# 04 — Generator account picker

**What to build:** The generator page gains an account picker (fed by
`/api/accounts`), and `/api/generator` accepts an `accountId` body field
(default: first account; no accounts → the existing 503 message).

**Blocked by:** 01 — State snapshot + accounts API + accounts card

**Status:** done

- [x] Operator picks any stored account and generates its single config
- [x] Defaults to the first account when no accountId is sent
- [x] Empty-accounts state disables Generate with a readable message

**Implemented:** `worker/panel.js` — the generator card gains a labeled
`<select id="gen-account">` (empty "First account (default)" option + one
option per stored account, fed by the existing `/api/accounts` fetch, built
with createElement/textContent). The POST /api/generator body includes
`accountId` only when a specific account is chosen (the default option omits
it, exercising the first-account default). No accounts → Generate + the
picker are disabled and the badge shows "No account". Card meta wording now
says "the account you pick". `worker/panel.test.js` adds a structural
assertion for `id="gen-account"` + the default option label.