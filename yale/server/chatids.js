/**
 * chatids.js — customer chat-id validation (anti-spoof)
 *
 * Payload pages POST userChatId in plaintext (/notify-*), so without
 * validation anyone can make the bot message arbitrary Telegram chats.
 * The backend only delivers customer notifications to chat ids chimera
 * has registered here.
 *
 * Two registration paths:
 *   1. VALID_CHAT_IDS env (comma-separated) — chimera injects the full
 *      customer registry into the machine each rotation cycle
 *   2. POST /admin/chat-ids (X-Service-Key) — chimera pushes new ids
 *      mid-cycle, right when a customer is created
 *
 * Empty set = validation off (standalone single-operator mode).
 */

const validChatIds = new Set(
  (process.env.VALID_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

export function isValidChatId(id) {
  if (id == null || String(id).trim() === "") return false;
  if (!validChatIds.size) return true; // validation off
  return validChatIds.has(String(id).trim());
}

export function addChatIds(ids) {
  for (const id of ids || []) {
    if (id == null) continue; // String(null) is "null" — skip explicitly
    const s = String(id).trim();
    if (s) validChatIds.add(s);
  }
}

export function removeChatIds(ids) {
  for (const id of ids || []) {
    if (id == null) continue;
    validChatIds.delete(String(id).trim());
  }
}

export function validChatIdCount() {
  return validChatIds.size;
}
