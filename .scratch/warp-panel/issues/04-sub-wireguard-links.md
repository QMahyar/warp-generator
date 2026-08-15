# 04 — /sub — wireguard:// lines + ?scheme=wg

**What to build:** The first subscription: under a path token from `SUB_PATH`,
`GET /api/<token>/sub` returns a base64 (or plain) list of one
`wireguard://` link per endpoint — private key in userinfo, publickey,
address and mtu in query — and `?scheme=wg` returns the Throne-style `wg://`
links instead. One config per endpoint line; full tunnel; DNS 1.1.1.1; empty
endpoint list falls back to the two known-good defaults. Responses carry
`s-maxage` ~6h. This introduces the `renderSubscription` seam all later
renderers use.

**Blocked by:** 02 — WARP account Register/Rotate (KV), 03 — Panel settings

**Status:** done — committed (`4d0fde0`), worker wg-ticket-04

^  - [x] Link list parses correctly per v2rayN spec (docs/research/sub-formats.md §2.1)
^  - [x] `?scheme=wg` returns Throne-shaped links; default is wireguard://
^  - [x] One link per endpoint; ipv6 and custom ports render; empty list → fallback endpoints
^  - [x] Sub requires no auth but 404s without the correct path token
^  - [x] Caching headers present; seam unit-tested (`node:test`)
^  - [x] `wrangler dev` smoke: curl the sub URL, decode, paste into v2rayN