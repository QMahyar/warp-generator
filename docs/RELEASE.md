# Release & Shipping — Warp Generator

> Tag is the source of truth. `package.json` + `_worker.js:VERSION` must match `v*.*.*` tag. `scripts/check-version.mjs` enforces it in CI.

## Versioning

- **Semver** `MAJOR.MINOR.PATCH` (git-workflow skill):
  - `MAJOR` — breaking (route removed, KV schema non-additive, format renamed)
  - `MINOR` — additive (new format, new route, new field with default)
  - `PATCH` — fix (Warp tolerance, validation, perf, docs)
- **Current:** `1.0.0` stable — no breaking change since tag; additive only.
- **Process:**
  ```bash
  # 1. bump versions atomically
  # edit package.json: "version": "1.0.1"
  # edit _worker.js: const VERSION = '1.0.1'
  # edit CHANGELOG.md: ## [1.0.1] — 2026-08-24

  node --check _worker.js && npm test && node scripts/check-version.mjs --tag=v1.0.1
  git add package.json _worker.js CHANGELOG.md
  git commit -m "release: v1.0.1 — <what>"
  git tag -a v1.0.1 -m "v1.0.1 — <what>"
  git push origin master --follow-tags

  # CI (verify job) checks syntax + tests + version consistency + dry-run + npm audit
  # Release workflow (on tag) creates GitHub Release + deploys to Workers + health check
  ```

- **Tag never moves.** If release fails, delete tag + release, fix, re-tag with next PATCH.

## Pre-launch Checklist (shipping-and-launch)

### Code quality

- [ ] `node --check _worker.js` clean
- [ ] `npm test` 241 green (incl. `goldens.test.mjs` — if goldens changed, `npm run goldens:update` diff reviewed)
- [ ] `node scripts/check-version.mjs` passes (tag ↔ `package.json` ↔ `_worker.js`)
- [ ] `npx wrangler deploy --dry-run --outdir=dist` shows 637 KiB / gzip ~148 KiB
- [ ] `npm audit --audit-level=high` → 0 high/critical (or documented exception)
- [ ] No `console.log` left except structured `event` logs (`warp_…`, `sub_generated`, …); no secrets in logs
- [ ] No TODO that must ship

### Security

- [ ] No secrets in repo (`git diff --staged | grep -i "cfk_\|password\|secret"`)
- [ ] `settings:password` is PBKDF2/bcrypt only; `wrangler secret` for `ADMIN_SETUP_SECRET`
- [ ] Rate limit `auth:fail:{ip}` 5/15min, `validate*` on all inputs per SPEC AC11, 410 on expired/disabled tokens
- [ ] `.wgenc` capped 2 MiB, `settings` allowlist `amnezia` only

### Perf / infra

- [ ] `_worker.js` startup < 30 ms, KV + Cache API only, no Node APIs at runtime
- [ ] Free-tier aware: batch `fetchAccountsBatched` 20, `listAggRecords` cursor, Cache API `ctx.waitUntil`
- [ ] `wrangler.toml` `compatibility_date` ≤ workerd version

### Docs

- [ ] `README.md` deploy/use/troubleshoot up to date, `README.fa.md` linked
- [ ] `CHANGELOG.md` has human `## [x.y.z] — YYYY-MM-DD` entry (Added/Changed/Fixed, not git log)
- [ ] `SPEC.md`/`DESIGN.md` still true; ADRs in `docs/decisions/` for any new decision
- [ ] `AGENTS.md`/`CLAUDE.md`/`.cursorrules` version bumped if behavior changed

## Deploy

- **Tag-triggered (primary):** push `v*.*.*` → `release.yml` → verify → GitHub Release → `wrangler deploy` (needs `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_API_KEY`+`EMAIL` + `ACCOUNT_ID` secrets) → `GET /healthz` check
- **Master dry-run:** push to `master` → `ci.yml` verify + dry-run only (no deploy)
- **Manual deploy (your Cloudflare account):**
  ```powershell
  $env:CLOUDFLARE_API_KEY="<Global API Key or use CLOUDFLARE_API_TOKEN>"
  $env:CLOUDFLARE_EMAIL="<your Cloudflare email>"
  $env:CLOUDFLARE_ACCOUNT_ID="<your account_id>"
  npx wrangler deploy
  curl -fsS https://<your-worker>.workers.dev/healthz
  ```

## Monitoring (first hour)

```
GET /healthz              → {"ok":true,"version":"1.0.0","kv_ms":<20}
GET /api/settings/warpstatus → {ok, checkedAt, lastError} (chip)
wrangler tail             → structured logs: sub_generated, warp_unexpected_structure, kv_error
```

Hold vs rollback:

| Metric | Hold | Roll back |
|---|---|---|
| `healthz` non-200 | investigate | rollback immediately |
| `warp_unexpected_structure` spike | check Warp API diff | keep serving (fallback) |
| Error rate >2× baseline | — | `gh release delete vX --yes && git push origin :refs/tags/vX && wrangler deploy` on previous tag |
| Latency p95 >50% | investigate | rollback |

## Rollback

```bash
# fastest: re-deploy previous tag
git checkout v1.0.0
npx wrangler deploy
# or tag delete + re-release
git push origin :refs/tags/v1.0.1
gh release delete v1.0.1 --yes
git tag -d v1.0.1
# fix, bump to v1.0.2, re-tag
```

KV data never rolled back — schema is additive (`tokenMeta`, `group`, `fetchCount`, `dns`); old code ignores unknown fields.

## Verification (after)

- [ ] `GET /healthz` 200
- [ ] `POST /api/account/generate` (via `/admin`) → 201 + sub fetch 200
- [ ] `wrangler tail` no new error type
- [ ] GitHub Release has correct `CHANGELOG.md` slice
