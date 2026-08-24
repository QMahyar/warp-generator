# Copilot Instructions — Warp Generator

> See `AGENTS.md` (agent rules) + `CLAUDE.md` (full stack/commands) for source of truth. This file mirrors them for GitHub Copilot.

## Stack

Single-file Cloudflare Worker `_worker.js` (~6700 lines), ES2022, `nodejs_compat`, KV + Cache API (`caches.default`), 241 tests, 17 formats.

## Commands

```
node --check _worker.js
npm test
node scripts/check-version.mjs
npx wrangler deploy --dry-run --outdir=dist
```

Tag `v*.*.*` is version truth (`package.json` ↔ `_worker.js:VERSION`).

## Patterns

- Routes: add to `ROUTES` (`_worker.js:6790`), formats to `FORMATS` (`_worker.js:6430`)
- KV via `kvGet/kvPut/kvDelete`, check null/false
- Cache via `caches.default` keyed `origin + /sub/{token}/{format}`, purge helpers
- Exports via `testHooks()` for non-function constants

## Docs

`README.md` (user + Contributing), `SPEC.md`, `DESIGN.md`, `CHANGELOG.md`, `docs/RELEASE.md`, `docs/decisions/ADR-*.md`, `research/`.
