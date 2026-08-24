# ADR-001: Single-file Cloudflare Worker (`_worker.js`)

## Status

Accepted

## Date

2026-08-23 (consolidated for v1.0.0 stable)

## Context

Need a Warp config manager that deploys in one click on free tier, with minimal cold-start and zero build step. Options: multi-file `src/` with bundler, single file with inlined HTML, separate frontend Worker.

Constraints: Workers free CPU 10 ms, KV 1k writes/day, no Node APIs, workerd rejects non-function exports, want `wrangler deploy` with no compile.

## Decision

All runtime code in one ES2022 module `_worker.js` (~6700 lines) + `html/` inlined via `String.raw`. Zero build, `wrangler deploy --dry-run --outdir=dist` 637 KiB / 148 KiB gzip, startup 26 ms.

Plain-function helpers exported directly; non-function constants (`FORMATS`, `ROUTES`, `VERSION`, `ROUTE_TABLE`) via `testHooks()` (workerd export rule).

## Alternatives

### Multi-file + esbuild
- Pros: smaller files, HMR
- Cons: bundle step, workerd export validation still needed, CI must run build, free-tier contributors need tooling
- Rejected: build is cost without user value; single file already greppable via `Grep`.

### Separate Pages Worker for admin
- Pros: cleaner split
- Cons: two deploys, two routes, CORS, KV sharing, double billing

## Consequences

- New format = one `FORMATS` entry (`_worker.js:6430`); new route = one `ROUTES` entry (`_worker.js:6790`) — no if-chains.
- Tests import pure helpers directly; constants via `testHooks()`.
- Editors must respect CRLF (`test/golden/*.txt -text`) and `node --check` gate.
