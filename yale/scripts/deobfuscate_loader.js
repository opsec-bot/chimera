// Safety-instrumented execution of the phishing kit's loader.js in an
// isolated Node vm context. Purpose: recover the plaintext strings (esp.
// the telemetry-beacon endpoint URL) that are XOR-obfuscated in the source.
// All network I/O is intercepted and BLOCKED -- fetch() calls are logged
// (method, url, body) and then rejected, so no real request ever leaves
// this machine and no wallet/DOM interaction can occur (there is no real
// DOM here, only harmless stub objects).
const vm = require("vm");
const fs = require("fs");

const src = fs.readFileSync("out/site_loader.js", "utf8");

const capturedFetches = [];
const capturedLogs = [];

const sandbox = {
  console: {
    log: (...args) => capturedLogs.push(["log", ...args]),
    error: (...args) => capturedLogs.push(["error", ...args]),
    warn: (...args) => capturedLogs.push(["warn", ...args]),
  },
  fetch: (url, opts) => {
    capturedFetches.push({ url, opts });
    return Promise.reject(new Error("network access blocked by analysis sandbox"));
  },
  navigator: { userAgent: "Mozilla/5.0 (analysis-sandbox)", wallets: undefined },
  window: undefined, // filled below (self-reference)
  document: {
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} },
    body: { appendChild() {} },
    querySelectorAll: () => [],
    addEventListener: () => {},
    readyState: "complete",
    referrer: "",
  },
  location: { href: "https://bagsfumbled.com/analysis-sandbox" },
  sessionStorage: { setItem() {}, getItem() { return null; } },
  TextDecoder: TextDecoder,
  Uint8Array: Uint8Array,
  Math: Math,
  Number: Number,
  String: String,
  Object: Object,
  Array: Array,
  Set: Set,
  Promise: Promise,
  JSON: JSON,
  URLSearchParams: URLSearchParams,
  encodeURIComponent: encodeURIComponent,
  CustomEvent: class CustomEvent { constructor(name, opts) { this.name = name; this.detail = opts && opts.detail; } },
};
sandbox.window = sandbox; // window === global-ish self, good enough for `window.X` reads
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(src, ctx, { timeout: 5000 });
} catch (e) {
  capturedLogs.push(["sandbox-exception", String(e)]);
}

// give the async IIFE a tick to run its fetch calls before we read results
setTimeout(() => {
  console.log("=== Captured fetch() calls (network access was blocked) ===");
  for (const f of capturedFetches) {
    console.log("URL:", f.url);
    if (f.opts) console.log("  opts:", JSON.stringify(f.opts));
  }
  console.log("\n=== Captured console output from inside the sandboxed script ===");
  for (const l of capturedLogs) {
    console.log(...l);
  }
}, 200);
