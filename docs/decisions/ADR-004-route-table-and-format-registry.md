# ADR-004: Declarative Route Table + Format Registry

## Status

Accepted

## Date

2026-08-23

## Context

Adding routes via if-chains and formats via scattered `if (format === ...)` was error-prone (404 vs 405, missing `Allow`, forgotten `needsAmnezia`, ZIP/binary headers). Need one place per feature.

## Decision

- **`ROUTES` → `ROUTE_TABLE` (`_worker.js:6790 → 6845`)** — `{method, segments:['api','thing'|'{param:regex}'|'*tail'], auth, handler}`. `dispatchRequest` (`_worker.js:6820`) handles auth wrap, 405 `Allow`, 501 `/api/*`, 404 else. No hand-rolled dispatch.
- **`FORMATS` (`_worker.js:6430`)** — `{contentType, ext, binary, needsAmnezia, gen}` for all 17 formats. `handleSubscription` → `FORMATS[format].gen(configs, amneziaParams)`. `generate*` never touches HTTP.
- Dashboard `SUB_FORMATS` mirrors `FORMATS` keys — `parity.test.mjs` guards drift.

## Alternatives

### Framework router (itty-router)
- Cons: extra dep, bundle, does not solve `testHooks()` export rule

## Consequences

- Adding format = one `FORMATS` entry + `SUB_FORMATS` + `npm run goldens:update`.
- Adding route = one `ROUTES` entry.
- `*format` tail strips trailing `/`, catch-all `*rest` after specific `sub/{token}/{format}` preserves legacy `400` for `/sub/tok`.
