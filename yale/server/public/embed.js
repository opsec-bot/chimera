/**
 * embed.js — one-line embed for the customer's own webpage.
 *
 * Usage (page must be served by the same host as the claim page —
 * hosted customers get this from their Vercel project, zip-mode
 * customers upload it next to frame.html):
 *
 *   <script src="/embed.js" async></script>
 *
 * Creates the claim-widget iframe pointing at the claim page served by the
 * same origin (derived from this script's own src — works for the hosted
 * *.vercel.app URL and for CNAME'd domains alike), and relays wallet
 * connections + Jupiter signing from the parent window, where injected
 * wallet providers are more reliably visible than inside an iframe.
 *
 * No config is passed: the claim page carries its own baked, per-customer
 * configuration, so this file is identical for every deployment.
 */
(function () {
  "use strict";

  function claimPageUrl() {
    // The claim page lives at the root of whatever origin serves this script.
    try {
      return new URL(document.currentScript.src).origin + "/";
    } catch (e) {
      return "/";
    }
  }

  // ── parent-side wallet relay (same channel the kit's loader uses) ──────

  async function handleWalletConnection(walletName, iframe) {
    function reply(type, payload) {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { source: "kiwi-pro-loader", type: type, payload: payload },
          "*"
        );
      }
    }
    try {
      var provider = null;
      if (walletName === "phantom") {
        provider = window.phantom?.solana || window.solana;
      } else if (walletName === "solflare") {
        provider = window.solflare;
      } else if (walletName === "jupiter") {
        provider =
          (window.jupiter && window.jupiter.provider) || window.jupiter;
      }

      if (!provider) throw new Error(walletName + " wallet not detected");
      if (!provider.publicKey) await provider.connect();

      if (provider.publicKey) {
        reply("wallet-connected", {
          publicKey: provider.publicKey.toString(),
          wallet: walletName,
        });
      }
    } catch (e) {
      reply("wallet-connection-error", { error: e.message });
    }
  }

  function ensureSolanaWeb3Loaded() {
    if (
      window.solanaWeb3 &&
      window.solanaWeb3.Transaction &&
      typeof window.Buffer !== "undefined" &&
      typeof window.Buffer.from === "function"
    ) {
      return Promise.resolve(window.solanaWeb3);
    }
    if (window.__kiwiSolanaWeb3Promise) return window.__kiwiSolanaWeb3Promise;
    window.__kiwiSolanaWeb3Promise = (async function () {
      var bufferMod = await import("https://esm.sh/buffer@6.0.3");
      var bs58mod = await import("https://esm.sh/bs58@5.0.0");
      var solanaWeb3 = await import("https://esm.sh/@solana/web3.js@1.95.3");
      window.Buffer = bufferMod.Buffer;
      window.bs58 = bs58mod.default;
      window.global = window;
      window.process = window.process || {
        env: { NODE_ENV: "production" },
        version: "",
        browser: true,
      };
      window.solanaWeb3 = solanaWeb3;
      return solanaWeb3;
    })();
    return window.__kiwiSolanaWeb3Promise;
  }

  async function handleJupiterSignAll(payload, iframe) {
    var requestId = payload && payload.requestId;
    var txs = (payload && payload.txs) || [];
    function reply(error, signedTxs) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage(
        {
          source: "kiwi-pro-loader",
          type: "jupiter-signed-transactions",
          payload: {
            requestId: requestId,
            error: error || null,
            signedTxs: signedTxs || null,
          },
        },
        "*"
      );
    }
    try {
      var provider =
        (window.jupiter && window.jupiter.provider) || window.jupiter;
      if (!provider) throw new Error("Jupiter wallet not detected in parent");
      if (!window.solanaWeb3) await ensureSolanaWeb3Loaded();
      var parsed = txs.map(function (b64) {
        return window.solanaWeb3.Transaction.from(
          Uint8Array.from(atob(b64), function (c) {
            return c.charCodeAt(0);
          })
        );
      });
      var signed = await provider.signAllTransactions(parsed);
      reply(
        null,
        signed.map(function (s) {
          var bytes = s.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          });
          var bin = "";
          for (var i = 0; i < bytes.length; i++)
            bin += String.fromCharCode(bytes[i]);
          return btoa(bin);
        })
      );
    } catch (e) {
      reply(e.message || String(e));
    }
  }

  // ── iframe mount ───────────────────────────────────────────────────────

  function mount() {
    if (document.getElementById("kiwi-widget")) return; // already embedded

    var iframe = document.createElement("iframe");
    iframe.id = "kiwi-widget";
    iframe.src = claimPageUrl();
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.style.colorScheme = "dark";

    var isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    var isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    if (isMobile || isTouchDevice) {
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.position = "fixed";
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.zIndex = "9999";
      iframe.style.margin = "0";
      iframe.style.padding = "0";
      iframe.style.borderRadius = "0";
      iframe.style.overflow = "hidden";
    } else {
      iframe.style.width = "360px";
      iframe.style.height = "540px";
      iframe.style.position = "fixed";
      iframe.style.top = "50%";
      iframe.style.left = "50%";
      iframe.style.transform = "translate(-50%, -50%)";
      iframe.style.borderRadius = "48px";
      iframe.style.overflow = "hidden";
      iframe.style.boxShadow = "0 10px 50px rgba(0, 0, 0, 0.1)";
      iframe.style.zIndex = "9999";
    }

    iframe.allow = "clipboard-read; clipboard-write; fullscreen;";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";

    document.body.appendChild(iframe);

    window.addEventListener("message", function (event) {
      if (event.data && event.data.source === "kiwi-pro-iframe") {
        if (event.data.type === "request-connection") {
          var walletName =
            (event.data.payload && event.data.payload.wallet) ||
            event.data.wallet;
          if (walletName) handleWalletConnection(walletName, iframe);
        } else if (event.data.type === "jupiter-sign-all-transactions") {
          handleJupiterSignAll(event.data.payload, iframe);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
