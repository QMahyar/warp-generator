# Task: implement ticket 10 — Import an existing WARP account

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 10:
`.scratch/warp-panel/issues/10-import-warp-account.md`.

## Read first (in this order)

1. `CONTEXT.md` (glossary — WARP account, Registration, Rotate; the Import
   concept extends the account acquisition language); 2.
   `.scratch/warp-panel/spec.md` (Implementation Decisions — KV ACCOUNT
   record; the Registration decision line now covers import);
3. `docs/adr/0002-single-shared-warp-account.md`;
4. `worker/account.js` (the record shape + KV helpers — extend, don't
   break; `readAccount/writeAccount`, `publicAccount`, `isValidAccountRecord`),
   `worker/auth.js` (don't touch), `worker/index.js` (route pattern for
   session-gated account routes), `worker/panel.js` (account card — add the
   import form), `worker/api-handler.js` (READ only: the registerClient
   request shape for the verification call), `docs/plans/pivot-inventory.md`
   (legacy conf builder layout if useful), `wrangler.jsonc`.

## What to build

- **Parsers** (pure, in `worker/account.js` or a sibling module):
  - conf parser: `[Interface]` `PrivateKey` (base64), `Address` (one or two
    CIDRs — v4 and/or v6), optional `DNS`; `[Peer]` `PublicKey`,
    `AllowedIPs`. Everything else ignored (Endpoint deliberately — the
    panel's endpoint list rules).
  - JSON parser: the warp-reg-style registration response shape — the
    `result` object as `registerClient` returns it (id, token) plus the
    enableWarp config JSON: `interface.addresses` (v4/v6), `interface.
    private_key` note the *client's* key lives with the operator, peers
    array with `public_key`, `reserved` (from `config.client_id` /
    `reserved` field; mirror `extractAccountRecord`'s field choices in
    `worker/account.js`). Auto-detect: try JSON first, then conf; a body
    that is neither → readable error listing what was expected.
  - Record: same ACCOUNT KV record shape as Register/Rotate, plus
    `source: 'register'|'import'`, `verified: boolean`, `verifiedAt?`;
    missing fields default: `clientId`/`token` null, `reserved` `[0,0,0]`,
    `registeredAt` = import time.
- **Soft verification**: when id+token exist, check against Cloudflare's
  API (same base URL/family as `registerClient` — e.g. `GET /reg/<id>` with
  `Authorization: Bearer <token>`, 10 s timeout, okhttp UA): 2xx →
  verified, else failed (record stores the verdict; the card shows it).
  Conf-only imports → unverified, no network call. Verification failure
  never blocks the store.
- **Route**: `POST /api/account/import` — session-gated like the account
  routes; body `{text}`; destructive-replace semantics: respond with a
  `replaces: true` shape only after parse success (the panel confirms
  before POSTing — two-step: parse endpoint? Simpler: the panel shows a
  confirm dialog before submitting; the server replaces on receipt, like
  Rotate. Document the choice). KV write strictly after parse (+ optional
  verify) succeeds — a failed import leaves the existing account untouched.
- **Panel**: import form in the account card (textarea + Import button +
  confirm-on-replace + verdict line after import; the Register error path
  already renders the server message — extend the 429 text server-side to
  point at Import). textContent-only, no innerHTML (established discipline).
- Also bump `worker/account.js`'s `extractAccountRecord` consumers: any
  new record fields must survive `publicAccount` (never expose key/token)
  and `isValidAccountRecord`.
- **Do not modify** `worker/auth.js`, `worker/settings.js`,
  `worker/sub.js`, `worker/panel.js` (except the account-card addition),
  `worker/api-handler.js`, or any non-worker dirs; `package.json` untouched.
- Tests: extend `node:test` — conf parse (v4-only, v4+v6, junk lines,
  missing key → readable error), JSON parse (full record, reserved
  fallback, foreign-shape → error), auto-detect both ways, record
  validation with new fields, verification mocked (stub `globalThis.fetch`
  per ticket 02's result pattern: 200 → verified, 403 → failed, network
  error → failed but stored).
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green, `node --check`, fetch-level
  smoke per the established pattern (import conf → card shows account
  source=import; import JSON → verified verdict; garbage → 400 readable;
  failed verify still stored; rate-limit Register error mentions Import).

## Deliver

Write `.scratch/router/results/10-import.md`: files, routes, parser field
maps, record shape changes, verify semantics, test output, smoke results,
surprises, deviations (with rationale). Reply with exactly DONE.