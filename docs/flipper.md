# Flipper — Telemetry Platform (beta, separate project)

A full-stack app (Express + React + Postgres) that rides chimera's rotation
engine as a Fly-VM payload. Originally a "stealer as a service" concept;
works but was never finished. Kept here because it's the reference payload
for `telemetry_platform`-type deployments.

## What it does

- Ships in a Docker image (`docker/flipper`, pushed to
  `registry.fly.io/chimera-flipper:latest`) provisioned per rotation cycle
- Vercel redirector proxies ALL routes to the VM (`proxy_all=True`) — the
  public URL is a Vercel page, the app lives on Fly
- Express API + Postgres on the VM; OxaPay subscription billing (sandbox key
  in `config.yaml: flipper.oxapay_merchant_key`)
- Routes: auth, dashboard, admin, subscription, payment, builder,
  api/browser, api/wallets, api/filesearch, api/asar, api/search

## State

- Boots on Fly (git log: supervisor, embedded-postgres, drizzle fixes)
- Embedded Postgres is **ephemeral** — data dies with the VM each cycle
  (anti-forensic by design; set `flipper.database_url` for persistence)
- Not part of the Yale drainer service — independent project

See `flipper/CLAUDE.md` + `flipper/README.md` for internals.
