# Task List: Warp Generator

**Project:** Cloudflare Worker - Warp Config Manager  
**Plan:** See `tasks/plan.md` for architecture decisions and dependency graph  
**Status:** Ready for implementation

---

## Phase 1: Foundation

### Task 1: Worker Skeleton & Route Dispatcher

**Description:** Create `_worker.js` with basic route dispatcher, error handling, and main entry point. Set up `wrangler.toml` with KV namespace binding.

**Acceptance criteria:**
- [ ] `_worker.js` exports default `fetch` handler
- [ ] Route dispatcher handles `/admin`, `/api/*`, `/sub/*` patterns
- [ ] Top-level try/catch returns 500 on errors
- [ ] Returns 404 for unknown routes
- [ ] `wrangler.toml` configured with KV namespace binding

**Verification:**
- [ ] Deploy succeeds: `wrangler deploy`
- [ ] Dev mode works: `wrangler dev --local`
- [ ] Visiting `/admin` returns 404 (not implemented yet)
- [ ] Visiting random path returns 404

**Dependencies:** None

**Files likely touched:**
- `_worker.js` (create)
- `wrangler.toml` (create)
- `package.json` (create)

**Estimated scope:** Small (3 files, ~100 lines total)

---

### Task 2: KV Schema Initialization & Default Data

**Description:** Add KV helper functions. On first request, check if `settings:global` exists. If not, seed KV with default presets and Amnezia settings.

**Acceptance criteria:**
- [ ] `initializeKV(env)` function checks for `settings:global`
- [ ] If missing, writes 5 default endpoint presets to `presets` key
- [ ] If missing, writes default Amnezia settings to `settings:global`
- [ ] Presets include: `engage.cloudflareclient.com:2408`, `162.159.192.1:2408`, `162.159.192.1:500`, `162.159.192.1:1701`, `[2606:4700:d0::a29f:c001]:2408`
- [ ] Amnezia defaults: `{Jc: 5, Jmin: 50, Jmax: 1000, S1: 0, S2: 0, H1: 1, H2: 2, H3: 3, H4: 4}`

**Verification:**
- [ ] Deploy worker, trigger any route
- [ ] Check KV: `wrangler kv:key get --namespace-id=<id> "presets"`
- [ ] Check KV: `wrangler kv:key get --namespace-id=<id> "settings:global"`
- [ ] Both keys contain expected JSON

**Dependencies:** Task 1

**Files likely touched:**
- `_worker.js` (add KV helpers, initialization logic)

**Estimated scope:** Small (1 file, ~80 lines)

---

### Task 3: Password Setup & Bcrypt Hashing

**Description:** Implement `/admin/setup` route (GET and POST). GET serves setup wizard HTML. POST validates password (8+ chars), hashes with bcrypt, stores in `settings:password`, redirects to login.

**Acceptance criteria:**
- [ ] GET `/admin/setup` returns HTML form (password input, submit button)
- [ ] POST `/admin/setup` validates password length (8-128 chars)
- [ ] Returns 400 "Password must be at least 8 characters" if too short
- [ ] Hashes password with bcrypt (cost factor 10)
- [ ] Stores hash in KV `settings:password`
- [ ] Returns 302 redirect to `/admin/login`
- [ ] If `settings:password` already exists, redirects to `/admin/login`

**Verification:**
- [ ] Visit `/admin/setup`, enter password "test123" → shows error
- [ ] Enter password "test1234" → redirects to `/admin/login`
- [ ] Check KV: `wrangler kv:key get --namespace-id=<id> "settings:password"`
- [ ] Hash starts with `$2a$10$` (bcrypt signature)
- [ ] Revisit `/admin/setup` → redirects to login (already set)

**Dependencies:** Task 2

**Files likely touched:**
- `_worker.js` (add bcrypt import, setup handlers)
- `html/setup.html` (create)

**Estimated scope:** Medium (2 files, ~120 lines)

---

### Task 4: Login & Session Management

**Description:** Implement `/admin/login` (GET/POST) and session validation middleware. POST validates password against bcrypt hash, creates session (random UUID), stores in KV with 24h expiry, sets HttpOnly cookie.

**Acceptance criteria:**
- [ ] GET `/admin/login` returns HTML form (password input, submit button)
- [ ] POST `/admin/login` validates password with `bcrypt.compare()`
- [ ] Returns 400 "Invalid password" if wrong password
- [ ] Generates session token (`crypto.randomUUID()`)
- [ ] Stores in KV `session:{token}` → `{expires_at: Date.now() + 86400000}`
- [ ] Sets cookie: `session={token}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
- [ ] Returns 302 redirect to `/admin`
- [ ] Session validation middleware checks cookie, looks up `session:{token}` in KV
- [ ] If session expired or missing, redirects to `/admin/login`
- [ ] `/admin/logout` POST deletes session from KV, clears cookie

**Verification:**
- [ ] Visit `/admin/login`, enter wrong password → shows error
- [ ] Enter correct password → redirects to `/admin`, cookie set
- [ ] Check KV: `wrangler kv:key get --namespace-id=<id> "session:{token}"`
- [ ] Refresh `/admin` → stays on page (session valid)
- [ ] Wait 24+ hours or delete session from KV → redirects to login

**Dependencies:** Task 3

**Files likely touched:**
- `_worker.js` (add login handlers, session validation middleware)
- `html/login.html` (create)

**Estimated scope:** Medium (2 files, ~150 lines)

---

## Checkpoint 1: Foundation Complete

**Verify before proceeding:**
- [ ] Worker deploys successfully to Cloudflare
- [ ] `/admin/setup` sets password, stores bcrypt hash in KV
- [ ] `/admin/login` validates password, sets session cookie
- [ ] Session persists across requests (KV lookup validates cookie)
- [ ] `/admin` route protected (redirects to login if no session)
- [ ] All error cases return proper status codes (400, 401, 500)

---

## Phase 2: Warp Integration

### Task 5: Curve25519 Keypair Generation

**Description:** Add Curve25519 keypair generation using `@noble/curves` library. Function takes no input, returns `{privateKey: base64, publicKey: base64}`.

**Acceptance criteria:**
- [ ] Install `@noble/curves` dependency
- [ ] `generateKeypair()` function generates random 32-byte private key
- [ ] Derives public key using Curve25519
- [ ] Returns both as base64 strings
- [ ] Keys are valid WireGuard keypair (public key derivable from private)

**Verification:**
- [ ] Call `generateKeypair()` in dev console
- [ ] Private key is 44 chars base64 (32 bytes encoded)
- [ ] Public key is 44 chars base64
- [ ] Use `wg pubkey` CLI to verify: `echo <privateKey> | wg pubkey` matches generated public key

**Dependencies:** Task 1

**Files likely touched:**
- `_worker.js` (add keypair generation function)
- `package.json` (add `@noble/curves` dependency)

**Estimated scope:** Small (2 files, ~40 lines)

---

### Task 6: Warp API Registration Client

**Description:** Implement `registerWarpAccount(env)` function that calls Cloudflare Warp API to register new account. Returns normalized config.

**Acceptance criteria:**
- [ ] Generates keypair via Task 5 function
- [ ] POSTs to `https://api.cloudflareclient.com/v0a4005/reg` with payload:
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
- [ ] Handles 429 (rate limit) → returns error "Warp API rate limited, try again in 60s"
- [ ] Handles 500 → returns error "Warp API error, try again later"
- [ ] Handles timeout (10s) → returns error "Warp API timeout"
- [ ] Extracts from response: `config.interface.addresses.v4`, `config.interface.addresses.v6`, `config.peers[0].public_key`, `config.peers[0].endpoint.host`
- [ ] Returns normalized object:
  ```json
  {
    "private_key": "...",
    "public_key": "...",
    "addresses": {"ipv4": "172.16.0.2/32", "ipv6": "..."},
    "peer_public_key": "bmXOC+...",
    "mtu": 1280,
    "reserved": [0, 0, 0]
  }
  ```

**Verification:**
- [ ] Call `registerWarpAccount(env)` in dev mode
- [ ] Returns valid config object
- [ ] Addresses are valid CIDR notation
- [ ] Peer public key is 44-char base64
- [ ] Test rate limiting: call 10 times rapidly, verify 429 handling

**Dependencies:** Task 5

**Files likely touched:**
- `_worker.js` (add Warp API client function)

**Estimated scope:** Medium (1 file, ~100 lines)

---

### Task 7: Config Parser & Normalizer

**Description:** Implement parsers for WireGuard `.conf` and Throne `wg://` URI formats. Normalize both to common schema.

**Acceptance criteria:**
- [ ] `parseWireGuardConf(text)` extracts `PrivateKey`, `Address`, `PublicKey` from `.conf` INI format
- [ ] Handles IPv4 and IPv6 addresses (comma-separated in `Address` field)
- [ ] `parseWgUri(uri)` extracts same fields from `wg://` query params
- [ ] Both parsers return normalized object (same schema as Task 6)
- [ ] Validates required fields: `PrivateKey`, `Address`, `PublicKey` (peer)
- [ ] Returns error object if validation fails: `{error: "Invalid config: PrivateKey required"}`
- [ ] Strips Amnezia params (Jc, Jmin, etc.) — not stored in normalized config
- [ ] Ignores `DNS`, `AllowedIPs`, `Endpoint`, `PersistentKeepalive` (not needed for storage)

**Verification:**
- [ ] Parse sample `.conf` from SPEC.md AC4 → returns normalized object
- [ ] Parse sample `wg://` URI from SPEC.md AC4 → returns same normalized object
- [ ] Parse invalid config (missing PrivateKey) → returns error object
- [ ] Parse config with Amnezia params → strips them, returns clean config

**Dependencies:** None

**Files likely touched:**
- `_worker.js` (add parser functions)

**Estimated scope:** Medium (1 file, ~150 lines)

---

### Task 8: Account CRUD API

**Description:** Implement `/api/account/*` endpoints: generate, import, list, get, update, delete, regenerate-token.

**Acceptance criteria:**
- [ ] POST `/api/account/generate` with `{name}` → calls Task 6, stores in KV `account:{uuid}`, returns `{id, token, config}`
- [ ] POST `/api/account/import` with `{name, config}` → parses via Task 7, stores in KV, returns `{id, token}`
- [ ] GET `/api/account` → lists all accounts (scan KV keys `account:*`)
- [ ] GET `/api/account/{id}` → returns account details
- [ ] PUT `/api/account/{id}` with `{name?, endpoints?, amnezia_overrides?}` → updates account
- [ ] DELETE `/api/account/{id}` → deletes `account:{id}` and `token:{token}` from KV
- [ ] POST `/api/account/{id}/regenerate-token` → generates new token, updates `token:{token}` mapping, invalidates old token
- [ ] All endpoints require session (middleware from Task 4)
- [ ] Input validation per SPEC.md AC11 (name: 1-100 chars, config: 100 bytes - 10KB, etc.)
- [ ] Returns 400 with specific error message on validation failure

**Verification:**
- [ ] Generate account via API → stored in KV with correct schema
- [ ] Import `.conf` via API → normalized and stored
- [ ] List accounts → returns array of accounts
- [ ] Update account name → reflected in KV
- [ ] Delete account → removed from KV (verify with `wrangler kv:key get`)
- [ ] Regenerate token → old token returns 404, new token works

**Dependencies:** Task 4, Task 6, Task 7

**Files likely touched:**
- `_worker.js` (add account API handlers)

**Estimated scope:** Large (1 file, ~250 lines)

---

## Checkpoint 2: Warp Integration Complete

**Verify before proceeding:**
- [ ] Can generate new Warp account (POST `/api/account/generate`)
- [ ] Can import Warp .conf (POST `/api/account/import`)
- [ ] Account stored in KV with normalized schema
- [ ] Token generated and mapped (`token:{token}` → account UUID)
- [ ] Can list/view/delete accounts via API
- [ ] All error cases return proper status codes and messages

---

## Phase 3: Subscription Core

### Task 9: Subscription Token Lookup & Endpoint Expansion

**Description:** Implement `/sub/{token}/*` route handler. Look up token, resolve account, expand endpoints.

**Acceptance criteria:**
- [ ] Extract token from URL path `/sub/{token}/{format}`
- [ ] Look up `token:{token}` in KV → resolve to account UUID
- [ ] Return 404 "Subscription not found" if token invalid
- [ ] Load account from KV `account:{uuid}`
- [ ] Return 404 "Account no longer exists" if account deleted
- [ ] Load endpoint list:
  - If `account.endpoint_list.type === "preset"`, load `presets` from KV, find preset by ID
  - If `account.endpoint_list.type === "custom"`, use `account.endpoint_list.custom_endpoints`
- [ ] Expand to N configs (one per endpoint):
  - Same `private_key`, `public_key`, `addresses`, `peer_public_key`, `mtu`, `reserved`
  - Different `endpoint` (IP:port from preset/custom list)
  - Different `tag`/`name`: `{AccountName} - {IP}:{Port}` format

**Verification:**
- [ ] Create account with default preset (5 endpoints)
- [ ] Call `/sub/{token}/test` (format not implemented yet) → returns 501 "Format not implemented"
- [ ] Verify token lookup logs show 5 expanded configs
- [ ] Invalid token → 404
- [ ] Delete account, use token → 404

**Dependencies:** Task 8

**Files likely touched:**
- `_worker.js` (add subscription route handler, endpoint expansion logic)

**Estimated scope:** Medium (1 file, ~120 lines)

---

### Task 10: WireGuard .conf Generator (Vanilla)

**Description:** Implement `generateWireGuardConf(configs, amnezia = false)` function. Returns ZIP with N `.conf` files.

**Acceptance criteria:**
- [ ] Takes array of expanded configs (from Task 9)
- [ ] Generates one `.conf` file per config with format:
  ```ini
  [Interface]
  PrivateKey = ...
  Address = 172.16.0.2/32, 2606:4700:110:...
  DNS = 1.1.1.1
  MTU = 1280

  [Peer]
  PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
  AllowedIPs = 0.0.0.0/0, ::/0
  Endpoint = 162.159.192.1:2408
  PersistentKeepalive = 25
  ```
- [ ] Filename: `{AccountName}-{IP}-{Port}.conf` (sanitize account name, replace spaces with dashes)
- [ ] Uses `fflate` library to create ZIP archive
- [ ] If `amnezia === true`, adds Amnezia params to `[Interface]` section (Task 11)
- [ ] Returns ZIP as `Uint8Array`

**Verification:**
- [ ] Generate ZIP for account with 5 endpoints
- [ ] ZIP contains 5 `.conf` files
- [ ] Each file has different `Endpoint` value
- [ ] Extract ZIP, open one `.conf` → valid WireGuard format
- [ ] Import into WireSock → connects successfully

**Dependencies:** Task 9

**Files likely touched:**
- `_worker.js` (add format generator function)
- `package.json` (add `fflate` dependency)

**Estimated scope:** Medium (2 files, ~100 lines)

---

### Task 11: WireGuard .conf Generator (Amnezia)

**Description:** Extend Task 10 generator to support Amnezia obfuscation params in `[Interface]` section.

**Acceptance criteria:**
- [ ] If `amnezia === true`, loads Amnezia settings:
  - Check `account.amnezia_overrides` (per-account settings)
  - If null, load `settings:global.amnezia`
  - If null, use hardcoded defaults from SPEC.md
- [ ] Adds to `[Interface]` section:
  ```ini
  Jc = 5
  Jmin = 50
  Jmax = 1000
  S1 = 0
  S2 = 0
  H1 = 1
  H2 = 2
  H3 = 3
  H4 = 4
  ```
- [ ] Values come from resolved Amnezia settings (not hardcoded)

**Verification:**
- [ ] Generate Amnezia ZIP for account
- [ ] Extract `.conf`, verify Amnezia params present
- [ ] Change global Amnezia settings via API
- [ ] Regenerate ZIP → new values reflected
- [ ] Set per-account overrides → takes precedence over global
- [ ] Import into Amnezia VPN client → obfuscation works

**Dependencies:** Task 10

**Files likely touched:**
- `_worker.js` (extend generator function)

**Estimated scope:** Small (1 file, ~50 lines)

---

## Checkpoint 3: Subscription Core Complete

**Verify before proceeding:**
- [ ] `/sub/{token}/wireguard-conf` resolves token → account
- [ ] Expands account + preset → N configs (one per endpoint)
- [ ] Returns ZIP with N `.conf` files
- [ ] `/sub/{token}/wireguard-conf-amnezia` includes Amnezia params
- [ ] Tested: Import vanilla ZIP into WireSock, connect successfully
- [ ] Tested: Import Amnezia ZIP into Amnezia VPN, obfuscation active

---

## Phase 4: Format Generators

**Note:** Tasks 12-19 are independent and can be parallelized. Each implements one subscription format.

### Task 12: Throne `wg://` URI Generator (Vanilla)

**Description:** Implement `generateThroneUri(configs, amnezia = false)` function. Returns text with one URI per line.

**Acceptance criteria:**
- [ ] Generates `wg://` URI per config with format:
  ```
  wg://{IP}:{Port}?private_key={base64-encoded}&local_address={IPv4}-{IPv6}&mtu=1280&public_key={base64-encoded}&persistent_keepalive_interval=25#{ConfigName}
  ```
- [ ] URL-encodes all query params (`=` → `%3D`, `/` → `%2F`)
- [ ] Fragment (`#{ConfigName}`) is human-readable name
- [ ] If `amnezia === true`, adds `&enable_amnezia=true&jc=5&jmin=50&jmax=1000&s1=0&s2=0&h1=1&h2=2&h3=3&h4=4`
- [ ] Returns text with one URI per line (newline-separated)

**Verification:**
- [ ] Generate Throne URIs for 5 configs
- [ ] Returns 5 lines of text
- [ ] Copy one URI, paste into Throne VPN → imports successfully
- [ ] Generate Amnezia variant → URI includes `enable_amnezia=true` and all params

**Dependencies:** Task 9

**Files likely touched:**
- `_worker.js` (add format generator function)

**Estimated scope:** Small (1 file, ~70 lines)

---

### Task 13: `wireguard://` URI Generator

**Description:** Implement `generateWireguardUri(configs)` function. Returns text with standard `wireguard://` URIs (no Amnezia support).

**Acceptance criteria:**
- [ ] Generates `wireguard://` URI per config with format:
  ```
  wireguard://{privateKey}@{IP}:{Port}?publickey={peerPublicKey}&address={IPv4}&allowedips=0.0.0.0/0&mtu=1280#{ConfigName}
  ```
- [ ] Private key in userinfo section (before `@`)
- [ ] URL-encodes query params
- [ ] Does NOT support Amnezia params (per research, this format has no Amnezia extension)

**Verification:**
- [ ] Generate URIs for 5 configs
- [ ] Copy one URI, paste into V2RayN → imports successfully
- [ ] Verify connection works

**Dependencies:** Task 9

**Files likely touched:**
- `_worker.js` (add format generator function)

**Estimated scope:** Small (1 file, ~60 lines)

---

### Task 14: Sing-box JSON Generator

**Description:** Implement `generateSingboxJson(configs)` function. Returns JSON with `outbounds[]` array (legacy format for Hiddify/NekoBox compatibility).

**Acceptance criteria:**
- [ ] Generates JSON per SPEC.md AC7:
  ```json
  {
    "outbounds": [
      {
        "type": "wireguard",
        "tag": "Home-ISP-162.159.192.1-2408",
        "server": "162.159.192.1",
        "server_port": 2408,
        "local_address": ["172.16.0.2/32", "2606:4700:110:.../128"],
        "private_key": "...",
        "peer_public_key": "...",
        "mtu": 1280,
        "reserved": [0, 0, 0]
      }
    ]
  }
  ```
- [ ] Uses legacy outbound format (not endpoint format from sing-box 1.11+)
- [ ] One outbound per config

**Verification:**
- [ ] Generate JSON for 5 configs
- [ ] Paste into Hiddify app → imports all 5 profiles
- [ ] Select one profile, connect → works
- [ ] Repeat test with NekoBox app

**Dependencies:** Task 9

**Files likely touched:**
- `_worker.js` (add format generator function)

**Estimated scope:** Small (1 file, ~50 lines)

---

### Task 15: Xray JSON Generator

**Description:** Implement `generateXrayJson(configs)` function. Returns JSON with `outbounds[]` using Xray-core WireGuard schema.

**Acceptance criteria:**
- [ ] Generates JSON per SPEC.md AC8:
  ```json
  {
    "outbounds": [
      {
        "protocol": "wireguard",
        "tag": "Home-ISP-162.159.192.1-2408",
        "settings": {
          "secretKey": "...",
          "address": ["172.16.0.2/32", "..."],
          "peers": [{
            "endpoint": "162.159.192.1:2408",
            "publicKey": "...",
            "keepAlive": 25
          }],
          "mtu": 1280,
          "reserved": [0, 0, 0]
        }
      }
    ]
  }
  ```
- [ ] Uses `secretKey` (not `private_key`)
- [ ] `peers[]` array with single peer per outbound

**Verification:**
- [ ] Generate JSON for 5 configs
- [ ] Save to file, run `xray -c config.json -test` → passes validation
- [ ] Import into V2RayN (supports Xray format) → works

**Dependencies:** Task 9

**Files likely touched:**
- `_worker.js` (add format generator function)

**Estimated scope:** Small (1 file, ~60 lines)

---

### Task 16: Clash YAML Generator

**Description:** Implement `generateClashYaml(configs)` function. Returns YAML with `proxies[]` array.

**Acceptance criteria:**
- [ ] Install `js-yaml` dependency
- [ ] Generates YAML per SPEC.md AC9:
  ```yaml
  proxies:
    - name: "Home-ISP-162.159.192.1-2408"
      type: wireguard
      server: 162.159.192.1
      port: 2408
      ip: 172.16.0.2
      ipv6: 2606:4700:110:...
      private-key: ...
      public-key: ...
      udp: true
      reserved: [0, 0, 0]
      mtu: 1280
  ```
- [ ] Uses `js-yaml.dump()` to serialize
- [ ] One proxy per config

**Verification:**
- [ ] Generate YAML for 5 configs
- [ ] Save to `config.yaml`, run Clash Meta with it → loads successfully
- [ ] Select proxy, connect → works

**Dependencies:** Task 9

**Files likely touched:**
- `_worker.js` (add format generator function)
- `package.json` (add `js-yaml` dependency)

**Estimated scope:** Small (2 files, ~70 lines)

---

### Task 17: V2RayN Base64 Generator

**Description:** Implement `generateV2raynBase64(configs)` function. Returns base64-encoded list of `wireguard://` URIs.

**Acceptance criteria:**
- [ ] Reuses Task 13 `generateWireguardUri()` function
- [ ] Joins URIs with newlines
- [ ] Base64-encodes entire text block
- [ ] Returns single base64 string (no line breaks)

**Verification:**
- [ ] Generate base64 for 5 configs
- [ ] Copy base64 string, paste into V2RayN subscription URL field → imports 5 configs
- [ ] Connect to one → works

**Dependencies:** Task 13

**Files likely touched:**
- `_worker.js` (add format generator function)

**Estimated scope:** XS (1 file, ~20 lines)

---

### Task 18: Subscription Route Handlers (All Formats)

**Description:** Wire up all format generators to `/sub/{token}/{format}` routes. Return responses with correct Content-Type headers.

**Acceptance criteria:**
- [ ] `/sub/{token}/wireguard-conf` → calls Task 10, returns ZIP with `Content-Type: application/zip`
- [ ] `/sub/{token}/wireguard-conf-amnezia` → calls Task 11, returns ZIP
- [ ] `/sub/{token}/throne` → calls Task 12, returns text with `Content-Type: text/plain; charset=utf-8`
- [ ] `/sub/{token}/throne-amnezia` → calls Task 12 with `amnezia=true`, returns text
- [ ] `/sub/{token}/wireguard-uri` → calls Task 13, returns text
- [ ] `/sub/{token}/singbox` → calls Task 14, returns JSON with `Content-Type: application/json`
- [ ] `/sub/{token}/xray` → calls Task 15, returns JSON
- [ ] `/sub/{token}/clash` → calls Task 16, returns YAML with `Content-Type: application/x-yaml; charset=utf-8`
- [ ] `/sub/{token}/v2rayn` → calls Task 17, returns text (base64)
- [ ] All routes include subscription headers from SPEC.md:
  ```
  Profile-Update-Interval: 24
  Subscription-Userinfo: upload=0; download=0; total=104857600; expire=4102329600
  Content-Disposition: attachment; filename*=utf-8''{accountName}-{format}
  Cache-Control: max-age=300
  ```

**Verification:**
- [ ] Visit each subscription URL, verify correct Content-Type
- [ ] Download each format, verify file/content structure
- [ ] Check response headers include all required headers

**Dependencies:** Tasks 10-17

**Files likely touched:**
- `_worker.js` (add route handlers)

**Estimated scope:** Medium (1 file, ~100 lines)

---

### Task 19: Subscription Caching

**Description:** Add caching layer for subscription responses. Cache in KV with 5-minute TTL, invalidate on account edit.

**Acceptance criteria:**
- [ ] `getCachedSubscription(token, format)` checks KV `cache:{token}:{format}:{timeBucket}`
  - `timeBucket` = `Math.floor(Date.now() / 300000)` (5-min bucket)
- [ ] If found, returns cached response (skip generation)
- [ ] `setCachedSubscription(token, format, data)` stores response in KV with same key
- [ ] `invalidateSubscriptionCache(token)` deletes all keys matching `cache:{token}:*` (use KV list + delete)
- [ ] Called when account updated/deleted (Task 8 PUT/DELETE endpoints)
- [ ] Cache stores raw response data (ZIP bytes, JSON string, etc.)

**Verification:**
- [ ] Request subscription twice in 1 minute → second request returns cached (verify via logs)
- [ ] Wait 6 minutes, request again → regenerates (new cache entry)
- [ ] Edit account, request subscription → regenerates (cache invalidated)
- [ ] Delete account → cache cleared

**Dependencies:** Task 18

**Files likely touched:**
- `_worker.js` (add caching functions, integrate into route handlers)

**Estimated scope:** Medium (1 file, ~80 lines)

---

## Checkpoint 4: Format Generators Complete

**Verify before proceeding:**
- [ ] All 9 formats generate valid configs
- [ ] Each format tested in at least one real VPN client:
  - V2RayN (base64 URIs) ✓
  - Clash Meta (YAML) ✓
  - Hiddify (Sing-box JSON) ✓
  - NekoBox (Sing-box JSON) ✓
  - Xray CLI (Xray JSON) ✓
  - Throne VPN (wg:// URIs) ✓
  - WireSock (Amnezia .conf) ✓
- [ ] Connection verified: public IP shows Cloudflare (check via `curl ifconfig.me`)
- [ ] Subscription caching works (second request faster, cache invalidates on edit)

---

## Phase 5: Settings & Polish

### Task 20: Preset Management API

**Description:** Implement `/api/presets` endpoints to manage endpoint presets (list, create, update, delete).

**Acceptance criteria:**
- [ ] GET `/api/presets` → returns array from KV `presets`
- [ ] POST `/api/presets` with `{name, endpoints: [{ip, port}]}` → validates, adds to presets array, saves to KV
- [ ] PUT `/api/presets/{id}` with `{name?, endpoints?}` → updates preset
- [ ] DELETE `/api/presets/{id}` → removes preset (only if no accounts using it)
- [ ] Input validation per SPEC.md AC11:
  - IP: valid IPv4/IPv6 or domain (max 253 chars)
  - Port: 1-65535
- [ ] Returns 400 if validation fails with specific error

**Verification:**
- [ ] Create custom preset with 3 endpoints via API
- [ ] List presets → includes new preset
- [ ] Create account with custom preset → subscription uses custom endpoints
- [ ] Delete preset while account using it → returns 400 "Preset in use"
- [ ] Delete account, then delete preset → succeeds

**Dependencies:** Task 8

**Files likely touched:**
- `_worker.js` (add preset API handlers)

**Estimated scope:** Medium (1 file, ~120 lines)

---

### Task 21: Amnezia Settings API

**Description:** Implement `/api/settings/amnezia` endpoints (GET, PUT) to manage global defaults and per-account overrides.

**Acceptance criteria:**
- [ ] GET `/api/settings/amnezia` → returns `settings:global.amnezia` from KV
- [ ] PUT `/api/settings/amnezia` with `{Jc?, Jmin?, Jmax?, S1?, S2?, H1?, H2?, H3?, H4?}` → validates, updates KV
- [ ] Input validation per SPEC.md AC11:
  - Jc: 0-200
  - Jmin, Jmax: 0-1280
  - S1, S2: 0-255
  - H1-H4: 0-4294967295 (uint32)
- [ ] Per-account overrides stored in `account.amnezia_overrides` (already in Task 8 PUT endpoint)
- [ ] Returns 400 if validation fails

**Verification:**
- [ ] Get global Amnezia settings → returns defaults
- [ ] Update Jc to 120 via API
- [ ] Generate Amnezia subscription → Jc=120 in config
- [ ] Set per-account override Jc=10
- [ ] Generate subscription for that account → Jc=10 (overrides global)

**Dependencies:** Task 8

**Files likely touched:**
- `_worker.js` (add settings API handlers)

**Estimated scope:** Small (1 file, ~60 lines)

---

### Task 22: Admin Dashboard UI

**Description:** Create HTML templates for admin panel: dashboard (account list), account detail, settings pages.

**Acceptance criteria:**
- [ ] `html/dashboard.html` → lists all accounts, "Create" and "Import" buttons, logout button
- [ ] Shows account name, created date, subscription token (truncated), actions (view, delete)
- [ ] `html/account.html` → shows account details, subscription URLs for all 9 formats (copy buttons), edit name/endpoints, regenerate token, delete account
- [ ] `html/settings.html` → endpoint presets editor, Amnezia global settings editor
- [ ] All pages use Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- [ ] Forms POST to API endpoints (JS `fetch()`)
- [ ] Copy-to-clipboard buttons use `navigator.clipboard.writeText()`
- [ ] Error messages shown inline (JS inserts error text into DOM)
- [ ] Logout button POSTs to `/admin/logout`

**Verification:**
- [ ] Visit `/admin` → shows dashboard with account list
- [ ] Click "Create Account" → modal/form appears, submit → account created, page refreshes
- [ ] Click account → shows detail page with 9 subscription URLs
- [ ] Click copy button → URL copied to clipboard
- [ ] Visit `/admin/settings` → can edit presets and Amnezia settings
- [ ] Logout → redirects to login, session cleared

**Dependencies:** Task 4, Task 8, Task 20, Task 21

**Files likely touched:**
- `html/dashboard.html` (create)
- `html/account.html` (create)
- `html/settings.html` (create)
- `_worker.js` (wire up HTML fetching from GitHub, placeholder replacement)

**Estimated scope:** Large (4 files, ~400 lines total HTML/JS)

---

### Task 23: Input Validation & Error Handling

**Description:** Audit all API endpoints for proper input validation and error handling per SPEC.md AC11.

**Acceptance criteria:**
- [ ] All fields validated with specific error messages (not generic "Invalid input")
- [ ] Name: 1-100 chars, no control characters → "Account name must be 1-100 characters"
- [ ] Config (import): 100 bytes - 10KB → "Config too large (max 10KB)"
- [ ] Private key: valid base64, 32 bytes decoded → "Invalid PrivateKey (must be base64)"
- [ ] IP: valid IPv4/IPv6 or domain → "Invalid IP address"
- [ ] Port: 1-65535 → "Port must be 1-65535"
- [ ] Password: 8-128 chars → "Password must be at least 8 characters"
- [ ] All KV operations wrapped in try/catch
- [ ] KV write failures return 500 "Failed to save"
- [ ] KV read returns null → 404 "Not found"
- [ ] Warp API errors handled per Task 6

**Verification:**
- [ ] Test each API endpoint with invalid inputs → returns 400 with specific error
- [ ] Simulate KV write failure (disconnect from KV?) → returns 500
- [ ] Check Cloudflare dashboard logs for errors → none (all caught and handled)

**Dependencies:** All API tasks (Tasks 4, 8, 20, 21)

**Files likely touched:**
- `_worker.js` (add validation functions, audit all endpoints)

**Estimated scope:** Medium (1 file, ~100 lines validation functions + audit)

---

### Task 24: README & Deployment Guide

**Description:** Write comprehensive README with deployment instructions, cf-scanner integration guide, troubleshooting.

**Acceptance criteria:**
- [ ] README includes:
  - Project overview (one paragraph)
  - Features list (9 subscription formats, account management, etc.)
  - Deployment instructions (step-by-step with `wrangler` commands)
  - First-run setup guide (visit `/admin/setup`, create password)
  - cf-scanner integration (link to repo, how to import scan results)
  - VPN client compatibility matrix (which formats work in which clients)
  - Troubleshooting section (common errors, solutions)
  - Known limitations (Warp API unofficial, rate limits, etc.)
  - License (MIT recommended)
- [ ] Screenshots or ASCII diagrams of UI flows
- [ ] Link to SPEC.md and DESIGN.md for technical details

**Verification:**
- [ ] Fresh user can follow README and deploy worker in <10 minutes
- [ ] All wrangler commands work as documented
- [ ] Troubleshooting section covers errors encountered during testing

**Dependencies:** All phases complete

**Files likely touched:**
- `README.md` (create)

**Estimated scope:** Medium (1 file, ~300 lines markdown)

---

## Checkpoint 5: Complete

**Verify before marking project done:**
- [ ] All acceptance criteria from SPEC.md met (AC1-AC11)
- [ ] All 24 tasks completed
- [ ] Input validation works (returns 400 with specific errors)
- [ ] Error handling tested (Warp API 429/500, KV failures)
- [ ] Subscription caching reduces CPU time (<10ms for cached)
- [ ] Admin panel UI complete and tested in browser
- [ ] README with deployment guide complete
- [ ] All 9 formats tested in real VPN clients
- [ ] Connection verified: public IP shows Cloudflare
- [ ] No console errors in Cloudflare dashboard logs
- [ ] Human reviewed and approved for release

---

## Summary

- **Total tasks:** 24
- **Estimated total effort:** ~30-40 hours agent time
- **Critical path:** Tasks 1-4 → 5-8 → 9-11 → 18-19 (foundation + core flow + caching)
- **Parallelizable:** Tasks 12-17 (format generators), Task 22 (HTML templates), Task 24 (README)
- **High-risk tasks:** Task 6 (Warp API integration), Task 10 (ZIP generation), Task 22 (UI complexity)

**Recommended approach:**
1. Complete Phase 1 (foundation) in one session
2. Complete Phase 2 (Warp integration) in one session
3. Complete Phase 3 (subscription core) in one session, test end-to-end with WireSock
4. Parallelize Phase 4 (format generators) across multiple sessions
5. Complete Phase 5 (settings & polish) in final session

**Next Step:** Human reviews task list, approves, and we proceed to implementation starting with Task 1.
