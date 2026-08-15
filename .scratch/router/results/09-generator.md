# 09 — Generator page reusing the stored account

Status: done (left in the working tree, no commit).

## Files

| File | Change |
|---|---|
| `worker/generate.js` | **new** — the single generator engine. Builders/constants moved verbatim from api-handler.js (single-engine discipline: nothing duplicated); registration path (`generateKeyPair`/`registerClient`/`enableWarp`) deleted entirely; adds the pure seam `renderGeneratedConfig(account, opts)`, the gated route handler `handleGeneratePost(request, env)`, and the static page registers `FORMATS` / `SERVICES` / `DNS_PROVIDERS` / `I1_MASKS` / `pickI1`. |
| `worker/api-handler.js` | **deleted** — its per-request registration and route handlers were the ticket's removal target; its builders/constants were moved to generate.js (the ticket allows this). Only importers were `worker/index.js` and `worker/panel.js`, both updated. |
| `worker/index.js` | legacy public `/api/generate` GET/POST/OPTIONS/405 block removed; `POST /api/generator` wired inside the auth gate (anon → 401); route-map comment updated (legacy route retirement + Next.js note). |
| `worker/panel.js` | Generator card added to the shell (framework-less, all dynamic values via textContent / `.value` / `img.src` — no innerHTML assignments) + the card's script; imports now from `./generate.js`. |
| `worker/generate.test.js` | **new** — 35 tests (see Test output). |
| `docs/…`, `wrangler.jsonc`, `package.json`, `config/services/*`, `worker/{auth,account,settings,sub,zip}.js` | untouched (only comment-level mentions of api-handler.js remain in sub.js/account.js docs — historical, per the no-modify rule). |

## Route map (worker/index.js)

- `POST /api/generator` — session-gated; reads ACCOUNT KV (`readAccount`, same validation as the sub routes); missing/corrupt account → 503 `{success:false, message:"No WARP account registered yet — register or import one first (account card)."}`; unknown format → 400 legacy message; other failures → 500 `Error: …` legacy wrapping. Response keeps the legacy contract: `{ success, content: { configBase64, qrCodeBase64, configFormat, fileName } }`.
- `GET /api/generator/formats` — not added: the page embeds the 7-format list statically (ticket's allowed option), so no extra route or fetch.
- Legacy `/api/generate` GET/POST/OPTIONS — **removed from the router**. Anon requests hit the auth gate (401 — the gate, not the route); authenticated requests fall through to ASSETS (404 in the smoke env). No match-all CORS preflight remains.

Nothing else in the repo calls the old route from the worker side. The unmaintained Next.js app (`hooks/use-generator.ts` → `fetch('/api/generate')`, `app/api/generate/route.ts`) still points at it: that is fine — ADR 0004 retired the Next.js UI (the panel replaces it), the path only matters when running the Next.js dev server (where its own route handler still exists, independent of the worker), and any static-export install served by the worker now receives the password-gated panel instead.

## Page surface (panel Generator card)

Format selector (7: AmneziaWG/wireguard, Throne, Clash, NekoRay, Husi, Karing, WireSock — names/extensions/QR support from `FORMATS`), device select (AmneziaWG 1.5, the only legacy UI option), endpoint override text input defaulting to the **first valid stored endpoint** (fetched from `/api/settings`; fallback `162.159.192.1:2408`; empty input → legacy `engage.cloudflareclient.com:4500` send), DNS selector (8 providers; community entries labelled with `•` like the legacy UI), site-mode select (all/specific), name-only service chips (no icons), IPv6 toggle (default on), exclude-LAN toggle (all-sites only; picking any service or switching to "specific" turns it off — legacy `use-generator.ts` semantics), persistent-keepalive toggle + value input (default 25 when enabled), custom-I1 domain input (shown only when the wireguard format is selected — the only format where I1 lands), Generate button, result panel with file name, Copy (clipboard via atob), Download (data:octet-stream, legacy filename scheme) and Show/Hide QR. A static hint links to `#account-card`; the card also disables Generate and flags "No account" when `/api/account` reports none — while the server still 503s independently.

## Parity decisions (all preserved exactly)

- Community DNS forces siteMode `'all'` **server-side** (services dropped) + mirrored in the UI (selecting a community DNS locks all, disables "specific", clears chips; the UI refuses switching back to "specific").
- wiresock `Id = <masking domain>` (`Ip = quic`, `Ib = firefox`); custom I1 domain doubles as the mask domain (legacy behavior).
- husi `persistent_keepalive_interval: 600` hardcoded (request keepalive ignored).
- clash `allowed-ips: ['0.0.0.0/0']` hardcoded (site mode ignored) + reserved CSV form `[83, 128, 39]`.
- throne `wg://` with key-minus-`=`, `WARP_PUB` hardcoded, reserved dashed `83-128-39`, junk params, `local_address` v4/32-v6/128, `#WARP`; QR = full link.
- wireguard QR strips the MTU line; wiresock QR = full .conf; QR only for wireguard/throne/wiresock (`qrcode` via `find_additional_modules` + `nodejs_compat`, lazily imported so `node --test` runs without node_modules — same lazy pattern as account.js's tweetnacl; a `__setQrCodeImpl` test hook swaps the encoder).
- MTU 1280 everywhere; I1 mask only for the `awg15` device (the only device the UI offers); custom I1 domain → generated QUIC line (the full QUIC port lives in generate.js verbatim).
- Keepalive normalization, endpoint default, file names (`WARP`/`UPPER` + 7-digit id + ext), community-DNS, exclude-LAN and DNS line ordering (`buildDnsLine` v4-then-v6) — all byte-identical to the legacy handler.

## Services-names approach (documented choice)

Plain embedded array `SERVICES` (27 `{id, name}` entries, name-sorted exactly like `config/services-loader.ts`) in generate.js instead of a JSON import: the worker bundle has no JSON build step and `node --test` (no node_modules in this repo) cannot resolve extensionless JSON imports. The ids double as the `IP_RANGES` keys the server matches — names alone would not function. The inventory's "26 entries" was already stale (27 files ship today); a test pins the count/order/ids so drift is visible. Comment in the file says to keep in sync by review.

## Test output

`node --test worker/*.test.js` → **218 tests, 218 pass, 0 fail** (183 prior + 35 new). `node --check` clean on every `worker/*.js`. New coverage:

- Every format renders from the stored record (key + v4/v6 in decoded output; format-specific shape: conf lines, wg:// link, clash YAML, sing-box JSONs, karing outbound).
- QR returns `data:image/png;base64,…` for wireguard/throne/wiresock, `''` otherwise; wireguard QR payload has no MTU line; throne QR = full link; graceful `''` fallback without an encoder.
- Community-DNS forcing (services dropped, telegram range absent), specific-site routing with non-community DNS, exclude-LAN all-sites list.
- Keepalive normalization (25 kept, floored, 0/65536+ dropped), I1 for awg15 only, custom-I1 QUIC generation, endpoint default, legacy file names.
- Missing account → GeneratorError 503 readable (`register or import`); unknown format → 400 legacy message; handler 405/500 paths; corrupt KV → 503.
- Minimal record (no v6/reserved, conf-import shaped) renders all formats.
- Worker-level smoke through the real router: gated route anon → 401; old `/api/generate` anon → 401 (gate) and authed → 404 (fallthrough); per-format end-to-end generation from a fake-KV stored account; missing account → 503; OPTIONS on the gated route → 405.

## Smoke results (fetch-level, per the established pattern)

- Generate each of the 7 formats with a fake-KV stored account via the real router + `handleGeneratePost` → all 200; each payload base64-decodes and carries the stored private key/addresses.
- **No network during generation**: `globalThis.fetch` stubbed to fail the test on any call — zero calls across all 7 formats and the handler path; asserts specifically that nothing reaches `api.cloudflareclient.com` (no `/reg`, no enableWarp).
- Missing account → 503 with the readable register-or-import message (handler + router).
- Gated routes anon → 401; old `/api/generate` → 404 (authed fallthrough; anon hits the gate).
- Panel render sanity: shell contains the generator card, 7 format options, 8 DNS options, embedded SERVICES list, `/api/generator` fetch, the account-card link, and no innerHTML assignments.

## Surprises

1. **`qrcode`/`tweetnacl` are not installed anywhere** (no node_modules in the repo, not even global) — the legacy static `import QRCode from 'qrcode'` in api-handler.js was untestable. Solved with the lazy import + `__setQrCodeImpl` hook (same shape as account.js's lazy tweetnacl); the worker bundle still resolves `qrcode` via `find_additional_modules` + `nodejs_compat`.
2. **The inventory says 26 services; the repo ships 27** (`config/services/*.json`) — the embedded list is generated from the real files (see above).
3. `throne` strips the trailing `=` from the private key, so naive "key present" assertions fail for it — the tests accept both forms (that strip itself is a parity quirk, kept).
4. `buildDnsLine` emits v4-then-v6 (not the interleaved legacy `DNS` const which was dead code) — the const was dropped and tests assert the actual line order.
5. Old `/api/generate` anon → 401 (the auth gate), not 404; only authenticated requests 404 via the ASSETS fallthrough. Documented in the route-map comment — the route is gone either way.

## Deviations (with rationale)

- **`worker/api-handler.js` deleted rather than left as a shim** — the ticket permits moving its builders/constants into the new generate module; a re-export shim would keep a misleading name and two files where one engine is the point (single-engine discipline). Both importers were updated in the same change.
- **No `GET` formats route** — the ticket offers "session-gated route or static embed"; the page embeds `FORMATS` (it needs the list to render the selector anyway), so no route was added.
- **Throne `local_address` for v6-less records** — builders were moved verbatim, so the legacy `/32-/128` output is kept (parity trumps the cosmetic fix; sub.js's documented deviation for the same case stands on its own for subscriptions). No real WARP record lacks v6, and the minimal-record test covers that the formats still render.
- **QR test hook** (`__setQrCodeImpl`) — the only way to assert QR behaviour under `node --test` without a package install; the worker bundle path is unchanged (lazy `import('qrcode')` → `.default`).