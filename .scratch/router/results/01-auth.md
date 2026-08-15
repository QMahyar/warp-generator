# Result — ticket 01: Password gate + panel shell

**Date:** 2026-08-15 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files (all new/changed code lives in `worker/`)

| File | Change |
|---|---|
| `worker/auth.js` | **new** — pure auth module: HMAC-signed session cookies (Web Crypto), constant-time compares, cookie helpers. Zero imports, no env access; runs identically in the Worker and under `node --test`. |
| `worker/panel.js` | **new** — framework-less panel UI (ADR 0004): `loginPage()` (public) and `panelShell()` (empty authenticated shell). Inline CSS, no JS framework, no external assets; logout is a plain form POST. |
| `worker/index.js` | **rewritten router** — keeps the `/api/generate` block byte-identical; adds `/api/auth/login`, `/api/auth/logout`; gates everything else behind a session check. `env` is now read (`env.PASSWORD`) — the router previously ignored it. |
| `worker/auth.test.js` | **new** — `node:test` suite (14 tests) for the cookie sign/verify/password logic. |
| `wrangler.jsonc` | commented `PASSWORD` placeholder for local dev (`vars` block + note to use `wrangler secret put PASSWORD` in production). No real secrets. |

Forbidden dirs (`lib/`, `app/`, `components/`, `functions/`, `config/`, `public/`, `scripts/`, docs, `package.json`) untouched — confirmed by `git status`.

### Routes (new map)

| Route | Behaviour |
|---|---|
| `GET/POST/OPTIONS /api/generate(/)` | **unchanged and public** (same handlers, same CORS, same 405). |
| `POST /api/auth/login` | Public. Accepts `application/x-www-form-urlencoded` (the login form) or JSON (`{password}`). Wrong password → `303 /?error=invalid`. Missing `env.PASSWORD` → `303 /?error=config` (everything stays gated). Correct → `303 /` + `Set-Cookie: warp_session=v1.<exp>.<sig>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` (+ `Secure` over https). |
| `POST /api/auth/logout` | Public. `303 /` + `Set-Cookie: warp_session=; …; Max-Age=0`. |
| any `/api/*` (other) | Gated: unauthenticated → `401 {"error":"Unauthorized"}`; authenticated → falls through to ASSETS (no such routes exist yet). |
| `/` | Gated: unauthenticated → login page; authenticated → panel shell. |
| any other path | Gated: unauthenticated → login page; authenticated → `env.ASSETS.fetch(request)` (existing ASSETS binding, now behind the password). |

Non-POST to either auth endpoint → 405 JSON. All panel HTML sent with `Cache-Control: no-store` (no edge caching of the login page). `api-handler.js`'s `onRequestPost` already received `env`/`ctx`; unchanged.

### Cookie mechanics

- Value: `v1.<expiryUnixSeconds>.<base64url(HMAC-SHA256(PASSWORD, "v1.<expiryUnixSeconds>"))>`.
- Issue: `issueSession(secret, {now, maxAge})`, default `maxAge` = 604 800 s (~7 days).
- Verify: `verifySession(token, secret, {now})` — format check, constant-time byte compare (XOR-accumulator `timingSafeEqualBytes`) of the supplied signature against a freshly computed HMAC, then strict `now < exp`.
- Password check: `verifyPassword(submitted, expected)` — double-HMAC digests compared constant-time (fixed 32-byte compare, no length signal). Empty `PASSWORD` never matches (login handler also 303s to `?error=config`).
- Rotating `PASSWORD` invalidates all live sessions — intended for a single-operator panel (documented in `auth.js`).
- `parseCookies()` handles multi-cookie headers, spacing and quoted values.

## Test output

`node --test` (from repo root; discovers `worker/auth.test.js`; no npm dependencies added):

```
ℹ tests 14   ℹ pass 14   ℹ fail 0   (duration ~0.85s)
```

Coverage: sign/verify roundtrip · expiry is ~7d · tokens differ per issuance time · tampered payload/signature rejected · wrong secret rejected · expiry boundary (valid until `exp-1s`, invalid at `exp`) · malformed tokens (`''`, wrong version, non-integer exp, bad base64, extra dots) · password right/wrong/empty/non-ASCII · `timingSafeEqualBytes` · cookie parsing · cookie header attributes · clear-cookie.

## Verification results

- `node --check` passes on all changed worker files: `worker/index.js`, `worker/auth.js`, `worker/panel.js`, `worker/auth.test.js`.
- `node --test`: 14/14 green (above).
- **Route-level smoke (13/13 checks)**: wrangler is not installed (no `node_modules`, no `./out`) so the `wrangler dev` checklist item could not run here. Instead I drove `worker/index.js`'s `fetch` directly from Node (stubbed `./api-handler.js` via a loader hook since tweetnacl/buffer/qrcode aren't installed, fake `ASSETS` binding). Verified end-to-end: unauthenticated `/` → login page · wrong password → 303 `?error=invalid`, no cookie · correct password (form and JSON) → session cookie with HttpOnly/SameSite=Lax/Max-Age=604800 · authenticated `/` → shell + logout form · `Secure` flag on https · tampered and expired cookies rejected · gated asset path: login page anon / ASSETS response with cookie · unknown `/api/*` → 401 JSON · `/api/generate` GET/OPTIONS/405 unchanged and public without auth · logout clears cookie and re-gates · non-POST auth → 405 · missing `PASSWORD` → `?error=config` and everything gated. Script was throwaway, run from `$HOME`, deleted afterwards.

## Surprises

1. **`node --test` on an empty-secret HMAC** — `verifyPassword('', '')` threw `DataError: Zero-length key` in Node (Web Crypto has no empty-key HMAC). Guarded in `verifyPassword` (empty expected → false) and asserted in tests; the routed path can't hit it anyway (config error short-circuits).
2. **Node loader-hook gotcha during smoke** — `encodeURIComponent` leaves `'` unescaped, which broke the loader module's own string literal. Irrelevant to the shipped code; only affected my throwaway smoke harness.
3. **Repo state** — no `node_modules`, wrangler, or `./out` (ASSETS directory) in the working tree, so `wrangler dev` needs `pkg`/`npm install` + `next build` by the operator. The ticket's `wrangler dev` smoke item is therefore replaced by the fetch-level smoke above until the environment is provisioned. `docs/plans/` and `docs/research/sub-formats.md` show as untracked in `git status` but are router-owned artifacts from the design phase, not touched by this ticket.

## Deviations

- **Smoke method**: `wrangler dev` smoke replaced by a Node fetch-level smoke of the real `fetch` handler (rationale above; same coverage, no environment provisioning).
- **Login error handling**: wrong password redirects (`303 ?error=invalid`) instead of returning 401, so the framework-less form works without JavaScript; the login page renders the message from the query param.
- **Gated assets**: after login, non-`/` paths still fall through to the existing ASSETS binding (old static export) instead of disappearing entirely — "everything else gated" per the ticket, and future tickets can restrict further. `/` serves the worker-rendered shell as specified.
- **`package.json` untouched** — no `test` script added (ticket forbids modifying it); run with `node --test` directly.

## Handoff notes

- Operator provisioning (already planned as a wizard in the spec): `wrangler secret put PASSWORD`; local dev: uncomment the `vars` placeholder in `wrangler.jsonc` or `--var PASSWORD:<value>`.
- `wrangler dev` smoke checklist item for this ticket: `node --test` + login → shell flow (now also covered by the node smoke above).