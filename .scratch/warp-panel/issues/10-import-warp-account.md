# 10 — Import an existing WARP account

**What to build:** When Cloudflare rate-limits registration from the Worker
IP — or the operator already holds a registered WARP elsewhere — the panel's
account card gains an Import form: paste either a WireGuard `.conf` (official
app / wgcf export: `[Interface]` private key + addresses, `[Peer]` public
key) or a registration JSON (warp-reg style: full record incl. client id,
token, reserved); the server auto-detects the format and stores the account
in the `ACCOUNT` KV binding, replacing any existing one (operator confirms
first). Soft verification: imports carrying a client id + token are checked
against Cloudflare's API with a **verified / failed** verdict; conf-only
imports store as **unverified** — subscriptions render either way. Missing
reserved bytes default to `[0,0,0]`; the imported conf's Endpoint line is
ignored (the panel's endpoint list rules). The Register action's rate-limit
error points at the Import form.

**Blocked by:** 02 — WARP account Register/Rotate (KV), 01 — Password gate
+ panel shell

**Status:** done — committed (`97b70b0`), worker wg-ticket-10

  - [x] Conf import → account stored; submerged fields sane (reserved `[0,0,0]`, no token, unverified)
  - [x] JSON import → full record incl. id/token/reserved; verified verdict when the API check passes, failed/`unverified` when it doesn't
  - [x] Replace flow confirms before overwriting; failed import leaves the existing account untouched
  - [x] Imported accounts render every subscription format the same as registered ones (spot-check `/sub` + `/sub/clash` + `/sub/wg`)
  - [x] Rate-limit error on Register mentions Import
  - [x] Unit tests for both parsers + extraction (`node:test`); fetch-level smoke