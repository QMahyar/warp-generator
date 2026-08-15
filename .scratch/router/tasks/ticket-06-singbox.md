# Task: implement ticket 06 — /sub/singbox

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 06:
`.scratch/warp-panel/issues/06-sub-singbox.md`.

## Read first (in this order)

1. `CONTEXT.md`; 2. `.scratch/warp-panel/spec.md` (Renderers — `?legacy=1`);
3. `docs/research/sub-formats.md` §2.3 (sing-box wireguard outbound vs 1.13+
   endpoint shape — both payloads are spelled out there);
4. `worker/sub.js` (seam + registry, tickets 04–05), `worker/settings.js`,
   `worker/account.js`, `worker/index.js` (SUB_PATH route pattern, cache
   headers, missingAccount helper), `wrangler.jsonc`.

## What to build

- `singbox` entry in the `RENDERERS` registry behind the unchanged seam:
  `renderSubscription('singbox', opts, { account, endpoints, awg })`.
  AWG is not expressible in sing-box — ignore the record (same as `/sub`).
- **Default payload** — a minimal but *runnable* sing-box `config.json` using
  the **1.13+ wireguard endpoint shape**: one `endpoints` entry (type
  wireguard, tag `warp-<host>:<port>`, address from the account record,
  private_key, mtu 1280, `peers: [{address, port, public_key, allowed_ips
  ["0.0.0.0/0", "::/0"], reserved (bytes)}]`) per valid endpoint, plus the
  minimal supporting skeleton a remote profile needs (inbounds e.g. a
  mixed/tun/0.0.0.0 inbound, outbounds referencing a selector/wirect or the
  endpoints, route final MATCH) — check what SFA/SFI remote profiles require
  (research §2.3 + sing-box docs; a `dns` block with 1.1.1.1 is expected).
  The JSON must parse and be structurally valid per the 1.13+ schema.
- **`?legacy=1`** — the pre-1.13 wireguard **outbound** JSON shape (research
  §2.3 first block) as the outbounds entries for NekoBox Android and Husi.
- Endpoint semantics: valid lines only, malformed skipped, zero valid → the
  two fallback endpoints (same policy as tickets 04–05).
- Route: `GET /api/<SUB_PATH>/sub/singbox` (+ `?legacy=1`), no session,
  wrong token → 404, missing account → 503 (reuse the shared helper),
  6 h cache headers, `Content-Type` `application/json; charset=utf-8`.
- **Do not modify** `worker/auth.js`, `worker/account.js`,
  `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, or any
  non-worker dirs; `package.json` untouched. New code in `worker/`; wiring
  in `worker/index.js` only.
- Tests: extend `node:test` — parse the default JSON and assert the
  endpoint entries per §2.3 (server/port/address/private_key/public_key/
  reserved/allowed_ips), the legacy shape differs correctly, per-endpoint
  cardinality, fallback, v6-less accounts. Reuse the throwaway fixtures.
  Update the `unknown format` guard if it currently asserts `'singbox'` —
  switch it to the next not-yet-shipped format (e.g. `'neko'`).
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green, `node --check`, fetch-level
  smoke per the established pattern: default + legacy + fallback + AWG
  ignored + wrong token 404 + missing account 503 + POST 405 + anon
  protected routes still 401.

## Deliver

Write `.scratch/router/results/06-singbox.md`: files, route, both payload
shapes, skeleton choices (inbounds/outbounds/dns) + why, test output, smoke
results, surprises, deviations (with rationale). Reply with exactly DONE.