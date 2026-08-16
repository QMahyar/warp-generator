# Audit: multi-account + multi-subscription backend & UI

Audit of the current worker (worker/index.js, account.js, import.js, settings.js,
sub.js, generate.js, auth.js, panel.js), ADRs 0001–0007, spec, and
docs/research/multi-account-subs.md — against the target design: 2–10 WARP
accounts (per-account register/import/rotate/delete + editable label), multiple
subscriptions (per-sub unguessable token, editable name, pinned account,
re-pin anytime), generator account picker, single KV state snapshot
(accounts + subs + revision), tokens SHA-256-hashed at rest, SUB_PATH secret
retired (no migration), s-maxage 5 min. Read-only audit; no code changed.

## Summary (10 lines)

1. Every account/session surface funnels through five helpers in
   worker/account.js (readAccount 203, writeAccount 223, deleteAccount 228,
   assertAccountBinding 216, publicAccount 190) plus two KV-write call sites in
   index.js (171, 314 via import.js) — the whole change reduces to replacing
   these with one snapshot module; the pure parts (registerAccount, import
   parsers, all renderers) survive untouched.
2. The sub hot path is `handleSubFormat` (index.js:339-353): a parallel
   `readAccount + readEndpoints [+ readAwg]` KV read per request; the
   multi-account version reads the state snapshot instead of ACCOUNT and
   resolves the account by id — same shape, one extra KV read or fewer.
3. Token matching moves from a constant-time compare against the `SUB_PATH`
   env secret (index.js:309-313, six call sites 440/445/450/455/460/465) to
   SHA-256(submitted) → lookup in subs[].tokenHash — a ~microsecond hash and
   an O(≤10) scan; the 404-on-mismatch contract (ADR 0006) is unchanged.
4. Tokens hashed at rest make full sub URLs unrecoverable after creation —
   the panel can only show full links once (in the create response); stored
   rows get a hash-prefix preview. This is the single biggest UI contract
   change and forces a create-time "copy your links now" flow.
5. KV snapshot write is read-modify-write with no CAS (KV is last-writer-wins,
   1 write/sec/key); panel actions are already single-writer and disable
   buttons in flight (panel.js setBusy 622-628), so a serialized write path +
   advisory revision is sufficient — a Durable Object is not warranted.
6. Login has no rate limiting today (index.js:236-252); hashing sub tokens
   does not change the login brute-force posture, but the change is the right
   moment to add a cheap throttle/Turnstile if desired (spec listed rate
   limiting as out of scope — that stance can stay).
7. `publicAccount` (account.js:190-198) already strips keys/tokens; the
   multi-account public view must extend it with id + label only, never the
   clientId/token/privateKey fields.
8. The generator needs only a body-level `accountId` (default = first account)
   — renderGeneratedConfig (generate.js:439) is already pure and account-shaped.
9. Endpoints/AWG are genuinely global: every renderer consumes them beside the
   account (sub.js renderClash 276, renderWg 623, renderAwg 660) with no
   per-account field anywhere — they stay in their own KV bindings.
10. SUB_PATH retirement touches index.js (router + header comment),
    panel.js (subscriptionList 40-60 + shell 491), wrangler.jsonc (25-30),
    scripts/deploy-warp-panel.sh (stage 4, lines 259-298), README, and
    panel.test.js (49-52) — all replaceable by the snapshot-backed routes.

---

## Axis 1 — Backend seam audit

### Every touchpoint if accounts and subs become lists

**worker/account.js** — the account module:
- `ACCOUNT_KV_KEY = 'account'` (account.js:40) — becomes the snapshot key.
- `extractAccountRecord` (account.js:124-153) — pure; unchanged (called by
  registerAccount for one new account at a time).
- `isValidAccountRecord` (account.js:162-182) — becomes the per-entry
  validator inside the snapshot's accounts[].
- `publicAccount` (account.js:190-198) — must add `id` + `label`; must keep
  stripping clientId/token/privateKey.
- `readAccount` (account.js:203-213), `writeAccount` (account.js:223-226),
  `deleteAccount` (account.js:228-231), `assertAccountBinding`
  (account.js:216-220) — all four are replaced by the state.js snapshot
  helpers. `registerAccount` (account.js:250-255) stays pure (network only).

**worker/index.js** — the route layer:
- Imports (index.js:96-104): readAccount/writeAccount/assertAccountBinding
  leave; publicAccount stays (or moves to state.js); registerAccount stays.
- `handleGetAccount` (index.js:159-163) → `handleGetAccounts`: read snapshot,
  map publicAccount over accounts[].
- `handleAccountAction` (index.js:166-177): `assertAccountBinding` +
  `registerAccount` + `writeAccount` → snapshot append (new account) or
  in-place replace (rotate). Register/rotate are the only network-touching
  account routes and must stay "KV write strictly after Cloudflare calls".
- `handleImportAccount` (index.js:189-223): `importAccount(env.ACCOUNT, text)`
  (import.js:308-315) writes the whole record; in the new shape it must
  produce a record and let the caller splice it into accounts[targetId] —
  i.e. import.js's `importAccount` splits into parse+verify (pure-ish) and
  the snapshot write moves to the caller. "Replaces that account only" is a
  call-site change: `state.accounts[i] = record` instead of `put('account')`.
- `subPathMatches` (index.js:309-313) + the six gate sites (index.js:440,
  445, 450, 455, 460, 465) — replaced by snapshot token lookup.
- `SUB_CACHE_CONTROL` (index.js:315): `'public, max-age=21600, s-maxage=21600'`
  → 5 min per the design (`public, max-age=300, s-maxage=300`).
- `missingAccount` (index.js:324-329): the 503 body stays; the trigger changes
  from "no account record" to "sub exists but pinned accountId resolves to
  nothing".
- `handleSubFormat` (index.js:339-353): the parallel read becomes
  `readState(env.STATE) + readEndpoints(env.ENDPOINTS) [+ readAwg]`; the
  account comes from `state.accounts.find(a => a.id === sub.accountId)`.
  Hot path: same number of KV reads (3 → 3; 2 → 2 for sub/singbox/neko).
- `handleSub*` wrappers (index.js:363-417): unchanged — they only need the
  resolved account passed through.
- Router: sub regexes (index.js:438-467) unchanged in shape; the gate inside
  each match arm swaps `env.SUB_PATH` compare for `lookupSubByToken(state,
  match[1])`; `panelShell({ origin, subPath })` (index.js:491) drops subPath.
- Route-map header comment (index.js:1-93) rewritten.

**worker/generate.js**:
- `readAccount(env.ACCOUNT)` (generate.js:528) → snapshot read + accountId
  resolution; `renderGeneratedConfig(account, opts)` (generate.js:439-491) is
  untouched — account picker is purely a request-body field
  (`accountId`, default first account; 503 when none).

**worker/import.js**:
- `importAccount(binding, text)` (import.js:308-315) — its KV write
  (import.js:314, via writeAccount imported at import.js:33) must be
  extracted; parse/verify stay. The 503/400 contract and `replaces` semantics
  per-account move into index.js.

**Panel/UI touchpoints for SUB_PATH retirement** (details in Axis 3):
- panel.js:40-60 `subscriptionList(origin, subPath)` — the static 7-row list
  is replaced by per-sub rows from /api/subs.
- panel.js:491 `panelShell({ origin, subPath })` — no subPath param.
- panel.js:42 the "SUB_PATH secret is not set" explainer — dead.
- panel.test.js:49-52 — test updated accordingly.
- wrangler.jsonc:25-30 comment block; scripts/deploy-warp-panel.sh stage 4
  (259-298) + smoke checks (482, 521-544); README.md:52,61,68,92-97,116.

### Minimal-shape change

New `worker/state.js` (single new module; nothing else needs a shape change):

- `STATE_KV_KEY = 'state'`
- `readState(binding)` → `{ schema, revision, accounts[], subs[] } | null`
  (validated like readAccount today; legacy `account` key fallback optional —
  see open questions).
- `writeState(binding, state)` — assert binding, bump revision, `put` the
  snapshot JSON.
- `mutateState(binding, fn)` — read-modify-write wrapper that serializes
  panel mutations: read → `fn(state)` → bump revision → write. Callers stay
  pure (they build records and call fn).
- `hashToken(token)` — SHA-256 → base64url (Web Crypto, auth.js already uses
  crypto.subtle).
- `lookupSubByToken(state, submitted)` — hash + find on subs[].tokenHash,
  constant-time compare of the digests (reuse `timingSafeEqualBytes`).
- `accountById(state, id)`.
- `publicAccounts(state)` / `publicSubs(state)` — the card payloads.

account.js shrinks to the pure network/record parts; settings.js, sub.js,
zip.js, auth.js, generate.js (seam) are untouched.

### Risks

- **KV 1 write/sec per key** (docs/research/multi-account-subs.md Q3): a burst
  of panel actions (e.g. registering 5 accounts back-to-back) exceeds 1/sec
  on the single snapshot key. Mitigation: sequential writes with a short
  delay between register actions (the CF 429 reality already spaces
  registrations — multi-account-subs.md Q2: low-single-digit bursts), and
  per-action in-flight buttons (panel.js setBusy pattern). Worst realistic
  day is ~20 writes vs the 1k/day free budget.
- **Last-writer-wins / lost update**: KV has no CAS. Two concurrent panel
  mutations (double-click across two tabs) clobber one. The existing UI
  already serializes per button; add a per-isolate mutation queue in the
  worker and treat revision as an advisory conflict detector (return a
  conflict error and re-fetch), not a hard guard.
- **Eventual consistency (~60s)**: a sub request hitting a stale edge cache of
  the snapshot can 404 a just-created token or serve a stale pin. Bounded by
  KV propagation and smaller than the 5-min s-maxage envelope; the 404 is
  indistinguishable from a wrong token, which is the correct posture.
- **Hot-path hash cost**: one WebCrypto SHA-256 on ~43 bytes per sub request —
  microseconds, irrelevant against the KV round-trip. O(n) scan over ≤10
  subs is nothing.
- **No migration**: with the `account` key abandoned, an existing deploy's
  account vanishes after upgrade (subs 503 until re-registered). The design
  accepts this ("no migration"); a one-time fallback (read legacy `account`
  key into accounts[0]) is cheap insurance — open question.

---

## Axis 2 — Security

- **Auth/session (worker/auth.js)**: `timingSafeEqualBytes` (auth.js:52-57),
  double-HMAC password verify (auth.js:73-78), HMAC-signed cookie with expiry
  (auth.js:87-120), HttpOnly/SameSite=Lax/Secure-over-https
  (auth.js:140-150). Solid, unchanged by this work.
- **Login brute force**: none today — `handleLogin` (index.js:236-252) has no
  rate limit or backoff; PASSWORD is the only gate. The multi-account change
  neither worsens nor fixes this. Recommend (optional): a KV-backed or
  in-memory failed-attempt throttle, or Cloudflare Turnstile on the login
  page; note spec.md:116 explicitly listed "rate limiting/abuse controls" as
  out of scope — the audit does not require reopening it.
- **Hashing tokens at rest — hot path impact**: none that matters. The
  submitted token is hashed per request (one SHA-256) and the 32-byte digests
  compared constant-time — the same timing discipline as today's
  `subPathMatches` (index.js:309-313). Hash-at-rest strictly improves
  KV-compromise posture (SubPanel precedent, multi-account-subs.md Q5) and
  rainbow tables are irrelevant for 256-bit random tokens.
- **Error-message leakage**: `publicAccount` (account.js:190-198) exposes
  registeredAt/v4/source/verified/verifiedAt only — no privateKey, clientId,
  or token. The multi-account `publicAccounts` must keep that promise and add
  only id/label. v4 (the account's WARP address) is already shown in the card;
  it stays, per-account.
- **Token in panel HTML**: tokens appear in the panel (operator-only,
  password-gated) exactly as SUB_PATH does today — no threat-model change.
  Keep /api/accounts and /api/subs **behind the auth gate**; only the six
  `/api/<token>/sub/*` routes stay pre-gate (index.js:433-467 pattern).
- **Deletion hazard (new)**: deleting a pinned account must keep the sub
  route's 503 contract (sub.js renderers throw SubscriptionError on a missing
  account — sub.js:277-279, 422-424, 522-524, 624-626, 661-663; index.js
  returns 503). The dangling `accountId` must resolve to a 503, never a 500
  or a leaked 404-differentiator. Import replacing "that account only" has
  the same guard.
- **Unchanged/weakened surfaces to double-check in review**: cookie
  verification cost per request (fine), the 404-vs-401 posture for near-miss
  sub paths (index.js router comment 433-437 — preserved by keeping the
  regexes identical), and not logging token values anywhere in the new
  routes.

---

## Axis 3 — Panel UI structure (worker/panel.js)

### Current structure

- `page()` shell (panel.js:62-366): one inline `<style>` block, no framework.
- `loginPage` (panel.js:369-386).
- `panelShell` (panel.js:395-1148): `String.raw` template (comment at
  396-398: regex/string escapes must survive byte-exact), dynamic values via
  textContent / input.value only — never innerHTML (header comment 18-19,
  scripts at 600-618, 850-857, 984-1003). Cards: account (413-429),
  endpoints (430-442), awg (443-502), subscriptions (503-512), generator
  (513-575). Four inline IIFE scripts: account card (578-683, incl. the
  confirm-on-replace at 663-668), settings (685-929), generator (931-1126,
  loads /api/settings + /api/account at 1109-1124), sub-copy buttons
  (1127-1146, `data-copy` + clipboard fallback).
- `subscriptionList(origin, subPath)` (panel.js:40-60): static 7-row list,
  `esc()` escaping (30-32), rows carry `data-copy` URLs.

### Recommended new UI

**Accounts card** (replaces 413-429) — one header + a rows list:
- Head: `WARP accounts` + count badge (`2 accounts` / `No accounts`).
- Top action row: `Add account` (register → POST /api/accounts/register) —
  the old Register becomes an append, not a replace.
- Per-account row (built with createElement + textContent, mirroring the
  settings script's flags pattern panel.js:752-766):
  - label: inline `<input>` (editable; commit on change → POST
    /api/accounts/:id/rename, revert on blur-error) or a small ✎ + prompt;
    recommend inline input with a save-on-Enter/change.
  - `v4`, `registeredAt` (fmt() at 595-598), source badge (`Registered` /
    `Imported`), verified line for imports (611-617 logic per-row).
  - actions: `Rotate`, `Import`, `Delete`.
  - Import: per-row collapsible `<textarea>` (reuse the awg/endpoints input
    styling) with a `Replace` button; confirm replaces that account only.
  - Delete confirm: `window.confirm('Delete this account? Any subscription
    pinned to it will return 503 until re-pinned.')` — the existing
    window.confirm pattern (663-668). Mark pinned subs count in the confirm
    text when > 0.
- Empty state: `No WARP accounts yet — add one (register or import).`
- Failure state keeps the `.error` box + `setBusy` disabling (622-628),
  extended to per-row buttons.

**Subscriptions card** (replaces 503-512 + subscriptionList 40-60):
- Head: `Subscriptions` + count badge.
- Create-sub form: name `<input>` + `Create subscription` → POST /api/subs;
  response carries `{ id, name, token, links }` — render the FULL 6-link list
  immediately (reuse the current `.sub-list` row markup + `data-copy`
  buttons, 54-59 / 1127-1146) with a one-time warning: "Copy these links now
  — the token is shown only once; afterwards only its fingerprint is shown."
- Per-sub row (persisted): name (editable like labels), account `<select>`
  (re-pin → POST /api/subs/:id/pin), token fingerprint (`<code>abc12345…</code>`
  — first 8 chars of the tokenHash, or a short id), `Delete` (confirm).
  Account select options come from /api/accounts (label + v4).
- Empty state: `No subscriptions yet — create one to get shareable URLs.`
- Keep the credential warning copy (508) per-row.

**Generator card** (513-575): add an account `<select>` above the format
grid (options from /api/accounts; value = accountId; label = `label (v4)`);
send `accountId` in the POST body (script at 1053-1067). Empty-accounts
state: existing badge logic (1118-1123) generalizes to "No accounts" +
disabled Generate.

**Structure rules that must hold** (all already true today):
- String.raw template; esc() only for static/operator content, textContent
  for everything fetched; no innerHTML.
- Static lists (FORMATS/DNS/SERVICES) stay embedded (panel.js:26-27, 690,
  938-940); accounts/subs are fetched at load (two fetches: /api/accounts,
  /api/subs — mirror the Promise.all at 1109-1124).
- All dynamic rows built with createElement/textContent like the settings
  flags and generator chips (752-766, 989-1003).

---

## Axis 4 — Data model

Single KV snapshot — one binding (recommend renaming the ACCOUNT binding to
`STATE` in wrangler.jsonc:35; no migration needed per design), key `state`:

```json
{
  "schema": 1,
  "revision": 42,
  "accounts": [
    {
      "id": "a1",                       // short opaque id (4–6 random bytes base64url)
      "label": "Home",                  // operator-editable
      "privateKey": "…", "peerPublicKey": "…",
      "clientId": null, "token": null,  // nullable — conf imports carry none
      "v4": "172.16.0.2", "v6": "…", "reserved": "…",
      "source": "register" | "import",
      "verified": false, "verifiedAt": null,
      "registeredAt": "2026-08-15T…"
    }
  ],
  "subs": [
    {
      "id": "s1",
      "name": "Family",
      "tokenHash": "<sha256 base64url of the 43-char token>",
      "accountId": "a1",                // pinned account; dangling ⇒ 503
      "createdAt": "2026-08-15T…"
    }
  ]
}
```

- Account entries reuse the existing record fields verbatim so
  `isValidAccountRecord` (account.js:162-182) stays the per-entry validator;
  add `id` + `label` (label: string, trimmed, ≤ 60 chars, default from
  registeredAt).
- `revision`: monotonically incremented by `writeState`; used for conflict
  detection and (later) ETag/304 (multi-account-subs.md Q4). No CAS in KV —
  advisory only.
- Rotation **keeps** `id` + `label` and replaces the record body — preserves
  the current "links stay stable across account rotations" contract
  (panel.js:508, spec story 17).
- Delete removes the account entry and **leaves** subs' `accountId` dangling
  (sub route → 503 with the existing readable message, index.js:324-329);
  the panel shows "account deleted — re-pin" on those sub rows.
- Token: 32 random bytes → 43-char base64url (SubPanel precedent,
  multi-account-subs.md Q5); stored only as SHA-256 → base64url. The raw
  token exists in exactly two places: the create response and the
  operator's clipboard.
- Endpoints/AWG stay global — verified: all renderers consume
  `{ account, endpoints, awg }` (sub.js:276, 421, 521, 623, 660, 678) and no
  renderer or generator path references a per-account endpoint/AWG value.
  The generator's endpoint override is per-request (generate.js:444-446).
- Migration story: none — new snapshot key; the legacy `account` key is
  simply never read (optional fallback, see open questions).

---

## Axis 5 — Route/API surface

Proposed REST surface (all accounts/subs routes **behind the auth gate** —
router position at index.js:479-488 becomes the model):

- `GET /api/accounts` → `{ success, accounts: [{ id, label, registeredAt, v4,
  source, verified, verifiedAt }] }`
- `POST /api/accounts/register` (body `{ label? }`) → appends; `{ success,
  account }`
- `POST /api/accounts/:id/rotate` → fresh registration replacing that record,
  keeps id/label; `{ success, account }`
- `POST /api/accounts/:id/import` (body `{ text }`) → replaces that account
  only; `{ success, account, verdict }` (400/parse errors unchanged)
- `POST /api/accounts/:id/rename` (body `{ label }`) → `{ success, account }`
- `POST /api/accounts/:id/delete` → removes; 409 (or `{ success:false }`)
  when it is the last account? — recommend allowing it; subs 503.
- `GET /api/subs` → `{ success, subs: [{ id, name, tokenHashPrefix,
  accountId, createdAt, pinnedLabel? }] }` — never the token.
- `POST /api/subs` (body `{ name }`) → `{ success, sub: { id, name, token,
  accountId: null, links: { sub, clash, singbox, neko, wg, awg } } }` —
  token + links returned once.
- `POST /api/subs/:id/rename` (body `{ name }`)
- `POST /api/subs/:id/pin` (body `{ accountId }`) — re-pin anytime; null
  unpins (sub → 503).
- `POST /api/subs/:id/delete`
- (open) `POST /api/subs/:id/reset-token` — natural addition since links are
  unrecoverable after creation; cheap with the snapshot model.

The six sub routes keep their contracts exactly:
- Paths: `/api/<token>/sub[/clash|singbox|neko|wg|awg]` with the existing
  regexes (index.js:438-467), still matched **before** the auth gate.
- Matching: `sha256(token)` → `subs[].tokenHash`; no match → 404 (never
  401 — ADR 0006 posture preserved, index.js comment 433-437).
- Sub found, pinned account missing/dangling → 503 `missingAccount()`
  (index.js:324-329).
- Cache: `public, max-age=300, s-maxage=300` (was 21600, index.js:315).
- Handlers keep the parallel-read shape (index.js:341-345): state snapshot +
  endpoints [+ awg].

Generator: `POST /api/generator` body gains optional `accountId`
(default: first account; no accounts → existing 503 message).

---

## Design decisions the audit recommends

1. New `worker/state.js` module (readState/writeState/mutateState/hashToken/
   lookupSubByToken/accountById/publicAccounts/publicSubs) as the single
   seam; account.js keeps only the pure network + record parts.
2. One snapshot KV key `state` in a renamed `STATE` binding; accounts[] and
   subs[] with `schema` + `revision`; no migration (optional legacy-key
   fallback).
3. Rotation preserves account id/label; delete leaves sub pins dangling and
   the sub routes 503; import replaces that account only.
4. Tokens: 43-char base64url, SHA-256 at rest, returned exactly once in the
   create response; panel rows show a hash-prefix fingerprint; create-time
   link list with copy buttons + "copy now" warning.
5. Sub token matching = hash-then-constant-time-compare of digests, 404 on
   mismatch — hot-path cost negligible.
6. s-maxage 6 h → 5 min on all six sub routes; no purge/ETag machinery.
7. Accounts/subs API behind the auth gate; sub routes stay pre-gate.
8. Serialized panel mutations (in-flight disable + per-isolate queue),
   revision as advisory conflict detector; no Durable Object.
9. Generator: `accountId` request field, default first account; picker in
   the generator card fed by /api/accounts.
10. Endpoints/AWG stay in their own bindings (verified global).
11. Panel: per-account rows with inline label editing, per-row
    rotate/import/delete + confirm ("pinned subs will 503"), create-sub form
    with one-time links, account select per sub row; String.raw +
    textContent-only discipline preserved.
12. (Optional) login rate limiting or Turnstile — pre-existing gap, unchanged
    by this work.

## Open questions

1. Legacy-`account`-key fallback on first read of the new snapshot — do it
   (one-time import into accounts[0]) or accept re-registration?
2. Full sub links are unrecoverable after creation (hash at rest) — is that
   acceptable, or add `reset-token` (recommended)?
3. Delete the last account — allowed (all subs 503) or blocked with 409?
4. Register concurrency: enforce a worker-side min interval between
   registrations (CF 429 risk, multi-account-subs.md Q2)?
5. `revision` surfaced in the panel (debug) and/or used for ETag/304 later?
6. Per-account label default and max length; dedupe policy on labels?