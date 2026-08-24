# B9 — Token lifecycle

Status: OPEN
Type: task (AFK)
Blocked by: B8

## Question / Work

Tokens are bearer credentials with lifetime "forever" and zero telemetry. Additive KV schema only (backward compat: absent fields = unlimited).
1. Per-token optional expiry date (ISO), owner label, fetch hit counter (increment on sub GET — Cache API makes origin hits rare; count cache-miss/origin serves + note in UI copy), enabled/disabled flag.
2. Enforce at /sub/*: expired/disabled → 410 Gone with plain-text body (clients stop retrying); admin UI shows status chip.
3. Admin UX: token table columns (label, created, expires, hits, status), inline edit modal, revoke toggle, regenerate with breakage count.
4. API: extend account/token endpoints additively; validate expiry is future ISO date or null; label 1–100 chars sanitized.

## Acceptance

- Unit tests for expiry/disabled gate logic; existing accounts without new fields behave exactly as before.

## Answer

(resolved on close)
