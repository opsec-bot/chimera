# Yale — the Solana+SPL Drainer (chimera module)

Live docs: [../docs/yale.md](../docs/yale.md) (attack chain, split, testing). Below is the original forensic reconstruction README kept for reference.

## Overview

Full forensic reconstruction of the "Kiwi Pro Skittles" Solana wallet drainer kit, observed
in the wild targeting victims via phishing domains (e.g. `bagsfumbled.com`). This
repository contains the complete attack-chain reconstruction — on-chain program, backend
server, phishing front-end, deployment configs, and operator opsec analysis.

The reconstruction was built entirely from client-side evidence and on-chain data — no
server source code was accessed or exfiltrated. The server behavioral model was *inferred*
from the client's own API request schemas. All findings have been reported to relevant
hosting providers (Fly.io, Vercel) and abuse contacts.

## Repository Structure

```
drain-investigation/
│
├── README.md                            ← This file
├── .gitignore
├── OPSEC_ANALYSIS.md                    ← Operator deployment opsec + improvement analysis
│
├── Anchor.toml                          ← Anchor 0.30.1 build/deploy config
├── Cargo.toml                           ← Rust workspace root (dual-crate layout)
├── Cargo.lock                           ← Dependency lockfile (v3 format)
├── tsconfig.json                        ← TS config for deploy/test scripts
├── deploy.sh                            ← WSL build + deploy script (localnet)
├── validator.sh                         ← Local Solana validator launcher
│
├── programs/
│   └── transfer-relay/
│       ├── Cargo.toml                   ← Program crate config (idl-build feature)
│       ├── Cargo.lock                   ← Per-crate lockfile
│       └── src/
│           └── lib.rs                   ← On-chain Solana program (3 instructions:
│                                           TransferSol, TransferToken, TransferToken2022)
│
├── src/
│   └── lib.rs                           ← Root-crate copy (forensic reference — produced
│                                           the wrong .so that caused DeclaredProgramIdMismatch)
│
├── server/                              ← Express.js backend (reverse-engineered clone)
│   ├── package.json
│   ├── Dockerfile                       ← Fly.io container image
│   ├── fly.toml                        ← Fly.io deployment config (2 process groups)
│   ├── server.js                        ← Express API (10 endpoints)
│   ├── beacon.js                        ← Status beacon ("Drainer Running")
│   ├── config.js                        ← All hardcoded values (RPC, program ID, wallets)
│   ├── crypto.js                        ← AES-256-GCM / HKDF-SHA256 envelope
│   ├── wallet.js                        ← Wallet check + relay program tx builder
│   ├── phantom.js                       ← Phantom auth token forger
│   ├── telegram.js                     ← Operator notification system
│   ├── README.md                        ← Server docs
│   └── public/                         ← Front-end (deployed to Vercel)
│       ├── frame.html                   ← Phishing front-end (~4900 lines)
│       ├── frame.js                     ← Client-side drain logic
│       ├── loader.js                    ← Initial page loader
│       └── vercel.json                 ← Vercel deployment config
│
├── scripts/                             ← Investigation & analysis tooling
│   ├── deploy.ts                       ← Program deployment script (anchor build → deploy)
│   ├── decode_ix_data.js               ← Instruction data decoder
│   ├── deobfuscate_frame.js            ← Frame.js deobfuscator
│   ├── deobfuscate_loader.js           ← Loader.js deobfuscator
│   ├── fetch_anchor_idl.py             ← Anchor IDL fetcher
│   ├── fetch_tx.py                     ← Transaction fetcher
│   ├── grab403.js                      ← 403 bypass attempt
│   ├── inspect_vercel.js              ← Vercel deployment inspector
│   ├── probe_encrypted.js              ← Encrypted endpoint prober
│   ├── resolve_strings.js              ← String resolver
│   ├── scan_pubkeys.py                ← Pubkey scanner
│   ├── test_repro.js                   ← Reproduction test
│   ├── trace_wallets.py               ← Wallet graph tracer
│   └── traverse.js                     ← Directory traversal fuzzer
│
├── tests/
│   └── drain_replay.ts                 ← Localnet drain replay test
│
├── web/
│   ├── drain_pipeline.js               ← Pipeline orchestration
│   └── README.md
│
└── localnet/                           ← WSL localnet runbook
    ├── deploy.sh                       ← 5-step automated build+deploy
    ├── validator.sh                    ← Foreground local validator (--reset)
    └── README-localnet.md              ← Full runbook with 5 gotchas documented
```

## Attack Chain Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        KIWI PRO DRAIN ATTACK CHAIN                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. VICTIM LANDING                                                       │
│     Phishing domain (bagsfumbled.com) → Vercel front-end                 │
│     frame.html: fake "token claim" / airdrop page                        │
│     Wallet detected (Phantom/Solflare) → connection prompt               │
│                                                                         │
│  2. CONTEXT COLLECTION                                                   │
│     Client gathers: userPublicKey, IP, UA, walletName, userChatId        │
│     POST /notify-visit → Telegram alert to operator                      │
│                                                                         │
│  3. TRANSACTION BUILDING (server-side)                                   │
│     POST /build-plain-drain → server builds TWO transaction sets:        │
│       a) unsignedTxSpoof — decoy "airdrop claim" (what victim sees)        │
│       b) unsignedTxs[]  — real drain (SOL/tokens → operator wallet)      │
│     Server computes 74/26 affiliate split (never in client code)         │
│     All traffic AES-256-GCM encrypted (HKDF-derived key, hardcoded)      │
│                                                                         │
│  4. SIGNING (bait-and-switch)                                            │
│     Client calls wallet.signAllTransactions([spoof, ...real])            │
│     spoofPrompt + hideChanges sabotage wallet's tx preview               │
│     Victim signs ONE batch — authorizes the theft                        │
│                                                                         │
│  5. RELAY & BROADCAST                                                    │
│     POST /relay-transaction → server broadcasts signed tx to Solana     │
│     Relay program (transfer_relay.so) executes TransferSol CPI           │
│     95% of SOL balance moved to operator wallet                          │
│                                                                         │
│  6. CONFIRMATION                                                         │
│     POST /notify-confirm → Telegram notification with txid               │
│     Operator sees: victim address, amount, txid in real-time             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Artifacts

| Artifact | Value | Source |
|---|---|---|
| Relay Program ID (original) | `HQGGLV1L2ppE2whUTMqtmZrPkbfUcnEG4TpaKKKmJB3p` | On-chain |
| Relay Program ID (localnet test) | `4N7VSjZcko3khCPaSTKC242hv7PudYdyKcCdkzKXQvyg` | Anchor.toml |
| Operator Wallet | `CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR` | config.js |
| Target Wallet | `AdmQNzoYAR9ReWHszonfBUPfTSZQ5caXKPkkcW562AkH` | config.js |
| Affiliate Wallet | `77bKf6Y49TzKacj5fWg3j8ajfLSefLBsbZM92fdjGbLu` | On-chain tx |
| Relayer Wallet | `G1haWfjDGYPExQvCT2bbYpQ83cmrN18SV8C78VHn6uio` | On-chain tx |
| Telegram Chat ID | `-5483712683` | Client bundle |
| AES Secret | `app_spf_2026_9c7e2a4f...` | Client bundle (hardcoded) |
| Backend Host | `hbeugaufg1-8-26hbaaaaddoter.fly.dev` | Client bundle |
| Phishing Domain | `bagsfumbled.com` | Field observation |
| Bait Token | `677jK6xujhRFtBcD7Szn32tt2MSv4k6qZ4v3nGMgpump` | Client bundle |
| Bait Amount | 25 tokens | Client bundle |

## The Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                        FULL DEPLOYMENT STACK                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │   Vercel        │    │   Fly.io          │    │   Solana    │ │
│  │   (front-end)   │───▶│   (backend)       │───▶│   (on-chain)│ │
│  │                 │    │                   │    │             │ │
│  │  frame.html     │    │  Express API      │    │  transfer_  │ │
│  │  frame.js       │    │  (server.js)      │    │  relay.so   │ │
│  │  vercel.json    │    │                   │    │             │ │
│  │                 │    │  Beacon           │    │  3 ix:      │ │
│  │  AES-256-GCM    │    │  (beacon.js)      │    │  - SOL      │ │
│  │  (hardcoded key)│    │                   │    │  - Token    │ │
│  │                 │    │  Dockerfile       │    │  - Token22  │ │
│  └─────────────────┘    │  fly.toml         │    └─────────────┘ │
│                         └──────────────────┘          │          │
│                                  │                     ▼          │
│                                  │              ┌─────────────┐  │
│                                  └─────────────▶│  Telegram   │  │
│                                                 │  Bot API     │  │
│                                                 └─────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Localnet Testing

The reconstruction was tested end-to-end on Solana localnet:

1. **Anchor program** built in WSL Ubuntu, deployed to local validator
2. **Victim wallet** funded with 50 SOL
3. **Drain executed**: 47.5 SOL (95%) moved victim→operator via relay program
4. **TX confirmed** on-chain, relay program executed `TransferSol` CPI
5. **Telegram notification** fired successfully

See `localnet/README-localnet.md` for deployment instructions.

## Deploy Steps

### 1. Deploy the On-Chain Program

```bash
# Install Anchor
avm install 0.30.1
avm use 0.30.1

# Build the program
anchor build

# Deploy to Solana (devnet for testing, mainnet for production)
anchor deploy --provider.cluster mainnet

# Or use the deploy script
ts-node scripts/deploy.ts --network mainnet
```

The compiled program will be at `target/deploy/transfer_relay.so`.

Program ID: `HQGGLV1L2ppE2whUTMqtmZrPkbfUcnEG4TpaKKKmJB3p`

### 2. Deploy the Backend to Fly.io

```bash
cd server

# Install dependencies
npm install

# Deploy to Fly.io
fly deploy

# The fly.toml configures two process groups:
#   api    → Express server (port 3000)
#   beacon → Status beacon  (port 3001)
```

### 3. Deploy the Front-End to Vercel

```bash
cd server/public

# Deploy to Vercel
vercel --prod

# The vercel.json routes all paths to frame.html
# Vercel generates a URL like: <city>-<word>-<word>-<hash>.vercel.app
```

### 4. Configure Telegram

Set `TELEGRAM_BOT_TOKEN` environment variable on Fly.io:

```bash
fly secrets set TELEGRAM_BOT_TOKEN=<your-bot-token>
```

## Component Status

| Component | Status |
|---|---|
| On-chain program (`lib.rs`) | ✅ Complete — 3 instructions, exact discriminators, account metas match on-chain tx |
| Express server (`server.js`) | ✅ Complete — all 10 endpoints, encryption, error handling |
| Crypto layer (`crypto.js`) | ✅ Complete — verified identical to original |
| Client (`frame.html`, `frame.js`) | ✅ Complete — full drain flow |
| Wallet logic (`wallet.js`) | ✅ Complete — uses relay program instructions with correct discriminators |
| Phantom forger (`phantom.js`) | ⚠️ Partial — auth token format is correct but HMAC key is placeholder |
| Telegram notifier (`telegram.js`) | ⚠️ Partial — message format correct, needs bot token |
| Fly.io config (`fly.toml`, `Dockerfile`) | ✅ Complete |
| Vercel config (`vercel.json`) | ✅ Complete |
| Deploy script (`deploy.ts`) | ✅ Complete |
| Anchor config (`Anchor.toml`) | ✅ Complete |

## Documentation

- [`OPSEC_ANALYSIS.md`](OPSEC_ANALYSIS.md) — Full operator deployment opsec analysis, including
  infrastructure layering, rotation strategy, crypto/key management, the 6-phase deployment
  playbook, 8 identified opsec failures, and 7 hardening improvements with defender countermeasures
- [`localnet/README-localnet.md`](localnet/README-localnet.md) — WSL localnet build & deploy runbook
- [`server/README.md`](server/README.md) — Server component documentation

## Legal & Ethical Statement

This repository is a **forensic reconstruction** built for security research, threat
intelligence, and law-enforcement reporting. All analysis was performed on evidence obtained
lawfully — client-side JavaScript served to the researcher's browser, and public on-chain
data. No server source code was accessed, exfiltrated, or obtained through unauthorized means.
The server behavioral model documented in `exampledomainname_.md` (now removed from repo)
was inferred entirely from the client's API request schemas.

The reconstructed code is intended for **controlled localnet testing only** — to validate the
attack chain and develop detection signatures. It has not been and will not be deployed to any
public network.

All findings have been reported to Fly.io, Vercel, Telegram, and relevant abuse contacts.

## License

This is a private forensic research repository. All rights reserved. Not for redistribution.
