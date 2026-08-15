# 08 — /sub/wg zip + /sub/awg

**What to build:** `GET /api/<token>/sub/wg` returns a zip of one `.conf` per
endpoint (plain WG confs, or AmneziaWG confs with Jc/Jmin/Jmax/S/H/I lines
when the AWG toggle is on) for the official WireGuard and AmneziaWG apps; and
`GET /api/<token>/sub/awg` returns a base64 list of awg:// links (base64url
conf + name) for LxBox/INCY-style clients.

**Blocked by:** 04 — /sub — wireguard:// lines + ?scheme=wg, 03 — Panel
settings (for the AWG toggle)

**Status:** ready-for-agent

- [ ] Zip opens with one well-named conf per endpoint; AWG confs carry the J/S/H/I lines when enabled
- [ ] awg:// links decode to valid confs; absent AWG toggle → endpoint still serves wg zip
- [ ] Seam unit-tested (`node:test`); `wrangler dev` smoke