# Result — ticket 02: WARP account Register/Rotate (KV)

**Date:** 2026-08-17 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files (all new/changed code in `worker/` + one config comment)

| File | Change |
|---|---|
| `worker/account.js` | **new** — the account module: `registerAccount()` (keypair → `/reg` → enable WARP, same two CF calls as the legacy handler, 10 s timeout + okhttp UA preserved), pure `extractAccountRecord()`, `readAccount`/`writeAccount`/`deleteAccount` KV helpers over the `ACCOUNT` binding, `isValidAccountRecord`/`publicAccount`, `describeAccountError()` mapping, `AccountError` type, `assertAccountBinding()`. |
| `worker/index.js` | routes `GET /api/account`, `POST /api/account/register`, `POST /api/account/rotate` (all session-gated); `json()` helper; route-map header updated. Register/Rotate are the **only** writers of the ACCOUNT binding. |
| `worker/panel.js` | account card in the shell (ticket 01's placeholder replaced): status badge (No account / Registered since), Register + Rotate buttons with in-flight state (disabled + "Registering…/Rotating…", meta line "Contacting Cloudflare — this takes a couple of seconds…"), error box, load-time fetch of `/api/account`. Vanilla inline script, values set via `textContent` (never innerHTML). |
| `wrangler.jsonc` | commented `kv_namespaces` placeholder for the `ACCOUNT` binding (local dev + `wrangler kv namespace create ACCOUNT` note). No real secrets. |
| `worker/account.test.js` | **new** — 20 `node:test` cases (pure parts + network call shapes via stubbed `globalThis.fetch`). Zero npm dependencies. |

Forbidden dirs (`lib/`, `app/`, `components/`, `functions/`, `config/`, `public/`, `scripts/`, docs, `package.json`) and `worker/auth.js` untouched — confirmed by `git status` (only the four files above; the `.scratch/router/tasks/…`, `docs/plans/`, `docs/research/sub-formats.md` untracked entries are router-owned artifacts from the design phase).

### Routes (all require a valid session; unauth → 401 JSON like other `/api/*`)

| Route | Behaviour |
|---|---|
| `GET /api/account` | → `{"success":true,"account":{registeredAt,v4}\|null}` — the card's state feed; never contains keys/token (`publicAccount`). Corrupt KV JSON → `account:null` (never crashes). |
| `POST /api/account/register` | `assertAccountBinding` (fail fast) → `registerAccount()` → `writeAccount()` → `{"success":true,"action":"register","account":{registeredAt,v4}}`. |
| `POST /api/account/rotate` | identical flow, `action:"rotate"`; overwrites the stored record (Rotate replaces). |
| failure | `{"success":false,"message":<readable>}`; HTTP status = upstream status when present (429 for rate-limit), else 500. **KV write happens strictly after the CF calls succeed — a failed action leaves KV byte-identical.** |

### Account record shape (the `ACCOUNT` KV value, JSON under key `"account"`)

```
{ privateKey, clientId, token, peerPublicKey, v4, v6, reserved, registeredAt }
```

- `privateKey` — our generated X25519 secret (base64, 32 raw bytes)
- `clientId`, `token` — `/reg` response (`result.id` / `result.token`)
- `peerPublicKey` — `warp.result.config.peers[0].public_key`
- `v4`, `v6` — `warp.result.config.interface.addresses.*` (v6 tolerated as `''`)
- `reserved` — `warp.result.config.client_id` (tolerated as `''`)
- `registeredAt` — ISO-8601 UTC, injectable `now` for tests

Exactly the "account material snapshot" from `docs/plans/pivot-inventory.md`; later subscription/generator tickets consume this record as-is.

## Test output

`node --test` (repo root; discovers `worker/auth.test.js` + `worker/account.test.js`):

```
ℹ tests 34   ℹ pass 34   ℹ fail 0   (duration ~1.7s)
```

14 auth (unchanged, still green) + 20 new account tests: happy-path extraction (all 8 fields, injected `now`), first-peer-only, missing v6/reserved tolerated, rejection of missing peer/addresses/client-id/token, `registerClient` (URL, POST body incl. `type:'ios'`/key, okhttp UA, `AbortSignal` present), 429 mapping with `status`, TypeError wrapping with `cause`, PATCH enableWarp with `Authorization: Bearer`, `describeAccountError` full mapping table, `isValidAccountRecord` (required vs optional fields, bad date), `publicAccount` leak check (no privateKey/token/clientId in output), KV roundtrip under key `account`, empty/corrupt/malformed → null, missing-binding error, delete.

## Smoke results (fetch-level, real handler)

Per ticket 01's pattern (no wrangler/node_modules/`./out` in this repo): drove the **real** `worker/index.js` `fetch` from Node with a loader hook substituting `./api-handler.js` and `tweetnacl` (throwaway stubs — `buffer` resolves to the Node builtin), a **stubbed `globalThis.fetch`** for `api.cloudflareclient.com` (ok/network-error/rate-limit modes, call log), a **fake ACCOUNT KV binding** (Map) and fake ASSETS. **33/33 checks passed**, exit 0:

- anon account routes → 401 · authed GET → `account:null` initially
- register → 200; KV holds full record (client-1/token-1, peer pubkey, v4+reserved, ISO `registeredAt`, 32-byte private key); response carries only `{registeredAt,v4}`; okhttp UA on both CF calls; reg body has public key + `type:'ios'`; PATCH body `warp_enabled:true`
- GET reflects KV after write; JSON never contains privateKey/token/clientId
- rotate → replaces record (client-1 → client-2), same peer shape
- network error → 500 + "Network error while reaching api.cloudflareclient.com. Try again." · **KV unchanged**
- rate limit → 429 + "Cloudflare is rate-limiting registrations from this network…" · **KV unchanged**
- missing ACCOUNT binding → 500 readable config error · **zero CF calls** (fail-fast check)
- corrupt KV value → `account:null`, no crash
- `/` shell contains the card (`account-card`, Register/Rotate, `/api/account` wiring); anonymous `/` still the login page
- legacy `/api/generate` GET still public · GET on `/api/account/register` and POST on `/api/account` → 405

Harness was throwaway (`$HOME/smoke-02/`), deleted afterwards.

## Surprises

1. **`module.register()` deprecation** — Node 26 warns `module.register()` is deprecated in favour of `registerHooks()` (also `DEP0205`); harmless for a throwaway harness. Repo files unaffected (plain Worker globals).
2. **Smoke-stub off-by-one** — my first CF stub incremented the registration counter on *every* call (POST *and* PATCH), so rotate appeared to issue `client-3` and the "KV unchanged" assertions failed. The worker code was correct (verified with a log-stub); fixed the harness's counter placement. Good reminder that smoke failures need stub-vs-code triage before touching product code.
3. **`extractAccountRecord` vs `registerClient` validation split** — the warp response never carries `id`/`token` (they come from the `/reg` response), so the record needs them as parameters; both layers validate independently.
4. **No static tweetnacl import possible** — the test suite runs with no `node_modules`; `import 'tweetnacl'` at top level would break `node --test`. Solved with a lazy `await import('tweetnacl')` inside `generateKeyPair()` (esbuild bundles it for the worker just like the static import in `api-handler.js`); `Buffer` comes from the `'buffer'` module which is a Node builtin and a wrangler-bundled polyfill — safe in both.

## Deviations (with rationale)

- **Register overwrites too** — Register and Rotate share one flow (fresh registration → overwrite KV). Semantically distinct per the glossary, mechanically identical; the ticket only demands *Rotate* replace, and rejecting Register when an account exists would add a surprising precondition with no UI benefit. `action` in the response lets the card distinguish.
- **Fail-fast binding check before network** — `assertAccountBinding(env.ACCOUNT)` runs before any CF call so a misconfigured deployment never burns a (rate-limited!) registration it cannot store. `writeAccount` keeps the same guard as defense in depth. The ticket's "write AFTER the network call succeeds" ordering is preserved.
- **`wrangler dev` smoke replaced by fetch-level smoke** — wrangler/`node_modules`/`./out` absent (same as ticket 01); the node smoke covers the same ground with the real handler, stubbed CF API and fake KV binding, plus the KV-unchanged-on-failure properties the manifest asks for.
- **Card is client-rendered** — status loads via `fetch('/api/account')` rather than SSR, so the shell stays arg-free and the card never goes stale after actions; in-flight/error states require JS anyway. No-JS browsers see the loading state and no buttons (login/logout remain no-JS).
- **No `/api/account` OPTIONS/CORS** — panel is same-origin; matches the auth endpoints' convention.
- **Error statuses**: upstream `status` (429 etc.) reflected; generic failures 500 with a readable message. "A failed action leaves KV unchanged" is guaranteed by write ordering, not by status codes.

## Handoff notes & checklist

- [x] Register → account in KV + card; reload keeps it (smoke 3–4, 16)
- [x] Rotate → replaces record; `registeredAt` updates (smoke 18–20; `registeredAt` is a fresh `now()` per call)
- [x] Registration failure (rate-limit, network) → readable error; KV unchanged (smoke 21–24)
- [x] No registration outside Register/Rotate — `registerAccount()` is called only by the two routes; nothing auto-registers. (The legacy public `POST /api/generate` still registers per request — ticket 01 kept it byte-identical; removing that is the generator ticket's "reuse the stored account" work, e.g. the spec's user story 20.)
- [x] Local-dev KV placeholder added in `wrangler.jsonc` (commented); `wrangler dev` smoke left as an operator checklist item (needs `pkg install` tooling + `wrangler kv namespace create`).