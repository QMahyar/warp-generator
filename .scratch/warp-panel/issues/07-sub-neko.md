# 07 — /sub/neko

**What to build:** `GET /api/<token>/sub/neko` returns a base64 list of
`nekoray://custom#` links, each wrapping the sing-box wireguard outbound JSON
for one endpoint. Importable by NekoBox desktop.

**Blocked by:** 04 — /sub — wireguard:// lines + ?scheme=wg

**Status:** done — committed (`3925e73`), worker wg-ticket-07

  - [x] Decoding the payload yields one `nekoray://custom#` link per endpoint
  - [x] Wrapped JSON matches the CustomBean shape (docs/research/sub-formats.md §2.2)
  - [x] Seam unit-tested (`node:test`); `wrangler dev` smoke