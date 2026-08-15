# Research: subscription formats per client family (WARP/WireGuard)

Research date: 2026-08-15. Primary sources only; payload shapes verified against
client source code and real WARP sub generators. Companion doc: `bpb-panel.md`.

## 1. Summary table

| Client | Accepts sub URL | WireGuard/WARP link format | Import method | Notes |
|---|---|---|---|---|
| **v2rayN** (2dust) | Yes — HTTP(S) URL; body = plain list **or** base64 of links (auto-detected; base64 decoded if valid) | `wireguard://` (private key in userinfo, pubkey/etc in query) | Sub URL → "update subscription"; also paste link, import `.conf` | Subscription covers VMess/SS/SOCKS/VLESS/Trojan/Hy2/TUIC/**WireGuard**/Anytls |
| **NekoBox (Android)** | Yes — parses Clash Meta, V2rayN, Shadowsocks, **sing-box (1.3.8+ outbounds)**, share links + base64 | no native `wireguard://` parser; WireGuard via sing-box outbound JSON (sub) or `.conf` import | Sub URL; file import | Reserved field = base64 string in UI |
| **NekoBox (PC, nekoray)** | Yes — base64 list, Clash YAML, V2rayN-format, SS, links | `nekoray://custom#<base64(json)>` wrapping a sing-box `wireguard` outbound (`core: "internal"`) | Sub URL; paste link; custom-config import | No native WG link parser; WG runs as custom sing-box outbound |
| **Husi** | Yes — "normal" sub: **base64 first, then parse sing-box JSON or proxy links**; **does NOT parse Clash/Mihomo** | `wireguard://`; sing-box JSON outbound | Sub URL (group); default UA `husi/<ver>` | WARP `Reserved` supported (list or base64) |
| **sing-box (SFA/SFI)** | Core has no sub; official GUI req: **Remote Profile** = remote sing-box `config.json` fetched from URL (auto-update 60 min) | full JSON config; WG outbound (≤1.12) or **WireGuard endpoint (1.13+, peers[])** | `sing-box://import-remote-profile?url=...#name` | WG outbound deprecated 1.11, **removed in 1.13.0** |
| **Clash Meta / Mihomo** | Yes — raw **YAML** profile fetched by URL (guis); node lists via `proxy-providers: type: http, url:` | `type: wireguard` proxy YAML block | Profile URL; proxy-providers | reserved as `[a,b,c]` or `"U4An"`; AWG via `amnezia-wg-option`; multi-peer `peers:` syntax |
| **Karing** | Yes — "Clash, V2ray/V2fly, Sing-box, Shadowsocks, Sub, Github Subscriptions"; full clash, partial clash.meta | any of the above | Sub URL | sing-box-based (flutter GUI) |
| **AmneziaWG app** | **No** subscription. Official sharing: `vpn://` key (AmneziaVPN app only) or native **`.conf`** (AmneziaWG app / router). Community: `awg://` = base64url(.conf)#name | `.conf` with `Jc/Jmin/Jmax/S1–S4/H1–H4(/I1–I5)`; plain WG `.conf` also works | Share sheet / file import, QR (some clients) | WARP is plain WG → normal `.conf` is enough |
| **Official WireGuard app** | **No** subscription concept (confirmed) | `.conf` | Import file (`.conf` or **`.zip` of confs**, Android) / QR scan / paste | one tunnel per conf |
| **WARP sub tooling** (real examples) | juerson worker: `?target=v2rayn|nekoray|clash|hiddify` | see §2 payloads | Sub URL per client | BPB panel: per-endpoint configs per core (see bpb-panel.md) |

## 2. Exact payload shapes + wg:// fields

### 2.1 v2rayN — `wireguard://` (source: `WireguardFmt.cs`; sample from juerson worker)
Fields: `userinfo` = **private key** (url-decoded); `host:port` = endpoint;
query `publickey` (b64), optional `presharedkey`, `reserved`, `address`
(comma-separated CIDRs), `mtu`; fragment `#remark`. `.conf` import also
supported (multi-peer → one profile per peer).
```
wireguard://OOrigZsSjw2YaY4urjbbU4%2FBNOZKXqW6EYNm8XKLtkU%3D@162.159.192.127:7152/?publickey=bmXOC%2BF1FxEMF9dyiK2H5%2F1SUtzH0JuVo51h2wPfgyo%3D&address=172.16.0.2%2F32%2C2606%3A4700%3A110%3A82ce%3A...%2F128&mtu=1280#162.159.192.127%3A7152
```
Subscription body: one link per line, plain **or** base64(whole blob).

### 2.2 NekoBox PC — `nekoray://custom#` (source: `Bean2Link.cpp`/`CustomBean.hpp`; sample: juerson `buildNekoRayLink`)
`cs` = sing-box wireguard outbound JSON (1.11-era fields).
```
nekoray://custom#<base64 of>
{"_v":0,"addr":"127.0.0.1","cmd":[""],"core":"internal",
 "cs":"{\"type\":\"wireguard\",\"tag\":\"wireguard-out\",\"server\":\"162.159.192.1\",\"server_port\":2408,
        \"system_interface\":false,\"interface_name\":\"warp-wg\",\"local_address\":[\"172.16.0.2/32\",\"2606:.../128\"],
        \"private_key\":\"...\",\"peer_public_key\":\"bmXOC...=\",\"pre_shared_key\":\"\",\"reserved\":[...,...,...],
        \"mtu\":1280}",
 "mapping_port":0,"name":"warp-162.159.192.1:2408","port":1080,"socks_port":0}
```
NekoBox **Android**: same wireguard outbound JSON accepted directly via
sing-box-format subscription (1.3.8+) or `.conf` import.

### 2.3 sing-box — WireGuard outbound (≤1.12, deprecated 1.11, removed 1.13)
Fields: `server`, `server_port`, `local_address[]`, `private_key`,
`peer_public_key`, `pre_shared_key` (opt), `reserved[]` (opt), `mtu` (default
1408), `workers`.
```
{"type":"wireguard","tag":"wg","server":"162.159.192.1","server_port":2408,
 "local_address":["172.16.0.2/32","2606:4700:110:.../128"],"private_key":"...",
 "peer_public_key":"bmXOC...=","reserved":[0,0,0],"mtu":1280}
```
**1.13+ WireGuard endpoint** (`endpoints:` — replaces outbound; combines in+out):
```
{"type":"wireguard","tag":"wg-ep","mtu":1408,"address":["172.16.0.2/32"],
 "private_key":"...","peers":[{"address":"162.159.192.1","port":2408,
 "public_key":"bmXOC...=","allowed_ips":["0.0.0.0/0"],"reserved":[0,0,0]}]}
```
SFA/SFI "Remote Profile" fetches a full `config.json` (inbounds/outbounds/routing
required for a runnable profile).

### 2.4 Clash Meta / Mihomo — YAML proxy (source: wiki/metacubex.one `proxies/wg`)
Fields: `server`, `port`, `ip` (+`ipv6`), `private-key`, `public-key`,
`pre-shared-key` (opt), `reserved` (array or base64 string), `udp`, `mtu`,
`remote-dns-resolve`/`dns` (WARP: recommended), `persistent-keepalive`;
multi-peer via `peers: [...]`; AWG via `amnezia-wg-option`.
```yaml
proxies:
  - name: "warp-162.159.192.1:2408"
    type: wireguard
    server: 162.159.192.1
    port: 2408
    ip: 172.16.0.2
    ipv6: 2606:4700:110:....
    private-key: "..."
    public-key: "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
    reserved: [209,98,59]   # or "U4An"
    udp: true
    mtu: 1280
    remote-dns-resolve: true
    dns: [1.1.1.1, 8.8.8.8]
```
Served as **raw YAML** (never base64) for clash clients; mihomo node lists can
also be pulled via `proxy-providers: {type: http, url: ...}` (payload = yaml
with `proxies:`).

### 2.5 AmneziaWG
Official share formats (docs.amnezia.org): `vpn://<compressed json container>`
for the AmneziaVPN app; native `amnezia_for_awg.conf` for the AmneziaWG app —
`.conf` with `Jc, Jmin, Jmax, S1–S4, H1–H4, I1–I5` under `[Interface]` (S1–S4 /
H1–H4 must match server). Plain WG `.conf` works for WARP. Community `awg://`
scheme (used by LxBox, INCY app, etc.): `awg://<base64url(.conf)>#name`.
Official apps have **no subscription URL** — file/QR import only.

### 2.6 Official WireGuard app
Android `TunnelImporter.kt`: import single `.conf` or a **`.zip`** (every
`*.conf` entry becomes a tunnel); QR scan/paste also supported. No net import,
no subscription. iOS mirrors ("Create from file or archive"). So: a sub URL is
meaningless here — serve downloadable `.conf` / `.zip` instead.

### 2.7 Real WARP sub generators (payloads they serve)
- **juerson/wireguard-subconverter-worker** (`?target=`): `v2rayn|wireguard` →
  **base64 of `wireguard://` lines**; `nekoray` → **base64 of
  `nekoray://custom#` lines**; `clash` → **raw full Clash YAML** (subconverter
  template); `hiddify` → JSON. Adds `dns`/`remote-dns-resolve` to clash nodes.
  Also note: it re-rolls random endpoints per refresh (no stored account).
- **BPB Worker Panel** (see bpb-panel.md): WARP sub = same account rendered **per
  endpoint**, offered per core (Xray / sing-box / Clash-Mihomo), plus Best-Ping
  variants.

## 3. Recommended v1 endpoint set for warp-generator

| Endpoint | Payload | Clients served |
|---|---|---|
| `/sub` | base64 or plain list of `wireguard://` lines | v2rayN, v2rayNG, Streisand, **Husi**, Karing (link mode) |
| `/sub/clash` | raw YAML (`proxies` + minimal `proxy-groups`/`rules` + dns) | Mihomo, Clash Verge Rev, FLClash, ClashMetaForAndroid, Karing |
| `/sub/singbox` | full minimal `config.json` (WireGuard **endpoint** shape, 1.13+; legacy outbound shape flagable) | SFA/SFI remote profile, Karing, NekoBox Android (1.3.8+), Husi |
| `/sub/neko` | base64 list of `nekoray://custom#` links | NekoBox desktop |
| `/sub/wg` | `.conf` (one endpoint) or `.zip` of all per-endpoint confs | official WireGuard app, AmneziaWG app, WG Tunnel, WireSock |

Rationale:
- `wireguard://` link-format subs are **interchangeable** between v2rayN-family
  and Husi (both auto-detect plain vs base64) — merge into one `/sub`.
- Clash clients **cannot** parse link lists and v2rayN cannot parse YAML → clash
  must be separate, raw YAML.
- sing-box JSON is its own family; NekoBox Android + Husi + Karing + SFA/SFI can
  all consume it, but **NekoBox desktop cannot** (needs `nekoray://custom#`),
  and **Husi rejects Clash** while Karing accepts it — format per family, no
  single universal payload.
- Official WireGuard/AmneziaWG apps take files, never URLs → static-ish conf/zip
  endpoint; one conf per endpoint, `#` names from endpoint, all sharing the same
  registered WARP keys.
- Optional later: `/sub/awg` (base64url `.conf` lines) for AWG-capable
  third-party clients; `?target=` style single-entry point like juerson if we
  want one URL for everything.

## 4. Sources

- v2rayN wiki, Description of subscription:
  https://github.com/2dust/v2rayN/wiki/Description-of-subscription
- v2rayN WireGuard fmt (wg fields, .conf parse):
  https://github.com/2dust/v2rayN/blob/master/v2rayN/ServiceLib/Handler/Fmt/WireguardFmt.cs
- v2rayN SubscriptionHandler (base64 auto-decode):
  https://github.com/2dust/v2rayN/blob/master/v2rayN/ServiceLib/Handler/SubscriptionHandler.cs
- NekoBox for Android config docs (sub formats, .conf, Reserved):
  https://matsuridayo.github.io/nb4a-configuration/
- NekoBox PC share-link writer (nekoray://custom#):
  https://github.com/MatsuriDayo/nekoray/blob/main/fmt/Bean2Link.cpp ,
  custom-bean model: https://github.com/MatsuriDayo/nekoray/blob/main/fmt/CustomBean.hpp
- Husi wiki — Group (sub types, no Clash, UA):
  https://codeberg.org/xchacha20-poly1305/husi/wiki/Group
- Husi wiki — Proxy Protocol (WireGuard, Reserved):
  https://codeberg.org/xchacha20-poly1305/husi/wiki/Proxy-Protocol
- sing-box WireGuard outbound (deprecated, removed 1.13):
  https://sing-box.sagernet.org/configuration/outbound/wireguard/
- sing-box WireGuard endpoint (1.13+):
  https://sing-box.sagernet.org/configuration/endpoint/wireguard/ ;
  deprecations: https://sing-box.sagernet.org/deprecated/
- sing-box client requirements (Remote Profile, import URL scheme):
  https://sing-box.sagernet.org/clients/general/ ;
  SFA: https://sing-box.sagernet.org/clients/android/
- Mihomo: WireGuard proxy: https://wiki.metacubex.one/en/config/proxies/wg/
- Mihomo: proxy-providers: https://wiki.metacubex.one/en/config/proxy-providers/
- Karing README (sub compatibility):
  https://github.com/KaringX/karing
- AmneziaWG sharing formats (vpn:// vs .conf):
  https://docs.amnezia.org/documentation/instructions/share-connection/
- AmneziaWG protocol params: https://docs.amnezia.org/documentation/amnezia-wg/
- awg:// community scheme: https://docs.incy.cc/en/subscription-format/ ,
  https://github.com/Leadaxe/LxBox
- WireGuard Android importer (.conf/.zip/QR):
  https://github.com/WireGuard/wireguard-android/blob/master/ui/src/main/java/com/wireguard/android/util/TunnelImporter.kt
- Real WARP sub generator payloads:
  https://github.com/juerson/wireguard-subconverter-worker (README, src/worker.js)
- BPB panel (per-endpoint WARP subs): docs/research/bpb-panel.md