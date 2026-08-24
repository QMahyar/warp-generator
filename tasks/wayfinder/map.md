# Wayfinder Map — Full Remediation & Feature Ship

## Destination

Every finding from the 5-agent critical review implemented — backend and frontend, big and small — verified by tests, merged to master, deployed to the user's Cloudflare account, and live-tested against production.

## Notes

- **Execution override:** this effort carries implementation inside the map (user directive: "everything should be implemented"). Tickets are AFK `task` type worked by agent sessions in batches.
- Domain: Cloudflare Worker, single-file `_worker.js`, KV storage, inline SPA admin panel. No build step. Free tier.
- Skills every session should consult: none mandatory; use repo AGENTS.md conventions.
- Verification gate per batch: `node --check _worker.js` → `npm test` (once harness exists) → `npx wrangler deploy --dry-run --outdir=dist`. Frontend batches additionally smoke-test via `wrangler dev`.
- Line numbers from the review are stale after each batch — locate code semantically.
- Tracker: local markdown (`tasks/wayfinder/tickets/`). Claiming = editing ticket status line.

## Decisions so far

- [5-agent review](../../../qa-report/) : full findings inventory; source of all tickets
- Architecture kept: single-file worker + KV + vanilla inline SPA; frameworks/D1/SaaS rejected per report
- Cache API replaces KV subscription cache (consensus #2/#7)
- Token lifecycle instead of multi-user accounts (product report)
- Bandwidth metering ruled impossible; hit-counters only

## Not yet specified

- Exact WAF rule shape for `/sub/*` rate limiting (dashboard-side; may be replaced by in-worker throttle if quota-safe) — decide during B3/B4.
- compatibility_date target version (dry-run will dictate).

## Coverage expansion (2026-08-23 — 10-scout audit)

10 parallel scouts audited every VPN client subscription format:

- **C1 (P0):** subscription headers (`profile-title`/`subscription-userinfo`/`profile-web-page-url`) + deep links (`stash://`/`loon://`/`hiddify://import/` + `clash://` alias) + `clash-amnezia` (`amnezia-wg-option` for Mihomo DPI bypass)
- **C2 (P1):** iOS INI/YAML formats — `surge` (Surge conf) + `loon` (Loon one-liner) + `surfboard` + `egern` YAML
- **C3 (P2):** AWG 2.0 (`S3/S4/I1`) + `singbox-amnezia` + `presharedkey` param

Strictly additive: new FORMATS entries + header lines + deep-link twins; no breaking changes.

## Out of scope

- Multi-user auth system, bandwidth metering/quota enforcement, in-worker endpoint scanning, hosted SaaS, Telegram bot, config chaining, WARP+ license features (product report "do not build" list).
- D1 migration (report says before multi-user only; multi-user is out of scope).
- `vpn://` compressed JSON for AmneziaVPN app, SIP008 Shadowsocks envelope, Quantumult X `wireguard=` (QX has no WG) — scout-confirmed SKIP.
