#!/usr/bin/env bash
# Run the local Solana validator in the FOREGROUND. Leave this terminal open.
# Ctrl-C stops it. --reset wipes ledger state on each start.
source ~/.profile
source ~/.cargo/env
mkdir -p "$HOME/projects/transfer-relay/.localnet"
cd "$HOME/projects/transfer-relay/.localnet"
exec solana-test-validator --reset
