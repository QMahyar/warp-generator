# WireGuard/Warp Client Support Research

Research findings on VPN clients that support WireGuard/Warp configurations and their subscription formats.

## Summary Table

| Client | WG Support | Amnezia Support | Config Format | Subscription Format | Docs/Repo Link |
|--------|------------|-----------------|---------------|---------------------|----------------|
| **Xray-core** | ✅ Yes | ❌ No | JSON outbound | N/A (core, not client) | [GitHub](https://github.com/XTLS/Xray-core) / [Docs](https://xtls.github.io/config/outbounds/wireguard.html) |
| **V2RayN/V2RayNG** | ✅ Yes (via Xray) | ❌ No | Xray JSON | Sing-box, V2ray, Clash formats | [V2RayNG](https://github.com/2dust/v2rayNG) / [V2RayN](https://github.com/2dust/v2rayN) |
| **Clash Meta (mihomo)** | ✅ Yes | ❌ No | YAML proxy | YAML subscription | [GitHub](https://github.com/MetaCubeX/mihomo) |
| **sing-box** | ✅ Yes (deprecated in 1.11.0) | ❌ No | JSON outbound | JSON subscription | [GitHub](https://github.com/SagerNet/sing-box) / [Docs](https://sing-box.sagernet.org/configuration/outbound/wireguard/) |
| **Hiddify / HiddifyNG** | ✅ Yes (via sing-box) | ❌ No | Sing-box JSON | Sing-box, ClashMeta, V2ray formats | [GitHub](https://github.com/hiddify/hiddify-app) |
| **NekoBox / NekoRay** | ✅ Yes (via sing-box) | ❌ No | Sing-box JSON | Sing-box, ClashMeta, V2ray, Shadowsocks formats | [GitHub](https://github.com/MatsuriDayo/NekoBoxForAndroid) |
| **Shadowrocket** | ⚠️ Unknown | ⚠️ Unknown | Proprietary | Proprietary | Closed source (iOS only) |
| **Amnezia VPN** | ✅ Yes (official) | ✅ Yes (official) | Extended .conf | N/A (standalone client) | [GitHub](https://github.com/amnezia-vpn/amneziawg-windows-client) |
| **Oblivion Desktop** | ✅ Yes (Warp-based) | ⚠️ Partial | Warp config | N/A (Warp client) | [GitHub](https://github.com/bepass-org/oblivion-desktop) |
| **Throne VPN** | ✅ Yes | ⚠️ Yes (enable_amnezia flag) | `wg://` URI | N/A (known from user context) | User-provided format |
| **Exclave** | ✅ Yes | ⚠️ Possibly | `wireguard://` URI | ⚠️ Unknown | Need more research |
| **Mahsang** | ✅ Yes | ⚠️ Possibly | `wireguard://` URI (Amnezia variant) | ⚠️ Unknown | Need more research |
| **Official WireGuard** | ✅ Yes (vanilla only) | ❌ No | .conf file | N/A | [WireGuard.com](https://www.wireguard.com/) |

## Detailed Findings

### 1. Xray-core (Core - Not Client)

**WireGuard Support:** ✅ Yes  
**Amnezia Support:** ❌ No  
**Config Format:** JSON outbound

**Structure:**
```json
{
  "type": "wireguard",
  "tag": "wireguard-out",
  "server": "127.0.0.1",
  "server_port": 1080,
  "local_address": ["10.0.0.1/32"],
  "private_key": "YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=",
  "peer_public_key": "Z1XXLsKYkYxuiYjJIkRvtIKFepCYHTgON+GwPq7SOV4=",
  "pre_shared_key": "31aIhAPwktDGpH4JDhA8GNvjFXEf/a6+UaQRyOAiyfM=",
  "reserved": [0, 0, 0],
  "mtu": 1408
}
```

**Key Parameters:**
- `reserved`: Warp-specific reserved bytes (3 bytes array)
- `mtu`: Typically 1408 for IPv6, 1440 for IPv4
- Multi-peer support available

**Links:**
- Docs: https://xtls.github.io/config/outbounds/wireguard.html
- Repo: https://github.com/XTLS/Xray-core

---

### 2. V2RayN / V2RayNG

**WireGuard Support:** ✅ Yes (via Xray-core)  
**Amnezia Support:** ❌ No  
**Config Format:** Xray JSON format  
**Subscription Format:** Supports Sing-box, V2ray, Clash, ClashMeta formats

**Details:**
- V2RayNG: Android client (61.2k stars)
- V2RayN: Windows/Linux/macOS desktop client
- Uses Xray-core or V2fly-core as backend
- Parses subscription links but only extracts outbound/node info
- Routing rules from subscriptions are ignored

**Supported Subscription Formats:**
- Some widely used formats (Shadowsocks, ClashMeta, v2rayN)
- Sing-box outbound format

**Links:**
- V2RayNG: https://github.com/2dust/v2rayNG
- V2RayN: https://github.com/2dust/v2rayN

---

### 3. Clash Meta (mihomo)

**WireGuard Support:** ✅ Yes  
**Amnezia Support:** ❌ No (vanilla WireGuard only)  
**Config Format:** YAML proxy configuration  
**Subscription Format:** YAML-based

**Note:** The Clash Meta documentation for WireGuard proxies was not accessible (404 errors on wiki.metacubex.one), but the project clearly lists WireGuard support in its documentation.

**Structure (Expected):**
```yaml
proxies:
  - name: "wg-example"
    type: wireguard
    server: example.com
    port: 51820
    ip: 10.0.0.2
    private-key: "xxxxx"
    public-key: "xxxxx"
    pre-shared-key: "xxxxx"
    mtu: 1420
```

**Links:**
- Repo: https://github.com/MetaCubeX/mihomo
- Website: https://wiki.metacubex.one

---

### 4. sing-box

**WireGuard Support:** ✅ Yes (deprecated in 1.11.0, removed in 1.13.0)  
**Amnezia Support:** ❌ No  
**Config Format:** JSON outbound  
**Subscription Format:** JSON-based

**Deprecation Notice:** WireGuard outbound is deprecated as of sing-box 1.11.0 and will be removed in 1.13.0. Users should migrate to the WireGuard endpoint feature instead.

**Structure:**
```json
{
  "type": "wireguard",
  "tag": "wireguard-out",
  "server": "127.0.0.1",
  "server_port": 1080,
  "local_address": ["10.0.0.1/32"],
  "private_key": "YNXtAzepDqRv9H52osJVDQnznT5AM11eCK3ESpwSt04=",
  "peer_public_key": "Z1XXLsKYkYxuiYjJIkRvtIKFepCYHTgON+GwPq7SOV4=",
  "pre_shared_key": "31aIhAPwktDGpH4JDhA8GNvjFXEf/a6+UaQRyOAiyfM=",
  "reserved": [0, 0, 0],
  "mtu": 1408
}
```

**Links:**
- Repo: https://github.com/SagerNet/sing-box
- Docs: https://sing-box.sagernet.org/configuration/outbound/wireguard/

---

### 5. Hiddify / HiddifyNG

**WireGuard Support:** ✅ Yes (via sing-box backend)  
**Amnezia Support:** ❌ No  
**Config Format:** Sing-box JSON  
**Subscription Format:** Supports Sing-box, ClashMeta, V2ray formats

**Details:**
- Multi-platform: Android, iOS, Windows, macOS, Linux
- Based on sing-box universal proxy toolchain
- 32.2k stars on GitHub
- Supports wide range of protocols: Vless, Vmess, Reality, TUIC, Hysteria, WireGuard, SSH, etc.
- Open source and community-driven

**Subscription Support:**
- Sing-box format
- Clash Meta format
- V2ray format

**Links:**
- Repo: https://github.com/hiddify/hiddify-app
- Website: https://hiddify.com

---

### 6. NekoBox / NekoRay

**WireGuard Support:** ✅ Yes (via sing-box)  
**Amnezia Support:** ❌ No  
**Config Format:** Sing-box JSON  
**Subscription Format:** Multiple formats supported

**Details:**
- Android version: NekoBox (22.4k stars)
- Desktop version: NekoRay
- Based on sing-box universal proxy toolchain
- Supports plugins for extended protocol support

**Supported Protocols:**
- SOCKS (4/4a/5), HTTP(S), SSH
- Shadowsocks, VMess, Trojan, VLESS
- AnyTLS, ShadowTLS, TUIC
- Hysteria 1/2, WireGuard
- Via plugins: Trojan-Go, NaïveProxy, Mieru

**Subscription Formats:**
- Shadowsocks format
- ClashMeta format
- v2rayN format
- Sing-box outbound format

**Links:**
- Repo: https://github.com/MatsuriDayo/NekoBoxForAndroid
- Website: https://matsuridayo.github.io

---

### 7. Shadowrocket

**WireGuard Support:** ⚠️ Unknown  
**Amnezia Support:** ⚠️ Unknown  
**Config Format:** Proprietary (closed source)  
**Subscription Format:** Proprietary

**Details:**
- iOS only (closed source)
- Popular in circumvention communities
- No public documentation available for WireGuard support
- Requires further investigation or direct testing

---

### 8. Amnezia VPN

**WireGuard Support:** ✅ Yes (official client)  
**Amnezia Support:** ✅ Yes (official implementation)  
**Config Format:** Extended .conf file with Amnezia parameters  
**Subscription Format:** N/A (standalone client)

**Amnezia Extensions:**
- `Jc` (Junk packet count)
- `Jmin` (Junk packet minimum size)
- `Jmax` (Junk packet maximum size)
- `S1` (Init packet junk size)
- `S2` (Response packet junk size)
- `H1`, `H2`, `H3`, `H4` (Init packet magic header)

**Config Example:**
```ini
[Interface]
PrivateKey = xxxxx
Address = 10.0.0.2/32
DNS = 1.1.1.1
Jc = 4
Jmin = 50
Jmax = 1000
S1 = 20
S2 = 30
H1 = 1
H2 = 2
H3 = 3
H4 = 4

[Peer]
PublicKey = xxxxx
Endpoint = example.com:51820
AllowedIPs = 0.0.0.0/0
```

**Links:**
- Windows client: https://github.com/amnezia-vpn/amneziawg-windows-client
- Main project: https://github.com/amnezia-vpn

---

### 9. Oblivion Desktop

**WireGuard Support:** ✅ Yes (Warp-based)  
**Amnezia Support:** ⚠️ Partial (may support Warp's obfuscation)  
**Config Format:** Warp configuration  
**Subscription Format:** N/A (Warp client)

**Details:**
- Unofficial Cloudflare Warp client for Windows/Mac/Linux
- 8.3k stars on GitHub
- Uses WireGuard with Cloudflare Warp technology
- Supports multiple methods: WARP, Gool, Cfon (Psiphon), Masque
- Open source (Electron + TypeScript + Golang backend)

**Features:**
- TUN mode with sing-box
- System proxy with PAC
- Routing rules support
- Built-in scanner and ping tools

**Links:**
- Repo: https://github.com/bepass-org/oblivion-desktop

---

### 10. Throne VPN

**WireGuard Support:** ✅ Yes  
**Amnezia Support:** ⚠️ Yes (via `enable_amnezia=true` flag)  
**Config Format:** `wg://` URI  
**Subscription Format:** N/A

**URI Format (from user context):**
```
wg://[base64-encoded-config]?enable_amnezia=true
```

**Details:**
- Known format from user's existing implementation
- Supports both vanilla and Amnezia WireGuard
- URI scheme: `wg://`
- Amnezia support via query parameter

---

### 11. Exclave

**WireGuard Support:** ✅ Yes  
**Amnezia Support:** ⚠️ Possibly  
**Config Format:** `wireguard://` URI (standard scheme)  
**Subscription Format:** ⚠️ Unknown

**Details:**
- Need more research to determine exact URI format
- Likely uses standard `wireguard://` URI scheme
- Amnezia support status unknown

---

### 12. Mahsang

**WireGuard Support:** ✅ Yes  
**Amnezia Support:** ⚠️ Possibly (Amnezia variant)  
**Config Format:** `wireguard://` URI (Amnezia-aware)  
**Subscription Format:** ⚠️ Unknown

**Details:**
- Need more research to determine exact URI format
- Mentioned in Xray-core README as supporting Amnezia
- Likely uses `wireguard://` scheme with Amnezia extensions

---

## Key Observations

### URI Schemes

1. **Throne VPN:** `wg://[base64]?enable_amnezia=true`
2. **Exclave:** `wireguard://[params]` (vanilla)
3. **Mahsang:** `wireguard://[params]` (with Amnezia extensions)

### JSON-based Clients (Sing-box ecosystem)

All use similar structure:
- Hiddify
- NekoBox/NekoRay
- sing-box native clients

### Xray-based Clients

- V2RayN/V2RayNG
- Various Xray-compatible clients

### Amnezia Support Status

**Full Support:**
- Amnezia VPN (official)

**Partial/Unknown:**
- Throne VPN (via flag)
- Mahsang (likely supports)
- Exclave (unknown)

**No Support:**
- Xray-core
- Sing-box
- Clash Meta
- V2Ray family
- Hiddify
- NekoBox

### Popular in Censorship-Heavy Regions

**Iran:**
- Hiddify (Persian language support)
- V2RayNG
- NekoBox
- Oblivion (Warp-based, popular for Iran)

**China:**
- V2RayN
- Clash Meta
- sing-box
- NekoRay

**Russia:**
- Hiddify
- V2RayNG
- Amnezia VPN

## Subscription Format Recommendations

Based on the research, for maximum compatibility:

1. **JSON Format (Sing-box style)** - Supported by:
   - Hiddify
   - NekoBox/NekoRay
   - sing-box (though WG is deprecated)

2. **Xray JSON Format** - Supported by:
   - V2RayN/V2RayNG
   - All Xray-compatible clients

3. **YAML Format (Clash style)** - Supported by:
   - Clash Meta
   - Clash Verge

4. **URI Formats:**
   - `wg://` for Throne VPN
   - `wireguard://` for Exclave/Mahsang (needs verification)

## Recommendations for Your Project

For outputting Warp subscriptions:

1. **Primary formats to support:**
   - Sing-box JSON (most compatible with modern clients)
   - Xray JSON (V2Ray ecosystem)
   - Standard .conf file (official WireGuard clients)

2. **URI formats:**
   - `wg://` (Throne VPN)
   - `wireguard://` (Exclave/Mahsang - needs more research)

3. **Amnezia extensions:**
   - Only Amnezia VPN officially supports them
   - Throne VPN has partial support via flag
   - Other clients: no support

4. **Subscription aggregation:**
   - Consider providing multiple format outputs
   - Use content negotiation or format parameter
   - Include format detection in subscription responses

## Further Research Needed

1. **Shadowrocket:** Closed source, need direct testing
2. **Exclave URI format:** Need to find documentation or example configs
3. **Mahsang URI format:** Need to find documentation or example configs
4. **Clash Meta WireGuard:** Documentation was unavailable (404 errors)

---

**Research Date:** August 18, 2026  
**Research Focus:** WireGuard/Warp client support and subscription formats for censorship circumvention
