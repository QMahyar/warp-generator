# Standards review — subscription-panel implementation (whole diff)

Scope: `git diff 6495a67...HEAD` — 21 commits (tickets 01–10 + tracker), 41
files, +8169/−148. `worker/` implementation (index, auth, account, settings,
sub, panel, generate, import, zip + 10 `node:test` suites), `api-handler.js`
deleted (→ `generate.js`), tracker/spec edits, `wrangler.jsonc` docs.
Standards read: repo `AGENTS.md`, `docs/router.md`, spec.md Implementation +
Testing Decisions, ADRs 0001–0007.

## (a) Documented-standard violations

**No hard violations.** Every spec Implementation Decision is met:
textContent-only UI (no `innerHTML` in worker/, only comments); constant-time
compares (`verifyPassword` double-HMAC, `timingSafeEqualBytes` for SUB_PATH);
404-not-401 on sub tokens (notFound before the gate); 503 missing-account
helper; KV writes strictly after network success (`handleAccountAction`:
`registerAccount()` → `writeAccount()`; `import.js`: parse → verify →
`writeAccount`); fail-fast asserts (account/endpoints/awg); pure
`renderSubscription` + RENDERERS registry (`sub.js`); no network at serve
time (sub/generator handlers read KV only); 6 h cache (`SUB_CACHE_CONTROL`
21600); zero new npm deps (`package.json` untouched); tests via `node:test`
(10 suites). Worker protocol (docs/router.md) respected — read-only,
results-only.

Closest to a breach — **judgement**: `settings.js` `writeAwg` deletes the
key on the off path *before* `assertAwgBinding` (which fires only when
enabling), unlike `writeEndpoints`, which always asserts (spec: "fail-fast
binding asserts"). Outcome is coherent (off == absent), so this is an
assert-placement asymmetry, not a behavioral breach.

## (b) Baseline smells (all judgement)

1. **Duplicated Code** — `index.js` six sub handlers share one shape
   (`handleSub`…`handleSubAwg`): method check, `readAccount(env.ACCOUNT)`
   + `missingAccount()` 503, `readEndpoints` + `parseEndpointList` fallback,
   `SUB_CACHE_CONTROL` response. A `{ format, needsAwg }` table + one
   handler would cut ~5 copies.
2. **Repeated Switches** — `fetch()` cascades six near-identical
   `pathname.match(/^\/api\/([^/]+)\/sub\/…/)` + `subPathMatches` + notFound
   blocks; a route table would collapse them.
3. **Duplicated Code** — `reservedToBytes`/`reservedToDashed` and the
   `WARP_PUB` constant exist in both `sub.js` and `generate.js` (both new in
   this diff); parity rationale documented, but the legacy file both claim
   parity with is deleted.
4. **Duplicated Code** — `panel.js` client script mirrors `settings.js`
   validation (isV4/isHostname/isV6/portOk/lineResult, `AWG_DEFAULTS`,
   `AWG_RANGES`, I-regex, Jmin≤Jmax). Documented as a deliberate mirror;
   ADR 0004 (no build step) suppresses a shared-module fix, but every bounds
   tweak must land twice.
5. **Mysterious Name** — `readLoginBody` reads JSON-or-urlencoded bodies
   for login, import, endpoints and awg, not just login.
6. Tracker staleness — ticket 01's checklist marks "Legacy `/api/generate`
   … still public" done; ticket 09 retired the route (now 401-gated).
   Contradictory record; `docs/agents/issue-tracker.md` hygiene.

## (c) Violations from earlier tickets fixed here

- Per-request registration removed: `api-handler.js` deleted, register flow
  behind panel actions only (ADR 0002 / spec "per-request registration is
  removed from the worker").
- The unauthenticated public `/api/generate` (fresh `/reg` per request)
  retired — `/api/generator` is session-gated, renders from the stored
  account; stray hits fall through to the gate (401) or ASSETS 404.
- Ticket-01's `timingSafeEqualBytes` discipline extended to the SUB_PATH
  token rather than plain `===` (ticket 04).