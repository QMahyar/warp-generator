# Shipping Checklist — Warp Generator (v1.0.0)

Use before every `v*.*.*` tag. Source: shipping-and-launch skill.

## Pre-launch

### Code quality

- [ ] `npm run release:check` green (syntax → version → 241 tests → dry-run)
- [ ] `node --check _worker.js` 0
- [ ] `npx wrangler deploy --dry-run --outdir=dist` shows 637 KiB / gzip ~148 KiB, no warnings
- [ ] No TODO that must ship, no `console.log` debug (only `event` logs)

### Security

- [ ] `git diff --staged | grep -i "cfk_\|password\|secret"` → 0 (push protection will block)
- [ ] `npm audit --audit-level=high` → 0 high/critical
- [ ] `validate*` on all inputs (SPEC AC11), 410 on expired/disabled, rate limit `auth:fail:{ip}`

### Infra / ops

- [ ] `wrangler.toml` `compatibility_date` ≤ workerd, KV `WARP_KV` correct per vault
- [ ] `docs/RELEASE.md` version bump matches tag, `CHANGELOG.md` human entry grouped Added/Fixed
- [ ] `README.md` deploy/use/troubleshoot reflects current behavior

## Ship (tag is truth)

```bash
git tag -a v1.0.1 -m "v1.0.1 — <why>" && git push --follow-tags
# CI verify → Release workflow: GitHub Release + wrangler deploy + healthz
```

## First hour (monitor)

- [ ] `curl -fsS https://warp-generator.qhorror13194.workers.dev/healthz` → `{"ok":true,"version":"1.0.1"}`
- [ ] `wrangler tail` → no new error type, `warp_unexpected_structure` stable
- [ ] `GET /sub/{token}/singbox` via `/admin` QR → 200, `X-WG-Version: 1.0.1`
- [ ] GitHub Release has correct notes (`CHANGELOG.md` slice)

## Rollback

Feature-flag: not applicable (Workers). Rollback = re-deploy previous tag:

```bash
git checkout v1.0.0
npx wrangler deploy
# then delete bad tag/release
git push origin :refs/tags/v1.0.1
gh release delete v1.0.1 --yes
git tag -d v1.0.1
```

Data: KV schema additive — no migration rollback needed.

## Post-ship

- [ ] Update `docs/decisions/` if decision changed (new ADR superseding)
- [ ] Wire `AGENTS.md`/`CLAUDE.md`/`.cursorrules` if behavior changed (context-engineering)
