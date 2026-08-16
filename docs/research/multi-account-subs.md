# Research: Multi-account WARP subscriptions — patterns from similar projects, WARP registration limits, KV storage, cache invalidation, token models

Sources: see per-section links (GitHub repos/issues, Cloudflare docs, DeepWiki).
Research date: 2026-08-15. Findings only — no code copied.

Context: our panel currently stores ONE WARP account in KV (`ACCOUNT` binding, key
`account`, see ADR 0005) and serves ONE subscription URL from a single `SUB_PATH`
secret (ADR 0006, `s-maxage ~6h`). Target: 2–10 accounts with register/import/
rotate/delete, one subscription per token (name, pinned account, re-pin), and a
generator page with an account picker.

## Q1: Similar multi-account WARP codebases

### kadidalax/SubPanel — Cloudflare Workers + KV multi-user subscription panel
- https://github.com/kadidalax/SubPanel (raw files: `worker/accounts/repository.ts`, `worker/public-subscriptions.ts`, `worker/platform/crypto.ts`)
- **Single KV key `state:accounts` = whole snapshot** of all state: `users[]`,
  `nextUserId`, `revision`, `updatedAt`. Subscriptions live inside each user.
- Code comment (verbatim intent): *"KV is last-writer-wins; move domain writes to a
  Durable Object or D1 when concurrent administrators or frequent writes become
  normal."* — i.e. snapshot-in-KV is fine as long as writes are rare/single-writer.
- Passwords and subscription tokens stored **hashed** (SHA-256, base64url) at rest.
- Subscription token: 32 random bytes → 43-char base64url, regex
  `^[A-Za-z0-9_-]{43}$`, used as **path credential** `/sub/:token/:client`.
- Compiled config artifacts cached in KV as `compiled:<tokenHash>:<client>`;
  invalidation by **revision counters** (subscription revision, catalog revision)
  with ETag/Last-Modified/304 revalidation instead of TTL-based cache control.
- Client detected from User-Agent (mihomo/clash/sing-box/surge/loon/quantumultx/
  v2rayn/nekobox/shadowrocket/generic).

### vvbbnn00/WARP-Clash-API — single-account panel (8.8k stars, GPL-3.0, archived)
- https://github.com/vvbbnn00/WARP-Clash-API
- Single WARP account persisted as JSON in an `account/` directory.
- Subscription guarded by a shared `SECRET_KEY` query parameter; all subscriptions
  share the one account.
- Ships a "防封IP" (IP-ban-avoidance) proxy pool: registration traffic routed
  through rotating proxies so Cloudflare's per-IP rate limit doesn't kill the
  panel's ability to re-register.

### badafans/warp-reg — automated WARP registration CLI (Go, MIT, 236 stars)
- https://github.com/badafans/warp-reg, incl. `official-warp-api.txt` (full request/response dump of the private WARP API, extracted from 1.1.1.1 app v6.10)
- `POST /v0a2158/reg` with headers `CF-Client-Version: a-6.10-2158`,
  `User-Agent: okhttp/3.12.1`; body: `key` (WireGuard pubkey), `install_id`,
  `fcm_token`, `tos`, `model`, `serial_number`, `locale`.
- Response: `id` (device id), `token` (device bearer token), `account` object
  (`account_type: free`, `quota: 0`, `usage: 0`, `warp_plus: true`, `role: child`,
  `license`), `config` (client_id, peers/endpoint, interface v4/v6 addrs).
- Management endpoints: `GET /v0a2158/reg/{device_id}` (fetch device),
  `PUT /reg/{device_id}/account` (attach license, i.e. upgrade plan),
  `GET /reg/{device_id}/account/devices` (list bound devices),
  `PATCH /reg/{device_id}/account/reg/{device_id}` (rename/`active:false` to
  deactivate a device), `DELETE /reg/{device_id}` (delete account, 204).

### bepass-org/warp-plus — WARP client with account management
- https://github.com/bepass-org/warp-plus ; DeepWiki "6.3 WARP Account Management API" https://deepwiki.com/bepass-org/warp-plus/6.3-warp-account-management-api
- Identity persisted on disk (`wgcf-identity.json` per account); supports a
  **second ("gool") account** for WARP-on-WARP. Registration is built-in.

### Others (single-account generators, not panels)
- `lanrat/wireguard-warp-generator`, `rany2/warp.sh`, `P3TERX/warp.sh`,
  `fscarmen/warp` (GitLab) — one-shot register-and-print, no storage.
- `ErcinDedeoglu/cloudflare-warp` — Docker multi-instance WARP (one per container).
  Issue https://github.com/ErcinDedeoglu/cloudflare-warp/issues/2 :
  `WARP_INSTANCES=20` concurrent registrations → many 429 failures; ~10 works.

### Verdict for our design
The only direct precedent for "Cloudflare Workers + KV, many subscriptions" is
**SubPanel**: snapshot-all-state-in-one-KV-key + revision counter + hashed tokens
+ ETag revalidation. No CF-Workers project does multi-WARP-account rotation; the
nearest is WARP-Clash-API's proxy-pool trick, which implies registration is the
fragile part (see Q2).

## Q2: WARP registration constraints (rate limits, quota, expiry)

### Rate limiting — 429 is IP-based
- https://github.com/ViRb3/wgcf/issues/64 — "Too many requests" (429) on `/reg`;
  tied to the client IP, resolves after waiting; workarounds: wait, retry, or
  change IP.
- https://github.com/ErcinDedeoglu/cloudflare-warp/issues/2 — 20 concurrent
  registrations from one host → mass 429; ~10 sequential/low-concurrency OK.
  Practical ceiling for bursts is low single digits.
- WARP-Clash-API's proxy pool exists specifically because the panel's VPS IP gets
  rate-limited when it re-registers; i.e. high-volume registration from a single
  IP (especially a datacenter IP) is the classic failure mode.

### Registration payload/headers matter
- `official-warp-api.txt` (badafans/warp-reg) shows the app sends
  `CF-Client-Version`, `okhttp/3.12.1` UA and a fixed-shaped JSON body; `tos`
  timestamp is required. Registration returns `account_type: free`, `quota: 0`,
  `usage: 0` — free accounts are **unmetered** (quota 0 = no data cap) and the
  response carries **no expiry timestamp**; there is no documented "free account
  expires" concept in the reg API.

### What isn't documented / known gaps
- No official doc for `/reg` (private API). Failure modes observed in the wild:
  429 (rate), network unreachable from IPv6-only hosts (warp-plus#173), and
  occasional "blocked" responses from datacenter IPs — but the dominant,
  reproducible constraint is per-IP rate limiting.
- Cloudflare community threads on WARP client errors (e.g.
  https://community.cloudflare.com/t/getting-a-registration-error-in-the-free-version-of-warp/813818 )
  are client-side error lists; nothing establishes a per-account quota or expiry.

### Verdict for our design
- Registration must be treated as **rare and rate-limited**; a worker running on
  Cloudflare's shared egress IPs (which serve ALL tenants) will hit 429 much
  sooner than a residential IP. Options: register from the browser (user's IP),
  or worker-side with severe throttling (e.g. min 1 reg per 10+ min, queue,
  sequential). 2–10 accounts is comfortably below any observed ceiling **if
  registrations are spaced**.
- No expiry → rotation is only needed for bans/blocks/rate-limit incidents, not
  for time-based renewal. "Rotate" ≈ delete (DELETE `/reg/{id}`) + re-register.

## Q3: KV storage patterns for 2–10 accounts + subs

### KV semantics (official docs)
- https://developers.cloudflare.com/kv/reference/how-kv-works/ — KV is a central
  store with edge caching: writes become visible at the edge only after
  propagation; **eventual consistency** (~60s scale). Reads served from cache when
  present (hot) else from origin (cold).
- https://developers.cloudflare.com/kv/api/write-key-value-pairs/ — `put()`:
  **last-writer-wins** for concurrent writes; **1 write/sec per key**; value ≤
  25 MiB; key ≤ 512 B; metadata ≤ 1024 B; `expirationTtl` min 60 s; bulk put ≤
  10 000 keys/invocation.
- https://developers.cloudflare.com/kv/api/read-key-value-pairs/ — `get()`:
  `cacheTtl` min 30 s (default 60 s); negative lookups also cached; multi-get ≤
  100 keys/invocation.
- https://developers.cloudflare.com/kv/api/list-keys/ — `list()`: prefix filter,
  cursor pagination, lexicographic order (enables index keys like `acct:1`).
- https://developers.cloudflare.com/kv/platform/limits/ — free plan: 100 k
  reads/day, 1 k writes/day, 1000 ops/invocation, 1 GB storage.

### Patterns observed in the wild
- **Whole-snapshot single key** (SubPanel `state:accounts`): atomic consistent
  read of everything; revision counter for change detection; trivial to serve.
  Works while writes are rare and single-writer; breaks with concurrent/frequent
  writes (last-writer-wins clobbers). With 2–10 accounts + ≤10 subs, the snapshot
  is a few KB — far under 25 MiB, and 1 write/sec per key is ample for
  admin-only mutations.
- **Per-entity keys + index** (our current `account` key, extended): natural
  `ACCOUNT`-binding migration (one key per account, `subs:<token>` keys), but
  requires `list()` for enumeration (eventually consistent, paginated) or a
  maintained index key (which reintroduces the snapshot-write problem).

### Verdict for our design
Snapshot-in-one-key matches the single-admin, read-mostly shape of our panel and
has a working precedent (SubPanel) plus explicit CF guidance about when it stops
being OK. Per-entity keys buy nothing at this scale except enumeration pain.
Keep `ACCOUNT`/`ENDPOINTS` bindings (ADR 0005) but consider a single `state`
snapshot key (accounts + subs + revisions) inside the `ACCOUNT`-style binding;
**throttle registration writes** to respect 1 write/sec/key and keep free-plan
write budget (1 k/day) safe: worst case ~20 registrations + re-pins ≈ trivial.

## Q4: Cache invalidation — TTL vs purge vs ETag

### Options (official docs)
- **Short TTL (origin Cache-Control)**: https://developers.cloudflare.com/cache/concepts/cache-control/ — Origin Cache Control is enabled by default on Free/Pro/Business; `max-age`/`s-maxage` from the worker is honored as-is. No purge machinery needed; cost = stale-config window.
- **Workers Cache purge API**: https://developers.cloudflare.com/workers/cache/purge/ — `ctx.cache.purge({tags, pathPrefixes, purgeEverything})` from inside the worker, scoped to that worker/entrypoint, Instant Purge propagation; **rate-limited** on free plans (order of a few purge requests/min). https://developers.cloudflare.com/workers/cache/ — Workers Cache is worker-owned, controlled by Cache-Control; zone configs don't apply.
- **Zone-level Cache-Tag purge**: https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/ — `Cache-Tag` header + purge-by-tag via dashboard/API; **not callable from the worker** (needs zone API token), forces cache MISS after purge.
- **ETag/Last-Modified + 304** (SubPanel): client-driven revalidation; cache stores the body, client sends `If-None-Match`, worker returns 304 or a freshly compiled body. Zero purge; invalidation is implicit in revision comparison.

### Verdict for our design
- Zone-level tag purge is out (worker can't call it without a zone token; extra secret + ops).
- `ctx.cache.purge` is usable but free-tier rate limits make per-re-pin purges
  fragile; fine for occasional manual re-pin, not for routine rotation.
- Simplest robust choice: **short `s-maxage` (e.g. 5–10 min)** — bounds stale
  config after re-pin, zero machinery, respects ADR 0006's "cache at edge"
  intent while shrinking the 6 h window. Optionally add ETag/304 later for
  immediate re-pin propagation (SubPanel pattern) if stale-window complaints
  appear.
- Since the subscription URL is unguessable (ADR 0006), even a long TTL only
  leaks to the token holder — the staleness problem is purely UX, not security.

## Q5: Multi-subscription token models

- **SubPanel** (see Q1): per-sub **43-char base64url** token as **path credential** (`/sub/:token/:client`); **SHA-256 hashed at rest**; artifacts keyed by tokenHash+client; per-sub revisions.
- **v2board** (PHP panel; https://deepwiki.com/yuanweize/v2board/10.3-client-subscription-api , https://github.com/cdnf/v2board-api-document): per-user `token` column in `v_user` (MySQL), served as `/api/v1/client/subscribe?token=...` (and short form `/s/{token}`); token **stored plaintext** (lookups are `WHERE token = ?`); user can reset token (`/user/resetSecurity`); plan/data-caps enforced server-side at fetch time.
- **WARP-Clash-API**: one shared `SECRET_KEY` query param for everything (single account, single audience).
- **subconverter** (https://github.com/tindy2013/subconverter): stateless converter — `/sub?target=&url=&config=`; **no user model at all**; only a shared `api_access_token` for profiles (`/getprofile?name=&token=`). Token is admin-only, not per-subscriber.
- **BPB Worker Panel** (our reference, docs/research/bpb-panel.md): single unguessable `SUB_PATH` for the whole panel (current ADR 0006 shape).

### Verdict for our design
Per-sub token = our `SUB_PATH` generalized: 32 random bytes → 43-char base64url
as path credential `/api/<token>/sub` (ADR 0006 shape preserved, one token per
subscription). Hashing at rest (SubPanel) is strictly better than plaintext
(v2board) and costs nothing at 2–10 tokens; keep the hash indexed in the
snapshot so lookup is O(n) over a tiny list. Token **reset** should invalidate
edge-cached configs (short TTL handles it). Pin/re-pin is per-sub → a `pinnedAccount` reference in the snapshot; re-pin = revision bump + new compiled config.

## Open questions this raises
1. **Who registers accounts — worker or browser?** Worker egress IPs are shared
   Cloudflare IPs (429 risk, per Q2); browser uses the admin's residential IP.
   Browser-side registration would keep Cloudflare IPs out of `/reg` entirely.
2. **KV shape**: migrate the existing single `account` key into one snapshot key
   (`state` with accounts[] + subs[] + revisions) vs per-entity keys + index?
   (Snapshot has the precedent; per-key keeps ADR 0005 bindings intact.)
3. **How aggressive is the free-plan write budget vs registration churn?**
   1 k writes/day free KV — registration + re-pin traffic must stay far below.
4. **Stale window acceptable?** Short `s-maxage` (5–10 min) vs SubPanel-style
   ETag/304 immediate invalidation vs occasional `ctx.cache.purge` on re-pin.
5. **Account health checks**: poll `GET /reg/{id}` periodically (e.g. daily) to
   auto-detect deactivated/banned accounts and mark them in the panel?
6. **Does re-pin also mean per-endpoint sub-rendering** (BPB renders one config
   per endpoint per account) or just account swap?
7. **What happens to the existing single `SUB_PATH`/`account` on deploy** —
   migration path for current users' bookmarked URLs (ADR 0006 amendment)?
8. **Multi-account UI**: account picker on the generator page is per-request
   (no persistence) while subscription pin is per-token — confirm the mental
   model: generator = ad-hoc, subscription = pinned.