# Task: implement ticket 03 — Panel settings: endpoint editor + AWG params (KV)

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 03:
`.scratch/warp-panel/issues/03-panel-settings-endpoints-and-awg.md`.

## Read first (in this order)

1. `CONTEXT.md` (glossary — Endpoint)
2. `.scratch/warp-panel/spec.md` (Implementation Decisions: KV bindings
   `ENDPOINTS` and `AWG`, endpoint semantics, AWG params)
3. `docs/adr/0005-account-and-endpoints-in-kv.md`, `docs/adr/0007-per-client-sub-formats.md`
4. `docs/research/sub-formats.md` (clients' needs — informs defaults only)
5. `worker/index.js`, `worker/auth.js`, `worker/account.js`, `worker/panel.js`
   (tickets 01–02, committed), `worker/api-handler.js` (the I1 mask pool in
   its builders copy — `I1_MASKS`/`pickI1`), `wrangler.jsonc`

## Constraints

- Plain-JS Cloudflare Worker in `worker/`. **Do not modify** `lib/`, `app/`,
  `components/`, `functions/`, `config/`, `public/`, `scripts/`, docs,
  `package.json`, `worker/auth.js`, `worker/account.js` (reviewed, committed).
- New code: a worker-safe settings module (e.g. `worker/settings.js`):
  read/write the `ENDPOINTS` KV binding (a list of `host:port` lines) and the
  `AWG` binding (toggle + Jc, Jmin, Jmax, S1–S4, H1–H4, I1–I5). Routes in
  `worker/index.js`; settings cards in `worker/panel.js` (endpoints textarea
  + AWG card).
- Endpoint semantics (spec): one `host:port` per line, v4 or v6, any port;
  malformed lines flagged client-side without blocking valid ones; empty list
  is legal (subscriptions fall back — ticket 04's job, don't implement the
  fallback here).
- AWG: toggle + params; when off or unset, `AWG` is absent from KV. I1–I5
  defaults: pull from the I1 mask pool in the worker's builders copy — the
  panel card can prefill I1 with a picked mask when the operator enables AWG
  (or leave I1 empty and let renderers pick — your call, document it).
- Panel: framework-less (ADR 0004); keep the textContent-not-innerHTML
  discipline from the account card; Save buttons with saved feedback.
- KV bindings: names `ENDPOINTS` and `AWG`; commented placeholders in
  `wrangler.jsonc` for local dev.
- Tests: extend `node:test` — pure parts (parse/serialize endpoint lines and
  AWG params; validation) — the network layer is not involved.
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green (all suites), fetch-level
  smoke of the real `fetch` handler with a fake KV (ticket 01's result file
  explains the stub pattern): save endpoints, reload state, malformed-line
  handling, AWG toggle on/off.

## Deliver

Write `.scratch/router/results/03-settings.md`: files, routes, KV payload
shapes, validation rules, test output, smoke results, surprises, deviations
(with rationale). Then reply with exactly DONE.