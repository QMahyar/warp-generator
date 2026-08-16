# 01 — State snapshot + accounts API + accounts card

**What to build:** The panel stores multiple WARP accounts. A new state module
owns a single KV snapshot (schema, revision, accounts[], subs[]). The panel's
account card becomes an accounts list: per-account rows with an editable
label, per-row Register/Rotate/Import/Delete actions, empty and failure
states, and confirm dialogs (delete warns that pinned subscriptions will 503).
The API exposes list/register/rotate/import/rename/delete, all behind the
auth gate; register/rotate keep the "KV write strictly after Cloudflare
calls" contract.

**Blocked by:** None — can start immediately

**Status:** done (2026-08-16)

- [x] Operator registers a second account; both appear as labeled rows that survive reload
- [x] Rotate replaces only that account's record, keeping its id and label
- [x] Import targets one account slot; parse errors leave that slot untouched
- [x] Rename commits on edit; label validation enforced
- [x] Delete removes the account (with confirm); subs pinned to it resolve to 503 later
- [x] Public API never exposes privateKey/clientId/token
- [x] No registration happens outside Register/Rotate actions; registration spacing guard in place

**Implemented:**
- `worker/state.js` + `worker/state.test.js` (18 tests): STATE_KV_KEY 'state',
  schema-1 snapshot, read/write/mutate with revision bumps, append/replace/
  rename/remove account, sub-by-id/lookup-by-token (hash), validateLabel,
  publicAccounts/publicSubs.
- `worker/account.js`: trimmed to register/rotate/extract/public/isValid +
  legacy `readAccount` (kept for the sub routes until ticket 03) +
  `registrationWaitMs` (~8 s spacing guard).
- `worker/import.js`: `importAccount(binding, text)` → `importAccountRecord(text)`
  (no KV write; caller splices into the snapshot).
- `worker/index.js`: `/api/accounts`, `/api/accounts/register` (throttled 429),
  `/api/accounts/import` (append), `/api/accounts/:id/{rotate|import|rename|delete}`
  (404 on unknown id, 400 on blank label); `__resetRegistrationThrottle` test hook.
- `worker/panel.js`: accounts card with per-row actions (rotate/import/delete
  with confirm), inline label editing, add-account register/import, generator
  hint + `/api/accounts` fetch.
- `worker/accounts.test.js` (9 router-level smoke tests, tweetnacl stubbed via
  `worker/test-support/` loader).
- Full suite: 250 tests pass; lint clean.