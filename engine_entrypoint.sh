#!/bin/bash
# engine_entrypoint.sh — chimera-engine container boot
#
# Runs two processes in one machine:
#   1. the rotation engine + service API (python -m core.service_api)
#   2. the Telegram payload-builder bot (yale/bot/bot.js)
#
# If either dies the container exits, and Fly restarts the machine —
# no silent half-alive state (the bot without the engine is useless and
# vice versa).

set -e

cd /app

# Materialize config.yaml from the machine's secrets
python core/gen_config.py /app/config.yaml

# Persistent state lives on the mounted volume (/app/data)
mkdir -p /app/data/bot-builds

python -m core.service_api &
ENGINE_PID=$!

cd /app/yale/bot
node bot.js &
BOT_PID=$!

# Wait for either process — exit (→ Fly restart) when one dies
wait -n "$ENGINE_PID" "$BOT_PID"
EXIT_CODE=$?
echo "engine_entrypoint: a process exited ($EXIT_CODE) — restarting machine"
exit 1
