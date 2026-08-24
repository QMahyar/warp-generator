# B2 — Critical security & correctness fixes (surgical)

Status: OPEN
Type: task (AFK)
Blocked by: B1

## Question / Work

Small, high-severity fixes; each independent, tests must stay green:
1. Session writes get KV `expirationTtl` matching session duration (code check stays as defense-in-depth).
2. Atomic write ordering: `storeAccount` writes token mapping last + compensates; token regen writes NEW mapping before deleting OLD.
3. `validateEndpointList` rejects empty list (`length < 1`).
4. IPv6 bracket normalization at validation/store time (strip `[ ]` once, store bare).
5. Warp API response validation: typeof checks on `addresses.v4`/`.v6` (+ sane CIDR) → 502 on garbage; re-validate account.config shape at read path in expandEndpoints.
6. `wireguard://` generator trailing comma for single-stack accounts (filter(Boolean)).
7. `initializeKV`: wrap body in try/catch, set initialized flag AFTER success; wrap unguarded KV reads/calls: resolveToken, getCachedSubscription call site (fall through to regeneration on error), validateSession expired-delete (treat failure as logged out), login fail-counter put, createSession/destroySession (redirect ?error=generic on failure).
8. HEAD handled as GET with body suppressed (cache-aware); Content-Disposition attachment ONLY on ZIP formats; ZIP cached/stored as binary not base64.
9. Preset `<select>` fake "Custom endpoints" option: disable it (informational) or revert selection on no-op.
10. Rate-limit toast uses actual retry window, not hardcoded "15 minutes".

## Acceptance

- All existing tests green; add unit tests where pure-function (validators, wireguard:// fix).
- `node --check` + dry-run pass.

## Answer

(resolved on close)
