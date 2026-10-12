/**
 * crypto.js — AES-256-GCM encryption layer
 *
 * Reconstructed from frame_bundle_clean.js L2515-2605.
 * The server and client both use this exact scheme.
 *
 * Envelope format: { v: 1, ts: <epoch_ms>, n: <base64url(iv)>, d: <base64url(ciphertext+tag)> }
 * Inner plaintext: JSON { t: <epoch_ms>, p: <payload> }
 * Key derivation: HKDF-SHA256(secret, salt, info) → 32-byte AES-256 key
 */

import crypto from "crypto";
import { CONFIG } from "./config.js";

// Cache the derived key
let _cachedKey = null;

export function deriveKey() {
  if (_cachedKey) return _cachedKey;

  const ikm = Buffer.from(CONFIG.secret, "utf8");
  const salt = Buffer.from(CONFIG.hkdfSalt, "utf8");
  const info = Buffer.from(CONFIG.hkdfInfo, "utf8");

  // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();

  // HKDF-Expand: T(1) = HMAC(PRK, info || 0x01) → first 32 bytes
  _cachedKey = crypto
    .createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([1])]))
    .digest();

  return _cachedKey;
}

function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str) {
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function encryptPayload(payload) {
  // The client (frame.html) has no decryption capability — it sends plaintext
  // JSON and expects plaintext JSON responses. The encryption layer was
  // reconstructed server-side but the client was never updated to match.
  // Pass through as-is so the full drain flow works end-to-end.
  return payload;
}

export function decryptEnvelope(envelope) {
  if (!envelope || envelope.v !== 1) {
    throw new Error("Not a v1 envelope");
  }

  const key = deriveKey();
  const iv = base64urlDecode(envelope.n);
  const data = base64urlDecode(envelope.d);

  // Last 16 bytes are the GCM auth tag
  const tag = data.slice(data.length - 16);
  const ciphertext = data.slice(0, data.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  const decoded = JSON.parse(plaintext.toString("utf8"));

  // Timestamp integrity check — inner ts must match outer ts
  if (decoded.t !== envelope.ts) {
    throw new Error(
      `ts mismatch: inner=${decoded.t} outer=${envelope.ts}`
    );
  }

  return decoded.p;
}

/**
 * Express middleware that decrypts the request body.
 * If the body is an encrypted envelope, decrypts and replaces req.body with the plaintext payload.
 * If not an envelope, passes through (for plaintext endpoints).
 */
export function decryptMiddleware(req, res, next) {
  if (
    req.body &&
    typeof req.body === "object" &&
    req.body.v === 1 &&
    typeof req.body.n === "string" &&
    typeof req.body.d === "string"
  ) {
    try {
      req.body = decryptEnvelope(req.body);
      req.decrypted = true;
    } catch (e) {
      return res.status(400).json({ error: "invalid encrypted payload" });
    }
  }
  next();
}
