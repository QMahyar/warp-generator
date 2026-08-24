# Warp Generator — Agent Rules

**Project:** Cloudflare Worker for managing Warp WireGuard configs and subscriptions  
**Status:** v1.0.0 stable — first stable (single file, 257 tests, 17 formats, KV+Cache API)

---

## Tech Stack

- **Runtime:** Cloudflare Workers (ES2022, ES Module format)
- **Storage:** Cloudflare KV + Cache API (`caches.default`) for subscription responses
- **Language:** JavaScript (no TypeScript, no build step)
- **Dependencies:**
  - `bcryptjs ^2.4.3` — Password hashing
  - `@noble/curves ^1.9.0` — Curve25519 keypair generation
  - `fflate ^0.8.3` — ZIP compression
  - `js-yaml ^4.1.0` — YAML serialization

**Constraints:**
- Free tier: 100k KV reads/day, 1k writes/day, 1GB storage
- CPU time: 10ms per request (free), 50ms (paid)
- No Node.js APIs at runtime (use fetch, crypto.subtle, streams only; `node:test` is dev-only)
- Single-file architecture (`_worker.js`, ~6700 lines) + `test/` suite

---

## Commands

**Test (must be green before any handoff):**
```bash
node --check _worker.js                    # syntax gate
npm test                                   # 257 tests incl. goldens
node scripts/check-version.mjs             # package.json ↔ _worker.js ↔ tag must match
npm run goldens:update                     # ONLY after deliberate generator change; review diff
npx wrangler deploy --dry-run --outdir=dist
```

**Deploy / Release (tag is truth, see docs/RELEASE.md):**
```bash
wrangler deploy                            # manual (needs CLOUDFLARE_API_KEY/EMAIL or TOKEN)
# release (semver): bump package.json + _worker.js:VERSION + CHANGELOG.md → commit → tag
git tag -a v1.0.1 -m "v1.0.1 — <what>" && git push --follow-tags
# CI verify → Release workflow creates GitHub Release + wrangler deploy + health check
```

**Local dev:**
```bash
npm run dev                 # wrangler dev --local
```

**CI:** `.github/workflows/ci.yml` verify on PR/master/tags (syntax → version → test → dry-run → audit). `.github/workflows/release.yml` on `v*.*.*` tags: verify → GitHub Release → deploy → `GET /healthz` check.

**Test KV:**
```bash
wrangler kv:key get --namespace-id=<id> "settings:password"
wrangler kv:key list --namespace-id=<id> --prefix="account:"
```

---

## Code Conventions

### Style
- `camelCase` for functions and variables
- `UPPER_SNAKE_CASE` for constants
- Async/await (no raw Promises)
- Early returns, no deep nesting
- Explicit error handling (try/catch at top level)

### Patterns

**Route registration (declarative table):**
```javascript
// Add to ROUTES (_worker.js ~line 6495). Do NOT write if-chains.
{ method: 'POST', segments: ['api', 'thing'], auth: true, handler: handleThingCreate },
// segments support literals, {param: regex} params, '*tail' rest segments
// dispatchRequest() handles auth wrapping, 405 (+ Allow header) on method mismatch,
// 501 under /api/*, 404 elsewhere. Never hand-roll dispatch.
```

**Format generators (registry):**
```javascript
// All 17 formats live in FORMATS (const FORMATS): { contentType, ext, binary, needsAmnezia, gen }
// New format = one registry entry; handleSubscription() picks it up automatically.
```

**KV operations (`kvSafe` wrappers):**
```javascript
// Always use kvGet/kvPut/kvDelete — never raw env.WARP_KV calls in new code.
const data = await kvGet(env, 'key', { type: 'json' });   // null on missing OR on error
if (!data) return { error: 'Not found', status: 404 };
const ok = await kvPut(env, 'key', JSON.stringify(value)); // false on failure
if (!ok) return { error: 'Failed to save', status: 500 };
// Wrappers log one structured line (op + key class); callers decide the HTTP response.
```

**Subscription caching (Cache API, not KV):**
```javascript
// Read: caches.default.match(cacheRequest) keyed by origin + /sub/{token}/{format}
// Write: ctx.waitUntil(caches.default.put(...)) — best-effort, never blocks the response
// Invalidate: purgeCachedSubscriptions(origin, [tokens]) / purgeAllCachedSubscriptions(request, env)
// Call invalidation after ANY account/preset/settings/tokenMeta/group mutation.
```

**Error responses:**
```javascript
function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```
Status codes are meaningful: 400 bad input, 401 unauth, 404 missing, **405 wrong method (with Allow)**, **410 expired/revoked token**, 429 rate-limited, 501 unknown API path, 500 server error.

**Testing pure logic (no workerd needed):**
```javascript
// Pure helpers are exported directly from _worker.js (parse*, validate*, generate*).
// Stateful pieces/constants go through testHooks().
import { parseWireGuardConf, testHooks } from '../_worker.js';
const { FORMATS, ROUTE_TABLE } = testHooks();
```

**testHooks() exports pattern (IMPORTANT):**
- Everything tests need that is *not itself a function* (FORMATS, ROUTES, ROUTE_TABLE,
  DASHBOARD_HTML, AMNEZIA_UI_PRESETS, VERSION, …) must be reached via `testHooks()` — an
  exported function returning them.
- **Why:** the module must stay valid as a Workers ES module. workerd rejects modules whose
  named exports aren't functions (only `default` + function exports survive validation), so
  you cannot just `export const FORMATS = {...}`. Plain-function helpers ARE safe to export
  directly (see the big export list near the bottom of `_worker.js`).
- When adding a constant the tests need: add it to the `testHooks()` return object, not to
  top-level exports.

### KV Key Naming
- `account:{uuid}` — Account objects (may include additive fields: `dns`, `group`,
  `tokenMeta {label, expiresAt, disabled}`, `fetchCount`)
- `token:{token}` — Token → account UUID mapping
- `agg:{token}` — Aggregate subscription record `{token, groups[], label?, created_at, tokenMeta?}`
- `session:{token}` — Session data with expiry
- `auth:fail:{ip}` — Login rate-limit counters
- `settings:password` — Bcrypt hash
- `settings:global` — Global settings (Amnezia defaults)
- `settings:warpstatus` — Last Warp API reachability probe result
- `presets` — Endpoint preset array (entries may include `dns`, `preferredOrder`)
- *(removed)* `cache:*` — subscription cache moved to the Cache API in v1.0.0; leftover stale
  keys from v1.x are harmless dead weight

---

## Project Structure

```
warp-generator/
├── _worker.js              # Single worker file (all logic, ~6720 lines)
├── wrangler.toml           # KV namespace binding, compatibility_date
├── package.json            # Dependencies + npm test / goldens:update scripts
├── README.md               # Deployment guide, API docs
├── README.fa.md            # Persian translation of README.md
├── SPEC.md                 # Acceptance criteria (11 ACs + v1.0.0 addendum)
├── DESIGN.md               # Design decisions (46-question interview)
├── CHANGELOG.md            # Release notes by area
├── .github/workflows/ci.yml
├── html/                   # Source HTML templates served inline via String.raw
├── test/
│   ├── *.test.mjs          # 16 node:test files, 257 assertions
│   ├── golden/*.txt        # Byte-contract fixtures (guarded by .gitattributes -text)
│   └── update-goldens.mjs  # npm run goldens:update
└── research/               # VPN format research docs
```

---

## Architecture

### Core Components
1. **Route Table** — declarative `ROUTES` array compiled to `ROUTE_TABLE`; single dispatcher
   handles auth, 405+Allow, 501/404 fallbacks
2. **Format Registry** — `FORMATS` map drives all 10 subscription formats (content type,
   extension, Amnezia flag, generator fn)
3. **Auth Layer** — Setup wizard, login, session management (bcrypt + HttpOnly cookies), rate limit
4. **Warp Integration** — Curve25519 keypair gen, Warp API client with retries/cooldown/
   compensating-delete/redaction, config parsers
5. **Account CRUD** — Generate/import accounts, store in KV, manage tokens + lifecycle
6. **Subscription Engine** — Token lookup (account or agg), normalize-once endpoint expansion,
   registry-driven generators, Cache API read/write/purge
7. **Admin Panel** — de-CDN'd SPA (zero third-party requests) with hash router, client picker,
   QR modals, deep links, latency probe, backup UI, group subscriptions

### Data Flow
```
User → /admin/login → Session cookie → /admin (dashboard SPA, no external requests)
                                    ↓
                            Click "Create Account"
                                    ↓
                          POST /api/account/generate
                                    ↓
              Warp API (retry/cooldown) → keypair gen → store in KV
                                    ↓
                            Return token → User
                                    ↓
                        GET /sub/{token}/singbox        ← or agg token
                                    ↓
       Cache API hit? → return cached : resolveToken → account|agg
                                    ↓
          expandEndpoints (dedupe endpoints, CIDR/tag/DNS normalized ONCE)
                                    ↓
              FORMATS[format].gen(configs) → response (+ X-WG-Version)
                                    ↓
              ctx.waitUntil(caches.default.put(...)) → return JSON
                                    ↓
        Any mutation later → purgeCachedSubscriptions(...) → next fetch regenerates
```

---

## Boundaries

### Always Do
- Validate all user input (sanitize, check types, enforce limits)
- Hash passwords with bcrypt (cost factor 10)
- Set `HttpOnly`, `Secure`, `SameSite=Strict` on session cookies
- Return proper HTTP status codes (400 bad input, 401 unauth, 404 missing, 405 wrong method, 410 gone, 500 server error)
- Route ALL KV access through `kvGet`/`kvPut`/`kvDelete` and check results
- Normalize imported configs (extract core fields, strip formatting)
- Purge affected Cache API entries after any account/preset/settings/token mutation
- Keep admin pages free of third-party network requests (de-CDN invariant)

### Ask First
- Adding new dependencies (affects bundle size, cold start)
- Changing KV schema (additive-only so far; requires migration logic otherwise)
- Adding new subscription formats (research + registry entry + goldens update + real-client test)
- Changing Warp API endpoints (unofficial API)

### Never Do
- Store passwords in plaintext
- Log sensitive data (private keys, passwords, tokens — warp client redacts; keep it that way)
- Trust user input without validation
- Make unbounded KV writes (respect free tier limits)
- Block on slow operations (use timeouts on external APIs)
- Add non-function named exports to `_worker.js` (workerd rejects them — use `testHooks()`)
- Reintroduce CDN/third-party resources into the admin HTML
- Hand-edit `test/golden/*` fixtures (regenerate via `npm run goldens:update`)
- Embed HTML in worker code (already inline, don't move to external)

---

## Common Tasks

### Adding a new subscription format

1. Research format spec (see `research/` directory)
2. Write generator function in `_worker.js`
3. Add entry to the `FORMATS` registry (`{ contentType, ext, binary, needsAmnezia, gen }`)
4. Add it to the dashboard's `SUB_FORMATS` list so the UI exposes it
5. Update goldens: `npm run goldens:update` (review diff!)
6. Test with a real VPN client; document in README.md

The route `/sub/{token}/{format}` needs no changes — the registry drives dispatch.

### Adding a new route

Add one entry to `ROUTES`. Auth, 405 handling, and 404/501 fallbacks come free from
`dispatchRequest`. If tests need route metadata, consume `ROUTE_TABLE` via `testHooks()`.

### Debugging KV issues

```bash
# List all keys
wrangler kv:key list --namespace-id=<id>

# Get specific key
wrangler kv:key get --namespace-id=<id> "account:abc-123"

# Delete key
wrangler kv:key delete --namespace-id=<id> "session:xyz"

# Stale v1.x cache keys (harmless, optional cleanup)
wrangler kv:key list --namespace-id=<id> --prefix="cache:" | \
  jq -r '.[].name' | \
  xargs -I {} wrangler kv:key delete --namespace-id=<id> {}
```

### Adding input validation

Follow SPEC.md AC11 (+ v1.0.0 addendum) rules:
- Name: 1-100 chars, no control characters
- Config (import): 100 bytes - 10KB
- Private key: valid base64, 32 bytes decoded
- IP: strict IPv4/IPv6 or domain (max 253 chars, IPv6 group/hex rules, per-label domain rules)
- Port: 1-65535
- DNS: valid IPv4/IPv6/domain
- Endpoints per account/preset: 1-200
- Password: 8-128 chars (bcrypt truncates at 72 bytes)
- Amnezia params: Jc: 0-128, Jmin/Jmax: 0-1280 (Jmin <= Jmax), S1/S2: 0-255, H1-H4: 0-2147483647 (int or `lo-hi` range, non-overlapping)
- Token label: 1-100 chars; expiresAt: future ISO date; group tag: sanitized within limits

**Example:**
```javascript
function validatePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'Port must be 1-65535';
  }
  return null; // Valid
}
```

---

## Known Gotchas

### Toolchain / Runtime
- **compatibility_date ceiling** — `wrangler.toml` compatibility_date must be ≤ what the locally
  installed workerd supports, else `wrangler dev` fails with a version error; bump the two together
- **Non-function exports rejected** — workerd refuses ES modules exporting constants; anything
  non-callable must ship through `testHooks()` (see Patterns above)
- **CRLF gotcha** — generators emit LF; `.gitattributes` marks `test/golden/*.txt -text` so git
  must never normalize them. If goldens fail only on Windows checkouts, suspect a CRLF conversion
  (e.g. files re-saved by an editor or added without the attribute)
- **Goldens are byte contracts** — any generator output change breaks `goldens.test.mjs` by design;
  regenerate deliberately with `npm run goldens:update` and review the diff

### Warp API
- **Unofficial API** — No docs, could change anytime
- **Rate limiting** — Unknown limits; client retries transient failures then cools down before re-registering
- **Response structure** — Field names vary between API versions
- **Reserved bytes** — Most accounts use `[0, 0, 0]`, don't randomize
- **Half-completed registrations** — compensating delete cleans up orphaned registrations

### KV
- **Eventual consistency** — Account might not be readable immediately after creation (rare, <1s)
- **No transactions** — Last write wins, no atomic operations
- **List operation** — Returns max 1000 keys per call; code pages with cursor (see `listAggRecords`)
- **TTL precision** — ExpirationTtl is approximate (±60s)
- **kvSafe swallows errors into null/false** — convenient, but means "missing" and "KV broke" look
  identical to callers; check logs when debugging

### Format Generators
- **Amnezia compatibility** — Only Amnezia VPN, Clash Meta, Throne, WireSock (Jc/Jmin/Jmax only) support Amnezia params
- **Sing-box deprecation** — Use legacy outbound format (not endpoint format from v1.11+) for Hiddify/NekoBox compatibility
- **YAML serialization** — js-yaml line width must be `-1` (unlimited) to avoid wrapping long keys
- **Zero Amnezia params omitted** — emitting zero H1-H4 makes amneziawg reject WARP configs

### Caching
- **Cache API, not KV** — subscription cache lives in `caches.default`, keyed by origin +
  `/sub/{token}/{format}`; purges are URL-scoped, so origin changes (custom domain) orphan old entries
- **Invalidation fan-out** — preset/settings edits purge ALL subscription URLs (`purgeAllCachedSubscriptions`);
  account edits purge only their tokens
- **ZIP size** — ZIPs can exceed 100KB; still fine for Cache API but watch mobile fetches

---

## Troubleshooting

### "Subscription not found" (404)
- Check token in URL is correct (copy from admin panel)
- Verify account exists: `wrangler kv:key get "token:{token}"`
- Check if it's actually an agg token (`agg:{token}` key) whose groups have no active members

### 410 Gone on a subscription
- Token expired (`tokenMeta.expiresAt` passed) or revoked (`disabled: true`) — by design
- Fix from the account detail page: clear expiry or re-enable

### 405 instead of expected response
- Wrong HTTP method on a defined path — check the `Allow` header in the response

### "Warp API timeout" (504)
- Warp API is slow or unreachable; the client already retried and cooled down
- Check the status chip / `GET /api/settings/warpstatus` for last-known reachability

### "Failed to save account" (500)
- KV write quota exceeded (1k writes/day on free tier)
- KV namespace not bound correctly (check wrangler.toml)
- Cloudflare API outage (check status.cloudflare.com)

### Session expired immediately
- Clock skew between client and server (cookies use Max-Age)
- Cookie blocked by browser (Secure flag requires HTTPS)
- Session duration too short (default 24h)

### Tests fail only on a fresh clone (Windows)
CRLF normalization of `test/golden/*.txt` — verify `.gitattributes` has `-text` for the golden
path and re-checkout the files.

---

## Testing

**257 tests across 16 files** (`node --test`, zero extra dev deps):

```bash
npm test                 # everything
npm run goldens:update   # refresh golden fixtures after deliberate output changes
```

Coverage map:
- `parsers-validators.test.mjs` — config parsers + input validators
- `edge-matrix.test.mjs` — nasty-input edge cases across validators/generators
- `parity.test.mjs` — dashboard SUB_FORMATS ↔ backend FORMATS registry parity
- `structural.test.mjs` — structural invariants of _worker.js
- `b2…b10-*.test.mjs` — per-batch regression suites (critical fixes, caching/observability,
  warp client, routes/registry, de-CDN, UX core, install moment, token lifecycle, product features)
- `goldens.test.mjs` — byte-exact fixture contracts for every format (incl. Amnezia round-trips)
- `helpers.mjs` — shared fake-env/KV harness

Manual spot-checks still required for: real Warp registration against production, actual VPN
client imports, QR scans, deep-link opens on device.

---

## Version History

**v1.0.0** (2026-08-24) — first stable
- Complete v1 across batches B2–B10 (see CHANGELOG.md for the full breakdown)
- Backend: Cache API caching + purge-based invalidation, kvSafe KV wrappers, /healthz, structured
  JSON logs, X-WG-Version header, Warp client tolerant (wrapper/casing/orphan fixes, retries/cooldown/redaction),
  declarative route table (405 + Allow), format registry, normalize-once expansion, batched
  account fetch, per-account/preset DNS
- Frontend: de-CDN'd (zero third-party requests), hash router, preset edit-in-place + bulk paste,
  per-account Amnezia editor (Mild/Aggressive), a11y+mobile pass, inline QR, deep links, guided
  client picker, delete/regen safety nets, drag-drop import
- Product: token lifecycle (label/expiresAt/disabled/fetchCount + 410 enforcement), AES-GCM
  encrypted backup export/import (.wgenc, skip|overwrite merge), approximate browser latency
  probe (preferredOrder), WARP status chip, aggregate group subscriptions (/api/agg → /sub),
  setup checklist banner
- DevOps: 257-test node:test suite incl. golden byte contracts, GitHub Actions CI (verify + release + healthz), tag-as-truth (`scripts/check-version.mjs`)
- Schema additive only: `tokenMeta`/`fetchCount`/`group`/`dns` appear on edit; `cache:*` abandoned (harmless)

**v1.2.0** (2026-08-21)
- Complete admin UI overhaul (3 parallel design agents + integrator + browser QA)
- New dark design system: glass cards, gradient CTAs, logo tile/favicon, glow background
- Skeletons/empty states/stat chips/toasts/custom confirm modals/Esc+backdrop modal close
- show/hide passwords, `?error=` mapped login/setup errors (replaces string-replace injection)
- Fixed: template-literal escape cooking killed dashboard JS (String.raw); preset route regex
  only matched UUIDs (404 on `default`/`iran`/`china`); uncaught clipboard rejections;
  stat chip 0-presets on load; all-sub formats 500 when `default` preset deleted
  (DEFAULT_PRESETS fallback in expandEndpoints)
- QA: desktop + mobile 390px matrix green, zero console errors; report in qa-report/FINAL.md

**v1.1.0** (2026-08-19)
- Deep audit vs official client sources (Throne/v2rayN/sing-box releases); all findings fixed
- 10 subscription formats: sing-box JSON → endpoint schema (Throne 1.13); new `singbox-legacy` (NekoBox/Hiddify)
- IPv6 endpoints bracketed everywhere; Clash unique names + real keepalive; Xray cleanup
- Real WARP client_id → reserved bytes; range-string Amnezia (H1-H4) support
- Login rate limit, setup secret gate, strict IP/amnezia validation
- Cache-write guard + invalidation on preset/settings changes; honest headers

**v1.0.0** (2026-08-18)
- Initial release
- 9 subscription formats
- Admin panel SPA
- Subscription caching
- Input validation per spec

---

## References

- **SPEC.md** — 11 acceptance criteria + v1.0.0 addendum, input validation rules
- **DESIGN.md** — Design decisions from 46-question interview
- **CHANGELOG.md** — Detailed release notes (tag is truth, see `scripts/check-version.mjs`)
- **README.md / README.fa.md** — Deployment guide, API docs (English / Persian)
- **CLAUDE.md / .cursorrules / .github/copilot-instructions.md** — Level-1 context (stack, commands, conventions, boundaries)
- **docs/RELEASE.md** — Release & shipping pipeline (semver, tag flow, pre-launch checklist, rollback)
- **docs/SHIPPING_CHECKLIST.md** — One-page pre-launch checklist
- **docs/decisions/ADR-*.md** — ADRs: single-file, KV+Cache, auth+backup, route/format
- **research/** — VPN client format specs (`WARP_API_RESEARCH.md`)
- **test/golden/** — Byte-contract fixtures (do not hand-edit)
- **tasks/plan.md** — Implementation plan, dependency graph
- **tasks/todo.md** — 24 completed tasks
- **tasks/wayfinder/** — Batch tickets B2–B11

---

**Last updated:** 2026-08-24  
**Status:** v1.0.0 stable; 257 tests green in CI
