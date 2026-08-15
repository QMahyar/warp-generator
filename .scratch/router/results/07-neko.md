# Result — ticket 07: /sub/neko — NekoBox desktop `nekoray://custom#` links

**Date:** 2026-08-18 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files

| File | Change |
|---|---|
| `worker/sub.js` | **extended** — `neko` entry in the `RENDERERS` registry behind the unchanged seam (`renderSubscription('neko', opts, { account, endpoints, awg })` → `{ body, contentType }`). New exports: `renderNeko`, `buildNekoLink`. Reuses `resolveEndpoints`/`DEFAULT_ENDPOINTS`/`SUB_MTU`/`reservedToBytes`/`proxyNameOf`/`clientAddressCidrs`/`buildLegacyWireguardOutbound`/`SubscriptionError` from tickets 04–06. AWG accepted for seam uniformity, ignored (not expressible — same decision as `/sub` and `/sub/singbox`). |
| `worker/neko.test.js` | **new** — 16 `node:test` cases (seam-level, no HTTP). Fixtures: the same throwaway records tickets 04–06 generated (regenerated locally; test files are not imported into each other). |
| `worker/index.js` | route wiring: `GET /api/<SUB_PATH>/sub/neko` (+ optional trailing `/`), registered **before** the auth gate; constant-time token compare; `handleSubNeko` (KV-only reads — account + endpoints, **no** AWG read since the wrapped outbound cannot express it; 503 via the shared `missingAccount()` helper; 6 h cache headers); route-map comment updated. |
| `worker/sub.test.js` | one assertion updated: the unknown-format guard asserted `'neko'` (now registered) → switched to `'wg'` (the next not-yet-shipped format — `/sub/wg` zip, ticket 08). |

Forbidden files untouched — confirmed by `git status`: `worker/auth.js`, `worker/account.js`, `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, `wrangler.jsonc`, `package.json` and all non-worker dirs unmodified (only `worker/index.js` + `worker/sub.js` + `worker/sub.test.js` modified, `worker/neko.test.js` added; the other untracked paths in `git status` are the router's own files, untouched).

## Route

| Route | Behaviour |
|---|---|
| `GET /api/<token>/sub/neko` (token = `SUB_PATH` env/secret) | **No session** — the path IS the credential (ADR 0006); wrong or missing token → **404** (never 401). Non-GET → 405. Missing account in KV → **503** (shared `missingAccount()` helper — identical bytes to `/sub`, `/sub/clash`, `/sub/singbox`). Headers: `Content-Type: text/plain; charset=utf-8` (links blob, like `/sub`), `Cache-Control: public, max-age=21600, s-maxage=21600` (6 h, spec). Trailing `/` accepted; near-miss paths (`/sub/nekox`) stay behind the auth gate (anon → 401). |

## Payload / link shape

```
<standard base64 of>
nekoray://custom#<URL-safe base64 of the CustomBean JSON>
nekoray://custom#<URL-safe base64 of the CustomBean JSON>
...
```

One link per **valid** endpoint line, newline-joined, then standard-base64'd as a whole blob — the exact `/sub` envelope convention. The fragment (not the blob) is **URL-safe** base64 — see Surprise 1 / Deviation 1, this is a verified NekoBox hard requirement.

Decoded CustomBean (field-for-field per research §2.2 sample; JSON key order matches the sample):

```json
{
  "_v": 0,
  "addr": "127.0.0.1",
  "cmd": [""],
  "core": "internal",
  "cs": "{\"type\":\"wireguard\",\"tag\":\"warp-162.159.192.1:2408\",\"server\":\"162.159.192.1\",\"server_port\":2408,\"system_interface\":false,\"interface_name\":\"warp-wg\",\"local_address\":[\"172.16.0.2/32\",\"2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8/128\"],\"private_key\":\"…\",\"peer_public_key\":\"bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=\",\"pre_shared_key\":\"\",\"reserved\":[83,128,39],\"mtu\":1280}",
  "mapping_port": 0,
  "name": "warp-162.159.192.1:2408",
  "port": 1080,
  "socks_port": 0
}
```

`cs` is a JSON **string** whose value is the sing-box wireguard **outbound** JSON — the ticket-06 `?legacy=1` shape (same builder, identical values by construction) extended with the three §2.2 fields that shape omits: `system_interface: false`, `interface_name: "warp-wg"`, `pre_shared_key: ""`.

## CustomBean field mapping + sources

| Bean field | Value | Source / rationale |
|---|---|---|
| `_v` | `0` | `fmt/CustomBean.hpp`: `CustomBean() : AbstractBean(0)` — the custom bean's serialized version. §2.2 sample: `"_v":0`. |
| `addr` | `"127.0.0.1"` | The profile's local listen address (AbstractBean base field). Sample value; NekoBox desktop re-allocates ports per running profile. |
| `cmd` | `[""]` | `CustomBean.hpp` `cmd` (stringList) — external-core command; unused for `core:"internal"`. Sample value. |
| `core` | `"internal"` | `CustomBean.hpp` — routes the bean to the bundled sing-box core: `BuildCoreObjSingBox()` returns `QString2QJsonObject(config_simple)` (i.e. the `cs` string parsed as JSON) **as the outbound object** (`fmt/Bean2CoreObj_box.cpp`); `DisplayType()`/`DisplayAddress()` read `cs.type` / `cs.server`+`cs.server_port`. |
| `cs` | the wireguard outbound JSON string (§2.2) | See below. |
| `mapping_port` | `0` | `CustomBean.hpp` — external-core port mapping only; unused by the internal core. Sample value. |
| `name` | `warp-<host>:<port>` | The profile name — research §2.2 + juerson convention; IPv6 re-bracketed (`warp-[2606:…]:2408`) per the shared `proxyNameOf` used by every renderer (tickets 05/06). |
| `port` | `1080` | The local SOCKS port mapping (sample value — the desktop client's per-profile allocation base). |
| `socks_port` | `0` | External-core mapping only (`CustomBean.hpp`). Sample value. |

| `cs` field | Value | Source / rationale |
|---|---|---|
| `type` | `"wireguard"` | §2.3 legacy outbound `type`; `DisplayType()` reads it (must be a JSON object with `type`). |
| `tag` | `warp-<host>:<port>` | The outbound id NekoBox's core sees. **Deviation from the §2.2 sample's static `"wireguard-out"`** — the ticket directs `tag`/`name` = `warp-<endpoint>` (same convention as tickets 05/06 tags), so imported profiles are distinguishable per endpoint. Parsing-neutral: NekoBox does not read `tag` for display, and each imported profile runs its own core instance. |
| `server` / `server_port` | endpoint host/port (IPv6 bare) | §2.3 legacy outbound; `DisplayAddress()` reads both. |
| `system_interface` | `false` | §2.2 sample field — userspace (the NekoBox GUI default); the legacy outbound shape from ticket 06 omits it, the sample carries it. |
| `interface_name` | `"warp-wg"` | §2.2 sample field (consulted only when `system_interface` is true, but emitted per sample). |
| `local_address` | `[v4/32]` (+ `[v6/128]` when the record has v6) | §2.3 first block; same values as ticket 06's legacy outbound. |
| `private_key` / `peer_public_key` | account record values | §2.3; `peer_public_key` = the record's (== WARP_PUB in practice). |
| `pre_shared_key` | `""` | §2.2 sample's explicit empty. |
| `reserved` | base64-decoded record bytes, `[0,0,0]` when empty/unparseable | §2.3 `reserved[]`; same `reservedToBytes` as clash/singbox (`'U4An'` → `[83,128,39]`). |
| `mtu` | `1280` | SUB_MTU (spec / §2.2 sample). |

Verified against primary sources at implementation time (fetched 2026-08-18):
- nekoray `fmt/AbstractBean.cpp` — `ToNekorayShareLink()`: the **canonical share link** is `nekoray://<type>#<fragment>` with the fragment = `toBase64(Base64UrlEncoding)` of the bean JSON → confirms the URL-safe alphabet (and padding) requirement.
- nekoray `fmt/CustomBean.hpp` — bean fields (`core`, `cmd`, `cs`→`config_simple`, `mapping_port`, `socks_port`; base `_v`/`addr`/`port`/`name` from `AbstractBean.hpp`).
- nekoray `fmt/Bean2CoreObj_box.cpp` — `BuildCoreObjSingBox()`: `cs` is parsed and used **directly as the outbound object** for `core:"internal"` → the cs must be a complete legacy wireguard outbound JSON.
- nekoray `sub/GroupUpdater.cpp` — subscription import: whole-body base64 first (standard alphabet), then per-line; `nekoray://` → host `"custom"` → fragment decoded with **`Base64UrlEncoding`** (`DecodeB64IfValid(fragment, Base64UrlEncoding)`) → `FromJsonBytes`.
- nekoray `3rdparty/base64.cpp` — the decoder with `Base64UrlEncoding` **rejects `+` and `/`** (IllegalCharacter) and requires length % 4 == 0 (padding) → standard base64 fragments silently fail to import.
- juerson wireguard-subconverter-worker `src/worker.js` (`buildNekoRayLink`) — the §2.2 sample source (field values; noted deviation on `tag` and on the fragment alphabet).
- Research §2.2 / §2.3 (legacy outbound shape).

## Endpoint semantics (identical to tickets 04–06, by construction)

`renderNeko` calls the same `resolveEndpoints()`: one link per **valid** endpoint line in stored order; malformed entries skipped, never an error; zero valid endpoints (absent/empty/all-malformed) → exactly the two defaults `162.159.192.1:2408` then `engage.cloudflareclient.com:2408`. The route feeds the parsed list from `readEndpoints` (same as `handleSub`). AWG: ignored — no AWG KV read at the route, `awg: null` passed to the seam (not expressible in a wireguard outbound; same decision as `/sub` and `/sub/singbox`).

## Test output

`node --test` (repo root; discovers all `worker/*.test.js`):

```
ℹ tests 126   ℹ pass 126   ℹ fail 0
```

110 prior (14 auth + 20 account + 20 settings + 24 sub + 14 clash + 18 singbox, all still green) + **16 new neko tests**: envelope is standard base64 → one `nekoray://custom#` link per valid endpoint · **byte-identical golden link** vs a hand-built §2.2 literal (the full 500+ char link, hardcoded) · every fragment is URL-safe base64 (regex `[A-Za-z0-9_-]+=*`) and parses to JSON · CustomBean golden deepEqual (`_v`/`addr`/`cmd`/`core`/`cs`/`mapping_port`/`name`/`port`/`socks_port`) · `cs` ≡ ticket-06 legacy outbound + the three §2.2 fields (deepEqual vs `buildLegacyWireguardOutbound` + extra) · every §2.2 cs field with account/endpoint values (incl. reserved bytes `[83,128,39]`) · per-endpoint names (custom port + bracketed IPv6) with bare IPv6 `server` · stored order · v6-less record → v4/32-only `local_address` + `[0,0,0]`, no v6 leak · reserved `'AAAA'`/empty → `[0,0,0]` · malformed skipped, never thrown · fallback on empty/null/undefined/all-malformed · AWG record ignored (byte-identical payloads) · missing account → readable `SubscriptionError`.

`node --check` green on `worker/index.js`, `worker/sub.js`, `worker/sub.test.js`, `worker/neko.test.js`.

## Smoke results (fetch-level, real handler)

Per tickets 01–06 pattern (no wrangler/node_modules/`./out` in the repo): drove the **real** `worker/index.js` fetch via a loader hook substituting `./api-handler.js` (stub exports `onRequestPost/Get/Options` + `I1_MASKS`/`pickI1` — the module-scope imports of index.js/panel.js; the real module needs tweetnacl/qrcode), fake KV bindings (Map), fake ASSETS, real auth. **31/31 checks passed**, exit 0:

1–3. default 200 · `Cache-Control: public, max-age=21600, s-maxage=21600` · `text/plain; charset=utf-8`
4–8. blob decodes to **3** links (5 stored lines, 2 malformed skipped) · every line `nekoray://custom#` · fragments URL-safe base64 · names per endpoint incl. `warp-engage.cloudflareclient.com:51820` and `warp-[2606:…]:2408` · stored order
9–13. CustomBean statics per §2.2 (`_v 0`, `addr 127.0.0.1`, `cmd [""]`, `core internal`, `mapping_port 0`, `port 1080`, `socks_port 0`) · cs parses as wireguard outbound JSON · legacy-outbound fields (server/server_port/mtu/keys) · §2.2 extras (`system_interface` false, `interface_name warp-wg`, `pre_shared_key ""`) · `local_address` v4+v6 + `reserved [83,128,39]`
14–16. absent ENDPOINTS key → the two fallback links in order · all-malformed → fallback pair
17–19. v6-less account → v4/32-only + `[0,0,0]` · AWG record in KV → payload byte-identical to absent · trailing slash → 200
20–22. wrong token → 404 JSON, no cache header, never 401 · missing `SUB_PATH` env → 404
23–24. missing account → 503 readable, no cache header
25–26. POST → 405 · near-miss `/sub/nekox` → 401 anon (stays gated)
27–28. anon `/api/account` → 401 · anon `/` → login page (auth gate intact)
29–31. regressions: `/sub` still 200 + base64 wireguard:// lines · `/sub/clash` still 200 + raw YAML · `/sub/singbox` still 200 + JSON

Harness was throwaway (`$HOME/smoke-07/`), deleted afterwards. Primary-source reference files fetched during research (`$HOME/juerson-worker.js`, `neko-*.cpp/hpp`) also deleted.

## Surprises

1. **The fragment alphabet is a hard NekoBox requirement that the §2.2 sample gets wrong.** The research sample (juerson `buildNekoRayLink`) uses `btoa()` — standard base64 — as the link fragment. But NekoBox desktop's import path (`sub/GroupUpdater.cpp` → `DecodeB64IfValid(…, Base64UrlEncoding)`) uses Qt's url-safe decoder, and the vendored decoder (`3rdparty/base64.cpp`) treats `+`/`/` as **IllegalCharacter** and requires `length % 4 == 0` (padding). So a standard-base64 fragment is silently dropped (`if (j.isEmpty()) return;` — no profile, no error). NekoBox's own share writer (`AbstractBean::ToNekorayShareLink`) encodes the fragment with `Base64UrlEncoding` — the round-trip canonical form is padded URL-safe base64. **Our links use URL-safe (padded) fragments**; the subscription *envelope* stays standard base64 (the whole-blob decoder at the top of `update()` uses the standard alphabet). Deviation from the §2.2 sample, grounded in the parser source — see Deviations 1.
2. **The `cs` field is a runtime outbound, not a display hint.** `CustomBean::BuildCoreObjSingBox()` parses `cs` and hands it to the internal core **as the outbound object** — so `cs` must be a complete, core-valid legacy wireguard outbound (every field the 1.11-era core reads), not just "whatever displays". That's why the ticket-06 legacy outbound + §2.2 extras composition is the right pick: `server`/`server_port` are also read by `DisplayAddress`, `type` by `DisplayType`, and the rest by the core.
3. **`_v: 0` is correct** — the custom bean is the one NekoRay family bean whose serialized version is 0 (its constructor passes 0 to `AbstractBean`), so the sample's `"_v":0` is not a typo.
4. **Smoke-harness footgun (harness-only):** `res.body` is a `ReadableStream` even for string-bodied Responses in Node's fetch — my first `parseBlob` fed the stream to `Buffer.from` and crashed on check 4. Fixed to `await res.text()`; the seam tests had been right all along. Same class of harness-vs-product triage the 04/05/06 results warn about.

## Deviations (with rationale)

- **URL-safe base64 for the link fragment (vs the §2.2 sample's standard base64).** The ticket says "importable by NekoBox desktop" and "field-for-field where it matters for NekoBox desktop parsing"; the importer rejects the standard alphabet outright (Surprise 1). Padded URL-safe (RFC 4648 §5, `+`→`-`, `/`→`_`, padding kept) is what NekoBox generates and parses. The whole-blob envelope remains standard base64 — matching `/sub` and the updater's first decode attempt. (juerson's links with a `+`/`/` in the fragment would be skipped by NekoBox desktop; not our bug to ship.)
- **`cs.tag` is per-endpoint `warp-<host>:<port>` instead of the sample's static `"wireguard-out"`.** The ticket explicitly directs `tag`/`name` = `warp-<endpoint>`; it also matches the tag convention of tickets 05/06 (`proxyNameOf`), so an operator can correlate an imported profile across the four formats. Parsing-neutral for NekoBox (verified: tag is not read by `DisplayType`/`DisplayAddress`; each profile runs its own core instance, so no tag collisions).
- **Compact JSON for the whole link** (`JSON.stringify`, no pretty-printing), including the `cs` string. NekoBox parses both (QJson parse is whitespace-insensitive; the sample's newlines are cosmetic). Keeps links ~25% shorter than the pretty-printed sample.
- **`neko` route passes `{}` opts and skips the AWG KV read** — no query options exist for this format (nothing in the ticket or the reference implementation), and the wrapped outbound cannot express AmneziaWG (same as `/sub`/`/sub/singbox`).
- **`sub.test.js` one-assertion update** — the unknown-format guard asserted `'neko'` throws, which this ticket invalidates by registering it; switched to `'wg'` (the next planned format, `/sub/wg` zip). No product code changed to make tests pass.

## Handoff notes

- Ticket checkboxes: payload decodes to one `nekoray://custom#` link per endpoint ✓ (golden link + envelope tests); wrapped JSON matches the CustomBean shape per §2.2 ✓ (bean + cs field-by-field, verified against nekoray source); seam unit-tested + fetch-level smoke ✓ (the `wrangler dev` item covered by the fetch-level smoke, same decision as tickets 01–06).
- Operator checklist once wrangler runs: `curl <sub-neko-url>` → paste the URL into NekoBox desktop ("Update subscription") → confirm one profile per endpoint appears (names `warp-<host>:<port>`), each connects, and the subscription refreshes without re-importing; compare with the `/sub/singbox?legacy=1` payload (same outbound values, different envelope).