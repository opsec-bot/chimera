# fly_provisioner.py — Spins up / destroys Fly VMs via Machines API
import requests
import secrets
import time
from typing import Any, Dict

class FlyProvisioner:
    """
    Uses Fly.io Machines API to provision ephemeral VMs.
    Each VM runs the C2 server (Sliver/Mythic/etc.) on an internal port.
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
        return f"{self.app_base}-{suffix}"

    def provision_vm(self, suffix: str) -> Dict[str, Any]:
        """Create a new Fly app + machine running the C2 server image."""
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
        resp.raise_for_status()

        # 2. Launch a machine from the C2 Docker image
        #    Image is pre-built: contains Sliver/Mythic server + auto-config script
        machine_config: Dict[str, Any] = {
            "config": {
                "image": "registry.fly.io/chimera-c2:latest",
                "region": self.region,
                "auto_destroy": False,
                "env": {
                    "SESSION_KEY": session_key,
                    "LISTEN_PORT": str(internal_port),
                    "PROXY_MODE": "resi"
                },
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
                "machine_type": "shared-cpu-1x",
                "memory_mb": 512,
                "size": "shared-cpu-1x"
            }
        }

        resp = requests.post(
            f"{self.BASE}/apps/{app_name}/machines",
            headers=self.headers,
            json=machine_config
        )
        resp.raise_for_status()
        machine = resp.json()

        # 3. Wait for VM to be "started"
        vm_id = machine["id"]
        self._wait_for_state(app_name, vm_id, "started", timeout=90)

        # 4. Allocate a dedicated IPv4 (ephemeral, new IP every cycle)
        resp = requests.post(
            f"https://api.fly.io/v4/apps/{app_name}/addresses",
            headers=self.headers,
            json={"type": "shared_ipv4"}
        )
        ip_data: Dict[str, Any] = resp.json() if resp.ok else {}
        vm_ip = ip_data.get("address", machine.get("private_ip", "unknown"))

        return {
            "app_name": app_name,
            "vm_id": vm_id,
            "ip": vm_ip,
            "internal_port": internal_port,
            "session_key": session_key,
            "region": self.region
        }

    def _wait_for_state(self, app_name: str, vm_id: str, target: str, timeout: int = 90):
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
