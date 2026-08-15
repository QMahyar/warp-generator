# Result — ticket 10: Import an existing WARP account

**Date:** 2026-08-15 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files

| File | Change |
|---|---|
| `worker/import.js` | **new** — the import module: pure conf parser (`parseWgConf`), pure registration-JSON parser (`parseRegistrationJson`), auto-detection (`parseImportText` — JSON first, then conf, neither → readable error listing both), soft verification (`verifyAccountCredentials`), record builder (`buildImportRecord`) and the full flow (`importAccount`: parse → record → verify → KV write). Uses `AccountError` / `writeAccount` from account.js (no circularity). |
| `worker/account.js` | record shape extended: `source: 'register'\|'import'`, `verified: boolean`, `verifiedAt: ISO\|null` on every record (`extractAccountRecord` now emits `source:'register', verified:false, verifiedAt:null`); `clientId`/`token` nullable (null for conf imports); `isValidAccountRecord` updated (nullable creds, source/verified/verifiedAt type rules, legacy pre-import records still valid); `publicAccount` now exposes source/verified/verifiedAt (never keys); the 429 rate-limit message now points at Import. |
| `worker/index.js` | `POST /api/account/import` route (session-gated like the account routes), `importAccount` wiring, route-map header updated ("Register, Rotate and Import are the ONLY writers of the ACCOUNT binding"). |
| `worker/panel.js` | account-card addition only: import textarea + Import button + verdict line; confirm-on-replace dialog; card renders source (Imported/Registered) + verdict ("Verified with Cloudflare" / "Verification failed — stored anyway" / "Unverified"); shared busy state across Register/Rotate/Import; textContent-only. |
| `worker/import.test.js` | **new** — 37 `node:test` cases (parsers, auto-detect, record rules, verified-flow with stubbed `globalThis.fetch` per ticket 02's pattern). |
| `worker/account.test.js` | updated the two deepEqual assertions for the new record fields (snapshot + publicAccount). |
| `wrangler.jsonc` | untouched (the import route needs no new bindings — reuses `ACCOUNT`). |

Forbidden files untouched: `worker/auth.js`, `worker/settings.js`, `worker/sub.js`, `worker/api-handler.js`, `package.json`, all non-worker dirs — confirmed via `git status` (only the 4 modified files above + 2 new worker files).

### Route

| Route | Behaviour |
|---|---|
| `POST /api/account/import` | session-gated (anon → 401). Body `{text}`; `text` must be a non-empty string ≤ 64 KiB (else 400). `assertAccountBinding` fail-fast → `importAccount` (parse → optional soft verify → KV write) → `{"success":true,"action":"import","replaces":true,"account":{registeredAt,v4,source,verified,verifiedAt},"verdict":{verified,verifiedAt}}`. Parse errors → 400 with the parser's readable message; KV untouched. Verify failures never 4xx — the import still succeeds with a failed verdict. |
| `GET /api/account` | response now carries `source`/`verified`/`verifiedAt` (the card's verdict); still never keys/token/clientId. |

**Destructive-replace choice (documented):** single-step server semantics, like Rotate — the server replaces the stored account on receipt; there is no separate parse endpoint. The panel performs the two-step: it holds the current account state from `GET /api/account` and shows `confirm('Import replaces the stored account. Continue?')` before POSTing (confirm only when an account exists). The response's `replaces: true` is informational — reachable only after parse success (a parse failure returns 400 without touching KV), which is exactly the "replaces only after parse success" contract. Rationale: a parse endpoint would round-trip the pasted secret twice through the panel for no gain; the server already returns the parser's error messages, and the confirm dialog covers the destructive case client-side.

### Parser field maps

**conf** (`parseWgConf`) — `[Interface]`/`[Peer]` sections, `Key = Value` lines (keys case-insensitive; comments `#`/`;` and non-`=` junk lines ignored; extra peers ignored):

| conf key | → material | notes |
|---|---|---|
| `[Interface] PrivateKey` | `privateKey` | required; base64 (base64url normalized), must decode to 32 bytes |
| `[Interface] Address` | `v4`, `v6` | one or two comma/space-separated CIDRs, family detected by `:`; mask stripped; v4 required (readable error otherwise), v6 optional |
| `[Interface] DNS` | `dns` | parsed, carried in material, dropped from the record (spec: subscriptions use 1.1.1.1) |
| `[Peer] PublicKey` | `peerPublicKey` | required; same 32-byte base64 check; first peer wins (mirrors `extractAccountRecord`) |
| `[Peer] AllowedIPs` | `allowedIPs` | parsed, carried, dropped from the record |
| everything else (`Endpoint`, `MTU`, `PersistentKeepalive`, …) | — | **ignored deliberately** — Endpoint especially: the panel's endpoint list rules which servers configs use |

**registration JSON** (`parseRegistrationJson`) — warp-reg-style document, `{result:{id,token,config}}` or unwrapped `{id,token,config}`:

| JSON field | → material | notes |
|---|---|---|
| `id` / `token` | `clientId` / `token` | optional; missing → null → unverified (conf-like) |
| `config.interface.addresses.v4` / `.v6` | `v4` / `v6` | v4 required, v6 optional |
| `config.interface.private_key` | `privateKey` | **required** — the client's own key lives with the operator (the real enableWarp response never carries it); readable error explains this |
| `config.peers[].public_key` | `peerPublicKey` | required; first peer wins |
| `config.client_id` | `reserved` | base64 string passthrough (mirrors `extractAccountRecord`'s field choice) |
| `config.reserved` | `reserved` | fallback: bytes array `[a,b,c]` → base64 (validated 0–255), or base64 string; missing → `''` |

**auto-detect** (`parseImportText`): first non-space char `{` → JSON parser; otherwise conf parser. A body with neither JSON shape nor any `[section]` line → one readable error listing both formats; malformed JSON starting with `{` → "Not valid JSON — expected the registration JSON from warp-reg…".

### Record shape changes (ACCOUNT KV value)

```
{ privateKey, clientId|null, token|null, peerPublicKey, v4, v6, reserved,
  source: 'register'|'import', verified: boolean, verifiedAt: ISO|null,
  registeredAt }
```

- `clientId`/`token` — nullable; conf imports store `null` (no credentials).
- `reserved` — still the base64 string the renderers consume via `reservedToBytes`/`reservedToDashed` (sub.js/ api-handler.js unchanged); missing → `''` which renders as `[0,0,0]` / `0-0-0` — the ticket's "default [0,0,0]" is honored at the byte level through the existing renderer code path (see deviations).
- `source` — `'import'` for imports, `'register'` for Register/Rotate.
- `verified`/`verifiedAt` — the soft-check verdict; `verifiedAt` = check time when a check ran (2xx or not), `null` for conf imports (no network).
- `registeredAt` — import time for imports.
- `isValidAccountRecord`: `clientId`/`token` accept null or non-empty string; `source` ∈ {register, import}; `verified` boolean; `verifiedAt` null or an ISO date; **legacy records without the ticket-10 fields still validate** (an account stored by an earlier deploy survives the upgrade). `publicAccount` never exposes `privateKey`/`clientId`/`token` (leak-checked in tests + smoke).

### Verification semantics

- Credentials (BOTH id and token) present → `GET <CF_BASE>/reg/<id>` with `Authorization: Bearer <token>`, okhttp UA, `AbortSignal.timeout(10 s)` — same base URL family and timeouts as `registerClient`.
- 2xx → `{verified:true, verifiedAt}`; HTTP rejection (403 etc.), network error, or timeout → `{verified:false, verifiedAt}`. **Never throws; the record is stored either way** and the card shows the verdict.
- Conf-only imports (and JSON without id/token) → `{verified:false, verifiedAt:null}`, no network call (asserted: zero CF calls).

## Test output

`node --test` (repo root): **183 tests, 183 pass, 0 fail** (~5 s). 37 new import tests + 2 updated account tests; all prior suites (auth 14, account 20, settings, sub, clash, singbox, neko, wg) still green. Covered: conf parse (v4-only, v4+v6, space-separated lists, junk/comment lines, missing key/address/peer → readable errors, v6-only rejected, bad base64 + wrong length), JSON parse (full record, unwrapped result, reserved via client_id / bytes array / base64 / absent, out-of-range bytes, missing private_key/v4/peer, id/token absent → null, foreign shape, invalid JSON), auto-detect both ways + neither, record building + ticket-10 validation rules (nullable creds, source/verified/verifiedAt, legacy records), publicAccount leak check, verification stub (200 → verified + request shape (URL, Bearer, UA, AbortSignal), 403 → failed, network error → failed, no creds → no network), importAccount flow (conf stores unverified with zero CF calls, json verified → stored with creds+reserved, 403/network → **still stored** with failed verdict, parse failure leaves KV byte-identical, second import replaces, missing binding → readable error).

`node --check` green on all changed files.

## Smoke results (fetch-level, real handler)

Per ticket 02's pattern: real `worker/index.js` under a `registerHooks` loader substituting `./api-handler.js` and `tweetnacl` (throwaway stubs), stubbed `globalThis.fetch` for `api.cloudflareclient.com` (call log; 200/403/network/ratelimit modes), fake ACCOUNT + ENDPOINTS KV bindings, fake ASSETS, real login/session. Harness at `$HOME/smoke-10/` (throwaway, outside the repo). **47/47 checks, exit 0:**

- anon import → 401; login → cookie; fresh account → null
- conf import → 200 `{success, action:'import', replaces:true}`, card `source=import, verified=false, verifiedAt=null`; KV record: `clientId/token null, reserved ''`, ISO `registeredAt`; **zero Cloudflare calls**; response never leaks key/token/clientId; `GET /api/account` reflects it
- every subscription format renders the imported account spot-checked: `/sub` (wireguard:// links + v4), `?scheme=wg` (Throne link with `reserved=0-0-0`), `/sub/clash` (wireguard proxy + `reserved: [0,0,0]`), `/sub/wg` (zip PK magic), `/sub/singbox`, `/sub/neko`, `/sub/awg` (outer base64 + inner base64url decoded for v4)
- panel endpoints rule: `/sub` uses the stored endpoint `my.endpoint.example:2408`, never the conf's `Endpoint = engage.cloudflareclient.com:2408` (deliberately ignored)
- JSON import (id+token+reserved) with 200 → verdict `{verified:true, verifiedAt}`; verification call shape asserted (`GET /reg/import-client`, `Authorization: Bearer import-token`, okhttp UA); KV has creds + reserved + verdict
- 403 → import still 200, verdict failed, **record stored**; network error → same
- garbage / empty / malformed-JSON / missing-text → 400 with readable messages; failed imports leave KV byte-identical
- conf re-import replaces the account (creds null again), no verification call
- Register with 429 → 429 message "…try again — or import an existing account from the account card instead."; KV untouched (import mentioned)
- missing ACCOUNT binding → readable 400, zero Cloudflare calls
- GET on import route → 405; panel shell contains import textarea/button/verdict line and the client-side confirm (two-step replace markup)
- The `AccountError` circularity smell surfaced here: the first smoke run crashed with `ReferenceError: AccountError is not defined` in `worker/index.js` — fixed by importing `AccountError` from account.js. (Unit tests couldn't see it: they exercise import.js directly, and the route handler only touches `AccountError` on the error path.)

## Surprises

1. **Smoke bugs outnumber product bugs** — this ticket's harness tripped on itself three times before settling: (a) I never assigned `globalThis.fetch = cfStub` in the first draft of main.mjs (the "verification didn't fire" mystery was the worker calling the *real* undici fetch — no network happened only because the base URL was unreachable and the catch swallowed it); (b) the fresh-account GET was missing the session cookie; (c) my `/sub` assertions assumed plaintext where the payload is base64-wrapped (`/sub`, `/sub/neko`, `/sub/awg`), and `reserved=` only exists in the Throne (`?scheme=wg`) link, not the v2rayn wireguard:// link. All three were expectation bugs, not worker bugs.
2. **Node 26 `registerHooks`** — the ticket-02 harness used `module.register()` (deprecation warning); Node 26.4 has `registerHooks()` which is clean and does the same job for a one-shot worker harness.
3. **`AllowedIPs` parse-order trap** — my first conf parser gated the whole `[Peer]` branch on `!peer`, so `AllowedIPs` (which comes *after* `PublicKey` in real confs) was silently dropped. Fixed by skipping whole *extra* peer sections at the `[header]` line instead. The unit test caught it (null vs expected), not the smoke (which only checks the record fields).
4. **reserved's `[0,0,0]` default is a renderer concern** — the record keeps the base64-string field (`''` when absent) that `extractAccountRecord` already chose; the renderers' `reservedToBytes('')`/`reservedToDashed('')` yield `[0,0,0]`/`0-0-0`. Storing `[0,0,0]` as an array would have mixed types with `config.client_id` passthrough and forced `isValidAccountRecord`/renderer churn for zero behavioural gain (verified in clash output + the wg:// link).

## Deviations (with rationale)

- **`reserved` stored as `''`, not `[0,0,0]`** — see surprise 4. The observable contract ("missing reserved bytes default to `[0,0,0]`") holds in every renderer (smoke check 16/18); the record stays type-consistent with Register/Rotate records and `extractAccountRecord`'s field choices, which the ticket itself says to mirror.
- **v6-only conf Address rejected** — the parser requires an IPv4 address with a readable message. `extractAccountRecord` also requires v4, and the record's `v4` is a required non-empty field that every renderer embeds; storing a v6-only account would silently read back as `null` from KV (validation) and produce broken configs. WARP confs in the wild always carry the `172.16.0.2/32`-style v4 address.
- **conf `DNS`/`AllowedIPs` parsed but not stored** — the record/renderers carry no DNS/allowed-IP fields (spec fixes DNS 1.1.1.1 and full tunnel); they're validated by tolerance and ignored beyond the parse, so a conf that would render differently under its own DNS doesn't silently change behaviour.
- **AccountError → 400 for missing-binding too** — `assertAccountBinding` throws `AccountError`, which the import handler maps to 400 (same bucket as parse errors). The message ("ACCOUNT KV binding is missing — add a kv_namespaces entry…") is readable either way; the register path keeps its 500.
- **Legacy records without source/verified still validate** — a pre-import deploy's stored account must survive the upgrade, not read as corrupt; `publicAccount` defaults them to `register`/unverified.
- **No dedicated parse endpoint** — see the route section; the confirm-dialog + `replaces:true` shape covers the ticket's "two-step" intent without double-round-tripping the pasted secret.

## Handoff checklist (ticket manifest)

- [x] Conf import → account stored; submerged fields sane (reserved `[0,0,0]` in clash / `0-0-0` in wg:// links, no token, unverified)
- [x] JSON import → full record incl. id/token/reserved; verified verdict on 200, failed/unverified stored when the check fails or creds are absent
- [x] Replace flow confirms before overwriting (client `confirm`); failed import leaves the existing account untouched (KV byte-identical on all 400 paths)
- [x] Imported accounts render every subscription format the same as registered ones (smoke: /sub, /sub?scheme=wg, /sub/clash, /sub/wg, /sub/singbox, /sub/neko, /sub/awg)
- [x] Rate-limit error on Register mentions Import
- [x] Unit tests for both parsers + extraction (`node:test` 183/183); fetch-level smoke 47/47