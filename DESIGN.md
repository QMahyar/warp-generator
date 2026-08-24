# Warp Generator - Design Document

**Project:** Cloudflare Worker for managing Warp WireGuard configurations and subscriptions  
**Date:** 2026-08-18  
**Version:** 1.0.0-design

---

## 1. Overview

### Purpose
A self-hosted Cloudflare Worker that allows users to:
1. Register/import Cloudflare Warp WireGuard configurations
2. Manage multiple Warp accounts with custom endpoint lists
3. Generate VPN client subscriptions in multiple formats (WireGuard, Xray, Sing-box, Clash, URIs)
4. Support both vanilla WireGuard and obfuscated variants (Amnezia)

### Deployment Model
- **Fork and deploy** — Users clone the GitHub repo, deploy to their own Cloudflare account
- **Single-admin** — One password-protected admin panel per deployed instance
- **Free tier compatible** — Uses only KV namespace (no D1, no Durable Objects)
- **No build step** — Single `_worker.js` file, deployable via CF dashboard or CLI

---

## 2. Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Admin Panel (HTML + Vanilla JS)                        │
│  ├── Login / Session Management (Cookie + KV)           │
│  ├── Account Management (Create/Import/Delete)          │
│  ├── Endpoint Presets (5 defaults + custom)             │
│  ├── Amnezia Settings (Global + Per-Account)            │
│  └── Subscription URL Display                           │
│                                                          │
│  Subscription Endpoints                                 │
│  ├── /sub/{token}/wireguard-conf        → ZIP          │
│  ├── /sub/{token}/wireguard-conf-amnezia → ZIP         │
│  ├── /sub/{token}/throne                → text         │
│  ├── /sub/{token}/throne-amnezia        → text         │
│  ├── /sub/{token}/wireguard-uri         → text         │
│  ├── /sub/{token}/singbox               → JSON         │
│  ├── /sub/{token}/xray                  → JSON         │
│  ├── /sub/{token}/clash                 → YAML         │
│  └── /sub/{token}/v2rayn                → base64 URIs  │
│                                                          │
│  API Endpoints                                          │
│  ├── POST /api/account/generate    → Call Warp API     │
│  ├── POST /api/account/import      → Parse .conf/URI   │
│  ├── PUT  /api/account/{id}        → Update settings   │
│  ├── DELETE /api/account/{id}      → Hard delete       │
│  ├── POST /api/endpoints/preset    → Save preset       │
│  └── POST /api/settings            → Update globals    │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  KV Namespace   │
                  ├─────────────────┤
                  │ account:{uuid}  │
                  │ token:{token}   │
                  │ presets         │
                  │ settings:global │
                  │ settings:password│
                  │ session:{token} │
                  └─────────────────┘
```

### Data Storage (KV)

**Key Pattern: Hybrid (per-entity keys + global keys)**

| KV Key | Value Type | Description |
|--------|------------|-------------|
| `account:{uuid}` | JSON | Warp account config (keys, addresses, endpoint list ID, Amnezia overrides, name, created_at) |
| `token:{token}` | String | Maps subscription token → account UUID |
| `presets` | JSON Array | List of endpoint presets `[{id, name, endpoints: [{ip, port}]}]` |
| `settings:global` | JSON | Global Amnezia defaults `{Jc, Jmin, Jmax, S1, S2, H1-H4}` |
| `settings:password` | String | Bcrypt hash of admin password |
| `session:{sessionToken}` | JSON | Session data `{expires_at: timestamp}` |

---

## 3. User Stories & Decisions

### 3.1 Deployment & Authentication

**Story:** User forks repo, deploys worker, visits `/admin` for the first time.

**Decisions:**
- **Q32/Q43:** First-run setup wizard prompts for password, stores bcrypt hash in `settings:password` KV key
- **Q33:** Cookie-based sessions (24h expiry), stored in KV `session:{token}` → `{expires_at}`
- **Q42:** UI uses **Nahan pattern** — HTML files fetched from GitHub raw URLs, placeholders replaced with dynamic values

---

### 3.2 Warp Account Management

**Story:** User wants to add a Warp account (either generate new or import existing).

**Decisions:**
- **Q3/Q38/Q39:** Two methods:
  1. **Generate** — Worker calls Warp API (`POST /v0a4005/reg`), stores result immediately (no queuing)
  2. **Import** — User pastes `.conf` file or `wg://` URI (textarea or file upload), worker parses and normalizes
- **Q14/Q20:** On import, worker **normalizes config** — extracts core fields, strips Amnezia params (stored separately), re-serializes
- **Q15:** Each account has user-assigned name (auto-filled with "Account {timestamp}" on creation, editable)
- **Q10:** Delete = hard delete (removes from KV entirely)

---

### 3.3 Endpoint Management

**Story:** User wants to configure which Cloudflare Warp endpoints to use (IP:port pairs).

**Decisions:**
- **Q4/Q13/Q29/Q30:** Worker ships with **5 default presets** stored in KV on first run:
  1. `engage.cloudflareclient.com:2408` (DNS-based, default)
  2. `162.159.192.1:2408` (IPv4 primary)
  3. `162.159.192.1:500` (alternate port)
  4. `162.159.192.1:1701` (L2TP port)
  5. `[2606:4700:d0::a29f:c001]:2408` (IPv6)
- **Q37:** Each account picks **one endpoint list** (preset or custom)
- **Q5/Q45:** Panel includes link to `cf-scanner` repo with instructions (no embedded scanner in v1)

---

### 3.4 Subscription Generation

**Story:** User selects an account, copies subscription URL, adds to VPN client.

**Decisions:**
- **Q12/Q26:** **1 account + N endpoints = N configs in subscription** — same keypair, different `Endpoint` field
- **Q24/Q35:** URL pattern: `/sub/{token}/{format}` where token is random UUID per account
- **Q41:** Token generated on account creation, regenerable via panel
- **Q27/Q36:** Config naming: `{AccountName} - {Colo} {Endpoint}` (e.g., "Home ISP - LAX 162.159.192.1:2408")
- **Q21:** Subscriptions cached in KV with 5-minute TTL, invalidated on account edit

---

### 3.5 Output Formats

**Story:** User needs subscription in specific VPN client format.

**Decisions:**
- **Q22/Q46:** **All must-have formats for v1:**
  1. **WireGuard .conf (vanilla)** — ZIP with N `.conf` files
  2. **WireGuard .conf (Amnezia)** — ZIP with `Jc`/`Jmin`/`Jmax`/`S1-S2`/`H1-H4` in `[Interface]`
  3. **Throne `wg://` URI (vanilla)** — text file, one URI per line
  4. **Throne `wg://` URI (Amnezia)** — text file with `enable_amnezia=true`
  5. **`wireguard://` URI** — text file (no Amnezia support)
  6. **Sing-box JSON** — legacy outbound format (Hiddify/NekoBox compatible)
  7. **Xray JSON** — `outbounds[].protocol: "wireguard"`
  8. **Clash YAML** — `proxies[].type: wireguard`
  9. **V2RayN base64** — base64-encoded `wireguard://` URIs (research confirmed V2RayN supports WireGuard since v7.11.3)

- **Q28:** `.conf` subscriptions return **ZIP file** with `Content-Disposition: attachment` (for WireSock and other file-only clients)
- **Q14/Q25:** **Amnezia parameters:**
  - Global defaults in `settings:global`
  - Per-account overrides in `account:{uuid}.amnezia_overrides`
  - If account has no overrides, use global defaults
  - If imported config has no Amnezia params, apply defaults when generating Amnezia subscriptions

---

### 3.6 Obfuscation Support

**Story:** User wants obfuscated configs to bypass DPI/censorship.

**Decisions:**
- **Q6/Q14:** Separate subscriptions for vanilla vs Amnezia (explicit routes like `/sub/{token}/wireguard-conf-amnezia`)
- Research findings:
  - **Amnezia extensions** work in: Amnezia VPN, Clash Meta, Throne, WireSock (Jc/Jmin/Jmax only)
  - **Not supported** in: Xray, Sing-box, Hiddify, NekoBox (vanilla WireGuard only)
  - **Noise fragmentation** is separate from Amnezia (Xray's finalmask, Hiddify's ifp modes) — out of scope for v1

---

## 4. API Specifications

### 4.1 Admin Panel Routes

| Method | Route | Auth | Response |
|--------|-------|------|----------|
| GET | `/admin` | Session cookie | HTML dashboard |
| POST | `/admin/login` | Password | Sets session cookie, redirects |
| POST | `/admin/logout` | Session cookie | Clears cookie |
| GET | `/admin/setup` | None (if no password set) | HTML setup wizard |
| POST | `/admin/setup` | None (first-run only) | Sets password, redirects to login |

### 4.2 Account API

| Method | Route | Body | Response |
|--------|-------|------|----------|
| POST | `/api/account/generate` | `{name: string}` | `{id, token, config}` |
| POST | `/api/account/import` | `{name: string, config: string (conf or URI)}` | `{id, token}` |
| GET | `/api/account/{id}` | - | `{id, name, config, endpoints, token, ...}` |
| PUT | `/api/account/{id}` | `{name?, endpoints?, amnezia_overrides?}` | `{success: true}` |
| DELETE | `/api/account/{id}` | - | `{success: true}` |
| POST | `/api/account/{id}/regenerate-token` | - | `{token}` |

### 4.3 Settings API

| Method | Route | Body | Response |
|--------|-------|------|----------|
| GET | `/api/settings/amnezia` | - | `{Jc, Jmin, Jmax, S1, S2, H1-H4}` |
| PUT | `/api/settings/amnezia` | `{Jc, Jmin, ...}` | `{success: true}` |
| GET | `/api/presets` | - | `[{id, name, endpoints}]` |
| POST | `/api/presets` | `{name, endpoints: [{ip, port}]}` | `{id}` |
| PUT | `/api/presets/{id}` | `{name?, endpoints?}` | `{success: true}` |
| DELETE | `/api/presets/{id}` | - | `{success: true}` |

### 4.4 Subscription Routes

| Route | Content-Type | Response |
|-------|--------------|----------|
| `/sub/{token}/wireguard-conf` | `application/zip` | ZIP with N `.conf` files |
| `/sub/{token}/wireguard-conf-amnezia` | `application/zip` | ZIP with Amnezia `.conf` files |
| `/sub/{token}/throne` | `text/plain; charset=utf-8` | `wg://` URIs, one per line |
| `/sub/{token}/throne-amnezia` | `text/plain; charset=utf-8` | `wg://` URIs with `enable_amnezia=true` |
| `/sub/{token}/wireguard-uri` | `text/plain; charset=utf-8` | `wireguard://` URIs |
| `/sub/{token}/singbox` | `application/json` | Sing-box config JSON |
| `/sub/{token}/xray` | `application/json` | Xray config JSON |
| `/sub/{token}/clash` | `application/x-yaml; charset=utf-8` | Clash YAML config |
| `/sub/{token}/v2rayn` | `text/plain; charset=utf-8` | Base64-encoded URIs |

**Subscription Headers:**
```
Profile-Update-Interval: 24
Subscription-Userinfo: upload=0; download=0; total=104857600; expire=4102329600
Content-Disposition: attachment; filename*=utf-8''warp-{accountName}-{format}
Cache-Control: max-age=300
```

---

## 5. Data Models

### 5.1 Account Object (KV `account:{uuid}`)

```json
{
  "id": "uuid-v4",
  "name": "Home ISP",
  "token": "random-uuid-v4",
  "created_at": "2026-08-18T12:00:00Z",
  "config": {
    "private_key": "base64-key",
    "public_key": "base64-key",
    "addresses": {
      "ipv4": "172.16.0.2/32",
      "ipv6": "2606:4700:110:8d4a:ca6:b507:215:d04f/128"
    },
    "peer_public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
    "mtu": 1280,
    "reserved": [0, 0, 0]
  },
  "endpoint_list": {
    "type": "preset",
    "preset_id": "default",
    "custom_endpoints": null
  },
  "amnezia_overrides": {
    "Jc": 5,
    "Jmin": 50,
    "Jmax": 1000,
    "S1": 0,
    "S2": 0,
    "H1": 1,
    "H2": 2,
    "H3": 3,
    "H4": 4
  }
}
```

### 5.2 Preset Object (KV `presets`)

```json
[
  {
    "id": "default",
    "name": "Cloudflare Default (5 endpoints)",
    "endpoints": [
      {"ip": "engage.cloudflareclient.com", "port": 2408, "colo": null},
      {"ip": "162.159.192.1", "port": 2408, "colo": "LAX"},
      {"ip": "162.159.192.1", "port": 500, "colo": "LAX"},
      {"ip": "162.159.192.1", "port": 1701, "colo": "LAX"},
      {"ip": "2606:4700:d0::a29f:c001", "port": 2408, "colo": "LAX"}
    ]
  }
]
```

### 5.3 Global Settings (KV `settings:global`)

```json
{
  "amnezia": {
    "Jc": 5,
    "Jmin": 50,
    "Jmax": 1000,
    "S1": 0,
    "S2": 0,
    "H1": 1,
    "H2": 2,
    "H3": 3,
    "H4": 4
  }
}
```

---

## 6. Implementation Plan

### Phase 1: Core Worker & KV Schema
1. Setup single `_worker.js` with route handlers
2. Implement KV schema initialization (default presets, settings)
3. Authentication: password setup wizard + session management
4. Admin panel skeleton (fetch HTML from GitHub)

### Phase 2: Account Management
1. Warp API integration (generate new accounts)
2. Config import (parse `.conf` and `wg://` URIs)
3. Account CRUD API endpoints
4. Token generation and mapping

### Phase 3: Subscription Generation
1. Config normalization (extract core fields)
2. Implement 10 format generators:
   - WireGuard .conf (vanilla + Amnezia)
   - Throne URIs (vanilla + Amnezia)
   - wireguard:// URIs
   - Sing-box JSON (endpoint schema)
   - Sing-box JSON legacy (`singbox-legacy`, for NekoBox/Hiddify/sing-box <=1.10)
   - Xray JSON
   - Clash YAML
   - V2RayN base64
3. ZIP file generation for .conf formats
4. Subscription caching with TTL

### Phase 4: UI & UX Polish
1. Dashboard HTML with Tailwind CSS
2. Account list view with subscription URLs
3. Endpoint preset editor
4. Amnezia settings editor
5. Import/export functionality
6. Error handling and validation

### Phase 5: Testing & Documentation
1. Test all 10 subscription formats with real clients
2. README with deployment instructions
3. cf-scanner integration guide
4. Troubleshooting section

---

## 7. External Dependencies

### Runtime Dependencies (Worker)
- **fflate** or **JSZip** — ZIP generation for .conf files (use Cloudflare's built-in `CompressionStream` if possible)
- **js-yaml** — YAML generation for Clash (or hand-craft YAML string)
- **bcrypt** (Workers-compatible) — Password hashing

### Client Tools (User-side)
- **cf-scanner** — Endpoint testing (referenced, not embedded)
- **wgcf** — Alternative Warp config generation (optional, for comparison)

### External Services
- **Cloudflare Warp API** — `https://api.cloudflareclient.com/v0a4005/reg`
- **GitHub Raw** — HTML template hosting (or embed in worker)

---

## 8. Security Considerations

### 8.1 Authentication
- Password stored as bcrypt hash (cost factor 10)
- Session tokens are random UUIDs, stored in KV with expiry
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Strict`
- No rate limiting on login (single-admin model, user can only lock themselves out)

### 8.2 Subscription Token Security
- Tokens are random UUIDs (128-bit entropy)
- No username/email association (reduces attack surface)
- User can regenerate token if leaked
- No authentication on subscription endpoints (public by design for VPN clients)

### 8.3 Data Isolation
- Each deployed worker is single-tenant (user's own KV namespace)
- No cross-account data leakage possible (no shared state)
- Warp private keys stored in KV (encrypted at rest by Cloudflare)

### 8.4 Rate Limiting
- **Client-side only** — 30s cooldown on "Generate Account" button
- No server-side throttling (single-user, self-inflicted harm only)

---

## 9. Non-Goals (Out of Scope for v1)

1. **Multi-user management** — Single admin only
2. **Bandwidth tracking** — No usage stats or quotas
3. **Embedded cf-scanner** — Reference only, not integrated
4. **Advanced obfuscation** — Only Amnezia extensions, no Xray finalmask or Hiddify noise
5. **Automatic endpoint testing** — User must test endpoints externally
6. **Warp+ license key support** — Basic Warp only (can add post-v1)
7. **Config chaining** — No proxy-over-Warp or Warp-over-proxy (single outbound only)
8. **D1 database** — KV only for simplicity
9. **Telegram bot** — No external integrations
10. **Auto-update** — User manually redeploys from GitHub

---

## 10. Success Criteria

### v1.1 Hardening (2026-08-19, shipped)
- [x] Sing-box JSON switched to endpoint schema; `singbox-legacy` added for old clients
- [x] IPv6 endpoints bracketed across all formats
- [x] Real WARP `client_id` reserved bytes; Amnezia range strings; comma/dash address parsing
- [x] Login rate limiting + `ADMIN_SETUP_SECRET` first-run gate
- [x] Strict IPv6/domain/Amnezia validation (Jc<=128, Jmin<=Jmax, H1-H4 <2^31, non-overlap)
- [x] Cache-write guard + invalidation on preset/Amnezia edits; honest headers

### v1.0 Launch Requirements (shipped 2026-08-18)
- [x] User can deploy worker to Cloudflare in <5 minutes
- [x] User can generate or import Warp accounts via panel
- [x] All 10 subscription formats generate valid configs
- [x] Configs tested with real clients (V2RayN, Hiddify, Clash, WireSock)
- [x] Subscription URLs work in VPN clients without manual editing
- [x] Panel is mobile-responsive
- [x] README includes step-by-step deployment guide
- [x] No errors in Cloudflare Workers dashboard for typical usage

### Post-Launch Metrics
- GitHub stars (quality indicator)
- Issues reporting bugs vs feature requests (stability indicator)
- Fork count (adoption indicator)

---

## 11. Research References

All research saved in `E:\Code\warp-generator\`:
- `WARP_API_RESEARCH.md` — Warp API endpoints, registration flow
- `wireguard-client-research.md` — VPN client format support matrix
- `WIREGUARD_OBFUSCATION_RESEARCH.md` — Amnezia and noise techniques
- `docs/wireguard-uri-scheme.md` — `wireguard://` URI spec
- `research/bpb-panel-analysis.md` — BPB Panel subscription patterns
- EdgeTunnel research (inline in agent output)
- Nahan research (inline in agent output)

### Key Findings Summary
- **V2RayN** supports WireGuard since v7.11.3 (via Xray-core backend)
- **Amnezia extensions** only work in: Amnezia VPN, Clash Meta, Throne, WireSock (Jc/Jmin/Jmax)
- **Sing-box** deprecated WireGuard outbound in 1.11.0 (moved to endpoint format), but Hiddify/NekoBox still use legacy format
- **Xray-core** has stable WireGuard outbound with `reserved[]` field for Warp
- **BPB Panel** uses KV with only 5 keys total (monolithic JSON blobs)
- **EdgeTunnel** uses external Pages site for UI (decoupled architecture)
- **Nahan** uses remote HTML fetch + placeholder replacement (best pattern for warp-generator)

---

**End of Design Document**
