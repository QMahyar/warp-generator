# B4 — Warp API client hardening

Status: OPEN
Type: task (AFK)
Blocked by: B2 (can parallel B3)

## Question / Work

1. Extract/centralize Warp API client: retries with exponential backoff + jitter on 5xx/network errors ONLY (never 4xx), max 2 retries; parse Retry-After into server-side cooldown flag (KV, short TTL) honored before next attempt.
2. Move hardcoded `User-Agent: okhttp/3.12.1` and `CF-Client-Version` into `wrangler.toml [vars]` with sensible defaults read via env.
3. Compensating action: registration succeeds but KV persist fails → best-effort DELETE /reg/{id} to avoid orphaned WARP identities; loud log if compensation also fails.
4. Redact logged upstream response bodies (truncate + strip anything resembling keys/ids); typed result union instead of {error}|{config} duck typing at call sites.
5. Rate-limit friendliness: honor 429 with cooldown rather than immediate user-facing failure when a retry budget remains.

## Acceptance

- Unit tests for backoff decision function (pure part); integration path unchanged when API healthy.
- No secrets in any new log statement.

## Answer

(resolved on close)
