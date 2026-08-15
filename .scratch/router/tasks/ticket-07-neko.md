# Task: implement ticket 07 — /sub/neko

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 07:
`.scratch/warp-panel/issues/07-sub-neko.md`.

## Read first (in this order)

1. `CONTEXT.md`; 2. `.scratch/warp-panel/spec.md` (Renderers);
3. `docs/research/sub-formats.md` §2.2 (nekoray://custom# exact shape —
   `cs` = sing-box wireguard outbound JSON, base64 whole link);
4. `worker/sub.js` (seam + registry, tickets 04–06), `worker/account.js`,
   `worker/settings.js`, `worker/index.js` (SUB_PATH route pattern, cache
   headers, shared missingAccount), `wrangler.jsonc`.

## What to build

- `neko` entry in the `RENDERERS` registry behind the unchanged seam:
  `renderSubscription('neko', opts, { account, endpoints, awg })` → payload =
  **base64 of one `nekoray://custom#` link per valid endpoint** (base64 of
  the whole blob of newline-joined links, matching the `/sub` convention —
  confirm against §2.2's sample).
- Each link wraps the NekoBox `CustomBean` JSON (`_v:0`, `addr`,
  `cmd:[""]`, `core:"internal"`, `cs` = the **sing-box wireguard outbound**
  JSON for that endpoint — the legacy shape from ticket 06, one endpoint per
  link, `tag`/`name` = `warp-<endpoint>`, mapped port etc. per §2.2 sample),
  `name` = `warp-<host>:<port>`. Follow the research's sample field-for-field
  where it matters for NekoBox desktop parsing (Bean2Link.cpp/CustomBean).
- Endpoint semantics: valid lines only, malformed skipped, zero valid →
  fallback pair (same policy as 04–06). AWG ignored (not expressible).
- Route: `GET /api/<SUB_PATH>/sub/neko`, no session, wrong token → 404,
  missing account → 503 (shared helper), 6 h cache headers,
  `Content-Type: text/plain; charset=utf-8` (links blob, like `/sub`).
- **Do not modify** `worker/auth.js`, `worker/account.js`,
  `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, or any
  non-worker dirs; `package.json` untouched. New code in `worker/`; wiring
  in `worker/index.js` only.
- Tests: extend `node:test` — decode the payload, assert one
  `nekoray://custom#` link per valid endpoint, the linked base64 parses to
  the CustomBean shape with a valid `cs` wireguard outbound (fields per
  §2.2), fallback, per-endpoint names. Update the `unknown format` guard in
  `sub.test.js` if it asserts `'neko'` → switch to `'wg'` (or `'awg'`, the
  next formats in 08).
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green, `node --check`, fetch-level
  smoke per the established pattern (default payload, fallback, wrong token
  404, missing account 503, POST 405, anon protected routes 401).

## Deliver

Write `.scratch/router/results/07-neko.md`: files, route, link shape,
CustomBean field mapping + sources, test output, smoke results, surprises,
deviations (with rationale). Reply with exactly DONE.