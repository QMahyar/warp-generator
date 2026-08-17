# Subscription payload formats

The per-client formats the panel serves on `/api/<token>/sub*`. No universal
payload exists — Clash clients cannot parse link lists, v2rayN cannot parse
YAML, Husi rejects Clash, NekoBox desktop needs `nekoray://custom#` wrappers,
and the official WireGuard app takes files, not URLs.

The renderers are the implementation: `worker/sub.js` (the single
`renderSubscription` seam). This document pins the researched shape each
client's parser accepts, the exact values emitted, and the deviations from the
reference samples. The six formats below are served at:

| Route | Payload | Client family |
|---|---|---|
| `/api/<token>/sub` (`?scheme=wireguard` default) | base64 of `wireguard://` links | v2rayN family |
| `/api/<token>/sub` (`?scheme=wg`) | base64 of Throne `wg://` links | Throne |
| `/api/<token>/sub/clash` | raw YAML | Clash Meta / Mihomo |
| `/api/<token>/sub/singbox` | raw JSON `config.json` | SFA / SFI |
| `/api/<token>/sub/singbox?legacy=1` | raw JSON with pre-1.13 outbound shape | NekoBox Android / Husi |
| `/api/<token>/sub/neko` | base64 of `nekoray://custom#` links | NekoBox desktop |
| `/api/<token>/sub/wg` | ZIP of `.conf` files | official WireGuard app |
| `/api/<token>/sub/awg` | base64 of `awg://` links | LxBox / INCY |

## Shared semantics (all formats)

- **One config per valid endpoint.** Endpoint lines are validated at save time
  (`worker/settings.js`); renderers skip anything that is not `{host, port}`
  and never error on it. Zero valid endpoints → the two known-good defaults
  (`162.159.192.1:2408`, `engage.cloudflareclient.com:2408`).
- **Full tunnel** — `AllowedIPs 0.0.0.0/0, ::/0`; DNS `1.1.1.1`; MTU `1280`.
- **Client addresses** — `v4/32` plus `v6/128` when the account record has v6.
- **Reserved** — the WARP client id. The record's base64 when set, else the
  `[0,0,0]` → `"AAAA"` convention. Renderers decode to bytes (`[a,b,c]`).
- **AmneziaWG** — a panel setting honored by the formats that can express it
  (clash via `amnezia-wg-option`, wg-zip via AWG `.conf` lines, awg endpoint);
  the rest ignore it (link formats, singbox, neko).
- **Envelope** — link-list formats are base64 of newline-joined links (whole
  blob), the convention v2rayN-family updaters accept.

## §2.1 `wireguard://` links (v2rayN family)

```
wireguard://<private-key>@<host>:<port>/?publickey=<b64>&address=<cidrs>&mtu=1280&reserved=<b64>#<endpoint>
```

Private key in the userinfo; `publickey` / `address` (v4[+v6] CIDRs) / `mtu` /
`reserved` (base64 of the client id) in the query; the fragment is the endpoint
(the client's remark). Everything but the authority is url-encoded (`/`→`%2F`,
`+`→`%2B`, `=`→`%3D`, `,`→`%2C`, `:`→`%3A`). v2rayN's `WireguardFmt` parses
this shape; WARP rejects the handshake without `reserved` (audit fix — the
param was once missing).

## §2.2 `nekoray://custom#` links (NekoBox desktop)

```
nekoray://custom#<base64url(CustomBean JSON)>
```

The fragment is the **URL-safe** base64 (RFC 4648 §5: `+`→`-`, `/`→`_`,
padding retained) of the NekoBox `CustomBean` JSON:

```json
{
  "_v": 0, "addr": "127.0.0.1", "cmd": [""], "core": "internal",
  "cs": "<wireguard outbound JSON, as a string>",
  "mapping_port": 0, "name": "warp-<host>:<port>", "port": 1080, "socks_port": 0
}
```

`cs` is the pre-1.13 wireguard outbound object (see §2.3 legacy shape) plus
`system_interface: false` (userspace), `interface_name: "warp-wg"` and
`pre_shared_key: ""`. NekoBox desktop's import path parses the fragment as the
bean JSON (`RawUpdater` → `FromJsonBytes`) and feeds `cs` straight into the
core. It **requires** the URL-safe alphabet — the standard alphabet's `+`/`/`
are rejected outright (`IllegalCharacter` under `Base64UrlEncoding`).

## §2.3 sing-box `config.json` (SFA / SFI)

A full minimal remote profile. Default (sing-box ≥ 1.13): the WireGuard
**endpoint** shape — one `endpoints` entry per valid endpoint:

```json
{
  "type": "wireguard", "tag": "warp-<host>:<port>", "mtu": 1280,
  "address": ["<v4>/32", "<v6>/128"],
  "private_key": "...",
  "peers": [{ "address": "<host>", "port": 2408,
              "public_key": "...", "allowed_ips": ["0.0.0.0/0", "::/0"],
              "reserved": [a, b, c] }]
}
```

plus the minimal skeleton: `log` (info + timestamps), `dns` (1.1.1.1, tagged,
as `final`; typed form `{"type":"udp","tag":…,"server":"1.1.1.1"}` since 1.12),
one `mixed` inbound on `0.0.0.0:2080`, a `selector` outbound over the endpoint
tags (default = first endpoint — SFA/SFI render a dashboard group for
selectors, so subscribers can switch endpoints without re-importing), and
`route.final = "select"`.

`?legacy=1` (NekoBox Android / Husi): the pre-1.13 wireguard **outbound** shape
as `outbounds` entries — `server`/`server_port`/`local_address`/`private_key`/
`peer_public_key`/`reserved`/`mtu` — and the legacy `address`-form DNS server
(the typed form was removed from sing-box 1.14, so the legacy payload keeps the
form still accepted by ≤ 1.13).

## §2.4 Clash (Clash Meta / Mihomo) — raw YAML

```
proxies:
  - name: "warp-<host>:<port>"
    type: wireguard
    server: <host>          # IPv6 unbracketed
    port: <port>
    ip: <v4>
    ipv6: <v6>              # only when the record has v6
    private-key: ...
    public-key: ...
    reserved: [a,b,c]
    udp: true
    mtu: 1280
    remote-dns-resolve: true
    dns: [1.1.1.1]
    amnezia-wg-option:      # only when the AWG toggle is on
      jc: 4
      jmin: 40
      ...
      i1: "<b 0x…>"         # the "I<n> = " prefix is stripped to the chain
proxy-groups:
  - name: "PROXY"
    type: select
    proxies: ["warp-<host>:<port>", ...]
rules:
  - MATCH,PROXY
```

Served as `text/plain; charset=utf-8` (matches the reference
wireguard-subconverter-worker); clash clients parse the body as YAML regardless
of content type. `reserved` must be an int array — mihomo rejects non-3-byte
`reserved`. The `amnezia-wg-option` block emits only keys mihomo's
`AmneziaWGOption` documents: `jc/jmin/jmax/s1–s4` (ints), `h1–h4` (strings,
numeric or v2 range form) and `i1–i5` (CPS chains — the `I<n> = ` prefix from
the settings record is stripped, because mihomo passes the YAML value verbatim
into the amneziawg-go `i1=…` line).

## §2.5 `awg://` links (LxBox / INCY)

```
awg://<base64url(conf)>#<name>
```

The community scheme. The segment is **padded** URL-safe base64 of a `.conf`
(the stored AWG conf when the toggle is on, else a plain WireGuard conf). The
`#name` is the shared `warp-<host>:<port>` convention — matching the zip
filenames (minus `.conf`) and the clash/singbox tags, so a subscriber can
correlate one endpoint across every format.

## §2.6 ZIP of `.conf` files (official WireGuard app)

A storeless ZIP (`application/zip`) of one `.conf` per valid endpoint. The
WireGuard Android app imports a `.zip` of confs directly. Each conf:

```
[Interface]
PrivateKey = ...
Address = <v4>/32[, <v6>/128]
DNS = 1.1.1.1
MTU = 1280
<AmneziaWG lines when the toggle is on — Jc/Jmin/Jmax/S1–S4/H1–H4 as
 `Field = value`, I1–I5 as full CPS lines verbatim, in the canonical order>

[Peer]
PublicKey = ...
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = <host>:<port>      # IPv6 re-bracketed
```

Zip entry names are `warp-<host>-<port>.conf` with every character outside
`[a-zA-Z0-9.-]` replaced by `-` (IPv6 colons → dashes) — entry names are
extracted to the filesystem by the importing app, so the name can never smuggle
a path.

## Throne `wg://` (legacy parity)

```
wg://<host>:<port>?private_key=<key-without-=>&peer_public_key=<b64>&pre_shared_key=&reserved=0-0-0&persistent_keepalive=0&mtu=1280&use_system_interface=false&local_address=<v4>/32[-<v6>/128]&workers=0&enable_amnezia=true&junk_packet_count=4&junk_packet_min_size=40&junk_packet_max_size=70&init_packet_junk_size=0&response_packet_junk_size=0&init_packet_magic_header=1&response_packet_magic_header=2&underload_packet_magic_header=3&transport_packet_magic_header=4#WARP
```

Byte-identical to the legacy `buildThrone` (worker/api-handler.js, read-only).
`peer_public_key` is the WARP_PUB constant the legacy builder hardcodes; the
junk-packet/magic-header params are legacy literals; `reserved` is the dashed
form (`0-0-0` or `a-b-c`). Deviation only for a case the legacy builder cannot
hit: when the record has no v6, `local_address` is just `<v4>/32` (buildThrone
would emit `/32-/128` — Cloudflare always sends v6).

## Endpoint semantics (spec)

One config per **valid** endpoint line; malformed lines are already flagged by
`settings.js` at save time — the renderer skips anything that does not look
like `{host, port}` and never errors on it. Zero valid endpoints → the two
known-good defaults. Full tunnel and DNS 1.1.1.1 are implicit for the link
formats (v2rayN/Throne tunnel everything by default); MTU 1280 and the client
addresses come from the account record.
