# Spec: WARP subscription panel

**Status:** ready-for-agent
**Tracker:** local — `.scratch/warp-panel/`
**Companion docs:** CONTEXT.md (glossary), docs/adr/0001–0007,
docs/research/bpb-panel.md, docs/research/sub-formats.md,
docs/plans/pivot-inventory.md

## Problem Statement

The deployment is a stateless config generator: every request registers a
fresh WARP account, builds one config, and throws the keys away. There is no
password, no persistence, and no way to hand a group of people a working
subscription for their own client apps. BPB Worker-Panel solves this but
carries a large surface (VLESS, Trojan, DoH, chain proxies) we do not want.

## Solution

A Cloudflare Worker that serves a password-gated panel. The panel operator
registers one WARP account and maintains an endpoint list; the worker renders
those into six per-client subscription URLs, each stable and unguessable, plus
a generator page carrying over the original single-config feature.

## User Stories

1. As a panel operator, I want a password prompt when I open the deployment, so that nobody else can reach the panel.
2. As a panel operator, I want the session to persist, so that I don't re-enter the password on every page load.
3. As a panel operator, I want a Register action that creates the WARP account, so that subscriptions work without touching Cloudflare's API by hand.
4. As a panel operator, I want to see whether an account exists and when it was registered, so that I know the deployment state at a glance.
5. As a panel operator, I want a Rotate action that replaces a flagged account, so that subscribers keep working without URL changes.
6. As a panel operator, I want a textarea editor for endpoints, so that the subscriptions reflect exactly my endpoint:port list.
7. As a panel operator, I want my account, endpoints and AmneziaWG settings to survive redeploys, so that subscribers see no disruption.
8. As a subscriber, I want a subscription URL for v2rayN-style clients, so that importing means pasting one link.
9. As a Throne user, I want wg:// links, so that Throne imports them directly.
10. As a Clash user, I want a YAML subscription, so that Clash Meta clients import my per-endpoint configs.
11. As a sing-box user, I want a JSON profile, so that SFA/SFI loads it as a remote profile.
12. As a NekoBox desktop user, I want nekoray://custom# links, so that NekoBox imports the endpoint list.
13. As a WireGuard app user, I want a zip of per-endpoint confs, so that I import all endpoints at once.
14. As an AmneziaWG user, I want confs and links carrying Jc/Jmin/Jmax/S/H/I params, so that I can use WARP where plain WireGuard is blocked.
15. As an awg:// client user (LxBox, INCY), I want awg:// links, so that I can import all endpoints.
16. As a panel operator, I want a toggle and params for AmneziaWG variants, so that I control which formats carry obfuscation.
17. As a subscriber, I want the subscription URLs to stay the same across account rotations and endpoint edits, so that I never re-paste links.
18. As a subscriber, I want subscription fetches cheap, so that repeated client refreshes never strain the worker.
19. As a generator user, I want a Generate page in the panel, so that I can still produce a single config and QR for a chosen format.
20. As a generator user, I want generation to reuse the stored account, so that single configs stop burning fresh WARP registrations.
21. As a subscriber with a thottled ISP, I want a config per endpoint, so that one of them will connect.

## Implementation Decisions

- **Engine**: the worker's plain-JS engine (`worker/api-handler.js`) becomes
  the single engine. All builders stay where they are; the TS `lib/builders`
  tree, `functions/`, and the Next.js app are retired from the product
  (Next.js app stays in the repo, unmaintained — ADR 0004). This avoids
  tsconfig `@/`-alias and `server-only` bundling problems the inventory
  flagged; wrangler's esbuild already bundles tweetnacl/qrcode/buffer with
  `nodejs_compat`.
- **Seam**: a pure function `renderSubscription(format, opts, { account,
  endpoints, awg })` → `{ body, contentType }`. Every renderer sits behind it
  and is testable without HTTP.
- **Auth**: `PASSWORD` secret; `POST /api/auth/login` verifies in constant
  time and issues an HMAC-signed session cookie (Web Crypto), ~7-day expiry;
  every panel route and static asset checks it; logout clears it.
- **KV bindings**: `ACCOUNT` (private key, client id, token, peer public key,
  v4/v6 addresses, reserved, registeredAt), `ENDPOINTS` (line list),
  `AWG` (toggle + params, or absent). Written only by panel actions.
- **Registration**: `registerClient` + `enableWarp` move out of the request
  path into an account module behind `/api/account/register` and
  `/api/account/rotate`; the 10-second timeout and okhttp UA are preserved;
  per-request registration is removed from the worker.
- **Sub endpoints**: all under a path token from the `SUB_PATH` secret:
  `/api/<token>/sub` (`?scheme=wireguard|wg`, default wireguard),
  `/sub/clash`, `/sub/singbox` (`?legacy=1` serves the pre-1.13 outbound
  shape for NekoBox Android/Husi), `/sub/neko`, `/sub/wg` (zip),
  `/sub/awg`. No auth — the path is the credential (ADR 0006). Responses
  `s-maxage` ~6h at the edge.
- **Renderers** (payload shapes per `docs/research/sub-formats.md`):
  `wireguard://` with private key in userinfo and publickey/address/mtu in
  query; `wg://` = the existing Throne builder shape; Clash raw YAML with one
  `type: wireguard` proxy per endpoint plus minimal proxy-groups and dns,
  `amnezia-wg-option` when AWG is on; sing-box full minimal config.json with
  the 1.13+ wireguard endpoint shape; NekoBox = base64 lines of
  `nekoray://custom#` wrapping the sing-box outbound JSON; wg-zip = one .conf
  per endpoint (AWG confs with J lines when AWG is on); awg = base64url conf
  lines under the awg:// scheme.
- **Endpoint semantics**: one config per line, host:port (v4 or v6, any
  port); full tunnel (`0.0.0.0/0, ::/0`); DNS 1.1.1.1; empty list falls back
  to `162.159.192.1:2408` and `engage.cloudflareclient.com:2408`.
- **AWG settings**: panel card — toggle + Jc, Jmin, Jmax, S1–S4, H1–H4, and
  I1–I5 (defaults from the existing I1 mask pool); honored by clash, wg-zip
  and awg renderers; ignored by the formats that cannot express it.
- **Generator page**: ports the `use-generator.ts` flow to the panel; calls
  the stored account instead of registering per request; community-DNS rule
  and format-parity quirks (wiresock Id masking, husi keepalive 600, clash
  allowed-ips) preserved exactly.

## Testing Decisions

- Good test = external behaviour of the seam: given an account record,
  endpoints and opts, the payload decodes to the structure each client
  expects (parse the base64 list, YAML, JSON, zip entries).
- New runner: `node:test` via `npm test` (zero dependencies, works headless).
  No HTTP harness in v1 — the seam is pure; route wiring gets a manual
  `wrangler dev` smoke checklist per ticket.
- Fixtures: throwaway generated account records (never real keys), endpoint
  sets including IPv6, custom ports, and the empty-list fallback.
- Prior art: none — this is the repo's first test suite.

## Out of Scope

VLESS/Trojan/DoH/chain proxies (BPB bloat); per-user accounts; Best-Ping
configs; endpoint scanning; multi-worker sharding; Telegram integration;
rate limiting/abuse controls; Next.js UI maintenance; Docker/Vercel/Netlify
parity; PROXY_IP-style fallback domains.

## Further Notes

- Deploy path for the operator (wrangler secrets PASSWORD/SUB_PATH, KV
  bindings, wrangler dev) will be captured as a wizard script before handoff.
- The READMEs' star-history embed token flagged in `plans/README.md` should
  be rotated; out of scope here.
- `plans/001–005` must keep building; the typecheck script stays in
  package.json.