# B3 — Cache API swap + observability kit

Status: OPEN
Type: task (AFK)
Blocked by: B2 (can parallel B4)

## Question / Work

1. Replace KV subscription cache with Workers Cache API (`caches.default`): cache GET /sub/* responses keyed by request URL; on preset/settings/account mutation purge via `cache.delete` per known URL pattern (enumerate formats × token) — delete the entire KV-cache subsystem: getCachedSubscription, setCachedSubscription, bumpCacheVersion, cachever reads/writes, time-bucket keys.
2. Central `kvSafe(op)` wrapper for KV get/put/delete: logs failures once with op + key-class, returns null/false — collapse scattered try/catch through it where touched anyway.
3. Public `/healthz`: `{ ok, version, kv_ms }` with one cheap KV read; no auth.
4. Request log line in top-level fetch: JSON {routeClass: sub|api|admin|static, method, status, ms}; err+stack in catch. Never log raw tokens/keys (token.slice(0,8) max).
5. Log format-generation summary not bodies: {tokenPrefix, format, n_configs, bytes}.
6. Add version header (X-WG-Version) to subscription + admin responses from a single VERSION const.
7. Bump compatibility_date to newest that dry-run accepts.

## Acceptance

- Tests green; /sub/* still correct cold and warm; mutation invalidates cached subs (verify via local dev).
- Free-tier write burn from caching eliminated (no KV writes on sub GET path).

## Answer

(resolved on close)
