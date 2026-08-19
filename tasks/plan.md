# Implementation Plan: Warp Generator

**Version:** 1.0.0  
**Date:** 2026-08-18  
**Status:** Draft (awaiting approval)

---

## Overview

Build a Cloudflare Worker that generates Cloudflare Warp WireGuard configurations and serves subscriptions in 9 VPN client formats. Single-admin, KV storage, no build step.

---

## Architecture Decisions

### 1. Single-file Worker Architecture
**Decision:** All logic in `_worker.js` (no TypeScript, no build step)  
**Rationale:** Simplifies deployment (paste into CF dashboard or `wrangler deploy`). Matches EdgeTunnel pattern (43k stars). User can edit directly in browser.  
**Trade-off:** No type safety, harder to test locally. Acceptable for solo projects.

### 2. Nahan UI Pattern (Remote HTML + Placeholder Replace)
**Decision:** HTML files fetched from GitHub raw URLs at runtime, dynamic values injected via `String.replace(__PLACEHOLDER__, value)`  
**Rationale:** Separates UI from logic, no build step, easy to update UI without redeploying worker. Proven in Nahan (3k stars).  
**Trade-off:** Extra fetch on first request (cacheable). Relies on GitHub uptime.

### 3. KV Storage (No D1)
**Decision:** Use KV with hybrid key pattern (`account:{uuid}`, `token:{token}`, `presets`, `settings:global`)  
**Rationale:** Free tier sufficient (100k reads/day), no SQL needed. BPB Panel (13k stars) uses only 5 KV keys total.  
**Trade-off:** Eventual consistency, no transactions. Acceptable for single-admin use case.

### 4. Subscription Caching with TTL
**Decision:** Cache subscriptions in KV with 5-minute TTL, invalidate on account edit  
**Rationale:** Reduces CPU time (format generation expensive), stays under 10ms free tier limit for cached requests.  
**Trade-off:** Stale data for up to 5 minutes. Acceptable (VPN configs rarely change).

### 5. Vertical Slicing by User Journey
**Decision:** Build complete flows (auth → account → subscription) rather than horizontal layers  
**Rationale:** Each slice is testable end-to-end. Delivers value incrementally.  
**Order:** Foundation → Auth → Account Mgmt → Subscription Gen → Format Generators → Polish

---

## Dependency Graph

```
KV Schema Initialization
    │
    ├── Session Management (password, cookies)
    │       │
    │       └── Admin Panel UI
    │
    ├── Warp API Client (keypair gen, registration)
    │       │
    │       └── Account CRUD (generate, import, delete)
    │               │
    │               ├── Preset Management (endpoints)
    │               │       │
    │               │       └── Subscription Token Lookup
    │               │               │
    │               │               └── Format Generators (9 formats)
    │               │                       │
    │               │                       └── Subscription Caching
    │               │
    │               └── Amnezia Settings (global + per-account)
    │
    └── Config Parsers (import .conf, wg:// URI)
            │
            └── Config Normalizer (extract core fields)
```

**Implementation order follows bottom-up traversal:**
1. KV schema + session management (foundation)
2. Warp API client + config parsers (data layer)
3. Account CRUD + preset management (business logic)
4. Subscription token lookup + one format generator (core flow)
5. Remaining 8 format generators (parallel)
6. Caching + UI polish (optimization)

---

## Task List

Tasks recorded in `tasks/todo.md` (checklist format).

### Phase 1: Foundation (Tasks 1-4)
Core infrastructure: worker skeleton, KV schema, auth, session management.

### Checkpoint 1: After Phase 1
- [ ] Worker deploys to Cloudflare
- [ ] `/admin/setup` sets password, stores bcrypt hash in KV
- [ ] `/admin/login` validates password, sets session cookie
- [ ] Session persists across requests (KV lookup validates cookie)
- [ ] `/admin` route protected (redirects to login if no session)

---

### Phase 2: Warp Integration (Tasks 5-8)
Warp API client, keypair generation, account CRUD.

### Checkpoint 2: After Phase 2
- [ ] Can generate new Warp account (POST `/api/account/generate`)
- [ ] Can import Warp .conf (POST `/api/account/import`)
- [ ] Account stored in KV with normalized schema
- [ ] Token generated and mapped (`token:{token}` → account UUID)
- [ ] Can list/view/delete accounts via API

---

### Phase 3: Subscription Core (Tasks 9-11)
Token lookup, endpoint expansion, first format generator (WireGuard .conf vanilla).

### Checkpoint 3: After Phase 3
- [ ] `/sub/{token}/wireguard-conf` resolves token → account
- [ ] Expands account + preset → N configs (one per endpoint)
- [ ] Returns ZIP with N `.conf` files
- [ ] Tested: Import ZIP into WireSock, connect successfully

---

### Phase 4: Format Generators (Tasks 12-19)
Implement remaining 8 subscription formats (can parallelize).

### Checkpoint 4: After Phase 4
- [ ] All 9 formats generate valid configs
- [ ] Each format tested in at least one real VPN client:
  - V2RayN (base64 URIs)
  - Clash Meta (YAML)
  - Hiddify (Sing-box JSON)
  - NekoBox (Sing-box JSON)
  - Xray client (Xray JSON)
  - Throne VPN (wg:// URIs)
  - WireSock (Amnezia .conf)
- [ ] Connection verified: public IP shows Cloudflare

---

### Phase 5: Settings & Polish (Tasks 20-24)
Preset management, Amnezia settings, caching, UI improvements.

### Checkpoint 5: Complete
- [ ] All acceptance criteria from SPEC.md met (AC1-AC11)
- [ ] Input validation works (returns 400 with specific errors)
- [ ] Error handling tested (Warp API 429/500, KV failures)
- [ ] Subscription caching reduces CPU time (<10ms for cached)
- [ ] Admin panel UI complete (dashboard, account detail, settings)
- [ ] README with deployment guide complete

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Warp API changes/breaks** | High | Document API version in comments. Log unexpected responses. Add fallback error messages. Monitor GitHub issues for wgcf tool updates. |
| **KV write quota exceeded** | Medium | Return 503 "Storage quota exceeded". Add rate limiting docs. Log KV failures separately. |
| **Format generators produce invalid configs** | High | Test each format in real VPN clients before marking complete. Keep research docs (`wireguard-client-research.md`) as reference. |
| **CPU time exceeds 10ms (free tier)** | Medium | Cache subscriptions (5-min TTL). Profile slow operations. Consider lazy-loading dependencies. |
| **ZIP generation too slow** | Medium | Use `fflate` (faster than `jszip`). Generate ZIP once, cache in KV. Test with 10+ configs. |
| **Bcrypt too slow (<10ms budget)** | Low | Use cost factor 10 (not 12). Cache session validation (already in design). Measure during implementation. |
| **HTML fetch from GitHub fails** | Low | Add fallback: embed minimal HTML in worker if fetch fails. Cache HTML response. |
| **Session cookie security** | Medium | Enforce `HttpOnly`, `Secure`, `SameSite=Strict`. Use `crypto.randomUUID()` for tokens. Document no-XSS posture. |

---

## Parallelization Opportunities

**After Checkpoint 3 (first format working):**
- Tasks 12-19 (format generators) are independent, can run in parallel
- Each format has separate generator function, no shared state
- Test each format independently in real VPN clients

**Safe to parallelize:**
- Format generator implementation (Tasks 12-19)
- HTML template creation (separate files: `setup.html`, `login.html`, etc.)
- Documentation writing (README, deployment guide)

**Must be sequential:**
- KV schema initialization before any data operations
- Session management before admin panel
- Token lookup before format generators
- First format working before parallelizing others (validates core flow)

---

## Open Questions

1. **Warp API rate limiting:** No official docs. Should we add exponential backoff?
   - **Proposed:** Add simple retry (3 attempts, 1s delay). Log failures. Document in README.

2. **KV consistency for token lookup:** Eventual consistency could cause 404 immediately after account creation.
   - **Proposed:** Acceptable (happens only on creation, user can refresh). Document as known limitation.

3. **ZIP library choice:** `fflate` (smaller bundle, faster) vs `jszip` (more features, battle-tested)?
   - **Proposed:** Start with `fflate`. Switch to `jszip` only if compression issues arise.

4. **Amnezia parameter validation:** Research shows different clients accept different ranges.
   - **Proposed:** Use ranges from SPEC.md (Jc: 0-200, Jmin/Jmax: 0-1280, etc.). Document client compatibility in README.

5. **Config naming with colo:** Warp API response doesn't always include `colo` field.
   - **Proposed:** Use `{AccountName} - {IP}:{Port}` format. Prepend colo if present: `{AccountName} - LAX {IP}:{Port}`.

6. **Session expiry handling:** Should expired sessions show friendly message or just redirect?
   - **Proposed:** Redirect to login with query param `?expired=true`, show "Session expired, please log in again".

7. **First-run setup bypass:** What if user manually sets `settings:password` in KV before first visit?
   - **Proposed:** Check for password before showing setup. If exists, redirect to login. Document manual setup in README.

8. **Subscription URL display:** Copy-to-clipboard button or just show URLs?
   - **Proposed:** Show URLs as text with copy button (JS `navigator.clipboard.writeText()`). Fallback to text selection if clipboard API blocked.

---

## Implementation Notes

### Code Organization in `_worker.js`

Suggested structure (top to bottom):
1. **Constants & Config** (Warp API URLs, default Amnezia values, etc.)
2. **Utility Functions** (UUID generation, base64 encode/decode, validation)
3. **Crypto Helpers** (bcrypt, Curve25519 keypair generation)
4. **KV Helpers** (getAccount, saveAccount, getSession, etc.)
5. **Warp API Client** (register, parseConfig, normalizeConfig)
6. **Session Management** (validateSession, createSession, destroySession)
7. **Config Parsers** (parseWireGuardConf, parseWgUri, parseWireguardUri)
8. **Format Generators** (9 functions: generateWireGuardConf, generateThrone, etc.)
9. **Subscription Cache** (getCachedSubscription, setCachedSubscription, invalidateCache)
10. **Route Handlers** (handleAdminSetup, handleLogin, handleAccountAPI, handleSubscription)
11. **Main Router** (handleRequest, dispatches to route handlers)
12. **Worker Entry Point** (`export default { async fetch() {...} }`)

### HTML Templates

Create `html/` directory with:
- `setup.html` — First-run password setup wizard
- `login.html` — Login form
- `dashboard.html` — Account list, create/import buttons
- `account.html` — Account detail view, subscription URLs
- `settings.html` — Endpoint presets, Amnezia defaults

Each HTML uses placeholders like `__VERSION__`, `__ACCOUNT_NAME__`, `__SUBSCRIPTION_URLS__` for dynamic injection.

Use Tailwind CSS via CDN (like Nahan):
```html
<script src="https://cdn.tailwindcss.com"></script>
```

### Testing Strategy

**Per-phase verification:**
1. **Phase 1:** Manually test setup → login → session persistence (curl or browser)
2. **Phase 2:** Test Warp account generation (check KV, verify keypair format)
3. **Phase 3:** Download `.conf` ZIP, import into WireSock, connect to 1.1.1.1
4. **Phase 4:** Import each format into respective client, verify connection
5. **Phase 5:** Test full UI flows (create account → view → edit → delete)

**No automated tests in v1** (Cloudflare Workers testing requires Miniflare setup, out of scope). Manual verification sufficient.

---

## Definition of Done (Per Task)

Before marking any task complete:
- [ ] Code written and committed
- [ ] Functionality verified (manual test or curl)
- [ ] Error cases tested (invalid input, API failures)
- [ ] No console errors in Cloudflare dashboard logs
- [ ] Changes documented in task commit message

Before marking phase complete:
- [ ] All phase tasks completed
- [ ] Checkpoint criteria verified
- [ ] Human reviewed and approved phase output

---

**Next Step:** Review this plan, then proceed to Phase 3 (Task Breakdown) to generate detailed task list in `tasks/todo.md`.

---

## v1.1.0 — Audit Hardening (2026-08-19)

**Status:** Shipped. 10-agent audit vs official client sources (Throne, v2rayN, sing-box
binaries) → 4 sequential fix workers on `fix/audit-v1.1` (branch merged to master), full QA
harness rerun by parent, deployed (`8859f8bd`). See `reports/` for the audit findings and
CHANGELOG.md for the release notes.

- Format generators now 10 (singbox endpoint schema + `singbox-legacy`)
- Validation bounds updated per client/kernel caps (Jc≤128, H1-H4 <2^31, ranges, overlaps)
- New runtime secret: `ADMIN_SETUP_SECRET` (setup gate, optional)
