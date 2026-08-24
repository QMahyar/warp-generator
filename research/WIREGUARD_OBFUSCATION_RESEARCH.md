# WireGuard Obfuscation Techniques — Beyond Amnezia Extensions

Research findings on all known WireGuard obfuscation methods, their configurations, and client support.

---

## 1. Obfuscation Taxonomy

WireGuard obfuscation falls into **5 categories**:

| Category | How It Works | Strength | Overhead |
|----------|-------------|----------|----------|
| **A. Header/Padding Modification** | Modify WG packet headers, add junk/padding | Low-Medium | Low |
| **B. Protocol Wrapping** | Wrap WG inside another protocol (TCP, QUIC, TLS) | High | Medium-High |
| **C. Payload Encryption/Masking** | Encrypt or mask WG payload with symmetric crypto | High | Low-Medium |
| **D. Traffic Shaping** | Alter timing, packet sizes, port patterns | Medium | Low |
| **E. Protocol Imitation** | Make WG traffic look like QUIC, DNS, SIP, etc. | Very High | Medium |

---

## 2. Technique Details

### 2A. AmneziaWG (AWG) — Header/Padding Modification

**Category:** A (Header/Padding)  
**What it does:** Modifies WireGuard's fixed packet signatures

**Parameters:**

| Parameter | Range | Purpose | Must Match Peer? |
|-----------|-------|---------|-----------------|
| `Jc` | 0-10 | Number of junk packets before handshake | No (client-only) |
| `Jmin` | 64-1024 | Min junk packet size (bytes) | No |
| `Jmax` | 64-1024 | Max junk packet size (bytes) | No |
| `S1` | 0-64 | Padding for Handshake Initiation (148 bytes base) | **Yes** |
| `S2` | 0-64 | Padding for Handshake Response (92 bytes base) | **Yes** |
| `S3` | 0-64 | Padding for Cookie Reply (64 bytes base) | **Yes** (AWG 2.0) |
| `S4` | 0-32 | Padding for Transport Data | **Yes** (AWG 2.0) |
| `H1` | range/string | Magic header for Init (replaces type field) | **Yes** |
| `H2` | range/string | Magic header for Response | **Yes** |
| `H3` | range/string | Magic header for Cookie Reply | **Yes** |
| `H4` | range/string | Magic header for Transport Data | **Yes** |
| `I1` | binary | Init packet chain (AWG 2.0) — fake protocol header | **Yes** (AWG 2.0) |
| `I2-I5` | binary | Additional chain fields (AWG 2.0) | **Yes** |

**AWG 2.0 I1 imitation modes** (via CPS):
- `quic` — Imitate QUIC Long Header
- `dns` — Imitate DNS query
- `sip` — Imitate SIP signaling
- `stun` — Imitate STUN binding request
- `random` — Random bytes

**Config format:** Extended `.conf` file (INI-style)
```ini
[Interface]
PrivateKey = <base64>
Address = 172.16.0.2, 2606:4700:110:xxxx::xxxx/128
DNS = 1.1.1.1
MTU = 1280
Jc = 8
Jmin = 40
Jmax = 80
S1 = 86
S2 = 118
H1 = 1234567
H2 = 7654321
H3 = 3141592
H4 = 2718281
I1 = <b 0xce000000010897a2...>  # optional, AWG 2.0 only

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
```

**Key rules:**
- S1+148 ≠ S2+92 (must produce different total packet sizes)
- H1-H4 ranges must not overlap
- S1-S4, H1-H4, I1-I5 must match on both peers
- Jc/Jmin/Jmax can differ per peer

---

### 2B. Hiddify WARP Noise — Header/Padding Modification

**Category:** A (Header/Padding)  
**What it does:** Similar to AWG but with different parameter naming and modes

**Parameters (WARP-specific):**

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `ifpm` | Noise header mode | `m4` |
| `ifp` | Noise packet count range | `40-80` |
| `ifps` | Noise packet size range (bytes) | `40-100` |
| `ifpd` | Delay between noise packets (ms) | `4-8` |

**Modes:**

| Mode | Header Type | Fixed/Random | WG Trace |
|------|------------|--------------|----------|
| `m1` | Random | Random each time | Visible |
| `m2` | Random, fixed after first | Fixed | Hidden |
| `m3` | QUIC-based | QUIC structure | Hidden |
| `m4` | QUIC, fixed | Fixed | Hidden (Recommended) |
| `m5` | LQUIC | Lightweight QUIC | Hidden |
| `m6` | LQUIC, fixed | Fixed | Hidden |
| `gHEX` | Custom HEX header | User-defined | Varies |
| `hHEX` | Custom HEX, fixed | User-defined, fixed | Hidden |

**Config format:** WARP URI
```
warp://License@IP:port?ifp=40-80&ifps=40-100&ifpd=4-8&ifpm=m4#name
```

**Config format:** Sing-box JSON (in Hiddify fork)
```json
{
  "type": "wireguard",
  "server": "engage.cloudflareclient.com",
  "server_port": 854,
  "local_address": ["172.16.0.2/32", "2606:4700:110:xxxx::xxxx/128"],
  "private_key": "...",
  "peer_public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
  "reserved": [0, 0, 0],
  "mtu": 1280,
  "fake_packets": "5-10",
  "fake_packet_size": "40-100",
  "fake_packet_delay": "4-8",
  "fake_packet_mode": "quic"
}
```

**Available in:** Hiddify (sing-box fork), Karing, mihomo (Clash Meta) v1.18.9+

---

### 2C. Xray-core UDP Noise — Traffic Shaping

**Category:** D (Traffic Shaping)  
**What it does:** Sends fake UDP packets before WireGuard handshake to bypass first-packet inspection

**Parameters:**

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `noise` | Array of noise packet definitions | see below |
| `noise[].type` | Packet type: `rand` (random), `hex` (fixed bytes) | `"rand"` |
| `noise[].rand` | Random size range for rand packets | `"40-70"` |
| `noise[].packet` | Hex payload for hex packets | `"ee0000000108aaaa"` |
| `noise[].delay` | Delay range in ms | `"5-10"` |

**Config format:** Xray JSON (with finalmask)
```json
{
  "outbounds": [
    {
      "protocol": "wireguard",
      "settings": { "..." : "..." },
      "streamSettings": {
        "network": "raw",
        "finalmask": {
          "udp": [
            {
              "type": "noise",
              "settings": {
                "noise": [
                  { "type": "hex", "packet": "ee0000000108aaaa", "delay": "5-10" },
                  { "rand": "40-70", "delay": "5-15" },
                  { "rand": "40-70", "delay": "5-15" },
                  { "rand": "40-70", "delay": "5-15" }
                ]
              }
            }
          ]
        }
      }
    }
  ]
}
```

**Also known as:** GFW-Knocker's `wnoise`, `wnoisecount`, `wnoisedelay`, `wpayloadsize`

**Available in:** Xray-core (via finalmask), Xray forks with noise support

---

### 2D. swgp-go — Full Packet AEAD Encryption

**Category:** C (Payload Encryption)  
**What it does:** Encrypts entire WireGuard packets, hides handshake completely

**Proxy Modes:**

| Mode | Description | Replay Protection |
|------|-------------|-------------------|
| `zero-overhead-2026` | First 16 bytes AES, handshake XChaCha20-Poly1305 + random padding | Yes (2026+) |
| `paranoid-2026` | All packets padded to MTU, XChaCha20-Poly1305 | Yes (2026+) |
| `zero-overhead` | Legacy (no replay protection) | No |
| `paranoid` | Legacy (no replay protection) | No |

**Config format:** JSON
```json
{
  "servers": [
    {
      "name": "server",
      "proxyListen": ":20220",
      "proxyMode": "zero-overhead-2026",
      "proxyPSK": "base64-encoded-psk",
      "proxyFwmark": 0,
      "wgEndpoint": "[::1]:20221",
      "wgFwmark": 0,
      "mtu": 1500
    }
  ]
}
```

```json
{
  "clients": [
    {
      "name": "client",
      "wgListen": ":20222",
      "wgFwmark": 0,
      "proxyEndpoint": "[server-ip]:20220",
      "proxyMode": "zero-overhead-2026",
      "proxyPSK": "base64-encoded-psk",
      "proxyFwmark": 0,
      "mtu": 1500
    }
  ]
}
```

**Key points:**
- Requires paired server-side wrapper (not compatible with vanilla WG servers)
- WireGuard is completely unaware of swgp-go
- Full-packet AEAD hides packet sizes
- MTU must be set correctly (1500 for standard links)

---

### 2E. gutd (eBPF) — Protocol Imitation + Encryption

**Category:** E (Protocol Imitation) + C (Encryption)  
**What it does:** Wraps WireGuard in protocol envelopes (QUIC, SIP, Syslog) + ChaCha masking

**Obfuscation Modes:**

| Mode | Wire Appearance | Anti-Probing | Ports |
|------|----------------|--------------|-------|
| `quic` | Fake QUIC Long Header + SNI | XDP replies QUIC Version Negotiation | any UDP |
| `gut` | GOST-like random UDP | silent drop | any UDP |
| `sip` | SIP signaling + RTP data | XDP replies 200 OK/401/403 | 5060 + RTP ports |
| `syslog` | Base64 payload in syslog msg | silent drop | any UDP (514 typical) |

**Config format:** INI-style
```ini
[peer]
obfs  = quic
ports = 443
mtu   = 1420
sni   = example.com
key   = <shared key>
```

**MTU overhead:**

| Mode | Overhead | Max Safe WG MTU |
|------|----------|-----------------|
| `quic` | 16 bytes | 1420 |
| `gut` | 10 bytes | 1420 |
| `sip` | 22 bytes | 1400 |
| `syslog` | base64 (~4/3x) | 800 |

**Key features:**
- eBPF kernel datapath (Linux) or pure userspace fallback
- Port striping (multiple ports per peer)
- Probabilistic keepalive drop (timing obfuscation)
- Cross-platform: Linux (eBPF + userspace), Windows, RouterOS

---

### 2F. wg-obfuscator — XOR + STUN Masking

**Category:** A (Header) + E (Protocol Imitation)  
**What it does:** XOR-encodes WG packets + optional STUN masking

**Features:**
- XOR obfuscation with shared key
- STUN masking (makes traffic look like video calls)
- Handshake randomization (variable padding)
- Built-in NAT table for multi-client
- Cross-platform: Linux, Windows, macOS, Android, Docker, OpenWrt, MikroTik

**Config format:** INI-style
```ini
[preset-1]
name = default
extPort = 51822
key = your_xor_key
masking = STUN
idle = 60
dummy = 32
```

**Masking modes:**
- `STUN` — Traffic disguised as STUN (video call protocol)
- `AUTO` — Auto-detect
- `NONE` — XOR only

---

### 2G. Obfuscation-Tunnel — UDP-to-UDP/TCP/ICMP

**Category:** B (Protocol Wrapping)  
**What it does:** Transports WG over different protocols

**Transport modes:**
- **UDP-to-UDP** with header obfuscation (XOR first 16 bytes)
- **UDP-to-TCP** (FakeTCP or native TCP)
- **UDP-to-ICMP** (ping tunnel)

**Obfuscation modules:**
- `header` — XOR first 16 bytes (WireGuard header), optionally XOR next 16 bytes into first 16 to avoid zero-byte fingerprint
- `xor` — XOR entire data stream with key

**Config format:** Command-line flags
```bash
# UDP-to-UDP with header obfuscation
obfuscation-tunnel -l 127.0.0.1:408 -r server:80 -k mysecretkey -o header

# UDP-to-TCP
obfuscation-tunnel -l 127.0.0.1:408 -r server:80 -k mysecretkey -o xor -t tcp

# UDP-to-ICMP
obfuscation-tunnel -l 127.0.0.1:408 -r server:80 -k mysecretkey -o xor -t icmp
```

---

### 2H. Phantun — UDP-to-FakeTCP

**Category:** B (Protocol Wrapping)  
**What it does:** Converts UDP packets into fake TCP streams

**Key characteristics:**
- Designed specifically for WireGuard tunneling
- Minimal overhead (12 bytes)
- Preserves out-of-order delivery
- Does NOT perform TCP retransmission (unlike udp2raw)
- Multi-threaded for performance

**MTU calculation:**
```
WireGuard MTU = Link MTU - IPv4 header (20) - TCP header (20) - WireGuard overhead (32)
             = 1500 - 20 - 20 - 32 = 1428 bytes (IPv4)
             = 1500 - 40 - 20 - 32 = 1408 bytes (IPv6)
```

**Config format:** Command-line
```bash
# Client
phantun_client --local-port 408 --remote-host server-ip --remote-port 80

# Server
phantun_server --local-port 80 --remote-host 127.0.0.1 --remote-port 51820
```

---

### 2I. udp2raw — UDP-over-FakeTCP/ICMP

**Category:** B (Protocol Wrapping)  
**What it does:** Wraps UDP in raw TCP or ICMP with encryption

**Modes:**
- `faketcp` — Default, looks like TCP SYN/ACK
- `udp` — UDP-in-UDP
- `icmp` — ICMP tunnel

**Config format:** Command-line
```bash
# Server
udp2raw -s -l 0.0.0.0:8443 -r 127.0.0.1:51820 -k "shared_key"

# Client
udp2raw -c -l 127.0.0.1:50001 -r SERVER_IP:8443 -k "shared_key"
```

---

### 2J. Mullvad LWO — Lightweight WireGuard Obfuscation

**Category:** A (Header)  
**What it does:** Scrambles WireGuard packet headers with minimal overhead

**Description:**
- Developed by Mullvad VPN (released Nov 2025)
- Scrambles header of each WireGuard packet
- Computationally very cheap (low overhead, good for battery)
- Lower power consumption than Shadowsocks

**Config format:** Mullvad-internal (not publicly documented)

**Available in:** Mullvad VPN app v2025.13+ (Desktop, Android)

---

### 2K. xt_wgobfs — Kernel Module

**Category:** A (Header) + D (Traffic Shaping)  
**What it does:** iptables extension for WG obfuscation

**Features:**
- Obfuscates first 16 bytes of WG message
- Obfuscates mac2 field when all zeros
- Random padding added to messages
- Drops keepalive messages with 80% probability
- Zeroes Diffserv field

**Config format:** iptables rules + shared key
```bash
# Client (before wg up)
iptables -t mangle -I INPUT -p udp --sport 6789 -j WGOBFS --key mysecretkey --unobfs
iptables -t mangle -I OUTPUT -p udp --dport 6789 -j WGOBFS --key mysecretkey --obfs
```

**Available in:** Linux kernel module, cross-platform CLI via rs-wgobfs

---

### 2L. ProxyGuard (eduVPN) — UDP-over-TCP

**Category:** B (Protocol Wrapping)  
**What it does:** Converts WG UDP to TCP, designed for port 443 sharing

**Features:**
- WebSocket-like handshake but uses raw TCP after upgrade
- Can run behind nginx/Apache reverse proxy
- Designed for eduVPN ecosystem

---

### 2M. IVPN V2Ray — WireGuard over VMess

**Category:** B (Protocol Wrapping)  
**What it does:** Wraps WireGuard inside V2Ray VMess protocol

**Variants:**
- VMESS/QUIC — QUIC + TLS + SRTP header
- VMESS/TCP — TCP + HTTP request headers

**Config format:** IVPN app settings (Settings → Connection → Obfuscation)

**Available in:** IVPN apps (Desktop, iOS, Android)

---

## 3. Client Support Matrix

| Client | AWG | Hiddify Noise | Xray Noise | swgp-go | gutd | wg-obfuscator | Mullvad LWO |
|--------|-----|---------------|------------|---------|------|---------------|-------------|
| **Amnezia VPN** | ✅ Official | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Hiddify** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **sing-box (official)** | ❌ Rejected | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **sing-box-extended** | ✅ Fork | ✅ Fork | ❌ | ❌ | ❌ | ❌ | ❌ |
| **mihomo (Clash Meta)** | ✅ v1.18.9+ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Xray-core** | ❌ | ❌ | ✅ (finalmask) | ❌ | ❌ | ❌ | ❌ |
| **NekoBox/NekoRay** | ✅ (nekobox fork) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Karing** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Mullvad** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **IVPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (uses V2Ray) |
| **Mozilla VPN** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (uses udp2tcp) |

---

## 4. Configuration Format Comparison

| Technique | Config Format | Extension | Notes |
|-----------|--------------|-----------|-------|
| AmneziaWG | INI `.conf` | `.conf` | Extended WG config with AWG params |
| Hiddify WARP | URI or Sing-box JSON | URI `.txt` | `warp://` URI or JSON |
| Xray Noise | JSON (finalmask) | `.json` | Part of Xray outbound streamSettings |
| swgp-go | JSON | `.json` | Separate client/server configs |
| gutd | INI | `.conf` | Peer-based config sections |
| wg-obfuscator | INI | `.conf` | Preset-based sections |
| Obfuscation-Tunnel | CLI flags | N/A | Command-line only |
| Phantun | CLI flags | N/A | Command-line only |
| udp2raw | CLI flags | N/A | Command-line only |

---

## 5. What Can Be Applied to Cloudflare WARP?

### Already Working:

| Technique | WARP Compatible? | How |
|-----------|-----------------|-----|
| **AmneziaWG** | ✅ Yes | AWG client → WARP endpoint (S1=0, S2=0, H1=1, H2=2, H3=3, H4=4 for compat mode) |
| **Hiddify Noise** | ✅ Yes | `warp://` URI with noise params |
| **Xray Noise** | ✅ Yes | finalmask on WireGuard outbound |
| **swgp-go** | ⚠️ Needs server | Requires paired swgp-go server (can't use with WARP directly) |
| **gutd** | ⚠️ Needs server | Requires paired gutd server |
| **wg-obfuscator** | ⚠️ Needs server | Requires paired obfuscator server |
| **Mullvad LWO** | ❌ No | Mullvad-proprietary, not for WARP |

### WARP-specific AWG Config:

```ini
[Interface]
PrivateKey = <your-private-key>
Address = 172.16.0.2, 2606:4700:110:xxxx::xxxx/128
DNS = 1.1.1.1, 2606:4700:4700::1111, 1.0.0.1, 2606:4700:4700::1001
MTU = 1280

# AWG 1.5 compat mode (works with vanilla WG servers like WARP)
S1 = 0
S2 = 0
Jc = 8
Jmin = 40
Jmax = 80
H1 = 1
H2 = 2
H3 = 3
H4 = 4

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
PersistentKeepalive = 25
```

### WARP-specific AWG 2.0 Config (with CPS):

```ini
[Interface]
PrivateKey = <your-private-key>
Address = 172.16.0.2, 2606:4700:110:xxxx::xxxx/128
DNS = 1.1.1.1, 1.0.0.1
MTU = 1280
S1 = 0
S2 = 0
S3 = 0
S4 = 0
Jc = 4
Jmin = 40
Jmax = 70
H1 = 1
H2 = 2
H3 = 3
H4 = 4
I1 = <b real-warp-quic-payload>
I2 = <b random-bytes>
I3 = <b random-bytes>
I4 = <b random-bytes>
I5 = <b random-bytes>

[Peer]
PublicKey = bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 162.159.192.1:943
PersistentKeepalive = 25
```

---

## 6. Tools for Config Generation

| Tool | Purpose | Output |
|------|---------|--------|
| `warp-awg-gen` | Generate AWG 2.0 configs for WARP | `.conf` files |
| `warpscout` | Scan WARP endpoints + find working AWG params | CLI |
| `amneziawg-go` | AWG library (Go) | N/A (library) |
| `amnezia-wireguard-tools` | WG ↔ AWG conversion | `.conf` files |
| `cheburbox` | sing-box config generator with AWG support | `config.json` |
| `Phobos` | WireGuard admin panel + STUN obfuscator | Docker |

---

## 7. Key Takeaways for warp-generator

1. **Most common obfuscation in practice:** AWG (AmneziaWG) with compat mode params is the standard for WARP in censored regions (Russia, Iran)

2. **No single "wireguard noise" format** — each client uses different parameter names:
   - AWG: `Jc, Jmin, Jmax, S1-S4, H1-H4`
   - Hiddify: `ifp, ifps, ifpd, ifpm`
   - Xray: `finalmask.udp.noise[]`
   - gutd: `obfs=, ports=, sni=`

3. **Config conversion is non-trivial** — converting between AWG `.conf` and Hiddify URI requires mapping different parameter spaces

4. **WARP compatibility:** AWG with `S1=0, S2=0, H1=1, H2=2, H3=3, H4=4` is the minimal obfuscation that maintains WG compatibility with vanilla servers

5. **Anti-probing (responding to DPI probes):** Only gutd and swgp-go actively respond to DPI probes; AWG/Hiddify noise only masks the initial handshake

---

## Sources

- https://github.com/Advanced-WG/awgctrl-go/blob/main/docs/AWG_PARAMETERS.md
- https://www.ntkernel.com/the-imitation-game-how-modern-solutions-make-wireguard-invisible-to-dpi/
- https://lists.zx2c4.com/pipermail/wireguard/2026-April/009563.html
- https://hiddify.com/app/How-to-use-WARP-on-Hiddify-App/
- https://github.com/XTLS/Xray-core/issues/4372
- https://github.com/XTLS/Xray-core/issues/4309
- https://github.com/database64128/swgp-go
- https://github.com/sh0rch/packetveil
- https://github.com/ClusterM/wg-obfuscator
- https://github.com/RoliSoft/Obfuscation-Tunnel
- https://github.com/dndx/phantun
- https://mullvad.net/en/blog/introducing-lightweight-wireguard-obfuscation
- https://www.ivpn.net/blog/v2ray-obfuscation-available-all-ivpn-platforms/
- https://github.com/Skiro1/warp-awg-gen
- https://github.com/vernette/warpscout
