// test-access.mjs — verify the admin / whitelist / blacklist gate.
// Run: BOT_TOKEN=x BACKEND_URL=https://test-backend.fly.dev AES_SECRET=s \
//      ACCESS_FILE=./test-access.json node test-access.mjs

import assert from "assert";
import fs from "fs";
import { hasAccess, isAdmin, loadAccess, saveAccess } from "./bot.js";

const FILE = process.env.ACCESS_FILE || "./test-access.json";
const ADMIN = "7036670963";
const CUSTOMER = "111222333";
const STRANGER = "999888777";

const msgFrom = (id) => ({ chat: { id: Number(id) }, from: { id: Number(id) } });

// ── clean slate ────────────────────────────────────────────────────────────
fs.rmSync(FILE, { force: true });
let a = loadAccess();
assert.deepStrictEqual(a, { whitelist: [], blacklist: [] }, "fresh state wrong");
console.log("✓ fresh access state");

// ── admin recognition ──────────────────────────────────────────────────────
assert.ok(isAdmin(msgFrom(ADMIN)), "admin id not recognized");
assert.ok(!isAdmin(msgFrom(STRANGER)), "stranger recognized as admin");
console.log("✓ admin id recognized");

// ── closed by default ──────────────────────────────────────────────────────
assert.ok(!hasAccess(msgFrom(STRANGER)), "stranger allowed without whitelist");
console.log("✓ closed by default");

// ── whitelist ──────────────────────────────────────────────────────────────
a = loadAccess();
a.whitelist.push(CUSTOMER);
saveAccess(a);
assert.deepStrictEqual(loadAccess().whitelist, [CUSTOMER], "whitelist not persisted");
assert.ok(hasAccess(msgFrom(CUSTOMER)), "whitelisted user denied");
console.log("✓ whitelist grants + persists");

// ── admin always passes ────────────────────────────────────────────────────
assert.ok(hasAccess(msgFrom(ADMIN)), "admin denied");
console.log("✓ admin always passes");

// ── blacklist beats whitelist ──────────────────────────────────────────────
a = loadAccess();
a.blacklist.push(CUSTOMER);
saveAccess(a);
assert.ok(!hasAccess(msgFrom(CUSTOMER)), "blacklisted user allowed");
a = loadAccess();
a.whitelist = a.whitelist.filter((x) => x !== CUSTOMER); // /blacklist removes from whitelist
saveAccess(a);
assert.ok(!hasAccess(msgFrom(CUSTOMER)), "removed user still allowed");
console.log("✓ blacklist beats whitelist");

// ── reload from disk (persistence across restarts) ────────────────────────
const reloaded = loadAccess();
assert.ok(reloaded.blacklist.includes(CUSTOMER), "blacklist lost on reload");
assert.ok(!reloaded.whitelist.includes(CUSTOMER), "whitelist not cleaned");
console.log("✓ persists across restart");

fs.rmSync(FILE, { force: true });
console.log("\nALL ACCESS TESTS PASSED");
