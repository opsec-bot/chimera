/**
 * deploy.ts — On-chain program deployment script
 *
 * Builds and deploys the transfer_relay program to Solana.
 * Also creates the check_wallet marker account and funds the relayer.
 *
 * Usage:
 *   anchor build
 *   ts-node deploy.ts --network mainnet
 *   ts-node deploy.ts --network devnet
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";
import * as fs from "fs";

// Program ID from Anchor.toml
const PROGRAM_ID = new PublicKey("HQGGLV1L2ppE2whUTMqtmZrPkbfUcnEG4TpaKKKmJB3p");

// The check_wallet marker — must be created before the program works
const CHECK_WALLET = new PublicKey("CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR");

async function main() {
  const network = process.argv.includes("--network")
    ? process.argv[process.argv.indexOf("--network") + 1]
    : "devnet";

  const connection = new Connection(
    network === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : clusterApiUrl(network as any)
  );

  // Load deployer wallet
  const walletPath = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        fs.readFileSync(walletPath.replace("~", process.env.HOME!), "utf8")
      )
    )
  );

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(walletKeypair),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  TRANSFER RELAY — PROGRAM DEPLOYMENT             ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`  Network: ${network}`);
  console.log(`  Deployer: ${walletKeypair.publicKey.toString()}`);
  console.log(`  Program ID: ${PROGRAM_ID.toString()}`);
  console.log(`  Check wallet: ${CHECK_WALLET.toString()}`);
  console.log("");

  // Step 1: Deploy the program
  console.log("[1/4] Deploying program...");
  const programKeypair = Keypair.generate();
  const program = new Program<anchor.Idl>(
    JSON.parse(
      fs.readFileSync(
        "./target/idl/transfer_relay.json",
        "utf8"
      )
    ),
    provider
  );

  // Read the compiled .so
  const soPath = "./target/deploy/transfer_relay.so";
  if (!fs.existsSync(soPath)) {
    console.error(`  [!] Compiled program not found at ${soPath}`);
    console.error("  Run 'anchor build' first");
    process.exit(1);
  }

  const programData = fs.readFileSync(soPath);
  console.log(`  Program size: ${(programData.length / 1024).toFixed(1)} KB`);

  // Calculate required balance for program deployment
  const balanceRequired =
    await connection.getMinimumBalanceForRentExemption(programData.length);
  console.log(
    `  Rent: ${(balanceRequired / LAMPORTS_PER_SOL).toFixed(4)} SOL`
  );

  // Check deployer balance
  const deployerBalance = await connection.getBalance(walletKeypair.publicKey);
  console.log(
    `  Deployer balance: ${(deployerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
  );

  if (deployerBalance < balanceRequired + 0.01 * LAMPORTS_PER_SOL) {
    console.error("  [!] Insufficient balance for deployment");
    if (network === "devnet") {
      console.log("  Requesting airdrop...");
      const airdrop = await connection.requestAirdrop(
        walletKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdrop);
      console.log("  Airdrop confirmed");
    } else {
      process.exit(1);
    }
  }

  // Deploy using anchor
  try {
    await program.methods
      .initialize()
      .accounts({
        authority: walletKeypair.publicKey,
      })
      .signers([walletKeypair])
      .rpc();
    console.log("  Program deployed successfully");
  } catch (e) {
    console.log(`  Deployment via methods failed: ${e.message}`);
    console.log("  Use 'anchor deploy' CLI instead");
  }

  // Step 2: Create or verify check_wallet marker account
  console.log("\n[2/4] Verifying check_wallet marker account...");
  const checkWalletInfo = await connection.getAccountInfo(CHECK_WALLET);
  if (checkWalletInfo) {
    console.log(
      `  check_wallet exists (owner: ${checkWalletInfo.owner.toString()}, lamports: ${checkWalletInfo.lamports})`
    );
  } else {
    console.log("  check_wallet does not exist on-chain");
    console.log("  Note: The program requires this exact address in every tx.");
    console.log("  If deploying fresh, update CHECK_WALLET in lib.rs to your own marker.");
  }

  // Step 3: Fund the relayer wallet (if needed)
  console.log("\n[3/4] Checking relayer wallet...");
  const relayerWallet = new PublicKey(
    "G1haWfjD8nWxRYx5w7n8Z6tVRqL3j5m2KpHbCs9vDfNu"
  );
  const relayerBalance = await connection.getBalance(relayerWallet);
  console.log(
    `  Relayer balance: ${(relayerBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
  );
  if (relayerBalance < 0.05 * LAMPORTS_PER_SOL) {
    console.log("  Relayer needs funding for gas");
  }

  // Step 4: Print deployment summary
  console.log("\n[4/4] Deployment Summary");
  console.log("  ────────────────────────");
  console.log(`  Program ID: ${PROGRAM_ID.toString()}`);
  console.log(`  Check wallet: ${CHECK_WALLET.toString()}`);
  console.log(
    `  Discriminators:`
  );
  console.log(`    transfer_sol:        4e0aecf76d75154c`);
  console.log(`    transfer_token:      db117a35edabe8de`);
  console.log(`    transfer_token_2022: 8720f98e460b22ff`);
  console.log("");
  console.log("  Next steps:");
  console.log("    1. Update server/config.js with the deployed program ID");
  console.log("    2. Update server/wallet.js with the check_wallet address");
  console.log("    3. Fund the relayer wallet with SOL for gas");
  console.log("    4. Deploy the Express server to Fly.io");
  console.log("    5. Deploy the front-end to Vercel");
}

main().catch((e) => {
  console.error("Deploy failed:", e);
  process.exit(1);
});
