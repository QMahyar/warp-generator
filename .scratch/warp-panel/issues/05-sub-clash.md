# 05 — /sub/clash

**What to build:** `GET /api/<token>/sub/clash` returns raw Clash YAML with
one `type: wireguard` proxy per endpoint (ip/ipv6, private/public key,
reserved, udp, mtu, dns) plus minimal proxy-groups and rules, and
`amnezia-wg-option` on each proxy when the AWG toggle is on. Raw YAML, never
base64.

**Blocked by:** 04 — /sub — wireguard:// lines + ?scheme=wg, 03 — Panel
settings (for the AWG option)

**Status:** done — committed (`4679b49`), worker wg-ticket-05

  - [x] YAML parses with a Mihomo parser; one proxy per endpoint, valid proxy-groups/rules
  - [x] AWG on → `amnezia-wg-option` present and correct; off → absent
  - [x] IPv6 endpoint lines produce ipv6 entries; empty list → fallback endpoints
  - [x] Seam unit-tested (`node:test`); `wrangler dev` smoke