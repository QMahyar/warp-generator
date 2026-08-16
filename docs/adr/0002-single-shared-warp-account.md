# One shared WARP account per deployment

**Amended 2026-08-16 — multiple labeled accounts (multi-account feature). The
original decision below is kept verbatim; the amendment notes are at the
bottom of this file.**

All subscription configs use a single WARP account registered by the panel
operator, stored in KV. Not one account per visitor: Cloudflare's `/reg`
rate-limits by IP and a single Worker IP would burn through per-user
registrations; free WARP is unmetered, so a shared account is fine at personal
scale. Per-visitor accounts would force per-user subscription state and per-user
URLs — rejected.

Status: accepted.

---

## Amendment notes (2026-08-16)

Superseded for the panel: a deployment now stores **multiple** WARP accounts,
each a labeled slot (`id` + `label`) inside the `state` snapshot in the `STATE`
KV binding (see ADR 0005). What still holds: accounts are only ever registered
by the operator through panel actions (Register / Rotate / Import —
`worker/account.js`, `worker/index.js`), never per visitor or per request; the
per-visitor-account rejection is unchanged (Cloudflare `/reg` rate-limits by
IP, and a single Worker IP would burn through per-user registrations).
Registration calls are spaced (min ~8 s) so back-to-back operator actions do
not trip the rate limit. Each subscription pins exactly one account and keeps
serving across per-account rotations, so a flagged account no longer takes
down every subscription.