# 01 — Password gate + panel shell

**What to build:** Opening the deployment shows a login page; submitting the
correct password issues a session cookie; every panel page and api route
(except the still-public legacy `/api/generate`) is gated behind it; after
login the operator lands on an empty panel shell that later tickets fill.
Authentication uses a `PASSWORD` secret and an HMAC-signed session cookie
(Web Crypto), constant-time comparison, ~7-day expiry, logout.

**Blocked by:** None — can start immediately.

**Status:** done — committed (`a185ea6`), worker wg-ticket-01

- [x] Login page served without auth; wrong password rejected; correct password issues a working cookie
- [x] Gated routes/assets reject unauthenticated requests; expiry and logout work
- [x] Legacy `/api/generate` behaviour unchanged and still public
- [x] Cookie sign/verify covered by unit tests (`node:test`)
- [x] smoke: fetch-level harness (wrangler unavailable) — login → shell