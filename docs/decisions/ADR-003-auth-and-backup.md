# ADR-003: Auth (PBKDF2 + bcrypt migration) + AES-GCM backup (`.wgenc`)

## Status

Accepted

## Date

2026-08-23

## Context

Single-password admin, free tier, no email recovery. Need: resist offline cracking, survive future algo change, exportable backup that is itself secret.

## Decision

- **Password:** PBKDF2 100k SHA-256 16B salt, 256-bit, stored `pbkdf2$iterations$base64(salt)$base64(hash)` at `settings:password`. Legacy `bcrypt` hashes verified then re-hashed to PBKDF2 on login (auto-migration). `constantTimeEquals` on verify.
- **Session:** `session:{token}` KV TTL 24h, `HttpOnly` `Secure` `SameSite=Strict` `Path=/` (`_worker.js:3831` conditional on `isHttps` — dev `http` exception).
- **Rate limit:** KV `auth:fail:{ip}` 5 fails / 900 s → 429.
- **Backup:** `POST /api/backup/export` → `WGENC1` magic + 16B salt + 12B iv + AES-GCM ciphertext (PBKDF2 key, 8-128 char password, 2 MiB cap). Import `{blob, password, mode=skip|overwrite}` with per-item `validateBackupAccount` + `settings` allowlist `amnezia` only.

## Alternatives

### Only bcrypt
- Cons: `bcryptjs` larger, not WebCrypto-native, no upgrade path
- Rejected: PBKDF2 via `crypto.subtle` is Workers-native; keep `bcryptjs` only for migration.

### Plain JSON backup
- Cons: private keys in cleartext on disk
- Rejected: `.wgenc` is the wire.

## Consequences

- Lose password → `wrangler kv:key delete settings:password` then `/admin/setup` (needs `ADMIN_SETUP_SECRET` if set).
- Backup file IS secret — never commit.
- Import `skip` keeps IDs, `overwrite` reports `replacedOldTokens` and purges cache.
