# Pivot inventory — existing code mapped for the panel rebuild

Date: 2026-08-15. Status: inventory only, no code changed. Rebuild target:
`worker/api-handler.js` (single Worker bundle) becomes the whole app per
`docs/adr/0001-warp-subscription-panel.md`, `docs/adr/0004-lean-built-in-panel-ui.md`.

## Routes today

### `worker/index.js` — the only router (27 lines)
- `POST /api/generate` → `onRequestPost` (worker/api-handler.js:358).
- `OPTIONS /api/generate` → `onRequestOptions` (CORS preflight, api-handler.js:354).
- `GET /api/generate` → `onRequestGet` (api-handler.js:358 — returns `{success, formats: [7 ids]}`).
- Everything else → `env.ASSETS.fetch(request)` (Next.js static export in `./out`; SPA not-found fallback). **This catch-all is where the panel UI, password gate, account/endpoint API and subscription routes will be added.**
- Other methods on /api/generate → 405 JSON.

### `worker/api-handler.js` — one POST handler, no real routing
- Parses body: `selectedServices, siteMode, deviceType, endpoint, configFormat, dnsId, ipv6, excludeLan, persistentKeepalive, customI1Domain`.
- Flow: `generateKeyPair()` → `registerClient()` → `enableWarp()` (2 network calls to `api.cloudflareclient.com/v0i1909051800`) → resolve AllowedIPs → pick/generate I1 → `BUILDERS[format]()` → base64 + QR (only wireguard/throne/wiresock) → `{success, content}`.
- **State kept**: none. Stateless per request (only module-level consts + lazily cached `quicHmacKey`). No env/binding access — `onRequestPost({ request })` ignores `env`/`ctx`.
- **Errors**: `json({success:false, message})` — 400 for unknown format, 500 wrapped `Error: ${err.message}`. CORS headers on everything (`*`, `POST, GET, OPTIONS`).
- **npm imports** (api-handler.js:1-3): `tweetnacl`, `buffer`, `qrcode`. Also uses `AbortSignal.timeout`, `Web Crypto subtle`, `btoa`. All Worker-safe; `nodejs_compat` flag in wrangler.jsonc.

## Reusable engine (worker-safe unless flagged)

### `lib/builders/` — all pure string/JSON builders, port directly
| Export (file) | Signature |
|---|---|
| `buildConfig(format, params)` (index.ts) | dispatches to builder map; throws on unknown format |
| `buildConfigForQR(format, params)` (index.ts) | QR variant: throne = itself, wireguard/wiresock strip MTU |
| `buildWireguard(p)` / `buildWireguardForQR(p)` (wireguard.ts) | `.conf` — AMNEZIA lines S1 S2 Jc Jmin Jmax H1-H4, MTU 1280, I1 only for `awg15` |
| `buildThrone(p)` (throne.ts) | `wg://` URI with reserved dashed, WARP pubkey, junk params |
| `buildClash(p)` (clash.ts) | YAML proxy + proxy-groups; `allowed-ips: ['0.0.0.0/0']` hardcoded — **parity note with worker buildClash (identical)** |
| `buildNekoray(p)` (nekoray.ts) | sing-box WG outbound JSON |
| `buildHusi(p)` (husi.ts) | sing-box with `peers[]`, keepalive 600 |
| `buildKaring(p)` (karing.ts) | fake-packet outbound JSON |
| `buildWiresock(p)` (wiresock.ts) | `.conf` + `Id = <domain>` masking, `Ip = quic` |
| `pickI1()` / `I1_MASKS` / `DEVICE_PROFILES` / `MTU` / `WARP_PUBLIC_KEY` / `formatDNS()` / `parseEndpoint(ep)` (shared.ts) | constants + helpers; I1_MASKS synced by `scripts/build-i1-masks.mjs` |

### Support libs
- `lib/crypto.ts` — `generateKeyPair()`, `toBase64/fromBase64`, `reservedToBytes/Dashed/CommaSeparated`. Worker-safe (tweetnacl + buffer).
- `lib/quic.ts` — `generateI1Line(domain)` + ~18 internal QUIC/TLS helpers (quicInitial, quicStr8/16, quicVarint…). Worker-safe (Web Crypto only). Comment notes it was ported from the browser original — **no node deps**.
- `lib/qr-generator.ts` — `generateQR(text)` (data URL, else fallback SVG), `unsupportedQR(format)`. Worker-safe (qrcode).
- `lib/ip-ranges.ts` — **re-exports from `config/services-loader` which is NOT worker-safe** (see below). The worker already embeds its own `IP_RANGES`/`LAN_EXCLUDE_IPS`/`resolveAllowedIPs` copy (api-handler.js), so reuse the worker copy, not this re-export.
- `lib/cloudflare-client.ts` — `registerClient(publicKey) → {id,token}`, `enableWarp(clientId, token) → CloudflareWarpResponse`. Worker-safe apart from `@/types` alias; logic duplicated in api-handler.js with `warp.result.config` fields. Prefer extracting this TS module (or the worker's JS twin) as the single registration util for the panel's Register/Rotate.
- `lib/warp-service.ts` — orchestration layer: `generateWarpConfig(req)`, `WarpGenerationError`, `validate()`, `extractBuildParams()`, `sanitizeDomain()`, `normalizeKeepalive()`. **Not importable as-is from the worker bundle**: imports `config/services-loader` (`server-only` + fs) and `@/` path aliases. Its logic (steps 1-7, community-DNS forcing) is the bluepint for a pure `renderConfig(account, params, format)` function.
- `lib/utils.ts` — `cn()` clsx/tailwind-merge; UI-only.

### `config/`
- `config/formats.ts` — `CONFIG_FORMATS` (7 entries), `getFormatInfo`, `getFileName(format)`, `supportsQR`. Worker-safe plain data. Worker equivalent: `BUILDERS` + `EXTENSIONS` + `QR_FORMATS` consts (api-handler.js).
- `config/dns.ts` — `DNS_PROVIDERS` (8, with `isCommunity`), `DEFAULT_DNS_ID`, `getDnsProvider`, `isCommunityDns`, `buildDnsLine(id, includeIPv6)`. Worker-safe; duplicated in api-handler.js. **Community DNS forces siteMode 'all'** — keep that rule for generator parity.
- `config/endpoints.ts` — `ENDPOINTS` (2 defaults + custom), `getEndpointValue`, `isExternalEndpoint`. UI-config only; superseded by the panel's KV endpoint editor (ADR 0005).
- `config/services-loader.ts` — **NOT worker-safe** (flagged twice): `import 'server-only'` + `fs.readFileSync(process.cwd()/config/services/*.json)` at import time. Exports `SERVICES` (26 entries, sorted), `IP_RANGES`, `isServiceSupported`, `getServiceRanges`, `getCombinedRanges`, `LAN_EXCLUDE_IPS`, `resolveAllowedIPs`. The worker's baked-in `IP_RANGES` (generated by `scripts/build-ip-ranges.mjs`) is the worker-safe twin; `SERVICES` metadata (name/icon) must instead be generated into the bundle (TS JSON import) for the panel's service picker.
- `config/services/*.json` — 26 service entries with `ips`; data source for IP ranges + picker UI.

## UI surface (`app/` + `components/` + `hooks/`)

- `app/page.tsx` + `app/layout.tsx` (Next root layout, Geist fonts) + `app/not-found.tsx` + `app/api/generate/route.ts` (Next route → `generateWarpConfig`, CORS, error mapping 400/500 — the parity twin of the worker POST).
- `hooks/use-generator.ts` — **the whole generator page state machine**: `GeneratorState` (14 fields), `set`, `setDnsId` (community-DNS forces 'all'), `setSiteMode`, `toggleService`, `setEndpoint` (external link handling), `handleGenerate` (POST /api/generate), `reset`, `copyConfig` (atob), `downloadConfig`. Ports almost verbatim to the panel's generator <script>.
- `hooks/use-mobile.ts` — responsive helper; optional in lean panel.
- `components/home-client.tsx` — tab shell (generator / formats / applications / about), mounts ConfigSelectors, ServicePicker, AdvancedSettings, ResultPanel, Sidebar, Topbar, Footer. This is the page skeleton the static panel will recreate (login → account → endpoints → subscriptions → generator) minus Next.js bits.
- `components/generator/` — config-selectors (dropdowns: format, device, endpoint w/ flags, DNS, exclude-LAN toggle), service-picker (icon grid), advanced-settings (IPv6/keepalive/custom I1), result-panel (download/copy/QR), about-tab (client list), formats-tab, toggle. All plain React+Tailwind CSS vars — CSS/naming can be lifted, JSX must be re-written as vanilla HTML/JS or kept as-is behind a bundler.
- `components/layout/` — topbar (TABS; **Formats tab is commented out — dead**), sidebar (endpoints list, GitHub link/star fetch), footer.
- `components/icons/` — custom-icons, flag-icon (country-flag-icons), icon-resolver (ServiceIcon). Reusable in panel if bundling icons into the worker; otherwise drop.
- **What ports to a lean static panel UI**: layout shell, generator card flow, endpoint selector, service picker, result panel (copy/download/QR), token-paste approach. **What does not**: Next.js app router, `next/image`, Geist, radix, React state — the lean panel is framework-less per ADR 0004.

## Dead code (no longer wired)

- `components/generator/formats-tab.tsx` — Formats tab is commented out in topbar.tsx:6; component never rendered via the visible tab list (only `applications`/`about`).
- `app/api/generate/route.ts` + entire `app/` / `functions/` Next.js surface — retired when the worker serves the panel; `functions/api/generate.js` (Pages Functions) was the third deployment target kept in parity by plans 001-004 and dies with the pivot.
- `components/generator/about-tab.tsx` — rendered for BOTH `applications` and `about` tabs (home-client.tsx:116-117): one of the two tabs is redundant.
- Generator auto-picking components if the lean panel is a single script: radix dialog/select (package.json deps `@radix-ui/*`), `country-flag-icons`, `lucide-react`, `react-icons`, `class-variance-authority`, `tailwind-merge`, `geist`, `clsx`.
- `types/` — `@/`-aliased TS types (`BuildParams`, `GenerateRequest`, `ApiResponse`…) referenced by the TS lib layer; stays only if the engine is ported as TS, else collapsed into the JS bundle types.

## Subscription-building blocks (where the per-request flow splits)

Target flow per ADR 0002/0005/0006: one account in KV + endpoint list in KV; a subscription request = read account+endpoints, render N configs, cache ~6h.

1. **Registration (network, panel-only, rate-limited)** — `registerClient` + `enableWarp` (api-handler.js; lib/cloudflare-client.ts). Moves out of the request path into the panel's Register/Rotate action writing KV. Note the 10 s `AbortSignal.timeout` and `okhttp` UA that must be kept.
2. **Extract account material (pure)** — after `enableWarp`: `peer.public_key`, `iface.addresses.v4/v6`, `reserved = config.client_id`, plus our own keypair private key. This 5-field snapshot IS the KV account record; the POST's `p` object (api-handler.js) is exactly the shape a `renderConfig(account, endpoint, opts, format)` needs.
3. **Config rendering (pure, per endpoint × format)** — `BUILDERS[format](p)` with `endpoint` swapped per entry and WARP keys/lines unchanged. CLIENTS in `docs/research/sub-formats.md` define what a subscription body is per client (base64 link list, sing-box JSON, Clash YAML, raw conf), so per-format subscription = join of builder outputs wrapped per client convention (needs new wrapper code: sub payload vs single config; single-file formats like `wg://` list need base64 wrapping for most clients).
4. **Where the wg:// line, reserved/MTU, DNS live** — `wg://` line: `buildThrone` (throne.ts:10). Reserved handling: `reservedToBytes/Dashed/CommaSeparated` (lib/crypto.ts; duplicated in both handlers). MTU: constant `1280` (`MTU` in builders/shared.ts + inline `mtu: 1280`/`MTU = 1280` in every builder). DNS lines: `buildDnsLine` (config/dns.ts; worker copy in api-handler.js). I1: `pickI1` (shared.ts) / `generateI1Line` (quic.ts). All pure — the subscription renderer reuses them untouched.
5. **AllowedIPs policy** — `resolveAllowedIPs` (worker copy api-handler.js:117; TS twin services-loader.ts). Decision needed: subscriptions likely always 'all' (per-endpoint configs), while generator keeps siteMode. Keep the worker copy; drop the fs-based loader.

## Risks & parity notes

- **Twin drift**: api-handler.js vs functions/api/generate.js are byte-near-identical (only comment/line-wrap diffs) and the 7 builders are duplicated a third time in worker form vs lib/builders TS. Before the rebuild, pick ONE engine source (lib/builders TS compiled into the bundle, or the JS twins) — the pivot removes the parity burden of plans 001-004.
- **`server-only` + fs** (`config/services-loader.ts`) breaks any naive worker import; the worker's generated `IP_RANGES` block covers ranges but NOT service metadata (names/icons) — must be regenerated into the bundle for the picker.
- **Path alias `@/`** — all TS modules import `@/types`, `@/config/*`; bundling needs tsconfig path resolution or JS-porting.
- **No state today**: `onRequestPost` ignores `env`; KV bindings (`ACCOUNT`, `ENDPOINTS`, ADR 0005) and `SUB_PATH` secret (ADR 0006) are new — worker/index.js must start passing `env`/`ctx` through.
- **Community-DNS rule** silently rewrites siteMode → also a UI rule; forgeting it in the panel breaks split-tunnel setups (must stay in the shared logic).
- **Format parity quirks**: wiresock `Id` domain ≠ cryptographically generated I1 (plain-text masking); clash builder hardcodes `allowed-ips: ['0.0.0.0/0']` ignoring site mode; husi sets keepalive 600 while others use the request value — reproduce exactly for generator parity.
- **CORS/error shape**: existing API is open-CORS and string-message errors; the panel's password gate is per ADR 0001 — decide whether /api/generate stays public (it self-registers per request — **remove or gate it, it burns registrations + violates ADR 0002's one-account model**; the generator page should reuse the stored KV account instead).
- **Assets**: `wrangler.jsonc` serves `./out` with SPA fallback; the panel replaces ASSETS with worker-rendered HTML, or keeps ASSETS for static CSS/icons. `nodejs_compat` + `find_additional_modules` lets the bundle import node_modules (tweetnacl/qrcode/buffer) today.
- **Rate limiting**: current handler registers per request (2 CF API calls); plan 005 (`plans/005-reproducible-builds.md`) builds must keep working after removal of `functions/` and `app/`.

Useful seeds: `.scratch/router/tasks/inventory.md` (this task), `.scratch/router/tasks/research-sub-formats.md`.