# 06 — /sub/singbox

**What to build:** `GET /api/<token>/sub/singbox` returns a minimal runnable
sing-box `config.json` using the 1.13+ wireguard endpoint shape (one endpoint
entry per endpoint line), and `?legacy=1` serves the pre-1.13 wireguard
outbound shape for NekoBox Android and Husi.

**Blocked by:** 04 — /sub — wireguard:// lines + ?scheme=wg

**Status:** ready-for-agent

- [ ] Default payload valid against sing-box 1.13+ endpoint schema; legacy flag serves outbound schema
- [ ] One endpoint per endpoint line; ipv6 + custom ports render
- [ ] Seam unit-tested (`node:test`); `wrangler dev` smoke