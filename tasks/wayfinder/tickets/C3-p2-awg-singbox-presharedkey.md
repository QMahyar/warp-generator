# C3 — P2: AWG 2.0 fix + singbox-amnezia + presharedkey

Status: TODO
Priority: P2 — completeness, low urgency
Depends: C1, C2

## Scope

### 1) AWG 2.0 fix (`_worker.js:5921` generateWireGuardConf + DEFAULT_AMNEZIA + validator)
Current `wireguard-conf-amnezia` emits `Jc/Jmin/Jmax/S1/S2/H1-H4` (omits zeros). AWG 2.0 requires `S3/S4` + `I1-I5`; without them `awg-quick` warns / server `amneziawg-go` expects them.
- Extend DEFAULT_AMNEZIA + generator + `validateAmnezia` to include `S3:0-255, S4:0-255` and `I1: ''` (string like `"<r 128>"` or `"<b 0x..>"`).
- Emit `S3 =` `S4 =` iff non-zero, `I1 = <r 128>` iff non-empty string (validate `^<r \d+>$|^<b 0x[0-9a-fA-F]+>$`).
- Update test/golden/wireguard-conf-amnezia.txt via `npm run goldens:update`.
- Reference: https://github.com/amnezia-vpn/amneziawg-go#message-paddings, https://github.com/bivlked/amneziawg-installer/blob/main/ADVANCED.en.md

### 2) singbox-amnezia (`_worker.js:6039` generateSingboxJson + 6061 legacy)
Forks `spoofi/sing-box-awg` / `amnezia-box` add `amnezia-wg-option` or `amnezia_wg` to wireguard endpoint/outbound.
- New `FORMATS['singbox-amnezia']` and `FORMATS['singbox-legacy-amnezia']` with `needsAmnezia:true`.
- In generator, when hasAmnezia inject `amnezia_wg: { jc, jmin, jmax, s1, s2, h1-4 }` (or `amnezia-wg-option` per fork docs https://github.com/spoofi/sing-box-awg/blob/main/docs/configuration/endpoint/wireguard.md). Omit zeros.
- Dashboard SUB_FORMATS + goldens.

### 3) presharedkey param (`_worker.js:6018` generateWireguardUri)
v2rayN `WireguardFmt.cs` parses `presharedkey`; we skip. Add conditional `&presharedkey=<enc>` only if `cfg.pre_shared_key` truthy (WARP today has `""` so no output change for goldens).

## Acceptance
- `node --check` + `npm test` + `npm run goldens:update` + dry-run
- AmneziaWG 2.0 `awg-quick` parses without warning; singbox-amnezia imports in spoofi fork

## Out of scope
- `vpn://` compressed JSON export for AmneziaVPN app (requires zlib+base64 JSON, ~15 lines but different product) — ticket separately if demanded
- SIP008 Shadowsocks — not WireGuard
