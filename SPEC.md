# Spec: Warp Generator

**Version:** 2.0.0  
**Date:** 2026-08-23  
**Status:** Released (v1.0.0 approved 2026-08-18; v1.1.0 audit hardening shipped 2026-08-19; v2.0.0 feature-complete, see Addendum at bottom)

---

## Objective

Build a self-hosted Cloudflare Worker that manages Cloudflare Warp WireGuard configurations and generates VPN client subscriptions in 10 formats.

**User:** Individual who wants to:
1. Generate or import Warp configs without manual key management
2. Test multiple Warp endpoints (IP:port pairs) for their network
3. Get subscription URLs for their VPN clients (V2RayN, Clash, Hiddify, etc.)
4. Use both vanilla WireGuard and Amnezia obfuscation

**Success:** User can deploy worker, create Warp accounts, paste subscription URL into VPN client, and connect to Cloudflare Warp through optimized endpoints.

---

## Tech Stack

- **Runtime:** Cloudflare Workers (ES2022, Service Worker API)
- **Storage:** Cloudflare KV (key-value store)
- **Languages:** JavaScript (worker), HTML/CSS/JS (UI)
- **Dependencies:**
  - `bcryptjs` (password hashing)
  - `fflate` or `jszip` (ZIP generation)
  - `js-yaml` (YAML generation for Clash)
  - `@noble/curves` (Curve25519 for Warp keypair generation)

**Constraints:**
- Free tier limits: 100k reads/day, 1k writes/day, 1GB storage
- CPU time: 10ms per request (free), 50ms (paid)
- No Node.js APIs (fetch, crypto.subtle, streams only)

---

## Commands

**Deploy:**
```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

**Local dev:**
```bash
wrangler dev --local
```

**Bind KV namespace (one-time setup):**
```bash
wrangler kv:namespace create WARP_KV
wrangler kv:namespace create WARP_KV --preview
# Add namespace IDs to wrangler.toml
```

**Test KV locally:**
```bash
wrangler kv:key put --namespace-id=<id> "test" "value"
wrangler kv:key get --namespace-id=<id> "test"
```

---

## Project Structure

```
warp-generator/
├── _worker.js              # Single worker file (all logic)
├── wrangler.toml           # Cloudflare config (KV binding)
├── package.json            # Dependencies
├── SPEC.md                 # This file
├── DESIGN.md               # Design decisions from interview
├── README.md               # Deployment guide
├── html/
│   ├── setup.html          # First-run password setup
│   ├── login.html          # Login page
│   ├── dashboard.html      # Admin panel (account list)
│   ├── account.html        # Account detail view
│   └── settings.html       # Global settings (presets, Amnezia)
├── research/               # VPN format research docs
└── tasks/                  # Generated plan and task list
```

---

## Code Style

**Example worker route handler:**

```javascript
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Session check for admin routes
  if (path.startsWith('/admin') || path.startsWith('/api')) {
    const session = await validateSession(request, env);
    if (!session && path !== '/admin/setup' && path !== '/admin/login') {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  // Route dispatch
  if (path === '/admin') return serveAdminPanel(env);
  if (path === '/admin/setup') return handleSetup(request, env);
  if (path.startsWith('/api/account')) return handleAccountAPI(request, env, path);
  if (path.startsWith('/sub/')) return handleSubscription(request, env, path);

  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error(err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};
```

**Conventions:**
- `camelCase` for functions and variables
- `UPPER_SNAKE_CASE` for constants
- Async/await (no raw Promises)
- Early returns, no deep nesting
- Explicit error handling (`try/catch` at top level, return error responses)
- KV keys prefixed by type (`account:`, `token:`, `session:`)

---

## Testing Strategy

**Framework:** Manual testing (no test framework in v1 — Cloudflare Workers testing is complex)

**Verification approach:**
1. **Unit-level:** Test individual functions via `wrangler dev --local` + curl/Postman
2. **Integration:** Deploy to preview environment, test full workflows
3. **Format validation:** Generate subscriptions, import into real VPN clients:
   - V2RayN (Windows)
   - Clash Verge (Windows/Mac)
   - Hiddify (Android)
   - NekoBox (Android)
   - Clash Meta (CLI)
   - WireSock (Windows)

**Coverage targets:**
- All API endpoints return correct status codes
- All 10 subscription formats generate valid configs
- Configs tested in at least one client per format
- Error cases tested (invalid input, Warp API failures, KV failures)

**Test data:**
- Use test Warp account (register via API during testing)
- Test with single endpoint and 10 endpoints
- Test vanilla and Amnezia subscriptions

---

## Boundaries

### Always Do
- Validate all user input (sanitize, check types, enforce limits)
- Hash passwords with bcrypt (cost factor 10)
- Set `HttpOnly`, `Secure`, `SameSite=Strict` on session cookies
- Return proper HTTP status codes (400 for bad input, 401 for auth, 500 for server errors)
- Log errors to console (visible in Cloudflare dashboard)
- Normalize imported configs (extract core fields, strip formatting)
- Generate random UUIDs for account IDs and tokens (crypto.randomUUID())
- Check KV operation success (handle null returns, write failures)

### Ask First
- Adding new dependencies (affects bundle size, cold start time)
- Changing KV schema (requires migration logic for existing deployments)
- Adding new subscription formats (needs research + testing)
- Changing Warp API endpoints or request structure (unofficial API)
- Storing additional data in KV (consider free tier limits)

### Never Do
- Store passwords in plaintext
- Log sensitive data (private keys, passwords, tokens)
- Trust user input without validation
- Make unbounded KV writes (e.g., storing large files)
- Block on slow operations (Warp API calls should have timeouts)
- Use synchronous crypto (use crypto.subtle, not blocking libraries)
- Embed HTML in worker code (fetch from GitHub or serve as separate files)

---

## Success Criteria

### Phase 1: Core Infrastructure
- [ ] Worker deploys successfully to Cloudflare
- [ ] KV namespace bound and accessible
- [ ] First-run setup wizard creates password (bcrypt hash stored in KV)
- [ ] Login page validates password, sets session cookie
- [ ] Session persists for 24 hours, validates on subsequent requests
- [ ] Logout clears session cookie and KV entry

### Phase 2: Account Management
- [ ] Generate account: Calls Warp API, stores config in KV, returns account ID
- [ ] Import account: Parses `.conf` and `wg://` URIs, normalizes to common format
- [ ] List accounts: Returns all accounts from KV
- [ ] View account: Shows config, endpoints, subscription URLs
- [ ] Update account: Change name, endpoint list, Amnezia overrides
- [ ] Delete account: Removes account and token from KV
- [ ] Regenerate token: Creates new token, updates mapping

### Phase 3: Endpoint & Settings Management
- [ ] Default presets seeded on first run (5 Cloudflare endpoints)
- [ ] List presets: Returns all presets from KV
- [ ] Create preset: Validates endpoints (IP:port format), stores in KV
- [ ] Update preset: Modifies existing preset
- [ ] Delete preset: Removes preset (cannot delete if in use by accounts)
- [ ] Global Amnezia settings: Get/update defaults (Jc, Jmin, Jmax, S1-S2, H1-H4)
- [ ] Per-account Amnezia overrides: Stored in account object

### Phase 4: Subscription Generation
- [ ] Token lookup: `/sub/{token}/*` resolves token → account
- [ ] Invalid token returns 404
- [ ] Endpoint expansion: Account + preset → N configs (one per endpoint)
- [ ] Config naming: `{AccountName} - {Colo} {IP}:{Port}` format
- [ ] Cache: Subscriptions cached in KV with 5-minute TTL
- [ ] Cache invalidation: Editing account clears cache

### Phase 5: Format Generators (10 formats)
- [ ] WireGuard .conf (vanilla): ZIP with N `.conf` files
- [ ] WireGuard .conf (Amnezia): ZIP with Jc/Jmin/Jmax/S1-S2/H1-H4 in [Interface]
- [ ] Throne `wg://` (vanilla): Text with one URI per line
- [ ] Throne `wg://` (Amnezia): Text with `enable_amnezia=true&jc=...` params
- [ ] `wireguard://` URI: Text with standard URI format (no Amnezia)
- [ ] Sing-box JSON: Legacy outbound format with `local_address`, `peer_public_key`
- [ ] Xray JSON: `outbounds[].protocol: "wireguard"` with `secretKey`, `peers[]`
- [ ] Clash YAML: `proxies[].type: wireguard` format
- [ ] V2RayN base64: Base64-encoded `wireguard://` URIs

### Phase 6: End-to-End Validation
- [ ] V2RayN: Import base64 subscription, connect successfully
- [ ] Clash Meta: Import YAML subscription, connect successfully
- [ ] Hiddify: Import Sing-box JSON, connect successfully
- [ ] NekoBox: Import Sing-box JSON, connect successfully
- [ ] WireSock: Download .conf ZIP, import one file, connect successfully
- [ ] Amnezia VPN: Import Amnezia .conf, obfuscation parameters applied
- [ ] Connection verification: Can reach 1.1.1.1, public IP shows Cloudflare

---

## Acceptance Criteria

### AC1: First-Run Setup
**Given** user deploys worker with no password set  
**When** user visits `/admin`  
**Then** redirected to `/admin/setup`  
**And** setup page prompts for password (min 8 chars)  
**And** submitting valid password stores bcrypt hash in KV `settings:password`  
**And** redirects to `/admin/login`

**Error cases:**
- Password < 8 chars: Show error "Password must be at least 8 characters"
- KV write fails: Show error "Setup failed, try again"
- Password already set: Redirect to `/admin/login`
- **v1.1 hardening:** if `ADMIN_SETUP_SECRET` env/secret is set, POSTing to `/admin/setup` requires `secret=<value>` (else 403) until a password exists — prevents first-run takeover

---

### AC2: Login & Session Management
**Given** password is set  
**When** user visits `/admin`  
**Then** redirected to `/admin/login`  
**And** entering correct password creates session (random UUID)  
**And** session stored in KV `session:{uuid}` → `{expires_at: now + 24h}`  
**And** cookie set: `session={uuid}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`  
**And** redirects to `/admin` (dashboard)

**Error cases:**
- Wrong password: Show error "Invalid password", no redirect
- KV write fails: Show error "Login failed, try again"
- Session expired: Redirect to login, show "Session expired"
- **v1.1 hardening:** login rate limit — 5 failed attempts per client IP → HTTP 429 for 15 min (KV `auth:fail:{ip}`, cleared on success)

---

### AC3: Generate Warp Account
**Given** user is logged in  
**When** user clicks "Generate Account" and enters name "Home ISP"  
**Then** worker generates Curve25519 keypair  
**And** calls `POST https://api.cloudflareclient.com/v0a4005/reg` with:
```json
{
  "key": "<base64-public-key>",
  "install_id": "",
  "fcm_token": "",
  "tos": "2021-01-01T00:00:00.000Z",
  "model": "PC",
  "type": "Windows",
  "locale": "en_US"
}
```
**And** receives response with `id`, `account.id`, `config` (addresses, peer public key, endpoint)  
**And** stores in KV `account:{uuid}`:
```json
{
  "id": "generated-uuid",
  "name": "Home ISP",
  "token": "random-token-uuid",
  "created_at": "2026-08-18T12:00:00Z",
  "config": {
    "private_key": "...",
    "public_key": "...",
    "addresses": {"ipv4": "...", "ipv6": "..."},
    "peer_public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
    "mtu": 1280,
    "reserved": [0, 0, 0]
  },
  "endpoint_list": {"type": "preset", "preset_id": "default"},
  "amnezia_overrides": null
}
```
**And** stores token mapping in KV `token:{token}` → `{account-uuid}`  
**And** returns account details to UI

**Error cases:**
- Name empty: Return 400 "Account name required"
- Name > 100 chars: Return 400 "Account name too long (max 100)"
- Warp API returns 429: Return 503 "Warp API rate limited, try again in 60s"
- Warp API returns 500: Return 503 "Warp API error, try again later"
- Warp API timeout (>10s): Return 504 "Warp API timeout"
- KV write fails: Return 500 "Failed to save account"

---

### AC4: Import Warp Config
**Given** user has existing Warp config (from wgcf or manual registration)  
**When** user clicks "Import Account", enters name "Mobile 4G", pastes `.conf`:
```ini
[Interface]
PrivateKey = YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=
Address = 172.16.0.2/32, 2606:4700:110:8d4a:ca6:b507:215:d04f/128
DNS = 1.1.1.1
MTU = 1280

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 162.159.192.1:2408
PersistentKeepalive = 25
```
**Then** worker parses config, extracts:
- PrivateKey → `config.private_key`
- Address → `config.addresses.ipv4` and `ipv6`
- PublicKey → `config.peer_public_key`
- MTU → `config.mtu` (or default 1280)
**And** derives public key from private key  
**And** stores normalized config in KV (same schema as AC3)  
**And** ignores DNS, AllowedIPs, Endpoint, PersistentKeepalive (not stored)

**Also accepts Throne `wg://` URI:**
```
wg://162.159.192.1:2408?private_key=YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04%3D&local_address=172.16.0.2/32-2606:4700:110:8d4a:ca6:b507:215:d04f/128&mtu=1280&public_key=bmXOC%2BF1FxEMF9dyiK2H5%2F1SUtzH0JuVo51h2wPfgyo%3D
```
**Then** parses query params, normalizes to same schema

**Error cases:**
- Config < 100 bytes: Return 400 "Invalid config (too short)"
- Config > 10KB: Return 400 "Config too large (max 10KB)"
- Missing PrivateKey: Return 400 "Invalid config: PrivateKey required"
- Invalid PrivateKey format: Return 400 "Invalid PrivateKey (must be base64)"
- Missing Address: Return 400 "Invalid config: Address required"
- Invalid URI format: Return 400 "Invalid wg:// URI format"

---

### AC5: Subscription Generation (WireGuard .conf vanilla)
**Given** account "Home ISP" exists with default preset (5 endpoints)  
**When** user visits `/sub/{token}/wireguard-conf`  
**Then** worker looks up token → account  
**And** loads preset "default" (5 endpoints)  
**And** generates 5 `.conf` files:
```ini
# File: Home-ISP-engage.cloudflareclient.com-2408.conf
[Interface]
PrivateKey = YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=
Address = 172.16.0.2/32, 2606:4700:110:8d4a:ca6:b507:215:d04f/128
DNS = 1.1.1.1
MTU = 1280

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
PersistentKeepalive = 25

# File: Home-ISP-162.159.192.1-2408.conf (same but Endpoint = 162.159.192.1:2408)
# ... 3 more files ...
```
**And** creates ZIP archive with 5 files  
**And** returns ZIP with headers:
```
Content-Type: application/zip
Content-Disposition: attachment; filename*=utf-8''Home-ISP-wireguard-conf.zip
Cache-Control: max-age=300
Profile-Update-Interval: 24
```

**Error cases:**
- Invalid token: Return 404 "Subscription not found"
- Account deleted: Return 404 "Account no longer exists"
- Preset not found: Return 500 "Endpoint preset missing"
- ZIP generation fails: Return 500 "Failed to generate subscription"

---

### AC6: Subscription Generation (WireGuard .conf Amnezia)
**Same as AC5, but route is `/sub/{token}/wireguard-conf-amnezia`**  
**And** `.conf` files include Amnezia params in `[Interface]`:
```ini
[Interface]
PrivateKey = YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=
Address = 172.16.0.2/32, 2606:4700:110:8d4a:ca6:b507:215:d04f/128
DNS = 1.1.1.1
MTU = 1280
Jc = 5
Jmin = 50
Jmax = 1000
S1 = 0
S2 = 0
H1 = 1
H2 = 2
H3 = 3
H4 = 4

[Peer]
...
```
**Where Jc, Jmin, etc. come from:**
1. Account's `amnezia_overrides` if set
2. Else, global `settings:global.amnezia`
3. Else, hardcoded defaults (above values)

---

### AC7: Subscription Generation (Sing-box JSON — endpoint schema)
**Given** account "Home ISP" with 5 endpoints  
**When** user visits `/sub/{token}/singbox`  
**Then** worker generates the **endpoint schema** (required by sing-box v1.11+ and Throne 1.13+, which removed the legacy outbound):
```json
{
  "endpoints": [
    {
      "type": "wireguard",
      "tag": "Home-ISP-engage.cloudflareclient.com-2408",
      "address": ["172.16.0.2/32", "2606:4700:110:8d4a:ca6:b507:215:d04f/128"],
      "private_key": "YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=",
      "mtu": 1280,
      "workers": 4,
      "peers": [{
        "address": "engage.cloudflareclient.com",
        "port": 2408,
        "public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
        "allowed_ips": ["0.0.0.0/0", "::/0"],
        "persistent_keepalive_interval": 25
      }]
    }
    // ... one endpoint per config; bare addresses get /32 or /128 appended; tags unique
  ],
  "route": { "final": "Home-ISP-engage.cloudflareclient.com-2408" }
}
```
**And** returns with headers:
```
Content-Type: application/json
Profile-Update-Interval: 24
Cache-Control: max-age=300
```
**v1.1:** the legacy outbound schema (`outbounds` with `server`/`local_address`/`peer_public_key`) moved to route `/sub/{token}/singbox-legacy` for NekoBox / Hiddify / sing-box <= 1.10.

---

### AC8: Subscription Generation (Xray JSON)
**Same as AC7, but route is `/sub/{token}/xray`**  
**And** JSON format:
```json
{
  "outbounds": [
    {
      "protocol": "wireguard",
      "tag": "Home-ISP-engage.cloudflareclient.com-2408",
      "settings": {
        "secretKey": "YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=",
        "address": [
          "172.16.0.2/32",
          "2606:4700:110:8d4a:ca6:b507:215:d04f/128"
        ],
        "peers": [
          {
            "endpoint": "engage.cloudflareclient.com:2408",
            "publicKey": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
            "keepAlive": 25
          }
        ],
        "mtu": 1280,
        "reserved": [0, 0, 0]
      }
    }
    // ... 4 more outbounds
  ]
}
```

---

### AC9: Subscription Generation (Clash YAML)
**Same as AC7, but route is `/sub/{token}/clash`**  
**And** YAML format:
```yaml
proxies:
  - name: "Home-ISP-engage.cloudflareclient.com-2408"
    type: wireguard
    server: engage.cloudflareclient.com
    port: 2408
    ip: 172.16.0.2
    ipv6: 2606:4700:110:8d4a:ca6:b507:215:d04f
    private-key: YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=
    public-key: bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
    udp: true
    reserved: [0, 0, 0]
    mtu: 1280

  - name: "Home-ISP-162.159.192.1-2408"
    type: wireguard
    server: 162.159.192.1
    port: 2408
    ip: 172.16.0.2
    ipv6: 2606:4700:110:8d4a:ca6:b507:215:d04f
    private-key: YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=
    public-key: bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
    udp: true
    reserved: [0, 0, 0]
    mtu: 1280

  # ... 3 more proxies
```
**And** returns with:
```
Content-Type: application/x-yaml; charset=utf-8
```

---

### AC10: Subscription Caching
**Given** subscription generated at 12:00:00  
**When** same subscription requested at 12:03:00  
**Then** worker checks KV `cache:{token}:{format}` (key includes timestamp floor to 5-min bucket)  
**And** returns cached response (no regeneration)  
**When** same subscription requested at 12:06:00  
**Then** cache expired (>5 min), regenerates subscription  
**When** account edited at 12:02:00  
**Then** worker deletes all cache keys `cache:{token}:*`  
**And** next subscription request regenerates

---

### AC11: Input Validation
**All API endpoints validate inputs:**

| Field | Rule |
|-------|------|
| `name` | 1-100 chars, no control characters |
| `config` (import) | 100 bytes - 10KB |
| `private_key` | Valid base64, 32 bytes decoded |
| `public_key` | Valid base64, 32 bytes decoded |
| `ip` (endpoint) | Strict IPv4/IPv6 or domain (max 253 chars; IPv6 group/hex rules, per-label domain rules) |
| `port` (endpoint) | 1-65535 |
| endpoints per account/preset | 1-200 |
| `Jc` | 0-128 (kernel cap) |
| `Jmin`, `Jmax` | 0-1280, `Jmin <= Jmax` |
| `S1`, `S2` | 0-255 |
| `H1-H4` | 0-2147483647, integer or `lo-hi` range string; must not overlap pairwise |
| `password` | 8-128 chars (bcrypt applies 72-byte truncation) |

**Return 400 with specific error message on validation failure.**

### AC11a: Import Normalization (v1.1)
- `.conf` ([Interface] once, first [Peer] only; `Reserved = a,b,c` / `ClientId = <base64>` preserved; Amnezia ranges `H1 = 123-456` kept as strings)
- `wg://` / `wireguard://` (10KB cap; comma- or dash-separated address pairs; guarded percent-decoding)
- WARP API registers store decoded `client_id` → `reserved` bytes (fallback `[0,0,0]`)

---

## Open Questions

1. **Warp API stability:** Unofficial API could change. Should we version API calls or add fallback logic?
   - Proposal: Document API version in comments, add error logging for unexpected responses

2. **KV free tier exhaustion:** What happens if user exceeds 1k writes/day?
   - Proposal: Return 503 "Storage quota exceeded, try again tomorrow"

3. **Subscription URL security:** Tokens are public (no auth). Is this acceptable?
   - Proposal: Yes — standard for VPN subscriptions. Add "regenerate token" for leaked tokens.

4. **HTML hosting:** Fetch from GitHub raw or embed in worker?
   - Proposal: Fetch from GitHub (easier to update UI without redeploying worker)

5. **Password reset:** No email, how does user recover access?
   - Proposal: Document "redeploy worker with `wrangler kv:key delete settings:password`" in README

6. **Amnezia client compatibility:** Which clients actually support all Amnezia params?
   - Research shows: Amnezia VPN (all), Clash Meta (all), Throne (all), WireSock (Jc/Jmin/Jmax only)
   - Proposal: Document compatibility matrix in README

7. **Endpoint testing:** Should worker validate endpoints are reachable?
   - Proposal: No — too slow (10ms CPU limit). User tests endpoints with cf-scanner.

8. **Multi-account race conditions:** Two browser tabs editing same account?
   - Proposal: Last write wins (no locking in KV). Acceptable for single-admin use case.

---

## v2.0.0 Addendum (2026-08-23)

The historical ACs above stand unchanged. Batches B2–B10 added the following acceptance criteria.
Where an addendum AC supersedes old behavior, both are noted honestly.

### AC12: Health Check (`/healthz`)
**Given** the worker is deployed  
**When** `GET /healthz` is called without a session  
**Then** response is `200` with JSON `{ ok: true, version: <semver>, kv_ms: <number> }`  
**And** `version` matches the worker's `VERSION` constant  
**And** a live KV read is performed; if KV errors, `ok: false` + `error` field (still 200 — liveness vs. readiness is reported in-band)

### AC13: Token Lifecycle
**Given** an account has `tokenMeta { expiresAt, disabled }` (additive schema; absent = active forever)  
**Then**
- expired token → any `/sub/{token}/{format}` request returns **410 Gone** ("Subscription expired")
- `disabled: true` → **410 Gone** ("Subscription revoked")
- active token → 200 as before (backward compatible with all v1 KV data)
- `fetchCount` increments on each successful subscription fetch

### AC14: Encrypted Backup Round-Trip
**Given** accounts, presets, and global settings exist  
**When** `POST /api/backup/export {password}` is called  
**Then** an AES-GCM encrypted `.wgenc` blob downloads (`WGENC1` magic, PBKDF2-derived key)  
**And** importing that blob via `POST /api/backup/import` (multipart `file`, `password`, `mode=skip|overwrite`) restores every account/preset/settings item that passes validation  
**And** per-item failures are reported individually; a bad password fails cleanly  
**And** the backup file contains all private keys — treated as credentials-equivalent material

### AC15: Aggregate (Group) Subscriptions
**Given** accounts carry group tags (`account.group`) and an agg record exists at KV `agg:{token}` listing selected groups  
**When** `/sub/{aggToken}/{format}` is fetched  
**Then** configs of all *active* member accounts across those groups are merged into one response through the normal format registry  
**And** agg tokens support label/expiry lifecycle like account tokens (410 on expiry/revoke)  
**And** if no group member is active → 404 "No active accounts in this group"

### AC16: De-CDN Admin Pages
**Given** any admin page (`/admin`, `/admin/login`, `/admin/setup`) is loaded  
**Then** the page issues **zero third-party network requests** — all CSS/JS/fonts/icons are inline  
**And** QR generation, latency probing, and client helpers run entirely in-browser from inline code

### Behavioral changes vs. historical ACs (intentional)
- Wrong HTTP method on a defined path → **405 Method Not Allowed** (+ `Allow` header), not 404
- Unknown `/api/*` paths → 501; unknown non-API paths → 404
- Subscription cache moved from KV `cache:*` keys to the Cache API (AC10's mechanism changed;
  TTL semantics ~5 min preserved via Cache-Control); stale v1.x KV keys are harmless
- `/sub/*` HEAD returns headers-only mirror of GET status/headers
- Added validation rules (in addition to AC11): DNS (IPv4/IPv6/domain), token label (1–100),
  expiresAt (future ISO date), group tag (sanitized within limits), backup password (8–128)

---

**Next Step:** Human reviews and approves this spec, or requests changes. Once approved, proceed to Phase 2 (Plan).
