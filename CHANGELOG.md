# Changelog

All notable changes to warp-generator are documented here.

## [1.2.0] — 2026-08-21

Complete admin UI overhaul (5-agent pipeline: 3 parallel UI designers, integrator, browser QA
via headless Chrome on desktop 1440x900 + mobile 390x844). Full report: `qa-report/FINAL.md`.

### Added
- **New design system** — deep-navy `#070b14` theme with animated glow, glass cards, blue→cyan
  gradient buttons, gradient logo tile, inline SVG favicon (all pages)
- **Setup page** — password strength hint, show/hide password toggles, loading spinner, footer
  link to login
- **Login page** — show/hide toggle, loading spinner, session hint; `?error=` mapped messages
  (invalid password, rate limit, first-run setup)
- **Dashboard** — sticky glass header, stat chips (accounts/presets/formats), skeleton loaders,
  empty states with SVG art, avatar-tile account cards with copyable token chips, detail view
  with 10 subscription URLs (copy + open per row), toast stack with slide-in animations,
  custom confirm modals replacing native `confirm()`, Esc + backdrop modal close, preset
  editor with dynamic endpoint rows, Amnezia defaults with inline validation, loading states
  on every async button, full mobile responsiveness (390px: no overflow)
- **Error handling** — server-side setup/login errors now redirect with `?error=<code>`,
  mapped to friendly messages client-side (replaces the fragile class-string `replace()`)

### Fixed
- **Critical: dashboard script never executed** — escape sequences (`\s`, `\'`) in the embedded
  inline JS were cooked by the template literal, producing invalid JS (blown `onclick` strings,
  broken regexes). `DASHBOARD_HTML` is now `String.raw` so served HTML is byte-identical to
  `html/dashboard.html`
- **Preset DELETE/PUT 404 for seeded presets** — route regex only matched UUIDs; widened to
  `[^/]+` (`default`, `iran`, `china` now deletable)
- **Clipboard copy failed silently on plain-HTTP deploys** — `writeText` rejection now falls
  back to the `execCommand` path
- **Stat chip showed "0 presets" on fresh load** — dashboard now fetches presets alongside accounts
- **All subscriptions 500 after deleting the unused `default` preset** — new accounts reference
  `preset_id: 'default'`; `expandEndpoints` now falls back to `DEFAULT_PRESETS` when a
  referenced preset is missing

### QA
- Desktop + mobile browser matrix (setup, login + error, dashboard, import, detail, regenerate
  token, delete, presets, Amnezia validation, logout): all pass, zero console errors
- Screenshots: `docs/screenshots/`, full report: `qa-report/FINAL.md`

## [1.1.0] — 2026-08-19

Deep audit hardening: all findings from a 10-agent review against official client sources
(Throne, v2rayN, sing-box releases) shipped in one release.

### Added
- **`singbox-legacy` format** — legacy outbound schema for NekoBox / Hiddify / sing-box ≤ 1.10
- **Subscription pipeline guards** — HEAD requests (headers-only 200), 405 for other non-GET methods,
  HTTP 500 when an account has no endpoints, trailing-slash format normalization,
  Content-Disposition fallback filename for non-ASCII account names
- **Login rate limiting** — 5 failed attempts per IP → HTTP 429 for 15 minutes (KV-backed)
- **Setup takeover gate** — optional `ADMIN_SETUP_SECRET` required before any password exists
- **Import normalization** — `[Peer] Reserved`/`ClientId` preserved, `H1-H4` range strings
  (`123-456`) kept verbatim through parse → generate
- **Amnezia validation** — `Jmin ≤ Jmax`, non-overlapping H1-H4, range strings, `Jc ≤ 128` (kernel cap)
- **Strict endpoint validation** — real IPv6 group/hex rules, embedded IPv4, per-label domain
  rules, null-endpoint rejection, endpoint cap of 200 per account/preset
- **WARP API** — real `client_id` decoded into `reserved` bytes (fallback `[0,0,0]`),
  `Retry-After` surfaced on 429, `WARP_PEER_PUBLIC_KEY` fallback when peer key is missing
- `X-Content-Type-Options: nosniff` on HTML/JSON responses; `'` escaped in HTML output

### Changed
- **Sing-box JSON → endpoint schema** (`address[]` + `peers[]`, CIDR-normalized, `route.final`,
  unique tags) — required by sing-box ≥ 1.11 and Throne 1.13+ which removed the legacy outbound
- **IPv6 endpoints bracketed** at `expandEndpoints` — fixes `.conf Endpoint`, `wg://`,
  `wireguard://`, and Xray peer endpoints in one place
- **Clash YAML** — proxy names made unique (`name ip:port` suffix), bogus `persistent-watch`
  replaced with real `persistent-keepalive: 25`, reserved arrays cloned (no YAML anchors)
- **Xray JSON** — removed invalid `udp` field; address list filtered for missing IPv6
- **WireGuard .conf** — no trailing comma in `Address` when IPv6 absent; `# Reserved` comment
  emitted when reserved bytes are non-zero
- **Parsers** — `parseAddressPair` accepts comma and dash separators (v2rayN + Throne forms);
  10KB `wg://` cap; guarded `decodeURIComponent`; duplicate `[Interface]` → error, first
  `[Peer]` wins
- **Cache invalidation** — editing a preset or the global Amnezia settings now clears affected
  subscription caches
- **Cache reliability** — KV cache writes are best-effort (a failed write never 500s a valid fetch)
- **Honest headers** — removed fabricated `Subscription-Userinfo` quota/expiry

### Fixed
- Zero `H1-H4` Amnezia params no longer emitted (amneziawg `magic headers must not overlap`)
- Amnezia junk params now survive round-trips with string range values

### Security
- Setup-takeover protection, login rate limiting, strict input validation as above

---

## [1.0.0] — 2026-08-18

Initial release.

### Added
- Cloudflare Worker managing Warp WireGuard accounts (generate via unofficial Warp API / import
  `.conf` / `wg://` / `wireguard://`)
- 9 subscription formats: WireGuard `.conf` (vanilla + Amnezia, ZIP), Throne `wg://` (+Amnezia),
  `wireguard://`, Sing-box JSON, Xray JSON, Clash YAML, V2RayN base64
- Endpoint presets (default/Iran/China) with custom preset support
- Amnezia global defaults + per-account overrides (Jc, Jmin, Jmax, S1, S2, H1-H4)
- Admin SPA dashboard, bcrypt password auth with HttpOnly session cookies
- 5-minute KV subscription caching
- Input validation per SPEC.md AC11

---

[1.1.0]: https://github.com/qmahyar/warp-generator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/qmahyar/warp-generator/releases/tag/v1.0.0