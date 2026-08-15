# 09 — Generator page reusing the stored account

**What to build:** The panel's Generate page carries the original
single-config flow over (format selector, endpoint override, DNS, device,
IPv6/keepalive/I1 options, result panel with copy/download/QR) — but renders
from the stored WARP account instead of registering per request. Per-request
registration is removed from the worker; the community-DNS rule and existing
format-parity quirks are preserved. The old public `/api/generate` retires
with this ticket.

**Blocked by:** 01 — Password gate + panel shell, 02 — WARP account
Register/Rotate (KV)

**Status:** ready-for-agent

- [ ] All formats generate from the stored account; QR where supported; downloads named as before
- [ ] No `/reg` calls happen during generation (verified in logs)
- [ ] Community-DNS forces "all sites"; wiresock/husi/clash parity quirks preserved
- [ ] Legacy `/api/generate` routes removed; panel links updated
- [ ] `wrangler dev` smoke across formats