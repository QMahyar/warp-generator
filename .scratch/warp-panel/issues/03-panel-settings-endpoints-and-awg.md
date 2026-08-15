# 03 — Panel settings: endpoint editor + AWG params (KV)

**What to build:** The panel gains a settings card with a textarea of
`host:port` lines (v4 or v6, any port) saved to the `ENDPOINTS` KV binding,
and an AmneziaWG card — toggle plus Jc, Jmin, Jmax, S1–S4, H1–H4, I1–I5
(defaults drawn from the I1 mask pool) saved to the `AWG` binding. Both load
current state on open and persist on Save; malformed lines are flagged
without blocking the valid ones.

**Blocked by:** 01 — Password gate + panel shell

**Status:** done — committed (`7c1a118`), worker wg-ticket-03

- [x] Endpoint lines save to KV and reload; malformed lines flagged client-side
- [x] AWG toggle + params save to KV and reload; empty AWG = params absent
- [x] Saves survive redeploys (KV)
- [x] verification: fetch-level smoke with fake KV (wrangler unavailable)