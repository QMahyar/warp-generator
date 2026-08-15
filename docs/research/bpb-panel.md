# Research: BPB Worker Panel — the reference for our WARP subscription service

Source: https://github.com/bia-pain-bache/BPB-Worker-Panel (README) and
https://bia-pain-bache.github.io/BPB-Worker-Panel/ (usage/config docs).
Research date: 2026-08-15. Findings only — no code copied.

## What BPB is

A GUI panel running entirely on Cloudflare Workers/Pages that hands out proxies.
It serves **VLESS, Trojan and Warp (WireGuard) configs**, plus a private DoH
server, chain proxies, fragment, and routing rules (block porn/ads/malware,
bypass sanctions). Built for censorship-heavy regions (Iran, China, Russia).

Relevance: its **Warp subscription feature** is exactly the shape we want.
Everything else (VLESS, Trojan, DoH, chaining, fragment) is the "bloat" we are
deliberately NOT building.

## Facts that matter for our design

### WARP subscriptions (the core reference)
- The Warp subscription includes: a **Warp config** (node IPs from the user's
  region) and a **WoW (Warp-on-Warp) config** (foreign Cloudflare IPs, mostly
  Germany), plus **Best Ping** variants that test endpoints every 30 s
  (configurable 10–90 s).
- **"Editing the Endpoints in Warp General settings adds additional Warp and
  WoW configs based on the specified Endpoints."** — i.e. one subscription =
  the same WARP account, rendered once **per endpoint**. This is the
  endpoint:port → per-endpoint config model the user described.
- **"Renew Warp Accounts": updating the accounts retrieves new Warp accounts
  from Cloudflare** — registration against `api.cloudflareclient.com` is built
  in, and it re-registers rather than importing.
- WARP configs are WireGuard-based. Subscribers need scanned "clean" endpoints
  (`162.159.192.1:2408`, `162.159.193.10:500`, IPv6 forms, TLS 2408/8443/4500
  ports). BPB ships an endpoint-scanner script to run in Termux/Linux and
  paste results into panel settings.

### Auth & access
- "Password-protected panel: provides secure and private panel with full
  authentication." Single shared password for the panel.
- The subscription link itself is protected by an **unguessable path/UUID**
  (`SUB_PATH` env var), not by the panel password — clients fetch it without
  credentials.

### Clients & formats
Supported for Warp: v2rayNG, MahsaNG, v2rayN, Streisand, sing-box, husi,
Clash Meta / Verge Rev / FLClash, WireGuard app, AmneziaVPN, WG Tunnel.
Subscription links are offered per core (Xray, Sing-box, Clash-Mihomo).

### Deployment & limits
- Single Worker script or Pages; wizard-based install; config via env vars.
- ~100 K requests/day per worker for VLESS/Trojan ("suitable for 2–3 users");
  **"limitless Warp configs"** — the WireGuard path is the cheap one.

## What our repo already has (no need to rebuild)

- **WARP registration client** — `lib/cloudflare-client.ts`: X25519 keypair via
  tweetnacl → `POST /v0i.../reg` → `PATCH warp_enabled` → returns interface +
  peer (the exact flow BPB's "renew accounts" uses).
- **7-format config builders** — `config/formats.ts` + `lib/builders/*`:
  standard WireGuard/AmneziaWG `.conf`, Throne `wg://`, Clash `.yaml`,
  NekoRay/Husi/Karing `.json`, WireSock `.conf`, with QR support.
- **Endpoint infrastructure** — `config/endpoints.ts` (currently only 2
  defaults + custom) and `scripts/build-i1-masks.mjs` / `build-ip-ranges.mjs`
  which generate the I1 masks and split-tunnel IP ranges embedded in the
  worker bundle.
- **CF deployables already** — `worker/api-handler.js` (Worker bundle) and
  `functions/api/generate.js` (Pages Function), kept in parity by plans 001–004.

## The gap between BPB and us

| Capability | BPB | warp-generator today |
|---|---|---|
| Password-gated panel/API | yes (shared password) | no |
| Register WARP account | in panel ("Renew") | per-request, stateless |
| Endpoint list (many IP:port) | scan + paste, stored | 2 defaults + custom |
| Subscription per endpoint list | yes (Warp sub) | no — one config per request |
| Persistent stored account | yes (account + keys in worker state) | no — keys discarded |
| Un-guessable sub path | yes (SUB_PATH/UUID) | n/a |