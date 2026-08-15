# Per-client sub formats with wireguard/wg schemes and AmneziaWG variants

Subscriptions are served in client-specific formats — no universal payload
exists (Clash clients cannot parse link lists, v2rayN cannot parse YAML, Husi
rejects Clash, NekoBox desktop needs `nekoray://custom#` wrappers, and the
official WireGuard app takes files, not URLs). Six endpoints: `/sub`
(`wireguard://` lines, `?scheme=wg` for Throne-style `wg://`), `/sub/clash`,
`/sub/singbox`, `/sub/neko`, `/sub/wg` (zip of confs), `/sub/awg` (awg://
links). AmneziaWG obfuscation params (`Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5`, I1
pool from the existing masks) are a panel setting honored by the formats that
can express them (clash via `amnezia-wg-option`, wg-zip via AWG confs, awg
endpoint); the rest ignore them. Payload shapes per client documented with
sources in `docs/research/sub-formats.md`.

Status: accepted.