# Evasion & obfuscation improvement plan

Grounded in the bagsfumbled "Kiwi Pro" investigation
(`Obsidian Vault/drain-investigation/`), audited against our deployed
stack on 2026-10-12. Goal: match the original kit's evasion layer where we
lost it in reconstruction, then exceed it.

## Phase 0 — Parity audit (done)

| Kit technique | Our status | Verdict |
|---|---|---|
| String-array + self-defending JS obfuscation | **GONE** — templates are deobfuscated, 0 obfuscated identifiers | biggest gap |
| Console suppression in iframe | present in frame.html | ok |
| Parent/iframe split + custom postMessage | present (loader.js variant + frame) | ok |
| Config via sessionStorage, URL stripped | present | ok |
| hideChanges / spoofPrompt | present | ok |
| Backpack/Blockaid + Phantom stressers | present in frame.html | ok |
| Lighthouse-branded endpoints | present | ok |
| AES-256-GCM encrypted transport | present | ok |
| **Kit-versioned shared secret** (durable IOC per investigation §3e) | **WORSE** — one `drainer.aes_secret` shared by every customer site + salt literally `"kiwi-api-v1"` | biggest attribution leak |
| Server-side kill switch (minValue) | present (0.1 SOL or any token) | ok |
| Telemetry beacon | better — same-origin, no extra infra hostname | ok |
| Infra rotation | **WEAKER** — stable `chimera-drainer.fly.dev` hostname; kit used disposable subdomains | gap |
| Cloudflare fronting | spoofed `Server: cloudflare` header only | acceptable |
| On-chain: no hardcoded destinations | verified same | ok |
| Gas sponsor (relayer fronts fees/rent for dust victims) | **MISSING** — victim is feePayer; token-rich/SOL-less wallets can't pay rent for new ATAs | gap + lost victims |
| `kiwi` branding across payload | **35+ occurrences** (namespaces, postMessage channel, HKDF salt) | links us to the original kit's IOCs |

## Phase 1 — Branding + attribution breaks (quick, hours)

1. **Strip all kiwi branding** from `yale/server/public/*` templates:
   `kiwiPro` namespace, `#kiwi-widget`, `kiwi-pro-loader`/`kiwi-pro-iframe`
   postMessage sources, `app_spf_`-style leftovers, and the HKDF salt
   `"kiwi-api-v1"` → generic or per-customer value. The investigation's
   IOCs are keyed on these strings; carrying them tags us as the same kit.
2. **Per-customer namespaces** — reuse `core/polymorphic_renderer.py`
   (exists, currently only wired to the old C2 engine) to randomize the
   widget namespace, DOM ids, CSS class names, and postMessage channel
   name per customer deployment. Structural fingerprinting and
   cross-site clustering break; each customer's page looks bespoke.
3. **Per-customer minValue** — env-configurable + per-customer override
   (the page already sends `minValue`; the server ignores it today).

## Phase 2 — Per-customer secrets (the attribution kill shot)

4. **One AES secret per customer**, not one global:
   - registry generates + stores a secret per customer at creation
   - payload patched with that customer's secret (build_customer_files)
   - backend `decryptMiddleware` tries the request against all known
     secrets (registry pushed via the same VALID_CHAT_IDS-style channel)
   - HKDF salt per customer too
   Why: the investigation proved a fixed kit-versioned secret is THE
   durable fingerprint tying unrelated phishing sites to one operator.
   Ours currently does exactly that across every customer we host.

## Phase 3 — Restore code-level obfuscation

5. **Re-obfuscate at build time** (both chimera's `build_customer_files`
   and the bot's zip mode): run each template through
   javascript-obfuscator with a per-customer config (string-array
   encoding variant, rotation seed), so no two deployments share a hash,
   structure, or signature. Today only an HTML-comment nonce changes per
   redeploy — same bytes = same fingerprint otherwise.
   Requires: browser smoke test after the first obfuscated build
   (local_test.py + headless browse of a deployed page, connect a
   burner, verify the sign flow still works end to end).
6. **Rotation variance**: combine 2 + 5 so each rotation cycle's redeploy
   is structurally different, not just a different comment nonce.

## Phase 4 — Beyond kit parity

7. **Gas sponsorship** — relayer wallet pays tx fees + ATA rent and fronts
   a dust amount to SOL-less victims (the original kit's observed `G1ha`
   sponsor pattern). Expands the drainable set (token-rich, SOL-empty
   wallets currently can't sign a payable drain tx). Implementation:
   relayer as additional feePayer signer / SOL transfer in the drain tx.
8. **Researcher kill switch** — heuristic on build requests: datacenter
   ASN for the visitor IP (ipapi already returns it), known
   security-vendor UA patterns, high-frequency probing. Suspects get a
   decoy "not eligible" response instead of real drain txs.
9. **Backend hostname hygiene** — `chimera-drainer` is a distinctive name;
   rename to something bland at the next rebuild. Optional bigger job:
   rotate the fly app name every N cycles (needs Vercel rewrite +
   payload redeploy, same machinery as a customer redeploy).

## Phase 5 — Operator QOL

10. **Dashboard** — one-page Flask app (or extend the bot) reading
    service_api + stats: customers, sites, funnel, recent drains,
    backend health, cycle history, fee config. `dashboard/dashboard.py`
    already shows the pattern but is wired to the legacy C2 engine.

## Phase 6 — Customer delivery: embed mode (iframe snippet)

11. **Let customers embed our page on their own website** — today every
    customer gets a hosted `claim-xxxx.vercel.app` site they must either
    use directly or CNAME. Many customers already have their own web page
    (traffic source, social bio page, game site) and just want the
    wallet widget on it.

    Delivery: a one-line snippet the bot hands out with the site:

    ```html
    <script src="https://claim-xxxx.vercel.app/embed.js" async></script>
    ```

    - `embed.js` is the loader (the kit's parent/iframe split, §2a of the
      investigation): runs in the customer's page, detects wallets in the
      top window, creates a same-ORIGIN-hosted iframe pointing at our
      hosted page, and passes config via an encoded `?appConfig=` URL
      param that the page immediately strips (the kit's redirect-and-strip
      §2c — the victim-visible URL never carries the config).
    - Works alongside the hosted page, not instead of it: same customer
      record, same Vercel project, same chat-id/secret/stat validation.
      `embed.js` is served by the customer's own project so the customer's
      domain is the only thing a visitor sees — our Vercel URL never
      appears in the page source except as the script src.
    - Bot UX: `/sites` site menu gains an **"📋 Embed snippet"** button →
      sends the one-liner + instructions; `/embed <wallet>` directly.
    - Must land AFTER Phase 2 (per-customer secrets) and Phase 3
      (obfuscated build) so the snippet doesn't reintroduce a shared
      fingerprint across every customer's page.
    - Note: the current `loader.js` template already implements most of
      this pattern for zip mode — the work is adapting its config
      hand-off for cross-page embedding (sessionStorage doesn't cross
      origins) and shipping it from the hosted project.

## Recommended order

- **Phase 1** (branding strip, per-customer namespaces, minValue) — cheap,
  kills the attribution leaks
- **Phase 2** (per-customer secrets) — same session, the kill shot
- **Phase 3** (build-time obfuscation + browser smoke test)
- **Phase 6** (embed mode) — right after Phase 3: customer-facing
  revenue, but only safe once each build is structurally unique and
  per-customer-secreted
- **Phase 4** (gas sponsor first — it grows revenue; kill-switch and
  hostname rotation as ongoing hardening)
- **Phase 5** (dashboard) — whenever the bot's `/stats` stops being enough
