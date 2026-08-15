# WARP Subscription Panel

[Русский](README_ru.md) | [فارسی](README_fa.md) | **English**

Password-gated Cloudflare Worker that manages **one** registered WARP
account and serves per-client WireGuard subscription links over a secret
path. Built as a lean BPB-style panel: no VLESS/Trojan, no routing rules,
no chain proxies — just your WARP keys, your endpoints, seven config
formats, everywhere.

The legacy WARP Configuration Generator (Next.js UI + per-request
registration) is retired — see [docs/adr/0001.md](docs/adr/0001.md) and the
[Legacy](#-legacy) section.

## Features

- **One shared WARP account** per deployment (ADR 0002): registration is
  rate-limited by IP, WARP free is unmetered — register once, serve everyone
  (`docs/adr/0002.md`).
- **Register / Rotate / Import** (import accepts a WireGuard `.conf` or a
  warp-reg-style registration JSON, soft-verified against Cloudflare when
  credentials are present) — so a rate-limited or pre-existing account is
  never a blocker.
- **Endpoint editor + AmneziaWG settings** (Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5)
  stored in KV, applied where the format can express them.
- **One subscription URL per client** — see the formats table. All sub
  routes are edge-cached (6 h) and protected by an unguessable path token
  (ADR 0006): wrong tokens get a 404, never a 401.
- **Generator tab** — the legacy 7-format generator, now rendering from the
  stored account instead of registering per request. Zero network calls at
  generation time.
- **Zero runtime dependencies** — the worker bundle is plain JS (plus
  `tweetnacl`/`qrcode` for keys and QR). No npm install for the worker.

## Quick start

The operator must be logged in to Cloudflare (`wrangler login`) and run the
interactive wizard — it creates the secrets, the KV namespaces, patches
`wrangler.jsonc`, deploys, and smoke-tests the result:

```bash
wrangler login          # once
./scripts/deploy-warp-panel.sh
```

Walkthrough and troubleshooting: [docs/ops/deploy.md](docs/ops/deploy.md).

### Manual deploy

```bash
wrangler secret put PASSWORD   # panel login (min 12 chars)
wrangler secret put SUB_PATH   # long random token — the subscription credential
wrangler kv namespace create ACCOUNT      # then bind the ids in wrangler.jsonc
wrangler kv namespace create ENDPOINTS
wrangler kv namespace create AWG
wrangler deploy
```

`wrangler.jsonc` ships with every binding commented out — the wizard or the
manual steps above uncomment and fill them. Local development:
`wrangler dev --var PASSWORD:change-me --var SUB_PATH:dev-token`.

## Configuration

| Setting | Where | Meaning |
|---|---|---|
| `PASSWORD` | secret | Session-cookie signing / login secret for the panel gate |
| `SUB_PATH` | secret | The subscription path token — **it IS the credential** (ADR 0006) |
| `ACCOUNT` | KV | The WARP account record — `privateKey`, `clientId`, `token`, `peerPublicKey`, `v4`, `v6`, `reserved`, `source`, `verified`, `verifiedAt`, `registeredAt` — written **only** by Register/Rotate/Import |
| `ENDPOINTS` | KV | Panel settings: the endpoint list (key `endpoints`, one `host:port` per line, v4/v6, any port) |
| `AWG` | KV | Panel settings: AmneziaWG toggle + params (key `awg`) |

## Routes

### Panel (password-gated)

| Route | Purpose |
|---|---|
| `POST /api/auth/login` / `logout` | session setup / teardown |
| `GET /api/account` | current account summary (never keys/token) |
| `POST /api/account/register` | register a fresh WARP account (10 s timeout, okhttp UA) |
| `POST /api/account/rotate` | replace the account with a fresh registration |
| `POST /api/account/import` | store an existing account — conf or registration JSON, soft verification |
| `GET /api/settings` | endpoints + AWG settings |
| `POST /api/settings/endpoints` / `awg` | persist settings |
| `POST /api/generator` | generate any of the 7 config formats from the stored account |

### Subscriptions (path-token, no session, cached 6 h)

| URL | Format | Notes |
|---|---|---|
| `/api/<SUB_PATH>/sub` | wireguard:// links, base64 blob | `?scheme=wg` = Throne-style wg:// links |
| `/api/<SUB_PATH>/sub/clash` | mihomo YAML | one `type: wireguard` proxy per endpoint, `amnezia-wg-option` when AWG is on |
| `/api/<SUB_PATH>/sub/singbox` | sing-box `config.json` | runnable profile (SFA/SFI); `?legacy=1` = pre-1.13 outbound shape (NekoBox/Husi) |
| `/api/<SUB_PATH>/sub/neko` | `nekoray://custom#` links, base64 blob | CustomBean wrapping the sing-box wireguard outbound |
| `/api/<SUB_PATH>/sub/wg` | ZIP of `.conf` files | plain WireGuard, or AmneziaWG confs when AWG is on — official app import |
| `/api/<SUB_PATH>/sub/awg` | `awg://` links, base64 blob | always AWG params inside |

Missing account on a sub route → 503. Wrong token → 404. Endpoint list
empty/invalid on a sub route → the two fallback endpoints
(`162.159.192.1:2408`, `engage.cloudflareclient.com:2408`).

## Formats

WireGuard (`wireguard://` **and** Throne `wg://`), Clash, sing-box, NekoBox,
WireGuard ZIP, and AmneziaWG `awg://` — researched and pinned to each
client's parsing requirements in
[docs/research/sub-formats.md](docs/research/sub-formats.md). Endpoint
semantics are uniform: one config per valid endpoint line, malformed lines
skipped, full tunnel, DNS 1.1.1.1, MTU 1280.

## Security model

- Panel: HMAC-signed session cookie, constant-time compares, wrong password
  never reveals the store layout.
- Subscriptions: the path is the credential — unguessable `SUB_PATH`,
  wrong/missing token → 404 (ADR 0006). No session, no server-side logging
  of tokens.
- KV records: `publicAccount` never exposes keys or tokens; `acceptedSecret`
  checks in tests; worker routes fail fast when a KV binding is missing.

## Development

```bash
node --test            # 218 tests — node:test, zero dependencies
node --check worker/*.js   # syntax gate
node scripts/build-ip-ranges.mjs   # regenerates IP_RANGES in worker/generate.js
```

The worker is the production target (ADR 0003). Everything in `worker/`
is plain ES modules with no build step; the Next.js app, `lib/`, `app/`,
`components/`, `config/`, `functions/` remain in the repo only as history.

## 🗂 Legacy

- The Next.js generator UI and `functions/` (Netlify) are **unmaintained**
  — the panel replaces them (ADR 0004). `README_ru.md` / `README_fa.md`
  describe that retired product.
- The old public `POST /api/generate` route is gone from the worker; the
  Next.js dev server still has its own route handler (only relevant when
  running the legacy app).
- The GitHub Actions workflows shipping Docker/Vercel/Netlify and the
  IP_RANGES rebuild still exist; the rebuild now targets
  `worker/generate.js`.

## Project layout (worker/)

```
worker/
├── index.js       router: auth gate → panel routes → sub routes (no session)
├── auth.js        HMAC session cookie (constant-time compare)
├── account.js     account record + KV helpers (register/rotate/import writers)
├── import.js      conf + registration-JSON parsers, soft verification
├── settings.js    endpoints + AmneziaWG params in KV (with I1 masks)
├── generate.js    the generator engine: 7 format builders + IP_RANGES + QR
├── sub.js         subscription seam: renderSubscription + renderers registry
├── zip.js         storeless ZIP writer (no dependencies)
└── *test.js       218 tests, node:test
```

## 📄 License

MIT — see [LICENCE](LICENCE)