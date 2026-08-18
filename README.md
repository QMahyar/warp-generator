# Warp Generator

A self-hosted Cloudflare Worker that manages Cloudflare Warp WireGuard configurations and generates VPN client subscriptions in 9 formats.

## Features

- **Account Management** — Generate new Warp accounts via API or import existing `.conf`/`wg://` configs
- **9 Subscription Formats** — WireGuard .conf (vanilla + Amnezia), Throne wg://, wireguard://, Sing-box JSON, Xray JSON, Clash YAML, V2RayN base64
- **Endpoint Presets** — Manage Cloudflare endpoint IP:port pairs (5 defaults included)
- **Amnezia Obfuscation** — Global defaults + per-account overrides (Jc, Jmin, Jmax, S1, S2, H1-H4)
- **Admin Dashboard** — SPA UI with account list, subscription URLs, preset editor, settings
- **Subscription Caching** — 5-minute KV cache with auto-invalidation on account edits
- **Password Auth** — bcrypt-hashed password, HttpOnly session cookies, 24h expiry

## Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Cloudflare account (free tier works)

### Step-by-step

1. **Clone and install:**
   ```bash
   git clone <repo-url> warp-generator
   cd warp-generator
   npm install
   ```

2. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

3. **Create KV namespace:**
   ```bash
   wrangler kv:namespace create WARP_KV
   wrangler kv:namespace create WARP_KV --preview
   ```
   Copy the `id` values into `wrangler.toml`:
   ```toml
   kv_namespaces = [
     { binding = "WARP_KV", id = "YOUR_KV_NAMESPACE_ID" }
   ]
   ```

4. **Deploy:**
   ```bash
   wrangler deploy
   ```

5. **First-run setup:**
   - Visit `https://<your-worker>.workers.dev/admin/setup`
   - Create a password (min 8 characters)
   - You'll be redirected to login

6. **Create your first account:**
   - Login at `/admin`
   - Click "Create Account" (uses Warp API) or "Import Config" (paste existing `.conf`/`wg://`)
   - Copy a subscription URL and paste into your VPN client

### Local Development

```bash
wrangler dev --local
```

Then visit `http://localhost:8787/admin/setup`.

## API Reference

All API routes require a valid session cookie (except subscription URLs).

### Account API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/account` | List all accounts |
| `GET` | `/api/account/{id}` | Get account details |
| `POST` | `/api/account/generate` | Generate new Warp account (`{name}`) |
| `POST` | `/api/account/import` | Import config (`{name, config}`) |
| `PUT` | `/api/account/{id}` | Update account (`{name?, endpoint_list?, amnezia_overrides?}`) |
| `DELETE` | `/api/account/{id}` | Delete account |
| `POST` | `/api/account/{id}/regenerate-token` | Generate new subscription token |

### Preset API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/presets` | List all presets |
| `POST` | `/api/presets` | Create preset (`{name, endpoints: [{ip, port}]}`) |
| `PUT` | `/api/presets/{id}` | Update preset |
| `DELETE` | `/api/presets/{id}` | Delete preset (fails if in use) |

### Settings API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings/amnezia` | Get Amnezia defaults |
| `PUT` | `/api/settings/amnezia` | Update Amnezia defaults (`{Jc?, Jmin?, Jmax?, S1?, S2?, H1?, H2?, H3?, H4?}`) |

### Subscription URLs (no auth required)

| Format | Route |
|--------|-------|
| WireGuard .conf (ZIP) | `/sub/{token}/wireguard-conf` |
| WireGuard .conf Amnezia (ZIP) | `/sub/{token}/wireguard-conf-amnezia` |
| Throne wg:// URI | `/sub/{token}/throne` |
| Throne wg:// Amnezia | `/sub/{token}/throne-amnezia` |
| wireguard:// URI | `/sub/{token}/wireguard-uri` |
| Sing-box JSON | `/sub/{token}/singbox` |
| Xray JSON | `/sub/{token}/xray` |
| Clash YAML | `/sub/{token}/clash` |
| V2RayN Base64 | `/sub/{token}/v2rayn` |

## cf-scanner Integration

Use [cf-scanner](https://github.com/your-repo/cf-scanner) to find the fastest Warp endpoints for your network:

1. Run cf-scanner to get a list of IP:port pairs with latency scores
2. In the admin dashboard, go to Settings → Endpoint Presets → Add Preset
3. Enter the scanned IP:port pairs
4. Create an account and select your custom preset
5. Subscription URLs will use only your scanned endpoints

## VPN Client Compatibility

| Format | Clients |
|--------|---------|
| WireGuard .conf | WireSock, WireGuard,任何 WG 客户端 |
| Throne wg:// | Throne VPN |
| wireguard:// | V2RayN |
| Sing-box JSON | Hiddify, NekoBox |
| Xray JSON | V2RayN (Xray), xray CLI |
| Clash YAML | Clash Verge, Clash Meta |
| V2RayN Base64 | V2RayN |

## Amnezia Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Jc | 0-200 | 5 | Junk packet count |
| Jmin | 0-1280 | 50 | Junk packet min size |
| Jmax | 0-1280 | 1000 | Junk packet max size |
| S1 | 0-255 | 0 | Init packet junk size |
| S2 | 0-255 | 0 | Response packet junk size |
| H1 | 0-4294967295 | 1 | Init packet magic header |
| H2 | 0-4294967295 | 2 | Response packet magic header |
| H3 | 0-4294967295 | 3 | Transport packet magic header |
| H4 | 0-4294967295 | 4 | Cookie reply magic header |

## Troubleshooting

### "Warp API rate limited"
Wait 60 seconds and try again. The Warp API limits registration requests.

### "Subscription not found"
The token is invalid or the account was deleted. Regenerate the token from the account detail page.

### "Preset in use"
An account is using this preset. Delete or reassign the account first.

### Password reset
No built-in recovery. Delete the password from KV:
```bash
wrangler kv:key delete --namespace-id=<YOUR_ID> "settings:password"
```
Then visit `/admin/setup` to create a new password.

### Local dev: KV not working
Make sure you're using `wrangler dev --local` (local persistence). Remote KV bindings don't work in dev mode.

### Subscription not updating
Subscriptions are cached for 5 minutes. Edit the account to invalidate cache, or wait.

## Input Validation

All API endpoints validate inputs per SPEC.md AC11:

| Field | Rule |
|-------|------|
| Account name | 1-100 chars, no control characters |
| Config import | 100 bytes - 10KB |
| Private key | Valid base64, 32 bytes decoded |
| IP/endpoint | Valid IPv4/IPv6 or domain (max 253 chars) |
| Port | 1-65535 |
| Jc | 0-200 |
| Jmin, Jmax | 0-1280 |
| S1, S2 | 0-255 |
| H1-H4 | 0-4294967295 |
| Password | 8-128 chars |

Invalid inputs return `400` with a specific error message.

## Known Limitations

- Warp API is unofficial and may change without notice
- Free tier: 100k KV reads/day, 1k writes/day, 1GB storage
- No multi-admin support (single password, last-write-wins)
- No email recovery (manual KV delete required)
- Subscription tokens are public URLs (standard for VPN subscriptions)

## License

MIT
