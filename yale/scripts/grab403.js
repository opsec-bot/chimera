#!/usr/bin/env node
/**
 * grab403.js — Fetch and inspect the 33KB 403 body from the Fly backend.
 * Also checks for JS source maps on the Vercel frontend.
 */
const tls = require("tls");

function rawGet(host, path, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false });
    const chunks = [];
    let settled = false;
    const finish = (r) => { if (settled) return; settled = true; try { socket.destroy(); } catch {} resolve(r); };
    socket.setTimeout(timeoutMs);
    socket.on("secureConnect", () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: grab403/1.0\r\nAccept: */*\r\nConnection: close\r\n\r\n`
      );
    });
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => {
      const buf = Buffer.concat(chunks);
      const headEnd = buf.indexOf("\r\n\r\n");
      const head = headEnd > -1 ? buf.slice(0, headEnd).toString("latin1") : "";
      const body = headEnd > -1 ? buf.slice(headEnd + 4) : buf;
      const m = head.match(/HTTP\/[\d.]+ (\d+)/);
      const headers = {};
      for (const line of head.split("\r\n").slice(1)) {
        const i = line.indexOf(":");
        if (i > -1) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
      resolve({ status: m ? parseInt(m[1]) : 0, headers, body, bodyText: body.toString("utf8") });
    });
    socket.on("timeout", () => finish({ status: 0, body: Buffer.from("[TIMEOUT]"), bodyText: "[TIMEOUT]", headers: {} }));
    socket.on("error", (e) => finish({ status: 0, body: Buffer.from("[ERROR: " + e.message + "]"), bodyText: "[ERROR]", headers: {} }));
  });
}

(async () => {
  // 1. Grab the 403 body from Fly backend — what's in the 33KB HTML?
  console.log("=== FLY BACKEND 403 BODY INSPECTION ===\n");
  const flyHost = "backend-main-proud-frost-1362.fly.dev";

  const r1 = await rawGet(flyHost, "/fly.toml");
  console.log(`GET /fly.toml → ${r1.status} | ${r1.headers["content-type"]} | ${r1.body.length} bytes`);
  if (r1.status === 403 || r1.status === 200) {
    const body = r1.bodyText;
    // Extract title
    const titleMatch = body.match(/<title>(.*?)<\/title>/i);
    console.log(`  <title>: ${titleMatch ? titleMatch[1] : "(none)"}`);
    // Look for interesting strings
    const interesting = [
      /version/i, /express/i, /error/i, /forbidden/i, /nginx/i, /fly\.io/i,
      /cloudflare/i, /waf/i, /blocked/i, /script src=/i, /\.js"/i, /api/i,
      /vercel/i, /__NEXT/i, /_next/i, /webpack/i, /chunk/i, /bundle/i
    ];
    for (const re of interesting) {
      const m = body.match(re);
      if (m) console.log(`  found: "${m[0]}" at index ${m.index}`);
    }
    // Extract all script src and link href
    const scripts = [...body.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)];
    if (scripts.length) {
      console.log(`\n  Script sources (${scripts.length}):`);
      scripts.forEach(s => console.log(`    ${s[1]}`));
    }
    const links = [...body.matchAll(/<link[^>]*href=["']([^"']+)["']/gi)];
    if (links.length) {
      console.log(`\n  Link hrefs (${links.length}):`);
      links.slice(0, 15).forEach(l => console.log(`    ${l[1]}`));
    }
    // Dump first 2000 chars
    console.log(`\n  --- body preview (first 2000 chars) ---`);
    console.log(body.substring(0, 2000));
  }

  // 2. Check /health with query params and methods
  console.log("\n\n=== /health PROBING ===\n");
  const healthPaths = ["/health", "/health?verbose=1", "/health?debug=true", "/health?format=json", "/healthz", "/healthcheck"];
  for (const p of healthPaths) {
    const r = await rawGet(flyHost, p);
    console.log(`GET ${p} → ${r.status} | ${r.headers["content-type"] || "?"} | ${r.body.length} bytes`);
    if (r.bodyText && r.body.length < 2000) console.log(`  body: ${r.bodyText.substring(0, 500)}`);
  }

  // 3. Source map hunting on Vercel frontend
  console.log("\n\n=== SOURCE MAP HUNT (VERCEL) ===\n");
  const vercelHost = "helsinki-blake-pulse97-67ef.vercel.app";

  // First grab the frontend HTML to find JS bundle paths
  const fe = await rawGet(vercelHost, "/");
  console.log(`GET / → ${fe.status} | ${fe.body.length} bytes`);
  const jsBundles = [...fe.bodyText.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)];
  console.log(`Found ${jsBundles.length} script tags`);
  const jsPaths = jsBundles.map(m => m[1]).filter(u => u.endsWith(".js") || u.includes("_next"));
  console.log(`JS bundle paths: ${JSON.stringify(jsPaths.slice(0, 10))}`);

  // For each JS bundle, try .map
  for (const jsPath of jsPaths.slice(0, 8)) {
    const full = jsPath.startsWith("http") ? jsPath : jsPath;
    // Resolve relative paths
    let host = vercelHost;
    let path = jsPath;
    if (jsPath.startsWith("http")) {
      const u = new URL(jsPath);
      host = u.hostname;
      path = u.pathname;
    }
    const mapPath = path + ".map";
    const r = await rawGet(host, mapPath);
    console.log(`  ${mapPath} → ${r.status} | ${r.headers["content-type"] || "?"} | ${r.body.length} bytes`);
    if (r.status === 200 && r.body.length > 100) {
      console.log(`  ★★★ SOURCE MAP FOUND! (${r.body.length} bytes)`);
      console.log(`  preview: ${r.bodyText.substring(0, 500)}`);
    }
  }

  // Also try common source map locations
  const commonMaps = [
    "/bundle.js.map", "/main.js.map", "/app.js.map", "/index.js.map",
    "/static/js/bundle.js.map", "/static/js/main.js.map",
    "/_next/static/chunks/webpack.js.map",
  ];
  console.log(`\n  Trying common source map paths...`);
  for (const p of commonMaps) {
    const r = await rawGet(vercelHost, p);
    if (r.status === 200) {
      console.log(`  ★★★ ${p} → 200 | ${r.body.length} bytes | ${r.headers["content-type"]}`);
      console.log(`  preview: ${r.bodyText.substring(0, 300)}`);
    }
  }

  console.log("\n=== DONE ===");
})();
