# fly_provisioner.py — Spins up / destroys Fly VMs via Machines API
import requests
import secrets
import time
from typing import Any, Dict, Optional

class FlyProvisioner:
    """
    Uses Fly.io Machines API to provision ephemeral VMs.
    Each VM runs a Docker image on an internal port.
    Supports custom images per payload (C2 server, flipper platform, etc.)
    """

    BASE = "https://api.machines.dev/v1"

    def __init__(self, api_token: str, org_slug: str, region: str, app_base: str):
        self.token = api_token
        self.org = org_slug
        self.region = region
        self.app_base = app_base
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    def _app_name(self, suffix: str) -> str:
        # Fly app names: max 30 chars, lowercase alphanumeric + hyphens
        # Cannot start or end with a hyphen
        name = f"{self.app_base}-{suffix}"
        if len(name) > 30:
            max_suffix = 30 - len(self.app_base) - 1
            name = f"{self.app_base}-{suffix[:max_suffix]}"
        # Strip trailing hyphens
        name = name.rstrip("-")
        return name[:30]

    def provision_vm(
        self,
        suffix: str,
        image: str = "registry.fly.io/chimera-c2:latest",
        env: Optional[Dict[str, str]] = None,
        memory_mb: int = 512,
        machine_type: str = "shared-cpu-1x",
    ) -> Dict[str, Any]:
        """Create a new Fly app + machine running the specified image.

        Args:
            suffix: Unique suffix for the app name (timestamp-based).
            image: Docker image to run. Defaults to the chimera C2 image.
            env: Additional environment variables to inject into the VM.
            memory_mb: VM memory in MB. Flipper needs 1024+.
            machine_type: Fly machine type. Flipper needs shared-cpu-2x+.
        """
        app_name = self._app_name(suffix)
        session_key = secrets.token_hex(16)
        internal_port = 8443

        # 1. Create the Fly app
        resp = requests.post(
            f"{self.BASE}/apps",
            headers=self.headers,
            json={
                "app_name": app_name,
                "org_slug": self.org,
            }
        )
        if not resp.ok:
            raise RuntimeError(
                f"Fly API: failed to create app '{app_name}': "
                f"{resp.status_code} {resp.text}"
            )

        # 2. Build env — merge defaults with caller-provided overrides
        vm_env: Dict[str, str] = {
            "SESSION_KEY": session_key,
            "LISTEN_PORT": str(internal_port),
            "PROXY_MODE": "resi",
        }
        if env:
            vm_env.update(env)

        # 3. Launch a machine from the specified Docker image
        machine_config: Dict[str, Any] = {
            "config": {
                "image": image,
                "region": self.region,
                "auto_destroy": False,
                "env": vm_env,
                "services": [
                    {
                        "internal_port": internal_port,
                        "protocol": "tcp",
                        "concurrency": {
                            "type": "requests",
                            "hard_limit": 1000,
                            "soft_limit": 500
                        }
                    }
                ],
                "machine_type": machine_type,
                "memory_mb": memory_mb,
                "size": machine_type,
            }
        }

        resp = requests.post(
            f"{self.BASE}/apps/{app_name}/machines",
            headers=self.headers,
            json=machine_config
        )
        if not resp.ok:
            raise RuntimeError(
                f"Fly API: failed to create machine for app '{app_name}': "
                f"{resp.status_code} {resp.text}"
            )
        machine = resp.json()

        # 4. Wait for VM to be "started"
        vm_id = machine["id"]
        self._wait_for_state(app_name, vm_id, "started", timeout=120)

        # 5. Allocate a dedicated IPv4 (ephemeral, new IP every cycle)
        resp = requests.post(
            f"https://api.fly.io/v4/apps/{app_name}/addresses",
            headers=self.headers,
            json={"type": "shared_ipv4"}
        )
        ip_data: Dict[str, Any] = resp.json() if resp.ok else {}
        vm_ip = ip_data.get("address", machine.get("private_ip", "unknown"))

        # Fly VMs get IPv6 fdaa:... addresses — Vercel rewrites choke on colons
        # Use the app's fly.dev hostname instead for proxy destinations
        vm_hostname = f"{app_name}.fly.dev"

        return {
            "app_name": app_name,
            "vm_id": vm_id,
            "ip": vm_ip,
            "hostname": vm_hostname,    # use this for Vercel rewrites
            "internal_port": internal_port,
            "session_key": session_key,
            "region": self.region,
            "image": image,
        }

    def _wait_for_state(self, app_name: str, vm_id: str, target: str, timeout: int = 120):
        deadline = time.time() + timeout
        while time.time() < deadline:
            resp = requests.get(
                f"{self.BASE}/apps/{app_name}/machines/{vm_id}",
                headers=self.headers
            )
            if resp.ok and resp.json().get("state") == target:
                return
            time.sleep(2)
        raise TimeoutError(f"VM {vm_id} did not reach '{target}' in {timeout}s")

    def destroy_vm(self, app_name: str, vm_id: str):
        """Destroy a machine and delete the app entirely."""
        # Force destroy the machine
        requests.delete(
            f"{self.BASE}/apps/{app_name}/machines/{vm_id}",
            headers=self.headers,
            params={"force": "true"}
        )
        # Delete the app (removes all associated resources)
        requests.delete(
            f"{self.BASE}/apps/{app_name}",
            headers=self.headers
        )
