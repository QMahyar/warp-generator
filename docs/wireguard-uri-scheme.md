# `wireguard://` URI Scheme Research

## Overview

The `wireguard://` URI scheme is a **de facto standard** used by sing-box based Android VPN clients to encode WireGuard configuration in a single URI string. It is NOT an official IANA-registered scheme, nor is it part of the WireGuard specification.

## URI Format

```
wireguard://<PRIVATE_KEY>@<SERVER_IP>:<SERVER_PORT>?<query_params>#<label>
```

### Components

| Component | Required | Description |
|-----------|----------|-------------|
| `PRIVATE_KEY` | Yes | Client private key (base64). URL-encoded in userinfo. |
| `SERVER_IP` | Yes | Server IP address or hostname |
| `SERVER_PORT` | Yes | Server UDP port |
| Query params | Yes | Key-value pairs (see below) |
| `#label` | No | Fragment used as tag/remark |

### Query Parameters

| Parameter | Required | Type | Example | Description |
|-----------|----------|------|---------|-------------|
| `publickey` | Yes | base64 | `bmXOC...%3D` | Server public key |
| `address` | Yes | CIDR | `172.16.0.2/32` | Client tunnel address(es), comma-separated |
| `allowedips` | Yes | CIDR list | `0.0.0.0/0,::/0` | Routes through tunnel |
| `dns` | No | IP | `1.1.1.1` | DNS server |
| `mtu` | No | int | `1280` | MTU (default: 1420) |
| `keepalive` | No | int (sec) | `25` | Persistent keepalive interval |
| `presharedkey` | No | base64 | `abc...=` | Pre-shared key |
| `listenport` | No | int | `10000` | Local listen port (default: 0 = random) |
| `name` | No | string | `warp` | Interface name |

### Encoding Rules

- `/` → `%2F`
- `,` → `%2C`
- `:` → `%3A`
- `+` → `%2B`
- `=` → `%3D`

## Example: Cloudflare Warp

Given:
- Private key: `YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=`
- Server public key: `bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=`
- Client addresses: `172.16.0.2/32, 2606:4700:110:8d4a:ca6:b507:215:d04f/128`
- Endpoint: `162.159.192.1:2408`
- MTU: `1280`

```
wireguard://YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04%3D@162.159.192.1:2408?publickey=bmXOC%2BF1FxEMF9dyiK2H5%2F1SUtzH0JuVo51h2wPfgyo%3D&address=172.16.0.2%2F32%2C2606%3A4700%3A110%3A8d4a%3Aca6%3Ab507%3A215%3Ad04f%2F128&allowedips=0.0.0.0%2F0%2C%3A%3A%2F0&mtu=1280#Cloudflare%20Warp
```

### Simplified (single address only)

```
wireguard://YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04%3D@162.159.192.1:2408?publickey=bmXOC%2BF1FxEMF9dyiK2H5%2F1SUtzH0JuVo51h2wPfgyo%3D&address=172.16.0.2%2F32&allowedips=0.0.0.0%2F0%2C%3A%3A%2F0&mtu=1280#Cloudflare%20Warp
```

## Comparison: `wireguard://` vs `wg://`

| Aspect | `wireguard://` | `wg://` |
|--------|----------------|---------|
| Origin | De facto standard in sing-box ecosystem | Throne VPN proprietary |
| Private key | In userinfo (`@` before host) | Query param `private_key` |
| Public key | Query param `publickey` | Query param `public_key` |
| Endpoint | Host + port in authority | Query param or host:port |
| Address | Query param `address` | Query param `local_address` |
| AllowedIPs | Query param `allowedips` | Not standard (embedded) |
| Keepalive | `keepalive` | `persistent_keepalive_interval` |
| MTU | `mtu` | `mtu` |
| PresharedKey | `presharedkey` | `preshared_key` |
| Amnezia ext | **NOT supported** | Supported (via Throne) |
| Fragment `#` | Label/remark | Profile ID number |

### Key Structural Difference

**`wg://`** (Throne):
```
wg://HOST:PORT?private_key=X&public_key=Y&local_address=Z&mtu=N&persistent_keepalive_interval=M#ID
```

**`wireguard://`**:
```
wireguard://PRIVATE_KEY@HOST:PORT?publickey=X&address=Y&allowedips=Z&mtu=N#Label
```

The `wireguard://` format puts the private key in the URI userinfo (before `@`), which is more conventional for URI schemes but requires careful URL-encoding.

## Clients Supporting `wireguard://`

1. **Exclave** (formerly SagerNet fork) - Android proxy client
   - GitHub: `ExclaveNetwork/Exclave`
   - Uses sing-box core
   - Supports WireGuard as proxy (not VPN)

2. **MahsaNG** - Android VPN client for censorship circumvention
   - GitHub: `GFW-knocker/MahsaNG`
   - Uses custom sing-box core ("Mahsa Core")
   - Version 11+ added WireGuard support

3. **singbox-launcher** - Sing-box configuration launcher
   - GitHub: `Leadaxe/singbox-launcher`
   - Has formal spec document for `wireguard://` parsing

4. Other sing-box based clients that implement the same parser

## Standardization Status

**NOT standardized.** This is a community-driven de facto format that emerged from:
1. The sing-box project's endpoint configuration
2. Need for single-line import (QR codes, clipboard sharing)
3. Consistency with other sing-box proxy URI schemes (`vless://`, `trojan://`, etc.)

The closest thing to a specification is the singbox-launcher SPECS document at:
`github.com/Leadaxe/singbox-launcher/blob/main/SPECS/009-F-C-WIREGUARD_URI/SPEC.md`

## Differences from Standard WireGuard Config

| WireGuard Config | `wireguard://` URI |
|------------------|-------------------|
| `[Interface]` section fields | Query params `address`, `mtu`, `dns`, `listenport` |
| `[Peer]` section fields | Query params `publickey`, `allowedips`, `endpoint` (in host:port) |
| `PrivateKey` | URI userinfo (before `@`) |
| `PresharedKey` | `presharedkey` query param |
| `Endpoint` | `<host>:<port>` in authority |
| `PersistentKeepalive` | `keepalive` query param |
| `Table`, `PreUp`, `PostUp` | Not supported |
| `FwMark` | Not supported |

## Notes

- AmneziaWG extensions (Jc, Jmin, Jmax, S1, S2, H1-H4, I1-I5) are **NOT** part of the `wireguard://` URI scheme
- The scheme is primarily used for sharing configs via clipboard/QR, not for programmatic configuration
- Some implementations may accept standard WireGuard config files (starting with `[Interface]`) as an alternative import method
