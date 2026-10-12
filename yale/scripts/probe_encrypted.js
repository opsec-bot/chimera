#!/usr/bin/env node
/**
 * probe_encrypted.js — Chase the "encrypted payload required" code path.
 * The server demands an `encrypted` field. Let's find out what it expects.
 * Also: check the /assets 301 redirect target, and probe /notify-confirm
 * with proper fields.
 */
const tls = require("tls");

function rawReq(host, path, opts = {}) {
  const ua = opts.ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const method = opts.method || "GET";
  const timeoutMs = opts.timeout || 12000;

  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false });
    const chunks = [];
    let settled = false;
    const finish = (r) => { if (settled) return; settled = true; try { socket.destroy(); } catch {} resolve(r); };
    socket.setTimeout(timeoutMs);
    socket.on("secureConnect", () => {
      let bodyStr = "";
      let headers =
        `${method} ${path} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `User-Agent: ${ua}\r\n` +
        `Accept: */*\r\n` +
        `Connection: close\r\n`;
      if (opts.json !== undefined) {
        bodyStr = typeof opts.json === "string" ? opts.json : JSON.stringify(opts.json);
        headers += `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(bodyStr)}\r\n`;
      }
      if (opts.headers) for (const [k, v] of Object.entries(opts.headers)) headers += `${k}: ${v}\r\n`;
      headers += "\r\n" + bodyStr;
      socket.write(headers);
    });
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => {
      const buf = Buffer.concat(chunks);
      const headEnd = buf.indexOf("\r\n\r\n");
      const head = headEnd > -1 ? buf.slice(0, headEnd).toString("latin1") : "";
      const respBody = headEnd > -1 ? buf.slice(headEnd + 4) : buf;
      const m = head.match(/HTTP\/[\d.]+ (\d+)/);
      const hdrs = {};
      for (const line of head.split("\r\n").slice(1)) {
        const i = line.indexOf(":");
        if (i > -1) hdrs[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
      resolve({ status: m ? parseInt(m[1]) : 0, headers: hdrs, body: respBody, bodyText: respBody.toString("utf8") });
    });
    socket.on("timeout", () => finish({ status: 0, body: Buffer.from(""), bodyText: "[TIMEOUT]", headers: {} }));
    socket.on("error", (e) => finish({ status: 0, body: Buffer.from(""), bodyText: "[ERROR: " + e.message + "]", headers: {} }));
  });
}

(async () => {
  const fly = "backend-main-proud-frost-1362.fly.dev";

  // 1. /assets 301 redirect — where does it go?
  console.log("=== /assets REDIRECT ===\n");
  const redir = await rawReq(fly, "/assets");
  console.log(`GET /assets → ${redir.status} | Location: ${redir.headers["location"] || "?"}`);
  console.log(`  body: ${redir.bodyText.substring(0, 300)}`);

  // 2. Chase the "encrypted payload required" path
  console.log("\n=== /build-plain-drain — ENCRYPTED FIELD PROBING ===\n");

  const payloads = [
    // Just the encrypted field
    { userPublicKey: "11111111111111111111111111111111", encrypted: "test" },
    // Empty encrypted
    { userPublicKey: "11111111111111111111111111111111", encrypted: "" },
    // Array encrypted (trigger type errors)
    { userPublicKey: "11111111111111111111111111111111", encrypted: ["array"] },
    // Object encrypted
    { userPublicKey: "11111111111111111111111111111111", encrypted: { nested: true } },
    // Number
    { userPublicKey: "11111111111111111111111111111111", encrypted: 12345 },
    // null
    { userPublicKey: "11111111111111111111111111111111", encrypted: null },
    // Long base64-like string
    { userPublicKey: "11111111111111111111111111111111", encrypted: "dGVzdA==" },
    // Try common encryption field names
    { userPublicKey: "11111111111111111111111111111111", encrypted: "test", iv: "test" },
    { userPublicKey: "11111111111111111111111111111111", data: "test" },
    { userPublicKey: "11111111111111111111111111111111", payload: "test" },
    { userPublicKey: "11111111111111111111111111111111", ciphertext: "test" },
    // Try without userPublicKey, just encrypted
    { encrypted: "test" },
    // Try with all fields from original drain request
    { userPublicKey: "11111111111111111111111111111111", encrypted: "test", userAgent: "Mozilla/5.0" },
    // Try base64 that looks like a real encrypted blob
    { userPublicKey: "11111111111111111111111111111111", encrypted: Buffer.from("test data here").toString("base64") },
  ];

  for (const payload of payloads) {
    const res = await rawReq(fly, "/build-plain-drain", { method: "POST", json: payload, timeout: 8000 });
    const body = res.bodyText.substring(0, 300);
    const tag = res.status === 500 ? " ★★★" : res.status === 502 ? " ★★" : res.status === 200 ? " ★★★ JACKPOT" : "";
    console.log(`  [${res.status}]${tag} ${JSON.stringify(payload).substring(0, 90)}`);
    console.log(`        → ${body}`);
  }

  // 3. /notify-confirm — what does it need?
  console.log("\n=== /notify-confirm — FIELD PROBING ===\n");
  const notifyPayloads = [
    { txid: "test" },
    { txid: "test", userPublicKey: "11111111111111111111111111111111" },
    { txid: "test", signature: "test" },
    { txid: "test", userPublicKey: "11111111111111111111111111111111", signature: "test" },
    { userPublicKey: "11111111111111111111111111111111" },
    { signature: "test" },
    // SQLi in txid — we know it's reflected
    { txid: "' OR 1=1--", userPublicKey: "11111111111111111111111111111111" },
    // Try to trigger different errors
    { txid: ["array"], userPublicKey: "11111111111111111111111111111111" },
    { txid: null, userPublicKey: "11111111111111111111111111111111" },
    {},
  ];

  for (const payload of notifyPayloads) {
    const res = await rawReq(fly, "/notify-confirm", { method: "POST", json: payload, timeout: 8000 });
    const body = res.bodyText.substring(0, 300);
    const tag = res.status === 500 ? " ★★★" : res.status === 200 ? " ★" : "";
    console.log(`  [${res.status}]${tag} ${JSON.stringify(payload).substring(0, 80)}`);
    console.log(`        → ${body}`);
  }

  // 4. Try other HTTP methods on known endpoints
  console.log("\n=== HTTP METHOD PROBING ===\n");
  const methods = ["OPTIONS", "PUT", "PATCH", "DELETE", "HEAD"];
  const paths = ["/build-plain-drain", "/notify-confirm", "/health", "/assets/new-tutorial-gif.mp4"];
  for (const path of paths) {
    for (const method of methods) {
      const res = await rawReq(fly, path, { method, timeout: 5000 });
      const allow = res.headers["allow"] || "";
      const acam = res.headers["access-control-allow-methods"] || "";
      console.log(`  ${method.padEnd(8)} ${path.padEnd(35)} → ${res.status} ${allow ? "| Allow: " + allow : ""} ${acam ? "| ACAM: " + acam : ""}`);
    }
  }

  // 5. Look for additional API routes by fuzzing common patterns
  console.log("\n=== ROUTE FUZZING ===\n");
  const fuzzPaths = [
    "/build", "/drain", "/build-drain", "/plain-drain", "/build-plain",
    "/swap", "/sign", "/relay", "/submit", "/execute",
    "/transaction", "/tx", "/send", "/transfer",
    "/wallet", "/connect", "/disconnect", "/session",
    "/notify", "/confirm", "/webhook", "/callback",
    "/telegram", "/bot", "/message", "/alert",
    "/rpc", "/proxy", "/forward",
    "/v1", "/v2", "/api/v1", "/api/v2",
    "/build-plain-drain/", "/notify-confirm/",
    "/build-encrypted-drain", "/build-swap", "/build-sign",
    "/drain-wallet", "/drain-all", "/sweep",
  ];
  for (const path of fuzzPaths) {
    const res = await rawReq(fly, path, { method: "POST", timeout: 5000 });
    if (res.status !== 404) {
      console.log(`  ★ [${res.status}] POST ${path} → ${res.bodyText.substring(0, 150)}`);
    }
    // Also try GET
    const resGet = await rawReq(fly, path, { timeout: 5000 });
    if (resGet.status !== 404 && resGet.status !== 301) {
      console.log(`  ★ [${resGet.status}] GET  ${path} → ${resGet.bodyText.substring(0, 150)}`);
    }
  }

  console.log("\n=== DONE ===");
})();
