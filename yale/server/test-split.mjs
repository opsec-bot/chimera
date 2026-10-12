// test-split.mjs — operator split math
// Run: node test-split.mjs
import assert from "assert";
import { splitSolAmounts } from "./wallet.js";

process.env.OPERATOR_WALLETS = "wA,wB";

const LAMPORTS = 475_000_000; // 0.475 SOL — 95% of a 0.5 SOL wallet

// ── no cut configured → everything to the customer ──────────────────────────
process.env.OPERATOR_CUT = "0";
{
  const s = splitSolAmounts(LAMPORTS);
  assert.strictEqual(s.customer, LAMPORTS);
  assert.strictEqual(s.operator, 0);
  assert.strictEqual(s.operatorWallet, null);
  console.log("✓ no cut: 100% to customer");
}

// ── cut without wallets → everything to the customer ────────────────────────
process.env.OPERATOR_CUT = "0.2";
process.env.OPERATOR_WALLETS = "";
{
  const s = splitSolAmounts(LAMPORTS);
  assert.strictEqual(s.customer, LAMPORTS);
  assert.strictEqual(s.operator, 0);
  console.log("✓ no operator wallets: 100% to customer");
}
process.env.OPERATOR_WALLETS = "wA,wB";

// ── 15% cut ─────────────────────────────────────────────────────────────────
process.env.OPERATOR_CUT = "0.15";
{
  const s = splitSolAmounts(LAMPORTS);
  const expectedCustomer = Math.floor(LAMPORTS * 0.85);
  assert.strictEqual(s.customer, expectedCustomer);
  assert.strictEqual(s.operator, LAMPORTS - expectedCustomer);
  assert.ok(["wA", "wB"].includes(s.operatorWallet));
  // shares always sum to the full amount
  assert.strictEqual(s.customer + s.operator, LAMPORTS);
  console.log(`✓ 15% cut: ${s.customer} customer + ${s.operator} operator → ${s.operatorWallet}`);
}

// ── clamp: cut above 95% is capped ──────────────────────────────────────────
process.env.OPERATOR_CUT = "1.5";
{
  const s = splitSolAmounts(LAMPORTS);
  assert.strictEqual(s.customer, Math.floor(LAMPORTS * 0.05));
  assert.ok(s.operator > 0);
  console.log("✓ cut clamped at 0.95");
}

// ── zero-lamport edge ────────────────────────────────────────────────────────
{
  const s = splitSolAmounts(0);
  assert.strictEqual(s.customer, 0);
  assert.strictEqual(s.operator, 0);
  console.log("✓ zero amount handled");
}

console.log("\nALL SPLIT TESTS PASSED");
