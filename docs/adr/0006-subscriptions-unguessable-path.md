# Subscriptions protected by an unguessable path, not a password

**Amended 2026-08-16 — per-subscription tokens, hashed at rest; `SUB_PATH`
retired (multi-account feature). The original decision below is kept
verbatim; the amendment notes are at the bottom of this file.**

Sub clients fetch subscription URLs without credentials — that is how
subscriptions work in every client — so the panel password cannot gate them.
Instead each subscription lives under a token from a `SUB_PATH` secret (e.g.
`/api/<token>/sub`), which is what stope non-subscribers from guessing the
link. The panel prints the ready-to-paste URLs. Response caching
(`s-maxage ~6h`) keeps sub fetches off the worker's free-tier request budget.

Status: accepted.

---

## Amendment notes (2026-08-16)

Subscriptions are now named entities with their own token: `POST /api/subs`
mints 32 random bytes → 43-char base64url token per subscription, stored only
as its SHA-256 hash (`tokenHash`) inside the `state` snapshot
(`worker/state.js`); the panel shows the full ready-to-paste links exactly
once, at create/reset, then only a hash-prefix fingerprint. Route matching
hashes the submitted path token and constant-time compares it against
`subs[].tokenHash` (`lookupSubByToken`, `worker/index.js`); no match → 404,
never 401 — the "wrong token must not reveal the route exists" posture is
preserved. A sub whose pinned account is missing → 503 (readable message,
no-store). The `SUB_PATH` secret, its route gates, wrangler entry and
deploy-stage handling are removed with no legacy fallback; the six
`/api/<token>/sub*` routes keep their pre-gate, no-session shape. Edge
caching drops from ~6 h to `public, max-age=300, s-maxage=300` (5 min —
bounds the re-pin lag; `s-maxage` also disables stale-while-revalidate per
RFC 9111), and every non-200 sub response (404/503/405) carries explicit
`Cache-Control: no-store`.