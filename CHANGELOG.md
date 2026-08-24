# Changelog

All notable changes to warp-generator are documented here.

## [1.0.2] — 2026-08-24

Docs redaction + FA research sync.

- Official release decoupled from personal vault/Horror worker: `README.md` live URL → generic `https://<your-worker>.workers.dev`, `CHANGELOG.md`/`CLAUDE.md`/`docs/RELEASE.md` sanitized, `wrangler.toml` KV → `YOUR_KV_NAMESPACE_ID` placeholder
- `README.fa.md` researched & re-translated to match `README.md` v1.0.1 structure (17 formats, 241 tests, Cache API, troubleshooting) — was 10 formats / 218 tests; Persian authoritative note kept
- Verified: `vault` zero hits in `README*`/`CHANGELOG`/`wrangler.toml`/`docs/` (personal `E:\vault` unrelated to public release)

## [1.0.1] — 2026-08-24

Patch after stable: context + shipping wiring.

- `package.json` scripts `check:version` + `release:check` (`node --check && npm test && check:version`)
- `scripts/check-version.mjs` Windows-safe (no shell pipes)
- `docs/SHIPPING_CHECKLIST.md` (shipping skill one-page checklist)
- `.github/copilot-instructions.md` (context L1 mirror for Copilot)
- `AGENTS.md` references expanded to new docs

## [1.0.0] — 2026-08-24

First stable release. Single-file Cloudflare Worker for Warp WireGuard subscriptions on KV + Cache API. 241 `node:test` assertions (golden byte-contracts) green in CI, `node --check` clean.

### Added

- **17 subscription formats** — `wireguard-conf` / `wireguard-conf-amnezia` (ZIP), `throne` / `throne-amnezia`, `wireguard-uri`, `singbox` / `singbox-amnezia` (endpoint schema), `singbox-legacy` / `singbox-legacy-amnezia` (legacy outbound for NekoBox/Hiddify), `xray`, `clash` / `clash-amnezia`, `v2rayn`, `surge`, `loon`, `surfboard`, `egern`
- **Amnezia obfuscation** — global `DEFAULT_AMNEZIA` + per-account overrides (`Jc` 0-128, `Jmin`/`Jmax` 0-1280, `Jmin≤Jmax`, `S*` 0-255, `H*` lo-hi ranges, non-overlapping, zero omitted)
- **Endpoint presets** — `default` / `iran` / `china` + custom, per-preset DNS, `preferredOrder` via browser probe, bulk paste `ip:port`
- **Token lifecycle** — `tokenMeta {label 1-100, expiresAt future ISO, disabled}` → 410 Gone, `fetchCount` per-token
- **Group subscriptions** — `group` tag + `agg:{token}` merging active members, own lifecycle
- **Encrypted backup** — AES-GCM `.wgenc` (`WGENC1`, PBKDF2 100k SHA-256, 8-128 char password, 2 MiB cap, `skip|overwrite`)
- **DNS per account/preset** — `account → preset → 1.1.1.1`
- **Admin SPA (de-CDN)** — zero external requests, hash router `#/accounts`/`#/presets`/`#/settings`, client picker, inline QR (SVG), deep links, skeletons/empty states, toasts/confirm modals, checklist banner, WARP chip
- **Cache API** — `caches.default` keyed `origin + /sub/{token}/{format}` (`≈5 min`), `ctx.waitUntil(put)`, `purgeCachedSubscriptions` per-token + `purgeAllCachedSubscriptions` global (now includes `agg:{token}`)
- **Auth** — PBKDF2 + bcrypt migration, HttpOnly `Secure` `SameSite=Strict` 24h cookie, `auth:fail:{ip}` 5/15min 429, optional `ADMIN_SETUP_SECRET`
- **Health/observability** — `GET /healthz` `{ok,version,kv_ms}`, `GET /api/settings/warpstatus`, structured JSON logs, `X-WG-Version`

### Backend hardening

- `kvSafe` (`kvGet`/`kvPut`/`kvDelete`) — one-line structured log, graceful null/false
- Declarative `ROUTES` → `ROUTE_TABLE` + `dispatchRequest` (405 `Allow`, 501 `/api/*`, 404 else)
- `FORMATS` registry — one entry per format, `handleSubscription` registry-driven, normalize-once `expandEndpoints` (dedupe, CIDR, tags)
- Warp client — retry with `Retry-After`/exponential backoff + cooldown, compensating `DELETE` on half-registration (`warp_orphan_delete_failed`), redacted logs, `client_id` → `reserved[3]` (now tolerant: unwraps `{result}`/`{data}`, case-insensitive `client_id`/`public_key`, orphan cleanup, strict IPv6 `:::`/CIDR)

### Docs — arena synthesis (5 drafts)

- Base = minimal user-first (A) grafted with spec-mirror (B), Diátaxis gateway (C), visual/ops (D), release-notes banner (E)
- `README.md`: hero + deploy (1-click + wrangler) + 4-step use + dashboard tour + 17-format matrix + QR/deep-links + backup + ops + troubleshooting + **Contributing** (stack → architecture → KV → ROUTES → FORMATS → testing → recipes)
- `README.fa.md` preserved; `SPEC.md`/`DESIGN.md` remain source of truth

### Security

- Backup allowlists `settings` to `amnezia` only; expired tokens rejected on import; `parseAmneziaValue` strict; `validateBase64Key` rejects whitespace; `isRange` unified to `/^\d+-\d+$/`

### Shipping

- 241 `node:test` (14 files) + golden byte-contracts + `node --check` + `wrangler deploy --dry-run` in CI (`.github/workflows/ci.yml`); tag `v1.0.0` is source of truth (semver `MAJOR.MINOR.PATCH`)

[1.0.0]: https://github.com/QMahyar/warp-generator/releases/tag/v1.0.0
