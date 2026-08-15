# Task: implement ticket 02 — WARP account Register/Rotate (KV)

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 02:
`.scratch/warp-panel/issues/02-warp-account-register-rotate-kv.md`.

## Read first (in this order)

1. `CONTEXT.md` (glossary — WARP account, Registration, Rotate)
2. `.scratch/warp-panel/spec.md`
3. `docs/adr/0002-single-shared-warp-account.md`, `docs/adr/0005-account-and-endpoints-in-kv.md`
4. `docs/plans/pivot-inventory.md` (registration flow, account material fields)
5. `worker/index.js`, `worker/auth.js`, `worker/panel.js` (ticket 01 — committed),
   `worker/api-handler.js` (existing `registerClient`/`enableWarp` twins),
   `wrangler.jsonc`

## Constraints

- Plain-JS Cloudflare Worker in `worker/`. Single engine (ADR 0004). **Do not
  modify** `lib/`, `app/`, `components/`, `functions/`, `config/`, `public/`,
  `scripts/`, docs, `package.json` — and do not modify `worker/auth.js`
  (already reviewed and committed).
- New code: a worker-safe account module (e.g. `worker/account.js`):
  register/rotate via `api.cloudflareclient.com` (keep the 10 s timeout and
  okhttp UA), extract the account record (private key, client id, token,
  peer public key, v4/v6 addresses, reserved, registeredAt), read/write the
  `ACCOUNT` KV binding. `worker/index.js` gains the routes; the account card
  goes into `worker/panel.js` (the shell from ticket 01).
- Only Register and Rotate may write the account. Rotate replaces the stored
  record. Errors surface readable messages; a failed action leaves KV
  unchanged (write AFTER the network call succeeds).
- Panel: framework-less (ADR 0004). Account card shows status (none /
  registered since), handles the in-flight state (network ~1–2 s), renders
  errors.
- KV binding: name `ACCOUNT`; add a commented placeholder in `wrangler.jsonc`
  for local dev. Don't add real secrets.
- Tests: extend `node:test` — cover the pure parts (account-record
  extraction from a canned WARP response; error mapping). No npm
  dependencies.
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green (auth tests still pass), a
  fetch-level smoke of the real `fetch` handler with a stubbed fetch for the
  CF API and a fake KV binding (ticket 01's result file explains the stub
  pattern).

## Deliver

Write `.scratch/router/results/02-account.md`: files, routes, record shape,
test output, smoke results, surprises, deviations (with rationale). Then
reply with exactly DONE.