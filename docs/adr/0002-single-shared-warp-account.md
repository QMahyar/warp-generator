# One shared WARP account per deployment

All subscription configs use a single WARP account registered by the panel
operator, stored in KV. Not one account per visitor: Cloudflare's `/reg`
rate-limits by IP and a single Worker IP would burn through per-user
registrations; free WARP is unmetered, so a shared account is fine at personal
scale. Per-visitor accounts would force per-user subscription state and per-user
URLs — rejected.

Status: accepted.