# 05 — /reg hardening (CF-Client-Version + endpoint version + spacing)

**What to build:** Registration calls send the `CF-Client-Version` header and
target the wgcf-proven `v0a1922` endpoint version (live-probed alive; the
current minimal-header call is the oldest alive combo and has been observed
dropping). Panel registrations are spaced (worker-side guard on the last
registration timestamp, ~8 s minimum).

**Blocked by:** None — can start immediately

**Status:** done

- [x] registerClient sends CF-Client-Version and uses v0a1922
- [x] Back-to-back register/rotate actions are spaced; the guard holds in tests
- [x] Existing registration tests pass against the new call shape

**Implemented (2026-08-16):** worker/account.js now targets `https://api.cloudflareclient.com/v0a1922` and sends
`CF-Client-Version: a-6.3-1922` (kept okhttp/3.12.1 UA, Content-Type, 10 s timeout). Tests updated to assert the
new path + header (worker/account.test.js) and the stub base (worker/accounts.test.js). The ~8 s registration
spacing guard (registrationWaitMs + /api/accounts throttle) already existed from ticket 01 and was left untouched.