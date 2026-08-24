# BPB Panel (Cloudflare Worker VPN Panel) - Deep Analysis

**Repo:** https://github.com/bia-pain-bache/BPB-Worker-Panel  
**Stars:** 13.1k | **Forks:** 31.5k | **License:** GPL-3.0  
**Language:** TypeScript (bundled to single worker.js ~364KB)  
**Latest:** v5.0.0 (2026-07-08)

---

## 1. Architecture Overview

```
src/
  worker.ts              # Entry point - route dispatcher
  auth/auth.ts           # JWT authentication
  handlers/
    subscription.ts      # Subscription endpoint router
    panel.ts             # Admin panel + settings API
    login.ts             # Login page
    doh.ts               # DNS-over-HTTPS server
    websocket.ts         # WebSocket proxy handler
    telegram.ts          # Telegram bot integration
    proxy-ip.ts          # Proxy IP handler
    qrcode.ts            # QR code generation
  cores/
    common.ts            # Raw/base64 subscription (URL configs)
    wireguard.ts         # WireGuard .conf ZIP generation
    xray/configs.ts      # Xray JSON config generation
    sing-box/configs.ts  # Sing-box JSON config generation
    clash/configs.ts     # Clash/Mihomo JSON config generation
  protocols/
    vless.ts             # VLESS protocol handler
    trojan.ts            # Trojan protocol handler
    common.ts            # Shared protocol utils
  settings/
    settings.ts          # Global state, defaults, subscription defs
    kv.ts                # KV CRUD (read/write settings)
    main.ts              # Embedded settings, script builder
    validators.ts        # Settings validation
  types/
    settings.ts          # TypeScript interfaces
```

---

## 2. Subscription Endpoint Implementation

### URL Structure

```
https://{worker-domain}/{SECURE_PATH}/sub/{type}/{client}
```

**Route:** `/{securePath}/sub` → `handleSubscriptions()`

**Types (path segment 4):**
| Type | Description |
|------|-------------|
| `normal` | Standard VLESS/Trojan configs |
| `raw` | Base64-encoded URL configs (no settings applied) |
| `fragment` | Fragment-obfuscated configs (Xray/Sing-box only) |
| `warp` | Cloudflare Warp WireGuard configs |
| `warp-pro` | Warp Pro with Amnezia noise |
| `share-settings` | Export current panel settings as base64 |

**Client (path segment 5 - from `?app=` query param):**
| Client Value | Core | Output Format |
|---|---|---|
| `xray` | Xray-core | JSON array of configs |
| `sing-box` | Sing-box | JSON config object |
| `clash` | Clash Meta/Mihomo | YAML-compatible JSON |
| `wireguard` | Native WireGuard | ZIP of .conf files |
| `xray-knocker` | Xray with Knocker noise | JSON array |
| `amnezia` | Amnezia/WG Tunnel | ZIP with noise params |

### Client Detection

The `client` parameter comes from the `?app=` query parameter on the URL:
```typescript
client: decodeURIComponent(searchParams.get('app') ?? '')
```

### Full URL Examples

```
# Normal VLESS/Trojan for v2rayNG
https://worker.example.com/abc123/sub/normal?app=xray

# Normal for sing-box
https://worker.example.com/abc123/sub/normal?app=sing-box

# Fragment for Xray
https://worker.example.com/abc123/sub/fragment?app=xray

# Raw/base64 subscription
https://worker.example.com/abc123/sub/raw?app=xray

# Warp for Clash
https://worker.example.com/abc123/sub/warp?app=clash

# WireGuard .conf ZIP
https://worker.example.com/abc123/sub/warp?app=wireguard

# Warp Pro for Amnezia
https://worker.example.com/abc123/sub/warp-pro?app=amnezia
```

---

## 3. Format Support Matrix

| Format | Normal | Fragment | Raw | Warp | Warp Pro |
|--------|--------|----------|-----|------|----------|
| **Xray JSON** | ✅ | ✅ | - | ✅ | ✅ |
| **Sing-box JSON** | ✅ | ✅ | ✅ | ✅ | - |
| **Clash JSON** | ✅ | - | - | ✅ | ✅ |
| **WireGuard .conf ZIP** | - | - | - | ✅ | - |
| **Amnezia .conf ZIP** | - | - | - | - | ✅ |
| **Base64 URL list** | - | - | ✅ | - | - |

---

## 4. Subscription Generation Patterns

### 4a. Xray JSON Config (Normal/Fragment)

Returns a JSON **array** of full Xray configs (one per server node):

```json
[
  {
    "remarks": "💦 1 - VLESS 443 1.2.3.4",
    "version": { "min": "26.2.6" },
    "log": { "loglevel": "warning" },
    "dns": { ... },
    "inbounds": [
      { "tag": "mixed", "protocol": "mixed", "port": 10808 },
      { "tag": "dokodemo", "protocol": "dokodemo-door", "port": 10809 }
    ],
    "outbounds": [
      {
        "tag": "proxy",
        "protocol": "vless",
        "settings": {
          "vnext": [{
            "address": "1.2.3.4",
            "port": 443,
            "users": [{ "id": "uuid-here", "encryption": "none" }]
          }]
        },
        "streamSettings": {
          "network": "ws",
          "wsSettings": { "path": "/path?ed=2560" },
          "security": "tls",
          "tlsSettings": { "serverName": "sni.example.com", "fingerprint": "chrome" }
        }
      },
      { "protocol": "dns", "tag": "dns-out" },
      { "protocol": "freedom", "tag": "direct" },
      { "protocol": "blackhole", "tag": "block" }
    ],
    "routing": { ... },
    "observatory": { ... }
  }
]
```

**Key points:**
- Each config is self-contained with inbounds (mixed + dokodemo), outbounds, DNS, routing
- "Best Ping" configs have `observatory` + `balancers` for auto-selection
- Fragment configs add `streamSettings.tcpSettings.fragment` fields
- Response: `Content-Type: application/json`, `Content-Disposition: attachment; filename=bpb-normal-xray.json`

### 4b. Sing-box JSON Config

Returns a single JSON config object with selector groups:

```json
{
  "log": { ... },
  "dns": { ... },
  "inbounds": [ { "type": "tun" }, { "type": "mixed" } ],
  "outbounds": [
    { "type": "shadowsocks", "tag": "...", ... },
    { "type": "selector", "tag": "✅ Selector", "outbounds": [...] },
    { "type": "direct", "tag": "direct" }
  ],
  "endpoints": [ { "type": "wireguard", "tag": "...", ... } ],
  "route": { ... },
  "experimental": { "clash_api": { ... } }
}
```

**Key points:**
- Warp endpoints go in the top-level `endpoints` array (sing-box 1.12+)
- Selector groups organize proxies by category (Best Ping, chain, etc.)
- `Content-Disposition: attachment; filename=bpb-normal-sing-box.json`

### 4c. Clash JSON Config

Single config object in Clash/Mihomo format:

```yaml
mixed-port: 7890
ipv6: true
allow-lan: false
mode: rule
dns: { ... }
tun: { ... }
proxies: [ ... ]
proxy-groups: [ ... ]
rules: [ ... ]
```

### 4d. Raw/Base64 URL Subscription

**This is the classic VPN subscription format:**

```typescript
// Each config is a vless:// or trojan:// URL
const config = new URL(`${protocol}://config`);
config.username = vlUUID;  // or trPass
config.hostname = addr;
config.port = port;
config.searchParams.append('host', host);
config.searchParams.append('type', 'ws');
config.searchParams.append('security', security);
config.hash = remark;  // #remark
// ... more params

// All URLs concatenated with newlines, then base64-encoded
const configs = base64EncodeUtf8(VLConfs + TRConfs + chainConfig + customConfs);

return new Response(configs, {
    headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Profile-Title': `base64:${base64EncodeUtf8('💦 BPB Raw')}`,
    }
});
```

**Key points:**
- One URL per line, newline-separated
- Whole thing base64-encoded as a single blob
- `Content-Type: text/plain; charset=utf-8`
- `Profile-Title` header carries the base64-encoded panel name (for client display)
- Includes chain proxy and custom subscription aggregation

### 4e. WireGuard .conf ZIP

Uses `JSZip` to bundle multiple .conf files:

```typescript
const zip = new JSZip();

warpEndpoints?.forEach((endpoint, index) => {
    const conf = [
        '[Interface]',
        `PrivateKey = ${privateKey}`,
        `Address = 172.16.0.2/32, ${warpIPv6}`,
        `DNS = ${warpRemoteDNS}`,
        'MTU = 1280',
        // Amnezia noise params if isPro:
        // `Jc = ${amneziaNoiseCount}`,
        // `Jmin = ${amneziaNoiseSizeMin}`,
        // `Jmax = ${amneziaNoiseSizeMax}`,
        // 'S1 = 0', 'S2 = 0', 'H1 = 1', 'H2 = 2', 'H3 = 3', 'H4 = 4'
        '',
        '[Peer]',
        `PublicKey = ${publicKey}`,
        'AllowedIPs = 0.0.0.0/0, ::/0',
        `Endpoint = ${endpoint}`,
        'PersistentKeepalive = 25'
    ].join('\n');

    zip.file(`${_project_}-Warp-${index + 1}.conf`, conf);
});

const zipBlob = await zip.generateAsync({ type: 'blob' });

return new Response(arrayBuffer, {
    headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=bpb-warp-wireguard-conf.zip`,
    },
});
```

**Key points:**
- One .conf per endpoint
- Amnezia noise parameters (Jc/Jmin/Jmax/S1-S2/H1-H4) added for Pro configs
- `Content-Type: application/zip`
- ZIP returned as `ArrayBuffer`

---

## 5. KV Storage Schema

### KV Keys

| Key | Type | Description |
|-----|------|-------------|
| `proxySettings` | JSON string → `KvSettings` | All proxy/config settings |
| `warpAccounts` | JSON string → `WarpAccount[]` | Warp account keys (2 accounts) |
| `pwd` | string | Panel password |
| `secretKey` | string (hex) | JWT signing secret (32 bytes random) |
| `telegramBot` | JSON string → `TelegramBot` | Bot token + user ID |

### KvSettings Shape (stored as `proxySettings`)

```typescript
interface KvSettings {
    // DNS
    remoteDNS: string;           // "https://8.8.8.8/dns-query"
    remoteDnsHost: DnsHost;
    localDNS: string;
    antiSanctionDNS: string;
    
    // Connection
    enableIPv6: boolean;
    fakeDNS: boolean;
    allowLANConnection: boolean;
    logLevel: string;
    fingerprint: string;
    enableTFO: boolean;
    
    // Protocols & Ports
    protocols: string;           // "vless,trojan"
    ports: number[];             // [443, 8443, ...]
    
    // Proxy Chain
    chainProxy: string;
    chainProxyParams: any;
    upstreamProxy: string;
    upstreamParams: { upstreamServer, upstreamPort };
    
    // Clean IPs / CDN
    cleanIPs: string[];
    customCdnAddrs: string[];
    customCdnHost: string;
    customCdnSni: string;
    customDomain: string;
    
    // Fragment
    fragmentMode: string;
    fragmentLengthMin/Max: number;
    fragmentDelayMin/Max: number;
    fragmentPackets: string;
    
    // ECH
    enableECH: boolean;
    echServerName: string;
    
    // Warp
    warpRemoteDNS: string;
    warpEndpoints: string[];
    warpBestPingInterval: number;
    warpReservedBytes: boolean;
    
    // Routing
    bypassIran/China/Russia: boolean;
    bypassOpenAi/GoogleAi/Microsoft: boolean;
    blockAds/Porn/Malware/Phishing: boolean;
    customBypassRules: string[];
    customBlockRules: string[];
    
    // External
    customSubs: string[];
    customConfigs: string[];
    
    // Metadata
    panelVersion: string;
}
```

### WarpAccount Shape (stored as `warpAccounts`)

```typescript
interface WarpAccount {
    privateKey: string;    // Base64 WireGuard private key
    publicKey: string;     // Base64 WireGuard public key
    warpIPv6: string;      // "2606:4700:110:8fd2:.../128"
    reserved: string;      // "N16D" (Cloudflare Warp reserved bytes)
}
```

### Embedded Settings (in worker script, NOT in KV)

```typescript
interface EmbededSettings {
    accID: string;         // Cloudflare account ID
    accEmail: string;      // Cloudflare account email (used as username)
    apiToken: string;      // Cloudflare API token
    vlUUID: string;        // VLESS UUID
    trPass: string;        // Trojan password
    securePath: string;    // Random URL path segment for security
    proxyIpMode: string;   // "proxyip" | "cdn"
    proxyIPs: string[];    // Custom proxy IPs
    prefixes: string[];    // NAT64 prefixes
    fallback: string;      // Fallback domain
    dohUrl: string;        // DoH server URL
    mainDomain: string;    // Primary worker domain
}
```

---

## 6. Authentication Flow

### Login
1. User visits `/{securePath}/login`
2. POST `{ username, password }` to login endpoint
3. Password checked against KV `pwd` key
4. Username must match `accEmail` (Cloudflare email)
5. JWT generated with HS256, signed with random 32-byte secret from KV `secretKey`
6. JWT set as HttpOnly Secure cookie: `jwtToken=...; Path=/; HttpOnly; Secure; Max-Age=86400`
7. Cookie expires in 24 hours

### Panel Access
- All `/{securePath}/panel/*` routes check `authenticate()` first
- If no password set (`pwd` is null), panel is accessible without auth
- If password exists but JWT invalid → redirect to login

### Subscription Access
- **No authentication** — subscriptions are accessed by URL path (`/{securePath}/sub/...`)
- Security through obscurity: the `securePath` random segment acts as a secret URL prefix
- This is by design: VPN clients need to access subscriptions without auth

### Key Pattern: `SECURE_PATH`
```typescript
// Secure path is a random string generated during deployment
// It's embedded in the worker script, not in KV
// Example: /a8f3k2m9/sub/normal?app=xray
```

---

## 7. Response Headers

All subscription responses share common headers:

```typescript
{
    'Content-Type': varies by format (see below),
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Disposition': `attachment; filename=bpb-{type}-{core}.{ext}`,
    'Access-Control-Allow-Origin': '*',  // for share-settings only
}
```

| Format | Content-Type | File Extension |
|--------|-------------|----------------|
| Xray/Sing-box JSON | `application/json` | `.json` |
| Clash JSON | `application/json` | `.json` |
| Raw base64 | `text/plain; charset=utf-8` | (no file) |
| WireGuard ZIP | `application/zip` | `.zip` |
| Share settings | `text/plain; charset=utf-8` | `.dat` |

Special headers:
- `Profile-Title` (Raw only): `base64:${base64EncodeUtf8('💦 BPB Raw')}` — client reads this for display
- `DNS` (Raw only): remote DNS value for client DNS config

---

## 8. WireGuard/Warp Support

### Yes, full WireGuard support

**Warp subscription** (`/sub/warp`):
- Generates standard WireGuard .conf files
- Uses Cloudflare Warp accounts (2 hardcoded default accounts)
- Endpoints from `warpEndpoints` setting (default: `engage.cloudflareclient.com:2408`)
- Returns ZIP with one .conf per endpoint
- Includes both Warp (local IPs) and WoW (foreign IPs) configs

**Warp Pro** (`/sub/warp-pro`):
- Adds Amnezia obfuscation noise parameters:
  - `Jc`, `Jmin`, `Jmax` — noise packet count/size
  - `S1`, `S2`, `H1-H4` — static noise headers
- For AmneziaVPN and WG Tunnel clients

**Default Warp accounts (hardcoded fallbacks):**
```typescript
const warpAccounts = [
    {
        privateKey: '4NyxMUme2zGv5r3QWI0hJBlNglm1J/thoCE55PK29G8=',
        publicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
        warpIPv6: '2606:4700:110:8fd2:11f3:8e67:11d4:3704/128',
        reserved: 'N16D'
    },
    {
        privateKey: 'aPQwXZBOndL0km0Swo0ArDOoy3bjeZzTu+/d4YHxW04=',
        publicKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
        warpIPv6: '2606:4700:110:859d:1029:4dfa:bf63:ff08/128',
        reserved: 'SmWi'
    }
];
```

---

## 9. Clever Patterns Worth Copying

### 1. Secure Path Obscurity
```typescript
// Random path prefix for ALL routes — prevents URL guessing
const securePath = EMBEDED_SETTINGS.securePath;
// URLs become: /a8f3k2m9/sub/normal, /a8f3k2m9/panel, etc.
```
**Why:** Simple but effective — makes subscription URLs unguessable without requiring per-user tokens.

### 2. Embedded Settings in Script
```typescript
// Main settings (UUID, password, API token) are embedded directly in the worker script
// They're baked in during build, not read from KV on every request
Object.assign(globalThis, { EMBEDED_SETTINGS: {...} });
```
**Why:** Avoids KV read latency on every request for critical auth data. Settings changes require script redeployment.

### 3. Profile-Title Header
```typescript
// Raw subscription includes panel name in response header
'Profile-Title': `base64:${base64EncodeUtf8('💦 BPB Raw')}`
```
**Why:** VPN clients can display the panel name from the subscription response without parsing the body.

### 4. Best Ping with Observatory
```typescript
// Xray configs include observatory for automatic latency-based selection
observatory: {
    subjectSelector: ['proxy'],
    probeUrl: 'https://www.gstatic.com/generate_204',
    probeInterval: '30s',
    enableConcurrency: true
}
```
**Why:** Clients automatically select the fastest server without manual intervention.

### 5. Chain Proxy Tagging
```typescript
// Chain proxy configs use 🔗 emoji prefix for easy identification
const chainRemark = `#${encodeURIComponent('💦 Chain proxy 🔗')}`;
// Original configs always preserved alongside chained versions
```
**Why:** Users always have fallback if chain proxy breaks.

### 6. JSZip for WireGuard Bundles
```typescript
// Multiple .conf files zipped for WireGuard/Amnezia subscriptions
import JSZip from 'jszip';
const zip = new JSZip();
zip.file(`${name}-Warp-${i}.conf`, confContent);
const zipBlob = await zip.generateAsync({ type: 'blob' });
```
**Why:** Standard approach for bundling WireGuard configs — clients expect ZIP.

### 7. Raw Subscription Aggregation
```typescript
// Can fetch external subscriptions and merge them into Raw output
async function fetchCustomSubs(subs: string[]): Promise<string> {
    const results = await Promise.all(subs.map(async (url) => {
        const res = await fetch(url);
        const text = (await res.text()).trim();
        if (isBase64(text)) return base64DecodeUtf8(text);
        return text;
    }));
    return results.filter(Boolean).join('\n');
}
```
**Why:** Allows aggregating other proxy subscriptions into a single output.

### 8. Script Padding (Obfuscation)
```typescript
// Adds random dead code to prevent signature-based blocking
function paddCode() {
    const varCount = Math.floor(Math.random() * 450) + 50;
    // Generates 50-500 random variable declarations
    // Generates 50-500 random function declarations
}
```
**Why:** Makes each deployment slightly different, harder to fingerprint/block.

### 9. HTTP Custom Headers for Client Config
```typescript
// Share-settings response uses Content-Disposition with custom filename
'Content-Disposition': `attachment; filename=${_project_SM_}-settings.dat`
// Raw response uses DNS header for client DNS configuration
'DNS': remoteDNS
```

### 10. Two-Tier Settings (Embedded + KV)
```typescript
// Embedded: UUID, password, API token (baked into script)
// KV: DNS, ports, fragment, routing, warp endpoints (dynamic)
// This avoids KV reads for every request while keeping most settings dynamic
```

---

## 10. Key Code Snippets

### Subscription Router (handlers/subscription.ts)

```typescript
export async function handleSubscriptions(request: Request, env: Env): Promise<Response> {
    await setSettings(env);
    const { pathname, client } = getGlobals();
    const path = pathname.split('/')[3];  // Extract type from URL

    switch (path) {
        case 'normal':
            switch (client) {
                case 'xray':     return getXrCustomConfigs(false);
                case 'sing-box': return getSbCustomConfig(false);
                case 'clash':    return getClNormalConfig();
            }
        case 'raw':
            switch (client) {
                case 'xray':
                case 'sing-box': return getURLConfigs();
            }
        case 'fragment':
            switch (client) {
                case 'xray':     return getXrCustomConfigs(true);
                case 'sing-box': return getSbCustomConfig(true);
            }
        case 'warp':
            switch (client) {
                case 'xray':       return getXrWarpConfigs(false, false);
                case 'sing-box':   return getSbWarpConfig();
                case 'clash':      return getClWarpConfig(false);
                case 'wireguard':  return getWireguardConfigs(false);
            }
        case 'warp-pro':
            switch (client) {
                case 'xray':         return getXrWarpConfigs(true, false);
                case 'xray-knocker': return getXrWarpConfigs(true, true);
                case 'clash':        return getClWarpConfig(true);
                case 'amnezia':      return getWireguardConfigs(true);
            }
    }
}
```

### WireGuard Config Generation (cores/wireguard.ts)

```typescript
export async function getWireguardConfigs(isPro: boolean): Promise<Response> {
    const { warpIPv6, publicKey, privateKey } = getWarpAccounts()[0];
    const { warpEndpoints, warpRemoteDNS, amneziaNoiseCount, ... } = getSettings();
    const zip = new JSZip();

    warpEndpoints?.forEach((endpoint, index) => {
        const conf = [
            '[Interface]',
            `PrivateKey = ${privateKey}`,
            `Address = 172.16.0.2/32, ${warpIPv6}`,
            `DNS = ${warpRemoteDNS}`,
            'MTU = 1280',
            ...(isPro ? [
                `Jc = ${amneziaNoiseCount}`,
                `Jmin = ${amneziaNoiseSizeMin}`,
                `Jmax = ${amneziaNoiseSizeMax}`,
                'S1 = 0', 'S2 = 0', 'H1 = 1', 'H2 = 2', 'H3 = 3', 'H4 = 4'
            ] : []),
            '', '[Peer]',
            `PublicKey = ${publicKey}`,
            'AllowedIPs = 0.0.0.0/0, ::/0',
            `Endpoint = ${endpoint}`,
            'PersistentKeepalive = 25'
        ].join('\n');
        zip.file(`${_project_}-Warp-${index + 1}.conf`, conf);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const arrayBuffer = await zipBlob.arrayBuffer();
    return new Response(arrayBuffer, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename=${_project_SM_}-warp-wireguard-conf.zip`,
        },
    });
}
```

### Base64 Raw Subscription (cores/common.ts)

```typescript
export async function getURLConfigs() {
    const { vlUUID, trPass, ports, chainProxy, ... } = getSettings();
    let VLConfs = '', TRConfs = '';

    for (const domain of domains) {
        for (const port of totalPorts) {
            for (const addr of addrs) {
                if (protocols.includes(_VL_)) {
                    const config = new URL(`${_VL_}://config`);
                    config.username = vlUUID;
                    config.searchParams.append('encryption', 'none');
                    config.hostname = addr;
                    config.port = port.toString();
                    config.searchParams.append('host', host);
                    config.searchParams.append('type', 'ws');
                    config.searchParams.append('security', security);
                    config.hash = remark;
                    VLConfs += `${config.href}\n`;
                }
                // ... same for Trojan
            }
        }
    }

    const configs = base64EncodeUtf8(VLConfs + TRConfs + chainConfig + customConfs);
    return new Response(configs, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Profile-Title': `base64:${base64EncodeUtf8('💦 BPB Raw')}`,
        }
    });
}
```

---

## 11. Summary: What to Adopt for warp-generator

1. **Subscription URL pattern:** `/{secretPath}/sub/{type}?app={client}` — clean, extensible
2. **Multiple format support:** Route by client type, generate format-specific output
3. **WireGuard ZIP bundling:** JSZip for .conf files — standard approach
4. **Base64 raw subscription:** URL-per-line base64 format for maximum compatibility
5. **Secure path obscurity:** Random URL prefix as lightweight auth for subscriptions
6. **Response headers:** `Content-Disposition` for file download, `Profile-Title` for client display
7. **No-cache headers:** Always prevent caching subscription responses
8. **Observatory/balancer:** Auto-select best server by latency
9. **Settings separation:** Embedded (auth) vs KV (dynamic config) for performance
10. **External sub aggregation:** Fetch and merge external subscriptions into raw output
