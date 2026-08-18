# Warp Generator — Agent Rules

**Project:** Cloudflare Worker for managing Warp WireGuard configs and subscriptions  
**Status:** v1.0.0 complete, production-ready

---

## Tech Stack

- **Runtime:** Cloudflare Workers (ES2022, Service Worker API)
- **Storage:** Cloudflare KV (key-value store)
- **Language:** JavaScript (no TypeScript, no build step)
- **Dependencies:**
  - `bcryptjs ^2.4.3` — Password hashing
  - `@noble/curves ^1.9.0` — Curve25519 keypair generation
  - `fflate ^0.8.3` — ZIP compression
  - `js-yaml ^4.1.0` — YAML serialization

**Constraints:**
- Free tier: 100k KV reads/day, 1k writes/day, 1GB storage
- CPU time: 10ms per request (free), 50ms (paid)
- No Node.js APIs (use fetch, crypto.subtle, streams only)
- Single-file architecture (`_worker.js` only)

---

## Commands

**Deploy:**
```bash
wrangler deploy
```

**Local dev:**
```bash
wrangler dev --local
```

**Test KV:**
```bash
wrangler kv:key get --namespace-id=<id> "settings:password"
wrangler kv:key list --namespace-id=<id> --prefix="account:"
```

**Dry-run deploy:**
```bash
wrangler deploy --dry-run
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

**Route handler:**
```javascript
async function handleFoo(request, env) {
  // Validate input
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body');
  
  // Business logic
  const result = await doSomething(env, body);
  if (result.error) return errorResponse(result.error, result.status);
  
  // Success response
  return jsonResponse(result, 201);
}
```

**KV operations:**
```javascript
// Always check for null (KV returns null if key doesn't exist)
const data = await env.WARP_KV.get('key', { type: 'json' });
if (!data) return { error: 'Not found', status: 404 };

// Wrap writes in try/catch
try {
  await env.WARP_KV.put('key', JSON.stringify(value));
} catch {
  return { error: 'Failed to save', status: 500 };
}
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

### KV Key Naming
- `account:{uuid}` — Account objects
- `token:{token}` — Token → account UUID mapping
- `session:{token}` — Session data with expiry
- `cache:{token}:{format}:{timeBucket}` — Subscription cache
- `settings:password` — Bcrypt hash
- `settings:global` — Global settings (Amnezia defaults)
- `presets` — Endpoint preset array

---

## Project Structure

```
warp-generator/
├── _worker.js              # Single worker file (all logic, 1867 lines)
├── wrangler.toml           # KV namespace binding
├── package.json            # Dependencies
├── README.md               # Deployment guide
├── SPEC.md                 # Acceptance criteria (11 ACs)
├── DESIGN.md               # Design decisions (46-question interview)
├── tasks/
│   ├── plan.md             # Implementation plan
│   └── todo.md             # 24 tasks (all completed)
└── research/               # VPN format research docs
```

---

## Architecture

### Core Components
1. **Auth Layer** — Setup wizard, login, session management (bcrypt + HttpOnly cookies)
2. **Warp Integration** — Curve25519 keypair gen, Warp API client, config parsers
3. **Account CRUD** — Generate/import accounts, store in KV, manage tokens
4. **Subscription Engine** — Token lookup, endpoint expansion, format generators
5. **Admin Panel** — SPA with account/preset/settings management

### Data Flow
```
User → /admin/login → Session cookie → /admin (dashboard)
                                    ↓
                            Click "Create Account"
                                    ↓
                          POST /api/account/generate
                                    ↓
                    Warp API → keypair gen → store in KV
                                    ↓
                            Return token → User
                                    ↓
                        GET /sub/{token}/singbox
                                    ↓
               Token lookup → account → preset endpoints
                                    ↓
                      Expand 1 account + N endpoints
                                    ↓
                    Generate N Sing-box outbounds
                                    ↓
                      Cache in KV → return JSON
```

---

## Boundaries

### Always Do
- Validate all user input (sanitize, check types, enforce limits)
- Hash passwords with bcrypt (cost factor 10)
- Set `HttpOnly`, `Secure`, `SameSite=Strict` on session cookies
- Return proper HTTP status codes (400 bad input, 401 unauth, 500 server error)
- Check KV operation success (handle null returns, write failures)
- Normalize imported configs (extract core fields, strip formatting)

### Ask First
- Adding new dependencies (affects bundle size, cold start)
- Changing KV schema (requires migration logic)
- Adding new subscription formats (needs research + testing)
- Changing Warp API endpoints (unofficial API)

### Never Do
- Store passwords in plaintext
- Log sensitive data (private keys, passwords, tokens)
- Trust user input without validation
- Make unbounded KV writes (respect free tier limits)
- Block on slow operations (use timeouts on external APIs)
- Embed HTML in worker code (already inline, don't move to external)

---

## Common Tasks

### Adding a new subscription format

1. Research format spec (see `research/` directory)
2. Add generator function to `_worker.js` (after line 920)
3. Wire route in `handleSubscription()` (after line 1000)
4. Add Content-Type header
5. Test with real VPN client
6. Document in README.md

**Example:**
```javascript
function generateNewFormat(configs) {
  return configs.map(cfg => ({
    // format-specific structure
  }));
}

// In handleSubscription():
if (format === 'new-format') {
  const result = generateNewFormat(expanded.configs);
  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Profile-Update-Interval': '24',
      'Cache-Control': 'max-age=300'
    }
  });
}
```

### Debugging KV issues

```bash
# List all keys
wrangler kv:key list --namespace-id=<id>

# Get specific key
wrangler kv:key get --namespace-id=<id> "account:abc-123"

# Delete key
wrangler kv:key delete --namespace-id=<id> "session:xyz"

# Bulk delete (cache clear)
wrangler kv:key list --namespace-id=<id> --prefix="cache:" | \
  jq -r '.[].name' | \
  xargs -I {} wrangler kv:key delete --namespace-id=<id> {}
```

### Adding input validation

Follow SPEC.md AC11 validation rules:
- Name: 1-100 chars, no control characters
- Config (import): 100 bytes - 10KB
- Private key: valid base64, 32 bytes decoded
- IP: valid IPv4/IPv6 or domain (max 253 chars)
- Port: 1-65535
- Password: 8-128 chars
- Amnezia params: Jc: 0-200, Jmin/Jmax: 0-1280, S1/S2: 0-255, H1-H4: 0-4294967295

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

### Warp API
- **Unofficial API** — No docs, could change anytime
- **Rate limiting** — Unknown limits, handle 429 gracefully
- **Response structure** — Field names vary between API versions
- **Reserved bytes** — Most accounts use `[0, 0, 0]`, don't randomize

### KV
- **Eventual consistency** — Account might not be readable immediately after creation (rare, <1s)
- **No transactions** — Last write wins, no atomic operations
- **List operation** — Returns max 1000 keys per call, use cursor for pagination
- **TTL precision** — ExpirationTtl is approximate (±60s)

### Format Generators
- **Amnezia compatibility** — Only Amnezia VPN, Clash Meta, Throne, WireSock (Jc/Jmin/Jmax only) support Amnezia params
- **Sing-box deprecation** — Use legacy outbound format (not endpoint format from v1.11+) for Hiddify/NekoBox compatibility
- **YAML serialization** — js-yaml line width must be `-1` (unlimited) to avoid wrapping long keys

### Caching
- **Time bucket drift** — Cache key includes 5-min time bucket, no cross-bucket cache hits
- **Invalidation** — Deletes all `cache:{token}:*` keys, can hit KV write quota if done frequently
- **Cache size** — ZIP files can be large (>100KB for 10 configs), stays under 25MB KV value limit

---

## Troubleshooting

### "Subscription not found" (404)
- Check token in URL is correct (copy from admin panel)
- Verify account exists: `wrangler kv:key get "token:{token}"`
- Check if account was deleted (token orphaned)

### "Warp API timeout" (504)
- Warp API is slow or unreachable
- Retry after 60s
- Check network: `curl https://api.cloudflareclient.com/v0a4005/reg` from server

### "Failed to save account" (500)
- KV write quota exceeded (1k writes/day on free tier)
- KV namespace not bound correctly (check wrangler.toml)
- Cloudflare API outage (check status.cloudflare.com)

### Session expired immediately
- Clock skew between client and server (cookies use Max-Age)
- Cookie blocked by browser (Secure flag requires HTTPS)
- Session duration too short (default 24h)

---

## Testing

**No automated tests in v1.** Manual verification required:

### Phase 1: Auth Flow
1. Visit `/admin/setup` → set password → redirects to login ✓
2. Login with correct password → redirects to dashboard ✓
3. Login with wrong password → shows error ✓
4. Logout → clears session, redirects to login ✓

### Phase 2: Account Management
1. Generate account → stored in KV, token created ✓
2. Import .conf → parsed, normalized, stored ✓
3. List accounts → shows all ✓
4. Delete account → removed from KV, token deleted ✓

### Phase 3: Subscriptions
1. Download .conf ZIP → extracts N files ✓
2. Import into WireSock → connects successfully ✓
3. Test all 9 formats → valid output ✓
4. Invalid token → 404 ✓

### Phase 4: Settings
1. Edit preset → reflected in subscriptions ✓
2. Edit Amnezia defaults → reflected in Amnezia subscriptions ✓
3. Per-account Amnezia overrides → takes precedence ✓

---

## Version History

**v1.0.0** (2026-08-18)
- Initial release
- 9 subscription formats
- Admin panel SPA
- Subscription caching
- Input validation per spec

---

## References

- **SPEC.md** — 11 acceptance criteria, input validation rules
- **DESIGN.md** — Design decisions from 46-question interview
- **README.md** — Deployment guide, API docs
- **tasks/plan.md** — Implementation plan, dependency graph
- **tasks/todo.md** — 24 completed tasks
- **research/** — VPN client format specs

---

**Last updated:** 2026-08-18  
**Status:** Production-ready, all 24 tasks complete
