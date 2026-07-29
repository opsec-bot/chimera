#!/bin/bash
# init-db.sh — Initialize embedded PostgreSQL for flipper
# Creates the flipper user + database, generates a random password per boot.

set -euo pipefail

PG_DATA="/var/lib/postgresql/data"
PG_RUN="/run/postgresql"

# Generate random password per boot (anti-forensic — no persistent creds)
PG_PASS=$(openssl rand -hex 16)
echo -n "$PG_PASS" > /opt/flipper/.pgpass
chmod 600 /opt/flipper/.pgpass

# Initialize the data directory if not already done
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    echo "[flipper-db] Initializing PostgreSQL data directory..."
    su postgres -c "initdb -D $PG_DATA --auth-local=trust --auth-host=trust"
fi

# Start PostgreSQL — log to /tmp (postgres user can't write to /var/log)
echo "[flipper-db] Starting PostgreSQL..."
touch /tmp/postgresql.log
chown postgres:postgres /tmp/postgresql.log
su postgres -c "pg_ctl -D $PG_DATA -l /tmp/postgresql.log start -o '-c listen_addresses=localhost'"

# Wait for it to be ready
for i in $(seq 1 30); do
    if su postgres -c "pg_isready -q" 2>/dev/null; then
        break
    fi
    sleep 1
done

# Create user + database
echo "[flipper-db] Creating flipper user + database..."
su postgres -c "psql -c \"CREATE USER flipper WITH PASSWORD '$PG_PASS';\"" 2>/dev/null || true
su postgres -c "psql -c \"CREATE DATABASE flipper_db OWNER flipper;\"" 2>/dev/null || true
su postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE flipper_db TO flipper;\"" 2>/dev/null || true
su postgres -c "psql -c \"ALTER USER flipper WITH PASSWORD '$PG_PASS';\"" 2>/dev/null || true

echo "[flipper-db] PostgreSQL ready"
