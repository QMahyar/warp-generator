# Research: Source updates — what changed in our upstream dependencies since the 2026-08-15 baseline

Sources: see per-section links (GitHub repos/issues/PRs, Cloudflare docs/changelogs, live API probes).
Research date: 2026-08-15. Findings only — no code copied.
Context: re-check of docs/research/bpb-panel.md and docs/research/multi-account-subs.md against PRIMARY sources,
plus live probes of `api.cloudflareclient.com`.

## Q1: WARP /reg private API — endpoint version, headers, response fields

### The app has moved on from v0a2158
- Current Android 1.1.1.1 app is **6.38.6 (build 5101)**: `POST /v0a5101/reg`, header
  `CF-Client-Version: a-6.38.6-5101`, `User-Agent: okhttp/4.12.0`, `type` field **removed** from the body,
  `serial_number` added (sent as `""`). Verified with a live HTTP 200 registration.
  Source: https://github.com/osamingo/warp-wg/pull/11 (merged 2026-03-29, APK decompilation with jadx).
- wgcf (maintained, see Q2) uses **v0a1922** (`CF-Client-Version: a-6.3-1922`, UA `okhttp/3.12.1`) and pins its
  transport to **TLS 1.2 only, HTTP/2 disabled**, with the comment "Match app's TLS config or API will reject us
  with code 403 error 1020". Source: https://github.com/ViRb3/wgcf/blob/master/cloudflare/api.go
- badafans/warp-reg `official-warp-api.txt` is **unchanged** (v0a2158 / a-6.10-2158, extracted from app v6.10);
  repo has only 2 commits, no releases. The dump remains a useful reference but is stale relative to the app.
  Source: https://github.com/badafans/warp-reg

### Live probe of endpoint paths (2026-08-15, GET /reg from a residential IP)
- `v0i1909051800` (what lib/cloudflare-client.ts:3 uses), `v0a2158`, `v0a1922`, `v0a4005`, `v0a5101` all answer
  `405 Method Not Allowed` on GET — i.e. **all paths are still alive** for POST.
- Rapid successive requests from one IP get **connection-dropped (curl exit 000/EOF)** before any HTTP response;
  spacing requests ~8 s made every path answer 405 again. This is connection-level throttling from the client IP,
  consistent with the known per-IP rate limiting (docs/research/multi-account-subs.md Q2).
- A third-party panel reported the same class of failure in the wild: "Cloudflare started terminating v0a2158
  registrations with EOF when the client sent the bare User-Agent / minimal headers"; they moved to v0a4005 +
  first-party headers with a v0a2158 fallback. Source: https://github.com/masjeho2/s-ui-rus-inst/commit/db6eca2

### Verdict for our design
- `v0i1909051800` + minimal headers still works today, but it is the oldest combination in use and the only one
  that omits `CF-Client-Version` entirely — the one header every official client sends. The risk is not today's
  405s but Cloudflare tightening header validation (the EOF reports above). **Cheap hardening: add
  `CF-Client-Version` and consider moving BASE_URL to `v0a1922`** (the version the actively-maintained wgcf
  uses). Keep the response contract (id/token/account/config) unchanged — it has not moved.
- `type: "ios"` is still accepted (wgcf sends `"Android"`, the new app sends none); response parsing in
  lib/cloudflare-client.ts is unaffected.

## Q2: wgcf status — alive and maintained

- **Not archived, no successor needed.** Latest release **v2.2.32 (2026-07-23)**; releases continue through
  2025–2026: v2.2.27 (2025-06), v2.2.28 (2025-08), v2.2.29 (2025-08), v2.2.30 (2026-01), v2.2.31 (2026-05).
  Source: https://github.com/ViRb3/wgcf/releases
- v2.2.29 (2025-08-22) added device management (`wgcf update --activate/--deactivate/--remove DEVICE_ID`) and
  license-key-from-CLI; v2.2.28 (2025-08-14) "workaround api issues, see #515" — that issue is the Aug 2025
  spike of `500 Internal Server Error` from `/reg`, i.e. Cloudflare-side churn that got worked around.
  Source: https://github.com/ViRb3/wgcf/issues/515
- v2.2.32 restores "old tls fingerprint", closing #613: **429 Too Many Requests on 2–3 rapid successive
  registrations** (v2.2.31 regression). Registration remains IP-rate-limited; bursts of registrations from one
  IP are the fragile operation. Source: https://github.com/ViRb3/wgcf/issues/613

### Verdict for our design
- No successor to migrate to; wgcf's current constants (v0a1922 / a-6.3-1922 / okhttp/3.12.1, TLS-1.2 pin) are the
  best-documented working combination and the natural reference for any header changes (Q1).
- wgcf's #613 confirms the multi-account-subs Q2 verdict: **space out registrations** (seconds-to-minutes apart,
  not back-to-back).

## Q3: Cloudflare Workers + KV, cache, wrangler — 2025-2026 changes

### KV: limits unchanged, API routes moved, no deprecation
- Free-plan limits are unchanged as of Apr 2026: 100 k reads/day, 1 k writes/day, 1 k deletes/day, 1 k list/day,
  1 GB storage, 1 write/sec per key, 25 MiB values. Source: https://developers.cloudflare.com/kv/platform/limits/
- 2025-01-28: KV namespaces per account raised **200 → 1000** (all plans).
  Source: https://developers.cloudflare.com/changelog/product/kv/
- 2026-07-15: legacy KV REST routes `/accounts/{id}/workers/namespaces/*` are deprecated → move to
  `/accounts/{id}/storage/kv/namespaces/*`; old routes stop working **2026-10-15**. Direct URL substitution;
  request/response shapes identical. `wrangler kv namespace` uses the replacement API internally, so
  scripts/deploy-warp-panel.sh is unaffected. Source: https://developers.cloudflare.com/changelog/product-group/storage/
- KV itself is not deprecated. The "move toward SQLite" news is about **Durable Objects** (new DO namespaces must
  use the SQLite backend as of 2026-07-09); it does not affect KV. Source: https://developers.cloudflare.com/changelog/post/2026-07-09-restrict-new-kv-backed-namespaces/

### Workers Caching / purge / s-maxage
- `ctx.cache.purge({tags, pathPrefixes, purgeEverything})` (and `cache.purge` import from `cloudflare:workers`)
  is documented GA; purges are scoped **per entrypoint**, use Instant Purge, and are **rate-limited like zone
  purge** (free tier: low single-digit purges/min). `Cache-Tag` limits: printable ASCII, ≤1024 chars, ≤1000 tags.
  Source: https://developers.cloudflare.com/workers/cache/purge/
- **s-maxage semantics hardened**: per RFC 9111, `s-maxage` implies `proxy-revalidate` → Cloudflare **disables
  stale-while-revalidate and stale-if-error** when `s-maxage` (or `must-revalidate`/`proxy-revalidate`) is
  present. On expiry the edge blocks and revalidates with the Worker — no stale serving. This is exactly what
  ADR 0006's short `s-maxage` intends (fresh config after re-pin within one TTL window); just don't expect SWR
  to kick in, and don't combine `s-maxage` with `stale-while-revalidate`.
  Source: https://developers.cloudflare.com/cache/concepts/cache-control/ , https://developers.cloudflare.com/workers/cache/configuration/
- **New default: heuristic freshness.** Workers Caching applies RFC 9111 heuristic TTLs when a response carries
  no `Cache-Control` — e.g. `200` cached ~2 h, `404` ~3 min. Our 404s for wrong SUB_PATH tokens are therefore
  cached by default; harmless (the token holder already knows the URL), but set explicit `Cache-Control` on
  error responses if we want deterministic behavior. Source: https://developers.cloudflare.com/workers/cache/debugging/
- 2025-08-07: Worker-initiated `fetch` with `cache: "no-cache"` now forces origin revalidation instead of
  throwing (relevant if we ever do Worker→Worker cache-busting). Source: https://developers.cloudflare.com/changelog/post/2025-08-07-cache-no-cache/
- Origin Cache Control: still **enabled by default on Free/Pro/Business**; `s-maxage`/`max-age` handling otherwise
  unchanged. Source: https://developers.cloudflare.com/cache/concepts/cache-control/

### wrangler
- `wrangler.jsonc` supported since v3.91.0 and recommended for new projects; auto-config (no config file) is GA
  since wrangler 4.68.0 and generates `wrangler.jsonc`. Our wrangler.jsonc layout (kv_namespaces, vars, assets)
  matches current docs. Source: https://developers.cloudflare.com/workers/wrangler/configuration/
- wrangler v4 deprecations (Workers Sites, `legacy_env` service environments) do not touch us.
  Source: https://developers.cloudflare.com/workers/wrangler/deprecations/
- Workers Free plan limits unchanged: 100 k requests/day, 10 ms CPU, 128 MB, 50 subrequests/invocation,
  6 simultaneous outbound connections/request, 100 Workers, 20 k static asset files/25 MiB each.
  Source: https://developers.cloudflare.com/workers/platform/limits/

### Verdict for our design
- KV storage plan in multi-account-subs.md Q3 stands untouched (limits identical); the 2026-10-15 REST-route
  change only matters for hand-rolled API calls, not `wrangler kv` or runtime KV bindings.
- ADR 0006's `s-maxage` approach is confirmed sound and now well-documented (block-on-revalidate, no stale);
  keep TTL short, no purge machinery needed. Tag-based purge stays a possible future optimization (e.g. one
  `Cache-Tag: sub:<token>` per subscription) with the free-plan purge rate limit in mind.

## Q4: BPB panel — active, and v5 restructures auth + deployment

- Active development throughout 2025–2026: v4.1.3 (2026-02), v4.2.2 (2026-06), v4.2.3 (2026-06), then
  **v5.0.0 (2026-07-08) and v5.1.0 (2026-07-13)** — both pre-release, wizard-deploy-only ("BPB Next Generation").
  Source: https://github.com/bia-pain-bache/BPB-Worker-Panel/releases
- v5 changes that matter for our reference:
  - **Login now requires the Cloudflare account email as username** (addressing a security concern, #1348).
  - **All panel/subscription URLs sit behind a compulsory random `SECURE PATH`** (e.g. `https://worker.dev/<SECURE_PATH>/panel`)
    — a generalisation of our SUB_PATH (ADR 0006) from "sub path" to "everything path". Old `/panel` entry gone.
  - **No env vars anymore**: all settings are hardcoded into the script by the wizard; explicitly **not** using
    D1/KV ("due to D1 delay overhead"). Warp accounts are likewise baked in ("Updated default Warp accounts").
  - Warp Reserved bytes made optional (#1236, some ISPs flag them) — relevant to our `I1 = <b 0x…>` mask handling.
  - Fixes named "undefined in subscriptions links and Warp registration" (#1270 #1291), sing-box subscription fixes.
- v4.x: sing-box DNS-feature adaptation, Xray FinalMask, ECH fixes (#1190 #1224), removed `allowInsecure`.

### Verdict for our design
- v5 validates our token model: BPB moved **toward** an unguessable path as the security boundary for every URL,
  exactly ADR 0006's shape. No change needed on our side.
- BPB's no-KV stance is about *settings/accounts baked into the script at deploy time*; it does not invalidate
  our KV choice — we keep a registered account + endpoint list in KV because re-deploying on every change is not
  our workflow. But it is a reminder that KV write budget is not the constraint — deploy-time baking is a viable
  alternative for endpoints.
- The reserved-bytes change (#1236) is a signal to double-check our I1 mask defaults against current ISP behavior.

## Q5: Other dependencies

- **Cloudflare IP ranges API** (`https://api.cloudflare.com/client/v4/ips`) — verified live 2026-08-15
  (returns ipv4_cidrs/ipv6_cidrs/etag). We do not consume it: `lib/ip-ranges.ts` and scripts/build-ip-ranges.mjs
  are fed by hand-maintained `config/services/*.json`. No action.
- **Default endpoints** (config/endpoints.ts): `162.159.195.1:500` and `engage.cloudflareclient.com:2408` — still
  the canonical WARP anycast pair; `engage.cloudflareclient.com:2408` is the peer host in the current
  official-warp-api.txt dump. No change.
- **Protocol note**: the 1.1.1.1 apps switched to **MASQUE by default (Dec 2024)**; WireGuard mode remains
  selectable and the WireGuard /reg flow is what every third-party tool still uses (wgcf, warp-reg, BPB, us).
  No announcement of WireGuard /reg retirement. Source: https://blog.cloudflare.com/masque-now-powers-1-1-1-1-and-warp-apps-dex-available-with-remote-captures/
- **Deploy wizard** (scripts/deploy-warp-panel.sh): requires wrangler ≥3 — current wrangler is 4.x; the commands
  it uses (`wrangler login/secret put/kv namespace/deploy`) are unchanged in v4. `wrangler.jsonc` handling is
  current best practice. Optionally bump the preflight floor to ≥4.

## Summary — actionable updates (one line each)

1. `/reg` path + minimal headers still work, but add `CF-Client-Version: a-6.3-1922` and consider switching
   BASE_URL v0i1909051800 → v0a1922 to match the maintained wgcf (verified live: all paths answer 405 on GET).
2. The new app sends no `type` field and adds `serial_number` — body changes are optional, response shape unchanged.
3. wgcf is actively maintained (v2.2.32, 2026-07); no successor migration; its TLS-1.2/HTTP2-off pin is the
   documented "don't get 403 error 1020" recipe.
4. Registration is still per-IP rate-limited and rapid bursts get connection-dropped (wgcf#613, live probe) —
   keep registrations spaced; multi-account plans must throttle.
5. KV free limits unchanged (100 k reads / 1 k writes per day) — the KV storage plan from multi-account-subs.md Q3
   needs no revision.
6. Legacy KV REST routes die 2026-10-15 (move to /storage/kv/namespaces/*) — wrangler-based deploy unaffected.
7. `s-maxage` now officially disables stale-while-revalidate/stale-if-error (RFC 9111) — ADR 0006's short
   s-maxage gives block-on-revalidate freshness, exactly as intended.
8. Workers Caching heuristically caches responses with no Cache-Control (200 ≈ 2 h, 404 ≈ 3 min) — set explicit
   Cache-Control on our 404s if we want deterministic behavior.
9. BPB v5 (Jul 2026) moved all URLs behind a compulsory SECURE PATH and requires CF email login — validates our
   SUB_PATH design; BPB still avoids KV by baking settings/accounts into the script.
10. MASQUE is the app default (Dec 2024) but WireGuard /reg is unretired and used by every tool in the ecosystem —
    no timeline signal; this remains the project's existential-risk item to watch.

## Open questions

1. **Header tightening risk**: how long will `/reg` accept the minimal header set (no CF-Client-Version)?
   wgcf and the app always send it; the EOF reports suggest CF has started rejecting the bare-minimum combo.
   Test a real POST (side effect: creates an account) with current vs wgcf-style headers before relying on it.
2. **Workers-egress TLS**: wgcf pins TLS 1.2 + disables HTTP/2 to avoid "403 error 1020" — does the Workers
   runtime's fetch (its own TLS/HTTP stack, can't be pinned) ever trip the same check on registration from a
   Worker? No evidence either way; if worker-side registration starts failing, browser-side registration is the
   fallback (multi-account-subs.md Q2).
3. **Connection-level throttle parameters**: our probe showed ~3 s spacing can still get connection-dropped;
   what is the safe inter-registration interval from one IP (10 s? 1 min?)? wgcf#613 users hit it at 2–3 rapid
   runs; ErcinDedeoglu/cloudflare-warp suggested ~10 concurrent max. No official number exists.
4. **Free WARP terms**: no 2025–2026 changes found (unlimited data on free, WARP+ Unlimited $4.99/mo app-store
   only, 5-device license limit). Confirm nothing changed in Cloudflare's application ToS before depending on
   unmetered free accounts long-term.
5. **BPB v5 stable**: v5.0/5.1 are pre-releases; re-check the stable v5 notes for the final SECURE PATH / auth
   model and the "updated default Warp accounts" practice before borrowing more from it.
6. **MASQUE trajectory**: Cloudflare now defaults every app to MASQUE and has said nothing about WireGuard mode;
   if WireGuard access is ever retired, our whole config model dies with it. Worth a periodic re-check of the
   WARP client changelogs (https://developers.cloudflare.com/cloudflare-one/changelog/cloudflare-one-client/).