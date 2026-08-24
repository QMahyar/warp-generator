# Warp Generator — Claude Rules

## Project

Single-file Cloudflare Worker for Warp WireGuard subscriptions. Version `1.0.0` stable. One `_worker.js` (~6700 lines) + `test/` suite (257 tests).

## Tech Stack

- Runtime: Cloudflare Workers, ES2022, `nodejs_compat`, ES Module
- Storage: KV (`WARP_KV`) + Cache API (`caches.default`) — KV `cache:*` abandoned in v1
- JS only (no TS, no build), `node:test` dev-only
- Deps: `bcryptjs`, `@noble/curves`, `fflate`, `js-yaml`

## Commands

```bash
node --check _worker.js
npm test                          # 257 tests incl. goldens
npm run goldens:update            # ONLY after deliberate gen change
node scripts/check-version.mjs    # package.json ↔ _worker.js ↔ tag
npx wrangler deploy --dry-run --outdir=dist
npm run dev                       # wrangler dev --local
```

CI: `ci.yml` verify on PR/master (syntax → version → test → dry-run → audit). Release: `release.yml` on `v*.*.*` tag → verify → GitHub Release → `wrangler deploy` → `GET /healthz` check.

## Conventions

- `camelCase` funcs/vars, `UPPER_SNAKE` consts, `async/await`, early returns, explicit `try/catch` at top level
- Routes: add to `ROUTES` (`_worker.js:6790`) — never if-chains; `dispatchRequest` handles auth/405/501/404
- Formats: add to `FORMATS` (`_worker.js:6430`) — `{contentType, ext, binary, needsAmnezia, gen}`; sync `SUB_FORMATS` in dashboard
- KV: always `kvGet`/`kvPut`/`kvDelete` (`_worker.js:…` wrappers), check `null`/`false`; never raw `env.WARP_KV` in new code
- Cache: `caches.default.match` keyed `origin + /sub/{token}/{format}`; write via `ctx.waitUntil(put)`; purge via `purgeCachedSubscriptions` / `purgeAllCachedSubscriptions` (includes `agg:{token}`)
- Errors: `errorResponse(msg, status)` with 400/401/404/405+Allow/410/429/501/500
- Exports: plain helpers export directly; non-function constants via `testHooks()` (workerd rejects non-function named exports)
- No CDN in admin HTML (`String.raw`, inline only) — de-CDN invariant

## Boundaries

- Validate every input (see SPEC.md AC11 + addendum table in README)
- Hash with PBKDF2 (bcrypt only for migration), `HttpOnly` `Secure` `SameSite=Strict` cookies
- Never log private keys / tokens (warp client redacts)
- Never add dep without bundle check, never hand-edit `test/golden/*`, never `rm -rf` without confirm

## Docs

- Source of truth: `SPEC.md` (ACs), `DESIGN.md` (decisions), `CHANGELOG.md` (human changelog, tag is version truth), `README.md` (user + collapsed Contributing)
- ADRs: `docs/decisions/ADR-*.md` (single-file, KV+Cache, auth/backup, route/format)
- Release: `docs/RELEASE.md` (semver, tag flow, pre-launch checklist, rollback)
- Research: `research/` + `WARP_API_RESEARCH.md`

## Patterns

```javascript
// Route
{ method: 'POST', segments: ['api', 'thing'], auth: true, handler: handleThingCreate }

// Format
// FORMATS['foo'] = { contentType:'text/plain', ext:'txt', binary:false, needsAmnezia:false, gen: generateFoo }

// KV
const data = await kvGet(env, 'key', {type:'json'});
if (!data) return {error:'Not found', status:404};
```

## Shipping

Tag `vMAJOR.MINOR.PATCH` is the release. Bump `package.json` + `_worker.js:VERSION` + `CHANGELOG.md` atomically, `git tag -a v...`, `git push --follow-tags`. See `docs/RELEASE.md`.
