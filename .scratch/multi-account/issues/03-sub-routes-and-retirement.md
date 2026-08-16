# 03 — Sub routes from snapshot + cache + SUB_PATH retirement

**What to build:** The six `/api/<token>/sub*` routes resolve tokens against
the snapshot (hash + constant-time compare, 404 on mismatch — ADR 0006
posture). A sub whose pinned account is missing returns 503 with the existing
readable message. Edge cache drops to 5 min; non-200 sub responses get
explicit no-store. The SUB_PATH env secret, its gates, wrangler entry, deploy
script stage, and README references are removed; the panel shell and
subscription card are fed by the snapshot-backed API.

**Blocked by:** 02 — Subscriptions API + subscriptions card

**Status:** done

- [x] Each format route serves from its sub's pinned account; wrong token → 404
- [x] Deleted account → sub URL returns 503, not 500
- [x] Re-pin reflects within the 5-min cache window
- [x] 404/503/405 sub responses carry explicit no-store
- [x] Deploy works without SUB_PATH; docs updated

**Implemented (ticket 03):**

- `worker/index.js` — the six `/api/<token>/sub*` routes resolve the path token
  against the STATE snapshot: `sha256(token)` constant-time compared with
  `subs[].tokenHash` (`lookupSubByToken`), no match → 404 (never 401); sub
  found but pinned account missing → 503 with the existing readable message;
  `SUB_CACHE_CONTROL` = `public, max-age=300, s-maxage=300`; 404/503/405 sub
  responses carry `Cache-Control: no-store`; `subPathMatches` and the
  `env.SUB_PATH` gates deleted.
- `worker/account.js` — legacy `readAccount` + `ACCOUNT_KV_KEY` deleted
  (readers now go through `state.js`).
- KV binding renamed `ACCOUNT` → `STATE` (state snapshot: accounts + subs +
  revision) in `worker/*`, `wrangler.jsonc`, and the deploy script; SUB_PATH
  removed from `wrangler.jsonc`, `scripts/deploy-warp-panel.sh` (7 stages,
  13-check smoke suite with API-minted per-sub token), `docs/ops/deploy.md`,
  and `README.md` (`/api/<token>/sub*` routes, 5-min cache, token-hash security
  model).
- Tests: `worker/subs.test.js` public sub-route smoke tests (200 + max-age=300,
  wrong token → 404 no-store, POST → 405 no-store, deleted account → 503
  no-store, deleted sub → 404 no-store); 271/271 pass, `npm run lint` clean.