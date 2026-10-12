#!/usr/bin/env bash
# Build + deploy transfer-relay to a LOCAL validator that is ALREADY RUNNING.
# Start the validator first in another terminal:  bash ~/projects/transfer-relay/validator.sh
# Then run this:  bash ~/projects/transfer-relay/deploy.sh
set -euo pipefail
source ~/.profile
source ~/.cargo/env

PROJECT="$HOME/projects/transfer-relay"
PROGRAM_SO="$PROJECT/programs/transfer-relay/target/deploy/transfer_relay.so"
PROGRAM_KP="$PROJECT/target/deploy/transfer_relay-keypair.json"
PROGRAM_ID=4N7VSjZcko3khCPaSTKC242hv7PudYdyKcCdkzKXQvyg

echo '==> 1/5  Point CLI at localnet + check the validator is running'
solana config set --url localhost >/dev/null
if ! solana cluster-version >/dev/null 2>&1; then
  echo 'ERROR: local validator not reachable on http://localhost:8899'
  echo 'Start it first in another terminal:  bash ~/projects/transfer-relay/validator.sh'
  exit 1
fi

echo '==> 2/5  Force Cargo.lock to v3 (Solana build toolchain rejects v4)'
sed -i 's/^version = 4$/version = 3/' \
  "$PROJECT/Cargo.lock" "$PROJECT/programs/transfer-relay/Cargo.lock" 2>/dev/null || true

echo '==> 3/5  Build BPF binary (skip the broken IDL step)'
( cd "$PROJECT" && anchor build --no-idl )

echo '==> 4/5  Verify the freshly built .so has the correct program id baked in'
python3 - "$PROGRAM_KP" "$PROGRAM_SO" <<'PY'
import json, sys
kp = json.load(open(sys.argv[1])); pub = bytes(kp[32:64])
data = open(sys.argv[2], 'rb').read()
assert pub in data, 'FAIL: program id not in .so (stale build)'
print('   OK: id present,', len(data), 'bytes')
PY

echo '==> 5/5  Fund wallet + deploy'
[ -f "$HOME/.config/solana/id.json" ] || \
  solana-keygen new --no-bip39-passphrase --silent -o "$HOME/.config/solana/id.json"
solana airdrop 100 >/dev/null 2>&1 || true
echo "   wallet $(solana address)  balance $(solana balance)"
# If upgrading a bigger binary onto an already-running program fails with
# "account data too small", run once:
#   solana program extend 4N7VSjZcko3khCPaSTKC242hv7PudYdyKcCdkzKXQvyg 60000 --url localhost
solana program deploy "$PROGRAM_SO" --program-id "$PROGRAM_KP" --url localhost
echo
solana program show "$PROGRAM_ID" --url localhost
