# Result — ticket 05: /sub/clash — raw Clash YAML

**Date:** 2026-08-17 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files

| File | Change |
|---|---|
| `worker/sub.js` | **extended** — `clash` entry in the `RENDERERS` registry behind the unchanged seam (`renderSubscription('clash', opts, { account, endpoints, awg })` → `{ body, contentType }`). New exports: `renderClash`, `buildClashProxy`, `buildAmneziaWgOption`. Reuses `resolveEndpoints`/`DEFAULT_ENDPOINTS`/`SUB_MTU`/`SubscriptionError` from ticket 04. |
| `worker/clash.test.js` | **new** — 14 `node:test` cases (seam-level, no HTTP). Fixtures: the same throwaway records ticket 04 generated (regenerated locally; test files are not imported into each other — importing a test file would execute its suite in-process). YAML parsed with a tiny indentation-based subset parser written in the test file (map/seq/scalar + flow arrays, ~80 lines, zero deps). |
| `worker/index.js` | route wiring: `GET /api/<SUB_PATH>/sub/clash` (+ optional trailing `/`), registered **before** the auth gate like `/sub`; constant-time token compare; `handleSubClash` (KV-only reads incl. `readAwg`, 503 on missing account, 6 h cache headers); the 503 body was factored into a `missingAccount()` helper shared with `handleSub` (identical bytes, no behaviour change); route-map comment updated. |
| `worker/sub.test.js` | one assertion updated: the "unknown format" guard used `'clash'` (which is now registered) → switched to `'singbox'` (next not-yet-shipped format). |

Forbidden files untouched — confirmed by `git status`: `worker/auth.js`, `worker/account.js`, `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, `wrangler.jsonc`, `package.json` unmodified (only `worker/index.js` + `worker/sub.js` + `worker/sub.test.js` modified, `worker/clash.test.js` added).

## Route

| Route | Behaviour |
|---|---|
| `GET /api/<token>/sub/clash` (token = `SUB_PATH` env/secret) | **No session** — the path IS the credential (ADR 0006); wrong or missing token → **404** (never 401). Matched before the generic `/sub` pattern (the two regexes are disjoint). Non-GET → 405. Missing account in KV → **503** `{"error":"No WARP account registered yet — open the panel and run Register first."}`. Headers: `Content-Type: text/plain; charset=utf-8`, `Cache-Control: public, max-age=21600, s-maxage=21600` (6 h, spec). Trailing `/` accepted (same call as ticket 04); near-miss paths (`/sub/clashzz`) stay behind the auth gate (anon → 401). |

## YAML shape (raw, never base64)

Verified against `docs/research/sub-formats.md` §2.4 and the mihomo wiki `proxies/wg` page (fetched 2026-08-17):

```yaml
proxies:
  - name: "warp-162.159.192.1:2408"
    type: wireguard
    server: "162.159.192.1"
    port: 2408
    ip: "172.16.0.2"
    ipv6: "2606:4700:110:82ce:a1b2:c3d4:e5f6:a7b8"   # only when the record has v6
    private-key: "..."
    public-key: "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
    reserved: [83,128,39]                              # [a,b,c] bytes of the record reserved
    udp: true
    mtu: 1280
    remote-dns-resolve: true
    dns: [1.1.1.1]
    amnezia-wg-option:                                 # only when AWG is on
      jc: 4
      jmin: 40
      jmax: 70
      s1: 0
      s2: 0
      s3: 22
      s4: 7
      h1: "1"
      h2: "2"
      h3: "3"
      h4: "4"
      i1: "<b 0x61>"
proxy-groups:
  - name: "PROXY"
    type: select
    proxies:
      - "warp-162.159.192.1:2408"
      - "warp-[2606:4700:4700::1111]:2408"
rules:
  - MATCH,PROXY
```

Details:

- **Names**: `warp-<host>:<port>` (research §2.4 + juerson's `warp-${ip_with_port}` convention); IPv6 hosts re-bracketed in the name (`warp-[2606:…]:2408`). All scalars double-quoted — names/servers contain `:`, `[`, `]` which are YAML indicators in flow/prefix position; quoting is the robust form (mihomo's own sample quotes them).
- **`server`** is the stored host exactly as settings.js parses it (IPv6 **unbracketed** — brackets are only an endpoint-line syntax; mihomo accepts the bare address).
- **`ip`/`ipv6`** are the bare record addresses without CIDR (mihomo appends `/32`/`/128` itself, see `Prefixes()` in mihomo's wireguard.go). `ipv6` key omitted entirely when the record has no v6.
- **`reserved`** = `[a,b,c]` bytes from base64-decoding the record's `reserved` (legacy `reservedToBytes` parity, replicated in sub.js — api-handler.js untouched). Empty/unparseable → `[0,0,0]`. (A record whose reserved doesn't decode to exactly 3 bytes would emit that length verbatim, same as the legacy builder; WARP's client_id always decodes to 3.)
- **`udp: true`, `mtu: 1280`, `remote-dns-resolve: true`, `dns: [1.1.1.1]`** on every proxy per the ticket. No `allowed-ips` (the ticket lists no such field; mihomo's wiki notes traffic splitting is handled by clash, and §2.4's sample omits it for single-peer form).
- **Document tail**: `proxy-groups:` with one `select` group named `PROXY` listing every proxy name (same order as `proxies:`), `rules:` with `MATCH,PROXY`. Body ends with a trailing newline (standard YAML document terminator; harmless for clients, exact for hashing).

## amnezia-wg-option mapping (settings record → mihomo keys)

The stored AWG record (settings.js) is `{ enabled, Jc, Jmin, Jmax, S1–S4, H1–H4, I1–I5 }` (all strings, empty = omitted). mihomo's documented `AmneziaWGOption` (verified in mihomo `adapter/outbound/wireguard.go`, Meta branch) is:

| stored | emitted YAML key | notes |
|---|---|---|
| `Jc` | `jc` | bare int |
| `Jmin` | `jmin` | bare int |
| `Jmax` | `jmax` | bare int |
| `S1`–`S4` | `s1`–`s4` | bare ints |
| `H1`–`H4` | `h1`–`h4` | quoted strings — mihomo's struct is `string` (WeaklyTypedInput; the v2 range form `"123456-123500"` is legal) |
| `I1`–`I5` | `i1`–`i5` | quoted strings = the bare CPS chain (see below) |

- **Only non-empty fields are emitted** (`S3/S4/I1–I5` are empty in the defaults record → absent). This mirrors mihomo's own `genIpcConf`, which writes uapi lines only for non-zero/non-empty option values.
- **Enabled-and-empty guard**: if the record is enabled but every param is empty (not reachable via the panel — `parseAwgParams` fills defaults — but possible from a foreign record), `amnezia-wg-option` is omitted entirely: a bare `amnezia-wg-option:` would parse as nil in mihomo and behave as absent anyway; omitting is the honest form. `awg` null / `enabled !== true` → no option anywhere (verified per-proxy and whole-body).
- **I-value shape (deviation, see below)**: settings stores full `.conf` CPS lines (`"I1 = <b 0x…>"`, validated by that exact regex in settings.js); the `I<n> = ` prefix is stripped before emission. Verified end-to-end: mihomo passes the YAML `i1` value verbatim into the amneziawg-go uapi `i1=…` line (`genIpcConf`), and amneziawg-go's `newObfChain` parses `<tag …>` elements — the chain is the value; the conf-line prefix is a `.conf`-format artifact.

## Content-Type choice

**`text/plain; charset=utf-8`** — exactly what the research's reference implementation serves (juerson wireguard-subconverter-worker, `src/worker.js`: `new Response(clashConfig, { headers: { "Content-Type": "text/plain; charset=utf-8" } })`). Clash-family clients (Verge Rev, FLClash, ClashMetaForAndroid, Karing) fetch the URL and parse the body as YAML text; none sniff a YAML media type — there is no registered one. `application/octet-stream` would risk charset mangling in decoding proxies for no gain. §2.4 ("raw YAML, never base64") is the payload decision; text/plain is the transport convention.

## Endpoint semantics (identical to ticket 04, by construction)

`renderClash` calls the same `resolveEndpoints()` the `sub` renderer uses: one proxy per **valid** endpoint line in stored order; malformed entries (`null`, empty host, out-of-range/string ports, raw strings) skipped, never an error; zero valid endpoints (absent/empty/all-malformed) → exactly the two defaults `162.159.192.1:2408` then `engage.cloudflareclient.com:2408`, both rendered as full proxies in the group too. The route feeds it the parsed list from `readEndpoints` (same as `handleSub`).

## Test output

`node --test` (repo root; discovers all `worker/*.test.js`):

```
ℹ tests 92   ℹ pass 92   ℹ fail 0
```

78 prior (14 auth + 20 account + 20 settings + 24 sub, all still green) + **14 new clash tests**: raw-YAML-not-base64 + top-level keys · golden byte-identical document for one v4 endpoint (AWG off) · one proxy per valid endpoint with `warp-<host>:<port>` names incl. bracketed IPv6 and custom port, group lists the same names · §2.4 required fields on every proxy (type/server/port/ip/keys/udp/mtu/remote-dns-resolve/dns) · reserved `[83,128,39]` from `'U4An'` and `[0,0,0]` when empty · `ipv6` present/absent by record · amnezia-wg-option absent for null/undefined/`enabled:false`/`{}` · full option mapping incl. i1 prefix strip and empty-field omission (defaults record → exactly `jc,jmin,jmax,s1,s2,h1,h2,h3,h4`) · `buildAmneziaWgOption` unit contract (null on empty-enabled) · malformed skipped · fallback on empty/null/all-malformed · missing account → readable `SubscriptionError`. All YAML assertions run through the in-test mini parser (see deliverable below for why it's trustworthy here).

`node --check` green on `worker/index.js`, `worker/sub.js`, `worker/sub.test.js`, `worker/clash.test.js`.

## Smoke results (fetch-level, real handler)

Per tickets 01–04 pattern (no wrangler/node_modules/`./out` in the repo): drove the **real** `worker/index.js` fetch via a loader hook substituting `./api-handler.js` (stub exports `onRequestPost/Get/Options` + `I1_MASKS` — the real module needs tweetnacl/qrcode), fake KV bindings (Map), fake ASSETS, real auth. **35/35 checks passed**, exit 0:

1. anon `/api/account` → 401 (auth gate intact)
2–4. sub/clash 200 · `Cache-Control: public, max-age=21600, s-maxage=21600` · `text/plain; charset=utf-8`
5. body is raw YAML (starts `proxies:`, not base64)
6–11. 3 proxies from 5 endpoint lines (2 malformed skipped) · names incl. bracketed IPv6 + custom port · `type: wireguard` on all · required fields (keys, ip, mtu, udp, remote-dns-resolve, dns `[1.1.1.1]`) · ipv6 from the record · reserved `[83,128,39]`
12–16. AWG on: option on every proxy · exactly the 12 mihomo keys · values (jc 4, s3 22, h1 "1") · `i1` bare `<b 0x61>` (prefix stripped) · empty `i2` omitted
17–19. `proxy-groups` select `PROXY` + all names + `rules: MATCH,PROXY`
20. AWG off (key absent from KV) → no `amnezia-wg-option` anywhere in the body
21–22. wrong token → 404 JSON, no cache header, never 401
23–25. missing account in KV → 503 readable, no cache header
26–29. no ENDPOINTS key → the two fallback proxies in order (servers/ports checked) · all-malformed → fallback too
30. v6-less account → no `ipv6` keys, reserved `[0,0,0]`
31. POST → 405
32. trailing slash → 200
33. near-miss path `/sub/clashzz` → 401 anon (stays gated)
34. `/sub` (ticket 04) still 200 + base64
35. missing `SUB_PATH` env → 404

Harness was throwaway (`$HOME/smoke-05/`), deleted afterwards.

## Surprises

1. **mihomo's I-value shape needed primary-source digging.** The wiki documents `i1:`–`i5:` as strings but not their value syntax. Solved by reading two levels down: mihomo `genIpcConf` passes the YAML value verbatim as the amneziawg-go uapi `i1=` line, and amneziawg-go's `newObfChain` scans for `<tag …>` elements (text before the first `<` is ignored, so the settings prefix would *work* but is wrong). The bare-chain emission is grounded, not guessed.
2. **mihomo's H fields are `string`, not `int`** (v2.0 range form `"123456-123500"`), with "WeaklyTypedInput" bridging — so emitting them quoted covers both numeric and range values. settings.js already validates them as `\d+` but a range could be stored verbatim (flags are advisory) — quoted emission keeps that case parseable.
3. **legacy `buildClash` has a swapped-H bug** (emits `h4: 3, h3: 4`) plus hardcoded legacy junk values — parity would mean shipping the bug. The spec (AWG settings from the panel record, ticket 03) supersedes: our options come from the record in correct h1–h4 order. Noted for the reviewer; no legacy parity requirement applies (parity was only mandated for the Throne/wg:// line format in ticket 04).
4. **`node --test` suite now 92 cases in ~4 s** — the zero-dependency runner holds up; the mini YAML parser adds no deps.
5. Smoke-harness footguns (throwaway only, fixed in-harness): my quick smoke parser initially mis-parsed the group section's `- name: "PROXY"` as a proxy (indent 2), and once "fixed" hit the `proxies:` header line — the real-body parser in `clash.test.js` was correct throughout (14/14 from the first run).

## Deviations (with rationale)

- **`i<n>` values are the bare CPS chain, not the stored `"I<n> = …"` line** — the settings record keeps full `.conf` CPS lines (its own format contract, ticket 03); mihomo's option value is the chain (see above). The strip regex mirrors the exact prefix settings.js validates (`^I[1-5]\s*=\s*`), so it's a pure normalization, never a guess. If a foreign record ever stores a non-conforming value, it is emitted as-is minus any prefix — the YAML stays parseable either way.
- **`amnezia-wg-option` omitted when enabled-but-empty** — a nil block is semantically "no AWG" in mihomo anyway; emitting it would be noise (see YAML shape section).
- **`allowed-ips` not emitted** — the ticket's field list doesn't include it and mihomo's single-peer form treats routing as clash's job; the legacy builder's `allowed-ips: ['0.0.0.0/0']` is a generator-page artifact, not a sub-format requirement (§2.4 sample omits it).
- **`server` for IPv6 endpoints is unbracketed** — settings.js parses/stores hosts bracket-free; brackets are endpoint-line syntax only. The proxy *name* is re-bracketed (`warp-[…]:2408`) so it round-trips the operator's line.
- **`sub.test.js` one-assertion update** — the unknown-format guard asserted `'clash'` throws, which ticket 05 invalidates by registering it; switched to `'singbox'` (the next planned format). No product code changed to make tests pass.
- **Route reads `AWG` KV on every clash request** — one extra KV get per request (~sub-ms); the edge cache (6 h) makes this a non-issue, and the seam contract requires the record (compare: `/sub` skips the read because link formats cannot express AWG).

## Handoff notes

- Ticket checkboxes: "YAML parses with a Mihomo parser" — verified at the structural level against mihomo's documented shape + source (mihomo itself can't run here; the in-test parser + smoke assert the exact documented structure); "AWG on/off" ✓; "IPv6 + fallback" ✓; "Seam unit-tested + smoke" ✓ (`wrangler dev` item covered by the fetch-level smoke, same decision as tickets 01–04).
- Operator checklist once wrangler runs: `curl <sub-clash-url>` → paste into Clash Verge Rev / FLClash / ClashMetaForAndroid; toggle AWG in the panel → re-fetch → confirm `amnezia-wg-option` appears.