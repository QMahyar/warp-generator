# Result — ticket 06: /sub/singbox — sing-box config.json

**Date:** 2026-08-17 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files

| File | Change |
|---|---|
| `worker/sub.js` | **extended** — `singbox` entry in the `RENDERERS` registry behind the unchanged seam (`renderSubscription('singbox', opts, { account, endpoints, awg })` → `{ body, contentType }`). New exports: `renderSingbox`, `buildSingboxEndpoint`, `buildLegacyWireguardOutbound`. Reuses `resolveEndpoints`/`DEFAULT_ENDPOINTS`/`SUB_MTU`/`reservedToBytes`/`proxyNameOf`/`SubscriptionError` from tickets 04–05. AWG accepted for seam uniformity, ignored (not expressible — same decision as `/sub`). |
| `worker/singbox.test.js` | **new** — 18 `node:test` cases (seam-level, no HTTP), fixtures = the same throwaway records tickets 04/05 generated (regenerated locally; test files are not imported into each other). |
| `worker/index.js` | route wiring: `GET /api/<SUB_PATH>/sub/singbox` (+ optional trailing `/`), registered **before** the auth gate like `/sub` and `/sub/clash`; constant-time token compare; `handleSubSingbox` (KV-only reads — account + endpoints, **no** AWG read since sing-box cannot express it; 503 via the shared `missingAccount()` helper; 6 h cache headers); route-map comment updated. |
| `worker/sub.test.js` | one assertion updated: the unknown-format guard used `'singbox'` (now registered) → switched to `'neko'` (next not-yet-shipped format). |

Forbidden files untouched — confirmed by `git status`: `worker/auth.js`, `worker/account.js`, `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, `wrangler.jsonc`, `package.json` and all non-worker dirs unmodified (only `worker/index.js` + `worker/sub.js` + `worker/sub.test.js` modified, `worker/singbox.test.js` added; the other untracked paths in `git status` are the router's own files, untouched).

## Route

| Route | Behaviour |
|---|---|
| `GET /api/<token>/sub/singbox` (token = `SUB_PATH` env/secret) | **No session** — the path IS the credential (ADR 0006); wrong or missing token → **404** (never 401). Default payload = sing-box 1.13+ WireGuard **endpoint** shape. `?legacy=1` = pre-1.13 wireguard **outbound** shape. Non-GET → 405. Missing account in KV → **503** (shared `missingAccount()` helper — identical bytes to `/sub`, `/sub/clash`). Headers: `Content-Type: application/json; charset=utf-8`, `Cache-Control: public, max-age=21600, s-maxage=21600` (6 h, spec). Trailing `/` accepted; near-miss paths (`/sub/singboxzz`) stay behind the auth gate (anon → 401). |

## Payload shapes

### Default — 1.13+ WireGuard endpoint (SFA/SFI remote profile)

```json
{
  "log": { "level": "info", "timestamp": true },
  "dns": {
    "servers": [ { "type": "udp", "tag": "cloudflare-dns", "server": "1.1.1.1" } ],
    "final": "cloudflare-dns"
  },
  "inbounds": [ { "type": "mixed", "tag": "mixed-in", "listen": "0.0.0.0", "listen_port": 2080 } ],
  "outbounds": [ {
    "type": "selector", "tag": "select",
    "outbounds": ["warp-162.159.192.1:2408", "warp-[2606:4700:4700::1111]:2408"],
    "default": "warp-162.159.192.1:2408"
  } ],
  "route": { "final": "select" },
  "endpoints": [ {
    "type": "wireguard",
    "tag": "warp-162.159.192.1:2408",
    "mtu": 1280,
    "address": ["172.16.0.2/32", "2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128"],
    "private_key": "<record>",
    "peers": [ {
      "address": "162.159.192.1", "port": 2408,
      "public_key": "<record peerPublicKey>",
      "allowed_ips": ["0.0.0.0/0", "::/0"],
      "reserved": [83, 128, 39]
    } ]
  } ]
}
```

Verified against `docs/research/sub-formats.md` §2.3 second block AND the primary sources at implementation time: sing-box docs `configuration/endpoint/wireguard/` (fields `address`/`private_key`/`mtu`/`peers[].address|port|public_key|allowed_ips|reserved`), the 1.13 migration page (old outbound → new endpoint mapping), and the sing-box option Go source (`option/endpoint.go`, `option/group.go`, `option/route.go`, `option/dns.go`, `adapter/outbound/manager.go` — the last proves selectors/route resolve endpoint tags: `OutboundManager.Outbound(tag)` falls back to the endpoint manager, endpoints and outbounds share one tag namespace).

### `?legacy=1` — pre-1.13 wireguard outbound (NekoBox Android / Husi)

```json
{
  "log": { "level": "info", "timestamp": true },
  "dns": {
    "servers": [ { "tag": "cloudflare-dns", "address": "1.1.1.1" } ],
    "final": "cloudflare-dns"
  },
  "inbounds": [ { "type": "mixed", "tag": "mixed-in", "listen": "0.0.0.0", "listen_port": 2080 } ],
  "outbounds": [
    {
      "type": "wireguard",
      "tag": "warp-162.159.192.1:2408",
      "server": "162.159.192.1",
      "server_port": 2408,
      "local_address": ["172.16.0.2/32", "2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128"],
      "private_key": "<record>",
      "peer_public_key": "<record peerPublicKey>",
      "reserved": [83, 128, 39],
      "mtu": 1280
    },
    { "type": "selector", "tag": "select", "outbounds": ["warp-…", "…"], "default": "warp-…" }
  ],
  "route": { "final": "select" }
}
```

Per §2.3 first block (`server`/`server_port`/`local_address`/`private_key`/`peer_public_key`/`reserved`/`mtu`), placed in `outbounds` — the research states NekoBox Android and Husi parse the *outbound list* of a sing-box JSON (verified against the nb4a-configuration docs: "Sing-box格式 …可以解析出站节点" and Husi's group/proxy-protocol docs). No `endpoints` key anywhere.

### Mapping facts shared by both shapes

- **Tags**: `warp-<host>:<port>` — same convention as the clash proxies (ticket 05), so a subscription's names are consistent across formats; IPv6 hosts re-bracketed **in the tag only** (`warp-[2606:…]:2408`); the wireguard `server`/`peers[].address` is always the bare host (brackets are invalid in an address field).
- **`address` / `local_address`**: `[v4/32]` plus `[v6/128]` when the account record has v6; the legacy outbound's `local_address` and the endpoint's `address` use identical values.
- **`reserved`**: base64-decoded bytes of the record's `reserved` (`'U4An'` → `[83,128,39]` — same `reservedToBytes` as clash); empty/unparseable → `[0,0,0]`.
- **`allowed_ips`** `["0.0.0.0/0", "::/0"]` on every peer — full tunnel (spec).
- **`mtu` 1280** everywhere (SUB_MTU).
- **`system`** deliberately omitted (defaults to false): the userspace implementation needs no privilege on any platform.
- Legacy flag semantics: **only the exact value `1`** selects the legacy shape; `?legacy=0`/`?legacy=true`/absent → default (same "unknown value → default" philosophy as `?scheme=` in ticket 04). `opts.legacy === '1'` is the sole toggle.

## Skeleton choices and why

The remote-profile skeleton (same in both payloads, except the DNS server entry — see below) is the minimal set SFA/SFI needs to treat the fetched URL as a runnable remote profile (research §2.3: "inbounds/outbounds/routing required for a runnable profile"; clients/general docs):

- **`inbounds`: one `mixed` inbound on `0.0.0.0:2080`.** Mixed = SOCKS5 + HTTP on a single port, runnable on every platform with zero privileges and zero per-platform tuning. A `tun` inbound was deliberately *not* chosen for the skeleton: tun requires VPN permission, `auto_route`/`stack`/`route_address` tuning that is platform- and GUI-specific (and it conflicts with SFA's own VPN handling when the GUI manages tun). The ticket's "e.g. a mixed/tun/0.0.0.0 inbound" explicitly sanctions mixed; operators can layer tun on top.
- **`outbounds`: one `selector` over the endpoint tags, `default` = the first.** Selector outbounds resolve endpoint tags through the outbound manager (verified in `adapter/outbound/manager.go` — `Outbound(tag)` falls back to the endpoint manager; endpoints and outbounds share one tag namespace), and the sing-box client docs say GUIs render a dashboard **Group selector** for selector outbounds — so subscribers can switch endpoint without re-importing the profile. This satisfies "outbounds referencing a selector/wirect or the endpoints" (selector referencing the endpoints).
- **`route.final = "select"`** (no rules): every connection goes through the chosen endpoint — full tunnel, exactly the WARP sub semantics of tickets 04/05. `route.final` is a current option (`option/route.go`: `Final string json:"final,omitempty" reference:"outbound"`).
- **`dns`: 1.1.1.1 as the tagged `final` resolver** (spec: DNS 1.1.1.1). The server **entry uses the era-correct schema**: the default payload emits the typed form `{"type":"udp","server":"1.1.1.1"}` (canonical since 1.12, required going forward — the deprecated `address` form was **removed in 1.14.0**, per the official deprecated list), while the legacy payload emits `{"address":"1.1.1.1"}` (the form valid for ≤1.13 cores that the legacy shape targets). This keeps *both* payloads structurally valid for their intended core versions.
- **`log`**: `{"level":"info","timestamp":true}` — standard for GUI clients, helps debugging.

No `direct` outbound, no rules, no experimental/clash_api blocks: minimal per the ticket; the selector chain covers the full-tunnel case.

## Endpoint semantics (identical to tickets 04/05, by construction)

`renderSingbox` calls the same `resolveEndpoints()`: one entry per **valid** endpoint line in stored order; malformed entries (null, empty host, out-of-range/string ports, raw strings) skipped, never an error; zero valid endpoints (absent/empty/all-malformed) → exactly the two defaults `162.159.192.1:2408` then `engage.cloudflareclient.com:2408`. The route feeds the parsed list from `readEndpoints` (same as `handleSub`/`handleSubClash`). `route.final`/selector default = the first (fallback) endpoint.

## Test output

`node --test` (repo root; discovers all `worker/*.test.js`):

```
ℹ tests 110   ℹ pass 110   ℹ fail 0
```

92 prior (14 auth + 20 account + 20 settings + 24 sub + 14 clash, all still green) + **18 new singbox tests**: pretty-printed JSON (never base64) + `application/json; charset=utf-8` · one endpoint per valid line, tags incl. bracketed IPv6 + custom port · §2.3 fields on every endpoint (type/mtu/address/private_key/peers) · peer fields (address/port/public_key/allowed_ips/reserved bytes) · v6-less account → v4/32-only address + `[0,0,0]` reserved, no account-v6 leak · golden default config (full structural deepEqual for one v4 endpoint) · skeleton assertions (typed dns server, mixed inbound, selector listing every tag, route final) · legacy: no `endpoints` key, wireguard entries in outbounds, §2.3 first-block fields · legacy↔default 1:1 mapping (tag/server↔peer.address/server_port↔port/local_address↔address/peer_public_key↔public_key/reserved/mtu) · legacy dns address-form · strict `legacy === '1'` flag · malformed skipped · fallback on empty/null/undefined/all-malformed for both shapes · endpoints absent from the data object → fallback · AWG record ignored (byte-identical payloads) · builder unit contracts · missing account → readable `SubscriptionError`.

`node --check` green on `worker/index.js`, `worker/sub.js`, `worker/sub.test.js`, `worker/singbox.test.js`.

## Smoke results (fetch-level, real handler)

Per tickets 01–05 pattern (no wrangler/node_modules/`./out` in the repo): drove the **real** `worker/index.js` fetch via a loader hook substituting `./api-handler.js` (stub exports `onRequestPost/Get/Options` + `I1_MASKS` — what `index.js`/`panel.js` import at module scope; the real module needs tweetnacl/qrcode), fake KV bindings (Map), fake ASSETS, real auth. **35/35 checks passed**, exit 0:

1–3. default 200 · `Cache-Control: public, max-age=21600, s-maxage=21600` · `application/json; charset=utf-8`
4–9. body parses as JSON · 3 endpoints from 5 stored lines (2 malformed skipped) · tags in order incl. `warp-[2606:…]:2408` + custom port · endpoint fields (type/mtu/address/private_key) · peer fields per §2.3 (address/port/public_key/allowed_ips/reserved `[83,128,39]`) · bare IPv6 peer address + custom port · skeleton (typed dns 1.1.1.1, mixed inbound, selector listing the tags, route final select)
10–16. `?legacy=1` 200 + JSON ctype · no `endpoints` key, wireguard in outbounds · §2.3 outbound fields · selector last listing the same tags · legacy dns `address` form · `?legacy=0` → default shape
17–20. absent ENDPOINTS key → the two fallback endpoints in order (both shapes) · all-malformed → fallback
21. v6-less account → `address` v4-only + reserved `[0,0,0]`
22–23. AWG record present in KV → payload byte-identical to absent; no amnezia/Jc material in legacy
24–25. wrong token → 404 JSON, never 401, no cache header
26. missing `SUB_PATH` env → 404
27–28. missing account → 503 readable, no cache header
29. POST → 405
30. trailing slash → 200
31. near-miss path `/sub/singboxzz` → 401 anon (stays gated)
32–33. anon `/api/account` → 401, anon `/` → login page (auth gate intact)
34–35. regression: `/sub` still 200 + base64 links, `/sub/clash` still 200 + raw YAML

Harness was throwaway (`$HOME/smoke-06/`), deleted afterwards.

## Surprises

1. **The 1.13+ skeleton question was a real research problem, not a copy-paste one.** The research's §2.3 gives the endpoint JSON but not how a *profile* wires it up. Three facts had to be verified against source/docs: (a) route rules/`route.final` can reference an endpoint tag directly (`adapter/outbound/manager.go`: `Outbound(tag)` falls back to `endpoint.Get(tag)`); (b) **selector `outbounds` lists can contain endpoint tags** (same fallback — this is how the dashboard group switching works); (c) there is no `outbound/endpoint` docs page (my first fetch 404'd) — the wiring is purely via the shared tag namespace.
2. **The DNS server format is era-sensitive and the research doesn't say which.** The "1.1.1.1" DNS block the ticket expects has two schemas: the legacy `{"address":"1.1.1.1"}` (removed in **1.14.0**) and the typed `{"type":"udp","server":"1.1.1.1"}` (canonical since 1.12). A default payload using the legacy form would silently break on current SFA/SFI cores after the 1.14 release; a legacy payload using the typed form would break pre-1.12 cores. The payloads therefore use different forms — each valid for its intended core era (asserted in both unit and smoke tests). This is a deviation-from-naivety, not from the ticket (the ticket says "structurally valid per the 1.13+ schema" for default, and the legacy shape targets ≤1.12 consumers).
3. **Selector-in-outbounds + endpoint tags also gives the right GUI behaviour for free**: the sing-box client docs mandate a dashboard group selector for selector outbounds ("when the configuration includes group outbounds (specifically, Selector or URLTest)") — so the skeleton's selector doubles as the subscriber's endpoint switcher.
4. **`scratch`-level fixture footgun (test-only):** my `renderDefault(account = ACCOUNT_A, endpoints = ENDPOINTS)` helper silently turned the fallback test's `undefined` iteration value back into ENDPOINTS (JS default params) — the product code was right; the loop now calls `renderSubscription` directly. Same class of stub-vs-code triage the 04/05 results warn about.
5. **Smoke-harness URL footgun (harness-only):** my `get()` helper prepended `http://x` to a path that already started with `http://x`, producing a pathname that never matched `/api/...` → the worker correctly served the login page (200 HTML "no-store"). The harness now feeds absolute URLs through unchanged. Worth remembering for the ticket-07 harness.

## Deviations (with rationale)

- **Legacy flag matches only the exact value `1`** (`opts.legacy === '1'`). `?legacy=0` / `?legacy=true` / absent → the default (1.13+) shape, never an error — consistent with the `?scheme=` "unknown value → default" decision of ticket 04 and avoids breaking clients that append junk params. The route passes the raw query value through (`url.searchParams.get('legacy')`).
- **Legacy payload is a full config.json, not a bare `{"outbounds": […]}`.** The ticket says "the pre-1.13 wireguard outbound JSON shape … as the outbounds entries" — ambiguous between a bare outbound list and a full config. Chosen: the full skeleton with outbound entries in the legacy shape. Rationale: NekoBox Android/Husi parse the outbound list *out of* a sing-box JSON (so the entries are found either way), and a full config remains directly loadable in a ≤1.13 sing-box core — strictly more useful, zero extra cost. The `endpoints` key is absent in this shape (a ≤1.13 core would reject it).
- **Two DNS server schemas instead of one** — see Surprise 2. Each payload is schema-valid for its target core era.
- **`selector` (with `default` = first endpoint) as the sole outbound chaining mechanism**, rather than `route.final` → first endpoint tag and a separate `direct`. The selector gives subscribers a GUI endpoint switcher (client-docs mandate) while staying minimal; `route.final`/`route.default` could name an endpoint tag directly (verified in source) but that would forfeit the switcher at the cost of one extra tiny object.
- **`system` omitted** — defaults to false (userspace); a `system: true` later would require root and conflict with the GUIs' own handling. Nothing is gained by emitting it.
- **`sub.test.js` one-assertion update** — the unknown-format guard asserted `'singbox'` throws, which this ticket invalidates by registering it; switched to `'neko'` (the next planned format). No product code changed to make tests pass.
- **Route does not read the AWG binding** — sing-box cannot express AmneziaWG, so the KV read is skipped (same decision as `handleSub`; documented in the route comment).

## Handoff notes

- Ticket checkboxes: default payload structurally valid per the 1.13+ endpoint schema ✓ (verified against docs + option source; the endpoint fields match §2.3's second block exactly); legacy flag serves the outbound schema ✓; one endpoint per line with IPv6 + custom ports ✓; seam unit-tested + fetch-level smoke ✓ (the `wrangler dev` item covered by the fetch-level smoke, same decision as tickets 01–05).
- Operator checklist once wrangler runs: `curl <sub-singbox-url>` → paste into SFA/SFI as a remote profile (`sing-box://import-remote-profile?url=…#name`) → confirm the selector group appears in the dashboard and switching endpoints re-tunnels without re-import; `curl <url>?legacy=1` → import into NekoBox Android (sing-box format) and Husi.