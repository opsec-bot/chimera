#!/usr/bin/env node
/**
 * inspect_vercel.js — Dump the 33KB 403 body and retry with browser UA.
 * Also probe the Fly backend for additional routes discovered from the
 * stack-trace leak (the userAgent processing chain).
 */
const tls = require("tls");

function rawGet(host, path, opts = {}) {
  const ua = opts.ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const method = opts.method || "GET";
  const extraHeaders = opts.headers || {};
  const body = opts.body ? `Content-Length: ${Buffer.byteLength(opts.body)}\r\nContent-Type: ${opts.contentType || "application/json"}\r\n\r\n${opts.body}` : "";
  const timeoutMs = opts.timeout || 10000;

  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false });
    const chunks = [];
    let settled = false;
    const finish = (r) => { if (settled) return; settled = true; try { socket.destroy(); } catch {} resolve(r); };
    socket.setTimeout(timeoutMs);
    socket.on("secureConnect", () => {
      let req =
        `${method} ${path} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `User-Agent: ${ua}\r\n` +
        `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n` +
        `Accept-Language: en-US,en;q=0.5\r\n` +
        `Connection: close\r\n`;
      for (const [k, v] of Object.entries(extraHeaders)) req += `${k}: ${v}\r\n`;
      req += body ? body : "\r\n";
      socket.write(req);
    });
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => {
      const buf = Buffer.concat(chunks);
      const headEnd = buf.indexOf("\r\n\r\n");
      const head = headEnd > -1 ? buf.slice(0, headEnd).toString("latin1") : "";
      const respBody = headEnd > -1 ? buf.slice(headEnd + 4) : buf;
      const m = head.match(/HTTP\/[\d.]+ (\d+)/);
      const headers = {};
      for (const line of head.split("\r\n").slice(1)) {
        const i = line.indexOf(":");
        if (i > -1) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
      resolve({ status: m ? parseInt(m[1]) : 0, headers, body: respBody, bodyText: respBody.toString("utf8") });
    });
    socket.on("timeout", () => finish({ status: 0, body: Buffer.from("[TIMEOUT]"), bodyText: "[TIMEOUT]", headers: {} }));
    socket.on("error", (e) => finish({ status: 0, body: Buffer.from("[ERROR]"), bodyText: "[ERROR: " + e.message + "]", headers: {} }));
  });
}

(async () => {
  const vercelHost = "helsinki-blake-pulse97-67ef.vercel.app";
  const flyHost = "backend-main-proud-frost-1362.fly.dev";

  // 1. Vercel with real browser UA
  console.log("=== VERCEL WITH BROWSER UA ===\n");
  const r = await rawGet(vercelHost, "/");
  console.log(`GET / → ${r.status} | ${r.headers["content-type"] || "?"} | ${r.body.length} bytes`);
  console.log(`Server: ${r.headers["server"] || "?"} | X-Powered-By: ${r.headers["x-powered-by"] || "?"}`);

  if (r.status === 200) {
    // Extract JS bundles
    const scripts = [...r.bodyText.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)];
    console.log(`Script tags: ${scripts.length}`);
    scripts.forEach(s => console.log(`  ${s[1]}`));
    // Extract API calls / fetch URLs in the HTML
    const fetches = [...r.bodyText.matchAll(/(?:fetch|axios|XMLHttpRequest)[^"']*["']([^"']+)["']/gi)];
    if (fetches.length) { console.log(`\nFetch/API URLs in HTML:`); fetches.forEach(f => console.log(`  ${f[1]}`)); }
    // Look for backend URL references
    const urls = [...r.bodyText.matchAll(/https?:\/\/[^\s"'<>]+/gi)];
    const uniqueUrls = [...new Set(urls.map(u => u[0]))].filter(u => !u.includes("w3.org") && !u.includes("schema"));
    console.log(`\nAll URLs in HTML (${uniqueUrls.length}):`);
    uniqueUrls.slice(0, 30).forEach(u => console.log(`  ${u}`));
    // Save full HTML for reference
    require("fs").writeFileSync("scripts/vercel_index.html", r.bodyText);
    console.log(`\nFull HTML saved to scripts/vercel_index.html (${r.bodyText.length} chars)`);
  } else if (r.body.length > 1000) {
    // Dump the 403 body
    console.log(`\n--- 403 body (first 3000 chars) ---`);
    console.log(r.bodyText.substring(0, 3000));
    // Check if it's a Vercel challenge page
    const isVercel = /vercel/i.test(r.bodyText);
    const isCloudflare = /cloudflare|cf-ray/i.test(r.bodyText);
    console.log(`\nVercel page: ${isVercel} | Cloudflare: ${isCloudflare}`);
  }

  // 2. Fly backend — probe routes discovered from stack trace
  // The leak showed: (userAgent || (intermediate value) || "").toLowerCase()
  // Try sending different userAgent values to trigger different code paths
  console.log("\n\n=== FLY BACKEND — userAgent PROBING ===\n");

  // The 500 was triggered by POST /build-plain-drain with array userPublicKey.
  // Let's see what other endpoints exist by probing common patterns
  const endpoints = [
    ["GET", "/"], ["GET", "/api"], ["GET", "/api/health"],
    ["GET", "/status"], ["GET", "/version"], ["GET", "/info"],
    ["GET", "/metrics"], ["GET", "/debug"], ["GET", "/admin"],
    ["GET", "/assets/"], ["GET", "/assets"], ["GET", "/robots.txt"],
    ["GET", "/sitemap.xml"], ["GET", "/.well-known/security.txt"],
    ["GET", "/favicon.ico"], ["GET", "/index.html"],
    // Endpoint discovered from prior sweep
    ["POST", "/build-plain-drain"], ["POST", "/notify-confirm"],
    ["GET", "/build-plain-drain"], ["GET", "/notify-confirm"],
  ];

  for (const [method, path] of endpoints) {
    const opts = { method };
    if (method === "POST") {
      opts.body = JSON.stringify({ userPublicKey: "test", userAgent: "test" });
      opts.contentType = "application/json";
    }
    const res = await rawGet(flyHost, path, opts);
    const ct = res.headers["content-type"] || "?";
    const len = res.body.length;
    const preview = res.bodyText.substring(0, 200).replace(/[\r\n]+/g, " ");
    const interesting = res.status === 200 || res.status === 500 || (res.status === 404 && preview.includes("Cannot"));
    console.log(`  ${method.padEnd(5)} ${path.padEnd(35)} → ${res.status} | ${ct.substring(0, 30)} | ${len}b ${interesting ? "" : ""}`);
    if (res.status === 200 && len < 2000) console.log(`        body: ${preview}`);
    if (res.status === 500) console.log(`        ★ 500 ERROR: ${preview}`);
  }

  // 3. Try to trigger the 500 again with more targeted payloads to leak more code
  console.log("\n\n=== STACK TRACE LEAK — DEEPER PROBING ===\n");
  const leakPayloads = [
    // Original that worked
    { userPublicKey: ["array"], userAgent: "test" },
    // Try different field types
    { userPublicKey: "test", userAgent: ["array"] },
    { userPublicKey: "test", userAgent: null },
    { userPublicKey: "test", userAgent: 123 },
    { userPublicKey: "test", userAgent: {} },
    // Try extra fields that might hit unhandled paths
    { userPublicKey: "test", extra: ["array"] },
    { userPublicKey: "test", __proto__: { isAdmin: true } },
    // Try toString override
    { userPublicKey: { toString: "not-a-function" } },
    // Nested objects
    { userPublicKey: { nested: { deep: ["array"] } } },
    // Very long string
    { userPublicKey: "A".repeat(100000) },
  ];

  for (const payload of leakPayloads) {
    const res = await rawGet(flyHost, "/build-plain-drain", {
      method: "POST",
      body: JSON.stringify(payload),
      contentType: "application/json",
    });
    if (res.status === 500 || (res.status !== 200 && res.bodyText.includes("Error"))) {
      console.log(`  ★ [${res.status}] payload: ${JSON.stringify(payload).substring(0, 80)}`);
      const errMatch = res.bodyText.match(/(?:Error|error)[^]*?(?="|$)/);
      if (errMatch) console.log(`    error: ${errMatch[0].substring(0, 300)}`);
      // Look for code fragments
      const codeMatch = res.bodyText.match(/\([^)]*\)[^]*?(?:function|toLowerCase|toString|split|replace|match)/);
      if (codeMatch) console.log(`    code: ${codeMatch[0].substring(0, 300)}`);
      console.log(`    body: ${res.bodyText.substring(0, 400)}`);
    } else {
      console.log(`  [${res.status}] ${JSON.stringify(payload).substring(0, 60)} → ${res.bodyText.substring(0, 100)}`);
    }
  }

  console.log("\n=== DONE ===");
})();
