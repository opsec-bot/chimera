# run_dashboard.py — Entry point
"""
Chimera Operator Dashboard
Run: python -m dashboard.run_dashboard
Access: http://localhost:4444
"""
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import yaml
from typing import Any
from dashboard.dashboard import app, state


def load_config(path: str = "config.yaml") -> dict[str, Any]:
    with open(path) as f:
        return yaml.safe_load(f) or {}


if __name__ == "__main__":
    config: dict[str, Any] = load_config()

    print("""
╔══════════════════════════════════════════════╗
║         ⚡ CHIMERA OPERATOR DASHBOARD        ║
╠══════════════════════════════════════════════╣
║  Web UI:  http://localhost:4444              ║
║  Cycle:   {} min rotation                    ║
║  Proxy:   {}                       ║
║  Dead drop: GitHub gist {} ║
╚══════════════════════════════════════════════╝
    """.format(
        int(config.get("cycle_minutes", 60)),
        str(config.get("proxy_provider", "N/A")).ljust(10),
        str(config.get("gist_id", "N/A")).ljust(16)
    ))

    state.init(config)

    try:
        app.run(host="127.0.0.1", port=4444, debug=False)
    except KeyboardInterrupt:
        print("\n[dashboard] Shutting down...")
        state.shutdown()
        print("[dashboard] All infrastructure destroyed. Goodbye.")
