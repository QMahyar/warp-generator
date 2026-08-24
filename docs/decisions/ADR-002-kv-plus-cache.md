# ADR-002: KV + Cache API for subscriptions (not KV `cache:*`)

## Status

Accepted — supersedes v1.x KV `cache:{token}:{format}` (abandoned, harmless).

## Date

2026-08-23

## Context

Subscriptions (`GET /sub/{token}/{format}`) fan out to `expandEndpoints` + `FORMATS[format].gen`. Regenerating on every fetch is CPU-wasteful; caching 5 min is safe because configs change only on account/preset/settings/token/group edits.

Options: KV `cache:*` with TTL, Cache API (`caches.default`), no cache.

## Decision

- **Read:** `caches.default.match(cacheRequest)` keyed `origin + /sub/{token}/{format}`.
- **Write:** `ctx.waitUntil(caches.default.put(...))` — best-effort, never blocks response.
- **Invalidate:** `purgeCachedSubscriptions(origin, [tokens])` per-token + `purgeAllCachedSubscriptions(request, env)` global (now includes `agg:{token}` at `_worker.js:6438`). Call after any mutation.

KV holds only durable state (`account:{uuid}`, `token:{token}`, `agg:{token}`, `presets`, `settings:*`).

## Alternatives

### KV `cache:*`
- Cons: 1k writes/day free limit burned on every sub fetch, TTL ±60 s imprecise, extra KV cost
- Rejected:Cache API is edge-native, no write quota.

### No cache
- Cons: every sub fetch pays `expandEndpoints` + YAML/JSON gen
- Rejected: wasteful for 24h `Profile-Update-Interval` clients.

## Consequences

- `wrangler.toml` KV stays small; stale `cache:*` keys from v1.x remain as dead weight.
- Invalidation is fan-out `tokens × formats` sequential `delete` (correctness > speed).
- Origin change (custom domain) orphans old Cache API entries (URL-scoped) — acceptable.
