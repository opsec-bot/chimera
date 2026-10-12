// Fully resolves the string-array obfuscation in frame_bundle_unpackedmaybe.js.
// The decoder (_0x4a72) turned out to be a single, pure, deterministic global
// function -- not the per-scope-offset scheme seen in frame.html's other blob --
// so this just extracts it verbatim (array fn + decoder fn + the one-time
// self-defending array-rotation IIFE that aligns indices), evaluates that in
// an isolated Node vm (no DOM, no network, nothing else from the file runs),
// then uses the now-correctly-initialized decoder to resolve every call site
// in the full file via exact-text substitution. Pure data transform: no
// network access anywhere in this script.
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync("out/frame_bundle_unpackedmaybe.js", "utf8");
const lines = src.split("\n");

// Lines 1-57 (1-indexed) = array fn, decoder fn, rotation IIFE, per manual inspection.
const bootstrap = lines.slice(0, 57).join("\n");

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(bootstrap + "\nglobalThis.__decode = _0x4a72;", sandbox);

const decode = sandbox.__decode;

// Sanity check against a call site we already know should decode to something
// coherent (first arg/index only matters -- second arg is dead code).
console.log("Sanity check _0x4a72(993, 0x722) ->", JSON.stringify(decode(993, 0x722)));
console.log("Sanity check _0x4a72(1531, 0x966) ->", JSON.stringify(decode(1531, 0x966)));

const callRe = /_0x4a72\(\s*(-?\d+)\s*,\s*(-?0x[0-9a-fA-F]+|-?\d+)\s*\)/g;
const uniqueCalls = new Map(); // exact call text -> decoded string
let m;
while ((m = callRe.exec(src))) {
  const full = m[0];
  if (uniqueCalls.has(full)) continue;
  const a = parseInt(m[1], 10);
  let decoded;
  try {
    decoded = decode(a, 0); // second arg is unused by the decoder, value irrelevant
  } catch (e) {
    decoded = null;
  }
  uniqueCalls.set(full, decoded);
}

console.log(`\nDistinct call sites: ${uniqueCalls.size}`);
const failures = [...uniqueCalls.entries()].filter(([, v]) => v === null || v === undefined);
console.log(`Failed to resolve: ${failures.length}`);
if (failures.length) console.log("First few failures:", failures.slice(0, 10));

// Replace longest call-text-strings first to avoid partial-match issues (not
// actually possible here since every match is the full "_0x4a72(a,b)" form,
// but sort for determinism anyway).
let out = src;
const sorted = [...uniqueCalls.entries()].sort((a, b) => b[0].length - a[0].length);
for (const [callText, decoded] of sorted) {
  if (decoded === null || decoded === undefined) continue;
  const literal = JSON.stringify(decoded);
  // Split on the literal call text (safe: regex-special chars are only ( ) , - .
  // in this text, so use split/join instead of building a fresh regex per call).
  out = out.split(callText).join(literal);
}

fs.writeFileSync("out/frame_bundle_resolved.js", out);
console.log(`\nWrote out/frame_bundle_resolved.js (${out.length} chars)`);
