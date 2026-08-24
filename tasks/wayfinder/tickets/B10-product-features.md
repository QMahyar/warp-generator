# B10 — Backup, latency probe, status surface, aggregate subs

Status: DONE (batch/10-product-features, uncommitted)
Type: task (AFK)
Blocked by: B9

## Question / Work

1. Encrypted export/import: admin action exports ALL accounts+presets+settings as password-derived (PBKDF2 via crypto.subtle) encrypted JSON download; import restores onto fresh/cur namespace with validation + collision policy (skip/overwrite ask). Prominent warning that the file IS the credentials.
2. Browser-side endpoint latency probe: dashboard button HEAD/TIME-pings preset endpoints from the ADMIN BROWSER (zero Worker CPU), shows ms table, saves results into preset as preferred-order field consumed by expandEndpoints ordering.
3. Warp API status chip on dashboard: last registration attempt result + timestamp stored in KV ("generation: up/down, last verified N ago"); surfaced in admin header.
4. Aggregate subscription URL: group tag on accounts → merged sub URL serving union of member configs across all 10 formats (token-scoped to group, reuses lifecycle fields).
5. In-panel post-setup checklist (set password ✓ → create account ✓ → copy sub URL ✓) shown until completed.

## Acceptance

- Export→wipe-local-dev-KV→import round-trip restores working subscriptions in local dev.
- Probe produces plausible latencies and persisted order affects config ordering.
- Aggregate URL serves merged configs for tagged accounts.

## Answer

(resolved on close)

Shipped in `_worker.js` (single file, no new deps):

1. **Encrypted backup** — `POST /api/backup/export` {password} → AES-GCM blob (magic `WGENC1` + salt16 + iv12 + ct), `Content-Disposition: backup.wgenc`; key = PBKDF2-SHA-256 100k iters. Payload {version:1, exportedAt, accounts(full incl. private keys), presets, settings}. `POST /api/backup/import` {blob(base64), password, mode:'skip'|'overwrite'} → per-account validation (keys, endpoint_list, amnezia, group, tokenMeta), token-collision guard, reports {imported, skipped, errors[], presetsImported, presetsSkipped, settingsApplied}; purges cache after.
2. **Latency probe** — preset field `preferredOrder`; `PUT /api/presets/:id` accepts it; `expandEndpoints` applies via pure `applyPreferredOrder`. Browser probes endpoints with no-cors fetch + 3s AbortController; modal shows sorted ms table ("approximate reachability" labeled); Save order persists.
3. **WARP status chip** — every register attempt writes KV `settings:warpstatus` {ok, checkedAt, lastError} (wrapper around registration core); `GET /api/settings/warpstatus`; dashboard chip "WARP: up/down · N ago", tooltip = lastError.
4. **Aggregate subs** — account.group tag (sanitized 1-50); KV `agg:{uuid}` records with tokenMeta lifecycle (tokenStatus enforced on serve); `/sub/{aggToken}/{format}` merges all active member accounts' configs (each against own preset + preferredOrder) deduped by ip:port first-wins; per-member lifecycle gates; fetchCount on agg record; UI Settings card: create (group pills + label + expiry), list w/ format picker copy/QR/deep-link/open, revoke. Cache purge targets agg tokens when a member's group changes.
5. **Setup checklist** — banner until password✓(implicit)+account✓+sub-URL-copied(localStorage), dismissible.

Tests: test/b10-product-features.test.mjs — 32 tests (pure helpers incl. crypto round-trip under Node crypto.subtle, integration via dispatchRequest: export→import→serve round-trip, skip/overwrite, expired/revoked aggs, disabled-member exclusion). Gates: node --check ✓, npm test 218/0 ✓, wrangler deploy --dry-run ✓.

Security notes: backup file = all private keys, password never logged, min 8 chars both sides; agg tokens are UUIDs (route regex enforces hex-dash) so group-name guessing is not an attack path; group tags strip quotes/backslashes to keep inline handlers safe.
