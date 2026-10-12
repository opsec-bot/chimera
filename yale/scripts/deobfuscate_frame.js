// Safety-instrumented execution of frame.html's main script in an isolated
// Node vm context. All network I/O (fetch) is intercepted, logged, and
// BLOCKED before any request leaves this machine. DOM is stubbed with
// generic no-op elements so the script's own copious console.log("[DEBUG-...]")
// lines -- which are built from the same obfuscated string-array decoder --
// resolve to plaintext and get captured, without ever touching a real wallet,
// a real network endpoint, or a real transaction.
const vm = require("vm");
const fs = require("fs");

const html = fs.readFileSync("out/site_frame.html", "utf8");

// Pull out every <script> ... </script> body (non-module, inline) in order.
const scripts = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) scripts.push(m[1]);
console.log(`Found ${scripts.length} inline script blocks, sizes:`, scripts.map(s => s.length));

const capturedFetches = [];
const capturedLogs = [];

function makeFakeElement(id) {
  const el = {
    id,
    value: "",
    style: {},
    dataset: {},
    classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, remove() {},
    querySelector() { return makeFakeElement("q"); },
    querySelectorAll() { return []; },
    focus() {}, click() {},
    get textContent() { return this._tc || ""; },
    set textContent(v) { this._tc = v; },
    get innerHTML() { return this._ih || ""; },
    set innerHTML(v) { this._ih = v; },
  };
  return el;
}

const capturedTxCalls = [];

const sandbox = {
  console: {
    log: (...args) => capturedLogs.push(["log", ...args]),
    error: (...args) => capturedLogs.push(["error", ...args]),
    warn: (...args) => capturedLogs.push(["warn", ...args]),
    info: (...args) => capturedLogs.push(["info", ...args]),
    debug: (...args) => capturedLogs.push(["debug", ...args]),
  },
  fetch: (url, opts) => {
    capturedFetches.push({ url, opts });
    // Return a benign-looking rejected/empty response so calling code's
    // .catch()/try-catch paths run (revealing more log lines) without any
    // real network access.
    return Promise.resolve({
      ok: false,
      status: 599,
      statusText: "blocked-by-analysis-sandbox",
      json: async () => ({}),
      text: async () => "",
    });
  },
  navigator: {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    clipboard: { writeText: async () => {} },
    maxTouchPoints: 0,
  },
  window: undefined,
  document: {
    documentElement: makeFakeElement("html"),
    getElementById: (id) => makeFakeElement(id),
    createElement: () => makeFakeElement("created"),
    querySelector: () => makeFakeElement("q"),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: "complete",
    referrer: "",
    visibilityState: "visible",
    hasFocus: () => true,
  },
  location: { href: "https://bagsfumbled.com/frame.html", origin: "https://bagsfumbled.com", pathname: "/frame.html", search: "", replace() {} },
  sessionStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
  localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
  crypto: {
    randomUUID: () => "00000000-0000-0000-0000-000000000000",
    getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = 0; return arr; },
  },
  TextDecoder, TextEncoder, // WHATWG APIs, not standard V8 intrinsics -- must inject.
  // NOTE: String/Object/Array/Math/JSON/Promise/Set/Number/Uint8Array are deliberately
  // NOT set here -- a fresh vm context supplies its own realm intrinsics for those, and
  // string literals inside the executed scripts are bound to that realm's true
  // %String.prototype%, not to whatever object we assign a "String" property to. Injecting
  // our own would silently break the String.prototype.replace instrumentation below.
  URLSearchParams: URLSearchParams,
  URL: URL,
  encodeURIComponent, decodeURIComponent,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn) => setTimeout(fn, 16),
  AbortController,
  CustomEvent: class CustomEvent { constructor(name, opts) { this.name = name; this.detail = opts && opts.detail; } },
  alert: (msg) => capturedLogs.push(["alert()", msg]),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  postMessage() {},
  scrollTo() {},
  innerWidth: 400,
  innerHeight: 380,
  devicePixelRatio: 1,
  open: () => null,
  requestIdleCallback: (fn) => setTimeout(fn, 0),
};
sandbox.parent = sandbox; // frame.html normally runs inside an iframe; parent === self keeps `window.top !== window` checks false, which is fine for tracing this script's own logic
sandbox.top = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

const capturedReplaces = [];
sandbox.__captureReplace = (str, pattern) => capturedReplaces.push({ str, pattern });

const ctx = vm.createContext(sandbox);
// Instrument String.prototype.replace inside the sandbox realm (must patch
// the vm-realm's own String, not the host's) to catch every base-URL
// normalization call the script makes -- these all look like
// SOME_DECODED_STRING.replace(/\/$/, '') and are how the malicious backend
// host gets built up from the string-array-decoded fragments at init time,
// long before any wallet click. Purely observational: logs the string the
// method was called on, does not alter behavior.
vm.runInContext(`
  (function(){
    const orig = String.prototype.replace;
    String.prototype.replace = function(...args) {
      try {
        const s = String(this); // autoboxes to a String object in sloppy mode -- coerce back
        if (s.length > 6) __captureReplace(s, String(args[0]));
      } catch(e) {}
      return orig.apply(this, args);
    };
  })();
`, ctx);

for (const src of scripts) {
  try {
    vm.runInContext(src, ctx, { timeout: 3000 });
  } catch (e) {
    capturedLogs.push(["sandbox-exception", (e && e.name) + ": " + (e && e.message)]);
  }
}

setTimeout(() => {
  fs.writeFileSync("out/frame_sandbox_fetches.json", JSON.stringify(capturedFetches, null, 2));
  fs.writeFileSync("out/frame_sandbox_logs.json", JSON.stringify(capturedLogs, null, 2));
  fs.writeFileSync("out/frame_sandbox_replaces.json", JSON.stringify(capturedReplaces, null, 2));
  console.log(`\nCaptured ${capturedFetches.length} fetch() calls -> out/frame_sandbox_fetches.json`);
  console.log(`Captured ${capturedLogs.length} console lines -> out/frame_sandbox_logs.json`);
  console.log(`Captured ${capturedReplaces.length} String.replace() calls -> out/frame_sandbox_replaces.json`);
  const urlLike = capturedReplaces.filter(r => /^https?:\/\//i.test(r.str) || r.str.includes("."));
  console.log(`\nURL-like strings passed through .replace():`);
  for (const r of urlLike) console.log(" ", JSON.stringify(r.str));
}, 500);
