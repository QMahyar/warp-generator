# Task: implement ticket 04 — /sub — wireguard:// lines + ?scheme=wg

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 04:
`.scratch/warp-panel/issues/04-sub-wireguard-links.md`.

## Read first (in this order)

1. `CONTEXT.md` (glossary — Subscription, Sub format, Endpoint)
2. `.scratch/warp-panel/spec.md` (Seam, Sub endpoints, Renderers, Endpoint semantics)
3. `docs/adr/0006-subscriptions-unguessable-path.md`, `docs/adr/0007-per-client-sub-formats.md`
4. `docs/research/sub-formats.md` §2.1 (v2rayN wireguard:// exact shape)
5. `worker/index.js`, `worker/auth.js` (don't touch), `worker/account.js`
   (don't touch — read `extractAccountRecord`/record fields), `worker/settings.js`
   (don't touch — canonical endpoint lines, AWG record), `worker/panel.js`
   (don't touch), `worker/api-handler.js` (the legacy `buildThrone` wg://
   shape — reuse its line-construction logic, don't modify the file),
   `wrangler.jsonc`

## What to build

- **The seam** in a new `worker/sub.js` (ticket 04's renderer + the registry
  later tickets extend):
  `renderSubscription(format, opts, { account, endpoints, awg })` →
  `{ body, contentType }`, pure and unit-testable (no fetch, no env).
- **The renderer** for `sub` (the wireguard:// family):
  - default (`scheme=wireguard`): one `wireguard://` link per **valid**
    endpoint line — private key in userinfo (url-encoded), `publickey`,
    `address` (v4[+v6] CIDRs from the account record) and `mtu` in query,
    fragment = endpoint. v2rayN family.
  - `?scheme=wg` (Throne): the legacy `buildThrone` line shape, one per valid
    endpoint. **Do not modify api-handler.js** — replicate its construction
    inside `worker/sub.js` (documented as the Throne shape, parity per
    spec).
- **Endpoint semantics**: one config per valid line; ipv6-in-brackets and
  custom ports render; malformed lines are **skipped** (settings.js flags
  them; the renderer never errors on them). If zero valid lines exist →
  fall back to `162.159.192.1:2408` and `engage.cloudflareclient.com:2408`
  (spec). Full tunnel (`0.0.0.0/0, ::/0`), DNS `1.1.1.1`, MTU 1280, client
  addresses from the account record.
- **Route wiring** in `worker/index.js`:
  `GET /api/<token>/sub` where `<token>` = the `SUB_PATH` secret from env.
  Wrong/missing token → 404 (not 401 — path is the credential, ADR 0006).
  No session required. `?scheme=wireguard|wg` (default wireguard). Body:
  base64 or plain list per the research (v2rayN auto-detects — pick plain
  links joined by newlines, or base64; follow the research's recommended
  convention). `Content-Type` appropriate; `Cache-Control: public,
  max-age=21600, s-maxage=21600` (6 h, spec).
- **Never** hits the network at serve time: account + endpoints come from KV
  only. Missing account in KV → 503 with a readable message.

## Constraints

- **Do not modify** `lib/`, `app/`, `components/`, `functions/`, `config/`,
  `public/`, `scripts/`, docs, `package.json`, or `worker/auth.js`,
  `worker/account.js`, `worker/settings.js`, `worker/panel.js`,
  `worker/api-handler.js`. All new code in `worker/sub.js` + route wiring in
  `worker/index.js`. `wrangler.jsonc` may gain a commented `SUB_PATH` vars
  placeholder only.
- Tests: `worker/sub.test.js` via `node:test` — fixtures: throwaway account
  records (generate once, hardcode as test data — never real keys), endpoint
  sets incl. ipv6/custom ports/malformed lines/empty (fallback).
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green (all suites), `node --check`,
  fetch-level smoke of the real handler (fake KV, fake ASSETS, real auth) —
  per tickets 01–03 result files; decode the sub payload and assert the
  structure per §2.1.

## Deliver

Write `.scratch/router/results/04-sub.md`: files, route, seam signature,
payload conventions (plain vs base64 + why), fallback behaviour, test output,
smoke results, surprises, deviations (with rationale). Then reply with
exactly DONE.