# Cloudflare Warp API Research & Implementation Guide

**Research Date:** 2026-08-18  
**Purpose:** Implementation guide for building a Cloudflare Worker that generates Warp configs

---

## Table of Contents

1. [API Overview](#api-overview)
2. [Registration & Authentication Flow](#registration--authentication-flow)
3. [API Endpoints](#api-endpoints)
4. [Configuration Structure](#configuration-structure)
5. [WireGuard Integration](#wireguard-integration)
6. [Cloudflare Workers Constraints](#cloudflare-workers-constraints)
7. [Implementation Notes](#implementation-notes)
8. [Code Examples](#code-examples)
9. [Conversion Methods](#conversion-methods)
10. [Known Limitations](#known-limitations)

---

## API Overview

### Base URL
```
https://api.cloudflareclient.com
```

### API Versions
- **Current (wgcf):** `v0a1922`
- **Current (warp-plus):** `v0a4005`
- Format: `v0a{build_number}`

### Required Headers
```http
User-Agent: okhttp/3.12.1
CF-Client-Version: a-6.3-1922  # or a-6.30-3596 for newer version
Content-Type: application/json; charset=UTF-8
Authorization: Bearer {token}  # for authenticated requests
```

### TLS Requirements
- **Minimum TLS Version:** 1.2
- **Maximum TLS Version:** 1.2
- **HTTP/2:** Disabled (ForceAttemptHTTP2: false)
- API will reject requests with code 403 error 1020 if TLS config doesn't match

---

## Registration & Authentication Flow

### Step-by-Step Process

#### 1. Generate WireGuard Keypair
```
Client generates:
- Private key (32 bytes, Curve25519)
- Public key (derived from private key)
```

#### 2. Register Device
```http
POST /{apiVersion}/reg
Content-Type: application/json

{
  "key": "<PUBLIC_KEY>",
  "install_id": "",
  "fcm_token": "",
  "tos": "2026-08-18T11:50:00.000Z",
  "type": "Android",
  "model": "PC",
  "locale": "en_US",
  "warp_enabled": true
}
```

**Response:**
```json
{
  "id": "<DEVICE_ID>",
  "token": "<ACCESS_TOKEN>",
  "account": {
    "id": "<ACCOUNT_ID>",
    "account_type": "free",
    "created": "2026-08-18T11:50:00.000Z",
    "updated": "2026-08-18T11:50:00.000Z",
    "premium_data": 0,
    "quota": 0,
    "warp_plus": false,
    "referral_count": 0,
    "referral_renewal_countdown": 0,
    "role": "child",
    "license": "<LICENSE_KEY>"
  },
  "config": {
    "client_id": "<CLIENT_ID>",
    "peers": [
      {
        "public_key": "<SERVER_PUBLIC_KEY>",
        "endpoint": {
          "v4": "162.159.193.1",
          "v6": "2606:4700:d0::a29f:c001",
          "host": "engage.cloudflareclient.com",
          "ports": [500, 1701, 2408, 4500, 8080]
        }
      }
    ],
    "interface": {
      "addresses": {
        "v4": "172.16.0.2/32",
        "v6": "2606:4700:110:8xxx:xxxx:xxxx:xxxx:xxxx/128"
      }
    },
    "services": {
      "http_proxy": "socks5://172.16.0.1:1080"
    }
  },
  "key": "<PUBLIC_KEY>",
  "fcm_token": "",
  "name": "WARP",
  "tos": "2026-08-18T11:50:00.000Z",
  "type": "Android",
  "model": "PC",
  "locale": "en_US",
  "enabled": true,
  "install_id": "",
  "created": "2026-08-18T11:50:00.000Z",
  "updated": "2026-08-18T11:50:00.000Z",
  "place": 0,
  "warp_enabled": true,
  "waitlist_enabled": false
}
```

#### 3. Use Access Token
All subsequent requests require `Authorization: Bearer {token}` header.

---

## API Endpoints

### 1. Register Device
**Endpoint:** `POST /{apiVersion}/reg`

**Request Body:**
```json
{
  "key": "string (WireGuard public key)",
  "install_id": "string (optional)",
  "fcm_token": "string (optional)",
  "tos": "string (ISO 8601 timestamp)",
  "type": "string (Android/iOS/Windows/macOS/Linux)",
  "model": "string",
  "locale": "string (e.g., en_US)",
  "warp_enabled": true
}
```

**Response:** Full Identity object with token

---

### 2. Get Account Info
**Endpoint:** `GET /{apiVersion}/reg/{deviceId}/account`

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "id": "string",
  "account_type": "free|unlimited",
  "created": "string",
  "updated": "string",
  "premium_data": 0,
  "quota": 0,
  "usage": 0,
  "warp_plus": false,
  "referral_count": 0,
  "referral_renewal_countdown": 0,
  "role": "string",
  "license": "string"
}
```

---

### 3. Update Account (Add License Key)
**Endpoint:** `PUT /{apiVersion}/reg/{deviceId}/account`

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "license": "string (Warp+ license key)"
}
```

**Response:** Updated account info with `warp_plus: true`

**Important:** Known bug - existing accounts that have connected to Warp VPN cannot upgrade to Warp+. You must register a new account and immediately add the license before connecting.

---

### 4. Get Source Device
**Endpoint:** `GET /{apiVersion}/reg/{deviceId}`

**Headers:** `Authorization: Bearer {token}`

**Response:** Full device info including config and account

---

### 5. Update Source Device (Rotate Keys)
**Endpoint:** `PATCH /{apiVersion}/reg/{deviceId}`

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "key": "string (new public key)"
}
```

**Response:** Updated device info with new config

---

### 6. Get Bound Devices
**Endpoint:** `GET /{apiVersion}/reg/{deviceId}/account/devices`

**Headers:** `Authorization: Bearer {token}`

**Response:** Array of devices linked to this account (max 5)

---

### 7. Update Bound Device
**Endpoint:** `PATCH /{apiVersion}/reg/{deviceId}/account/reg/{boundDeviceId}`

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "name": "string (optional)",
  "active": true|false
}
```

---

### 8. Delete Bound Device
**Endpoint:** `DELETE /{apiVersion}/reg/{deviceId}/account/reg/{boundDeviceId}`

**Headers:** `Authorization: Bearer {token}`

**Response:** 204 No Content

---

### 9. Reset Account License
**Endpoint:** `POST /{apiVersion}/reg/{deviceId}/account/license`

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "license": "string (new license key)"
}
```

---

### 10. Get Client Config
**Endpoint:** `GET /{apiVersion}/client_config`

**Response:** Global client configuration (denylist, captive portal detection, etc.)

---

## Configuration Structure

### Full Identity Object
```typescript
interface Identity {
  id: string;                    // Device ID
  token: string;                 // Access token for API calls
  private_key: string;           // WireGuard private key (client-side only)
  key: string;                   // WireGuard public key
  account: {
    id: string;
    account_type: string;
    created: string;
    updated: string;
    premium_data: number;
    quota: number;
    usage: number;
    warp_plus: boolean;
    referral_count: number;
    referral_renewal_countdown: number;
    role: string;
    license: string;
    ttl?: string;
  };
  config: {
    client_id: string;
    peers: Array<{
      public_key: string;
      endpoint: {
        v4: string;
        v6: string;
        host: string;
        ports: number[];
      };
    }>;
    interface: {
      addresses: {
        v4: string;              // e.g., "172.16.0.2/32"
        v6: string;              // e.g., "2606:4700:110:8xxx::/128"
      };
    };
    services: {
      http_proxy: string;        // e.g., "socks5://172.16.0.1:1080"
    };
  };
  type: string;
  model: string;
  name: string;
  locale: string;
  enabled: boolean;
  install_id: string;
  fcm_token: string;
  tos: string;
  created: string;
  updated: string;
  place: number;
  warp_enabled: boolean;
  waitlist_enabled: boolean;
}
```

---

## WireGuard Integration

### WireGuard Configuration Format

```ini
[Interface]
PrivateKey = <CLIENT_PRIVATE_KEY>
Address = 172.16.0.2/32, 2606:4700:110:8xxx:xxxx:xxxx:xxxx:xxxx/128
DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001
MTU = 1280

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
```

### Key Components

1. **Interface Section**
   - `PrivateKey`: Client's WireGuard private key (from keypair generation)
   - `Address`: IPv4 and IPv6 addresses from `config.interface.addresses`
   - `DNS`: Cloudflare DNS servers (1.1.1.1, 1.0.0.1)
   - `MTU`: 1280 (default for maximum compatibility)

2. **Peer Section**
   - `PublicKey`: Server's public key from `config.peers[0].public_key`
   - `AllowedIPs`: Route all traffic through tunnel
   - `Endpoint`: Server endpoint from `config.peers[0].endpoint`
   - Ports available: 500, 1701, 2408, 4500, 8080

### MTU Considerations
- Default: 1280 (matches official Android app)
- Can be increased for better performance if network supports it
- Lower values increase reliability, higher values increase speed

---

## Cloudflare Workers Constraints

### Relevant Limits for Warp API Integration

| Constraint | Free Plan | Paid Plan | Impact |
|------------|-----------|-----------|--------|
| CPU Time | 10ms | 30s-5min | API calls are I/O-bound, minimal CPU usage |
| Memory | 128MB | 128MB | Sufficient for JSON processing |
| Subrequests | 50/request | 10,000/request | Each Warp API call = 1 subrequest |
| Daily Requests | 100,000 | Unlimited | Free plan may be insufficient for public service |
| Request Size | 100MB | 100-500MB | JSON payloads are small (~10KB) |
| Response Size | No limit | No limit | Configs are small (~5KB) |

### Key Considerations

1. **CPU Time**: Not a concern - Warp API calls are primarily network I/O
2. **Subrequests**: 
   - Registration flow: 1-2 subrequests (register + optional license update)
   - Config retrieval: 1 subrequest
   - Free plan: 50 subrequests is more than enough
3. **CORS**: Must be configured if accessed from browser
4. **TLS Configuration**: 
   - Workers cannot customize TLS version per-request
   - Default Workers TLS settings should work with Cloudflare's API
5. **Rate Limiting**: No official rate limits documented, but implement sensible throttling

### Worker Implementation Pattern

```javascript
export default {
  async fetch(request, env, ctx) {
    // 1. Generate WireGuard keypair
    // 2. Call Warp API to register
    // 3. Optionally add license key
    // 4. Format response as WireGuard config or JSON
    // 5. Return to client
  }
}
```

### Storage Options
- **KV**: Store generated configs (cache for repeated requests)
- **Durable Objects**: Rate limiting, quota management
- **R2**: Archive configs for later retrieval
- **D1**: Track usage analytics

---

## Implementation Notes

### Security Considerations

1. **Private Key Handling**
   - Generate on client-side OR in Worker
   - Never log or store private keys unnecessarily
   - If generating in Worker, return immediately to client

2. **Token Management**
   - Access tokens are bearer tokens
   - Store securely if caching configs
   - Tokens appear to be long-lived (no expiration info in API)

3. **License Key Validation**
   - Only official Warp+ subscriptions work
   - Referral keys and other methods may not work
   - Validation happens server-side

4. **Rate Limiting**
   - No documented API rate limits
   - Implement client-side rate limiting to be respectful
   - Consider caching configs for repeated requests

### Best Practices

1. **Error Handling**
   - API returns standard HTTP status codes
   - Parse error messages from response body
   - Common errors: 403 (TLS config), 400 (invalid input), 401 (invalid token)

2. **Endpoint Selection**
   - Multiple ports available: 500, 1701, 2408, 4500, 8080
   - Default to 2408 (most commonly used)
   - Allow users to specify alternative ports for restrictive networks

3. **IPv6 Support**
   - Both IPv4 and IPv6 addresses provided
   - Include both in WireGuard config
   - Server supports dual-stack

4. **Device Type**
   - API accepts: Android, iOS, Windows, macOS, Linux
   - Use "Android" for maximum compatibility
   - Model can be any string ("PC", "Server", etc.)

---

## Code Examples

### 1. Generate WireGuard Keypair (JavaScript/Workers)

```javascript
// Using Web Crypto API (available in Workers)
async function generateWireGuardKeypair() {
  // WireGuard uses Curve25519 for key exchange
  const keypair = await crypto.subtle.generateKey(
    {
      name: "X25519",
    },
    true,
    ["deriveKey", "deriveBits"]
  );

  const privateKeyBytes = await crypto.subtle.exportKey("raw", keypair.privateKey);
  const publicKeyBytes = await crypto.subtle.exportKey("raw", keypair.publicKey);

  // Convert to base64
  const privateKey = btoa(String.fromCharCode(...new Uint8Array(privateKeyBytes)));
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(publicKeyBytes)));

  return { privateKey, publicKey };
}
```

**Note:** Workers support X25519 (Curve25519) via Web Crypto API.

### 2. Register Device

```javascript
async function registerWarpDevice(publicKey, apiVersion = "v0a4005") {
  const response = await fetch(`https://api.cloudflareclient.com/${apiVersion}/reg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "User-Agent": "okhttp/3.12.1",
      "CF-Client-Version": "a-6.30-3596",
    },
    body: JSON.stringify({
      key: publicKey,
      install_id: "",
      fcm_token: "",
      tos: new Date().toISOString(),
      type: "Android",
      model: "PC",
      locale: "en_US",
      warp_enabled: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
```

### 3. Add License Key

```javascript
async function addLicenseKey(deviceId, token, licenseKey, apiVersion = "v0a4005") {
  const response = await fetch(
    `https://api.cloudflareclient.com/${apiVersion}/reg/${deviceId}/account`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "User-Agent": "okhttp/3.12.1",
        "CF-Client-Version": "a-6.30-3596",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ license: licenseKey }),
    }
  );

  if (!response.ok) {
    throw new Error(`License update failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
```

### 4. Generate WireGuard Config

```javascript
function generateWireGuardConfig(identity, privateKey) {
  const { config } = identity;
  const peer = config.peers[0];
  
  // Parse addresses
  const ipv4 = config.interface.addresses.v4;
  const ipv6 = config.interface.addresses.v6;
  
  // Choose endpoint (default to port 2408)
  const endpoint = `${peer.endpoint.host}:2408`;
  
  const wgConfig = `[Interface]
PrivateKey = ${privateKey}
Address = ${ipv4}, ${ipv6}
DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001
MTU = 1280

[Peer]
PublicKey = ${peer.public_key}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${endpoint}
`;

  return wgConfig;
}
```

### 5. Complete Worker Example

```javascript
export default {
  async fetch(request, env, ctx) {
    try {
      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      // Parse request (optional license key)
      const url = new URL(request.url);
      const licenseKey = url.searchParams.get("license");
      const format = url.searchParams.get("format") || "wireguard"; // wireguard, json

      // Generate keypair
      const { privateKey, publicKey } = await generateWireGuardKeypair();

      // Register device
      const identity = await registerWarpDevice(publicKey);

      // Add license if provided
      if (licenseKey) {
        await addLicenseKey(identity.id, identity.token, licenseKey);
        // Refresh identity to get updated account info
        const updatedIdentity = await getSourceDevice(identity.id, identity.token);
        Object.assign(identity, updatedIdentity);
      }

      // Format response
      let responseBody, contentType;
      if (format === "wireguard") {
        responseBody = generateWireGuardConfig(identity, privateKey);
        contentType = "text/plain";
      } else {
        responseBody = JSON.stringify({
          private_key: privateKey,
          config: generateWireGuardConfig(identity, privateKey),
          identity: identity,
        }, null, 2);
        contentType = "application/json";
      }

      return new Response(responseBody, {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};

// Helper functions from examples above would go here
```

---

## Conversion Methods

### WireGuard to V2Ray/Xray

V2Ray and Xray don't natively support WireGuard protocol. You need to:

1. **Run WireGuard locally** and use it as an outbound
2. **Use sing-box** (supports WireGuard natively)
3. **Chain protocols**: WireGuard → SOCKS5 → V2Ray

### WireGuard to Amnezia

Amnezia VPN supports WireGuard with obfuscation. Format:

```
wireguard://<base64_encoded_config>
```

Example conversion:
```javascript
function toAmneziaFormat(wgConfig) {
  const base64Config = btoa(wgConfig);
  return `wireguard://${base64Config}`;
}
```

### WireGuard to sing-box

sing-box supports WireGuard natively:

```json
{
  "type": "wireguard",
  "tag": "warp",
  "server": "engage.cloudflareclient.com",
  "server_port": 2408,
  "local_address": [
    "172.16.0.2/32",
    "2606:4700:110:8xxx::/128"
  ],
  "private_key": "<PRIVATE_KEY>",
  "peer_public_key": "<SERVER_PUBLIC_KEY>",
  "mtu": 1280
}
```

### WireGuard to Clash

Clash Meta supports WireGuard:

```yaml
proxies:
  - name: "WARP"
    type: wireguard
    server: engage.cloudflareclient.com
    port: 2408
    ip: 172.16.0.2
    ipv6: 2606:4700:110:8xxx::
    private-key: <PRIVATE_KEY>
    public-key: <SERVER_PUBLIC_KEY>
    udp: true
    mtu: 1280
```

### WireGuard URI Format (Throne/Mahsang)

Throne uses `wg://` protocol:
```
wg://<base64_encoded_json>
```

Where JSON is:
```json
{
  "name": "WARP",
  "address": ["172.16.0.2/32", "2606:4700:110:8xxx::/128"],
  "private_key": "<PRIVATE_KEY>",
  "public_key": "<SERVER_PUBLIC_KEY>",
  "endpoint": "engage.cloudflareclient.com:2408",
  "mtu": 1280
}
```

---

## Known Limitations

### API Limitations

1. **Account Upgrade Bug**
   - Existing accounts that have connected cannot upgrade to Warp+
   - Must register fresh account and add license immediately
   - Affects official app users trying to add keys retroactively

2. **Device Limit**
   - Maximum 5 devices per account
   - Must remove old devices to add new ones

3. **License Key Restrictions**
   - Only official Warp+ subscriptions work
   - Referral-based keys may not activate
   - Keys from third-party sources likely won't work

4. **No Official API Documentation**
   - All knowledge reverse-engineered
   - API may change without notice
   - No official support or SLA

### WireGuard Limitations

1. **MTU**
   - Default 1280 for compatibility
   - May need adjustment for specific networks
   - Higher MTU = better performance but less compatibility

2. **Endpoint Selection**
   - Multiple ports available but not all networks allow all ports
   - Port 2408 is most commonly open
   - Consider allowing user-specified ports

3. **NAT Traversal**
   - UDP-based protocol
   - May require port forwarding in some networks
   - Consider offering multiple endpoint options

### Workers Limitations

1. **TLS Configuration**
   - Cannot customize per-request TLS version
   - Workers default TLS should work but not guaranteed

2. **Crypto API**
   - X25519 support available but may have compatibility differences
   - Test thoroughly with actual WireGuard implementations

3. **Response Size**
   - Configs are small, not a practical limitation
   - JSON responses with full identity data still under 10KB

---

## Rate Limits & Quotas

### Observed Behavior
- No hard rate limits documented
- API appears to handle reasonable request volumes
- Consider implementing client-side throttling (e.g., 1 request/second)

### Recommendations
- Cache generated configs when possible
- Use Workers KV for config storage (1GB free)
- Implement exponential backoff for retries
- Monitor for 429 (Too Many Requests) responses

---

## Testing & Validation

### Connectivity Test
After generating a config, test with:
```bash
curl -x socks5://127.0.0.1:8086 http://connectivity.cloudflareclient.com/cdn-cgi/trace
```

Look for:
```
warp=on      # Free Warp
warp=plus    # Warp+
```

### Config Validation
Ensure generated config includes:
- Valid private/public keypair
- IPv4 and IPv6 addresses
- Server public key
- Valid endpoint (host:port)

---

## Additional Resources

### Tools & Libraries
- **wgcf**: https://github.com/ViRb3/wgcf
- **warp-plus**: https://github.com/bepass-org/warp-plus
- **WireGuard Tools**: https://www.wireguard.com/
- **OpenAPI Spec**: Available in wgcf repository

### Testing
- **Warp Endpoint**: `engage.cloudflareclient.com`
- **Connectivity Test**: `http://connectivity.cloudflareclient.com/cdn-cgi/trace`
- **DNS Test**: Query 1.1.1.1 for warp detection

---

## Summary

### Key Takeaways

1. **Registration is straightforward**: Generate keypair → POST to /reg → Get config
2. **No authentication required** for initial registration
3. **Access tokens** used for subsequent operations
4. **Warp+ upgrade** must happen immediately after registration
5. **WireGuard config** is easily generated from API response
6. **Workers are suitable** for this use case (low CPU, low memory, simple I/O)
7. **No official API docs** - rely on reverse engineering
8. **Multiple conversion formats** available for different VPN clients

### Implementation Checklist

- [ ] Implement WireGuard keypair generation
- [ ] Create registration flow
- [ ] Add optional license key support
- [ ] Generate WireGuard config output
- [ ] Add JSON output option
- [ ] Implement error handling
- [ ] Add CORS headers
- [ ] Consider caching with KV
- [ ] Add rate limiting
- [ ] Test connectivity
- [ ] Document usage
- [ ] Add conversion utilities (Amnezia, sing-box, etc.)

---

**End of Research Document**
