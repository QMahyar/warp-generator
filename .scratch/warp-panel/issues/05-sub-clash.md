# 05 — /sub/clash

**What to build:** `GET /api/<token>/sub/clash` returns raw Clash YAML with
one `type: wireguard` proxy per endpoint (ip/ipv6, private/public key,
reserved, udp, mtu, dns) plus minimal proxy-groups and rules, and
`amnezia-wg-option` on each proxy when the AWG toggle is on. Raw YAML, never
base64.

**Blocked by:** 04 — /sub — wireguard:// lines + ?scheme=wg, 03 — Panel
settings (for the AWG option)

**Status:** ready-for-agent

- [ ] YAML parses with a Mihomo parser; one proxy per endpoint, valid proxy-groups/rules
- [ ] AWG on → `amnezia-wg-option` present and correct; off → absent
- [ ] IPv6 endpoint lines produce ipv6 entries; empty list → fallback endpoints
- [ ] Seam unit-tested (`node:test`); `wrangler dev` smoke