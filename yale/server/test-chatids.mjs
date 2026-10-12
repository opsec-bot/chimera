// test-chatids.mjs — verify customer chat-id validation + routing target.
// Run: node test-chatids.mjs

import assert from "assert";
import {
  addChatIds,
  removeChatIds,
  isValidChatId,
  validChatIdCount,
} from "./chatids.js";
import { customerTarget } from "./telegram.js";
import { CONFIG } from "./config.js";

// ── validation off (no ids registered) ───────────────────────────────────
assert.strictEqual(validChatIdCount(), 0, "expected fresh/empty set");
assert.ok(isValidChatId("123456"), "validation should be off when set is empty");
assert.strictEqual(customerTarget(undefined), CONFIG.userChatId, "absent id should fall back");
assert.strictEqual(customerTarget(""), CONFIG.userChatId, "blank id should fall back");
console.log("✓ validation off — legacy fallback intact");

// ── registration turns validation on ─────────────────────────────────────
addChatIds(["-100", "-200"]);
assert.strictEqual(validChatIdCount(), 2, "two ids expected");
assert.ok(isValidChatId("-100"), "registered id rejected");
assert.ok(!isValidChatId("-999"), "unregistered id accepted");
assert.strictEqual(customerTarget("-100"), "-100", "registered id should route to itself");
assert.strictEqual(customerTarget("-999"), null, "unregistered id should be dropped");
console.log("✓ registered ids pass, unregistered drop");

// ── junk input ───────────────────────────────────────────────────────────
assert.ok(!isValidChatId(null), "null accepted");
assert.ok(!isValidChatId(""), "empty accepted");
assert.strictEqual(customerTarget(null), CONFIG.userChatId, "null should fall back, not drop");
addChatIds([null, undefined, "  ", "  -300  "]);
assert.strictEqual(validChatIdCount(), 3, "junk should be skipped, whitespace trimmed");
assert.ok(isValidChatId("-300"), "whitespace-trimmed id rejected");
console.log("✓ junk input handled");

// ── removal ──────────────────────────────────────────────────────────────
removeChatIds(["-100"]);
assert.ok(!isValidChatId("-100"), "removed id still valid");
assert.ok(isValidChatId("-200"), "unrelated id broken by removal");
console.log("✓ removal only removes the target");

console.log("\nALL CHAT-ID TESTS PASSED");
