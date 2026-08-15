# Result — ticket 04: /sub — wireguard:// lines + ?scheme=wg

**Date:** 2026-08-17 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files

| File | Change |
|---|---|
| `worker/sub.js` | **new** — the subscription seam: `renderSubscription(format, opts, { account, endpoints, awg })` → `{ body, contentType }` (pure: no fetch, no env, no KV) plus the ticket-04 `sub` renderer and the `RENDERERS` registry later tickets extend. Exports: `renderSubscription`, `renderSub`, `buildWireguardLink`, `buildThroneLink`, `resolveEndpoints`, `SubscriptionError`, `WARP_PUB`, `SUB_MTU`, `DEFAULT_ENDPOINTS`. |
| `worker/sub.test.js` | **new** — 24 `node:test` cases (seam-level, no HTTP). Fixtures: two throwaway account records (keys generated once with `crypto.randomBytes`, hardcoded — never real), endpoint sets incl. IPv6/custom port/malformed/empty (fallback). |
| `worker/index.js` | route wiring: `GET /api/<SUB_PATH>/sub` (+ optional trailing `/`), registered **before** the auth gate; constant-time token compare; `handleSub` (KV-only reads, 503 on missing account, 6 h cache headers); route-map comment updated. |
| `wrangler.jsonc` | commented `SUB_PATH` secret placeholder (same shape as `PASSWORD`). |

Forbidden dirs and `worker/auth.js` / `worker/account.js` / `worker/settings.js` / `worker/panel.js` / `worker/api-handler.js` untouched — confirmed by `git status` (only `worker/index.js` + `wrangler.jsonc` modified, `worker/sub.js` + `worker/sub.test.js` added).

## Route

| Route | Behaviour |
|---|---|
| `GET /api/<token>/sub` (token = `SUB_PATH` env/secret) | **No session** — the path IS the credential (ADR 0006); wrong or missing token → **404** `{"error":"Not found"}` (never 401 — a 401 would reveal the route exists). `?scheme=wireguard` (default) → base64 of one `wireguard://` link per valid endpoint; `?scheme=wg` → base64 of Throne-shaped `wg://` links. Unknown schemes silently default to wireguard. Non-GET → 405. Missing account in KV → **503** `{"error":"No WARP account registered yet — open the panel and run Register first."}`. Headers: `Content-Type: text/plain; charset=utf-8`, `Cache-Control: public, max-age=21600, s-maxage=21600` (6 h, spec). |
| anything else | unchanged (auth gate, panel, legacy `/api/generate` public). |

Token comparison uses `timingSafeEqualBytes` (imported from auth.js, no modification) on UTF-8 bytes — the token is a credential, so a prefix-timing side channel is avoided; length mismatch returns false immediately (like auth.js's own contract).

## Seam signature

```js
renderSubscription(format, opts, { account, endpoints, awg }) → { body, contentType }
```

- `format` — `'sub'` for ticket 04; the `RENDERERS` registry dispatches, so later tickets (clash/singbox/neko/wg/awg) add entries without touching the seam. Unknown format → `SubscriptionError` with a readable message.
- `opts.scheme` — `'wireguard'` (default; anything ≠ `'wg'` defaults) or `'wg'`.
- `account` — the stored ACCOUNT record (privateKey, peerPublicKey, v4, v6, reserved) — required; missing/null → `SubscriptionError` (route pre-checks and turns that into the 503).
- `endpoints` — the **parsed** valid endpoint list (`[{host, port, raw}]` from `settings.js`'s `parseEndpointList`); the route parses KV text itself so the seam stays KV-free. `awg` — accepted for seam uniformity, ignored by the link formats (see deviations).
- Returns the **final** payload body (base64 string, already endcoded) + `text/plain; charset=utf-8`. Payload conventions live inside the renderer, so later formats (raw YAML, JSON) just return their own `{body, contentType}`.

## Payload convention — base64, and why

§2.1/§3: v2rayN-family clients auto-detect plain vs base64 (v2rayN's SubscriptionHandler tries base64 first, falls back to plain links; Husi likewise) and the research offers both. Chosen: **base64 of the newline-joined link list** (whole blob, no trailing newline). Rationale:

1. The research's concrete reference implementation (juerson wireguard-subconverter-worker, §2.7) serves `base64 of wireguard:// lines` for `?target=v2rayn` — the only real-world convention documented.
2. Base64 is opaque: intermediate proxies/caches cannot corrupt or line-wrap the links, and clients never trim/mangle whitespace inside the payload.
3. The whole-v2rayN-family convention (NekoBox lists, awg://, nekoray://) is base64 — uniform behaviour for the operator.

Cost: +33% bytes, irrelevant at this payload size. `?scheme=` selects the link shape only, not the encoding.

## Renderer details (per §2.1 / legacy parity)

**wireguard:// link** (v2rayN family, §2.1 — verified byte-identical to the sample shape):
`wireguard://<enc(privateKey)>@<host>[:port]/?publickey=<enc(peerPublicKey)>&address=<enc("v4/32[,v6/128]")>&mtu=1280#<enc(endpoint)>`

- userinfo = private key, url-encoded (`/`→%2F, `+`→%2B, `=`→%3D — exactly like the juerson sample);
- `publickey` from the account record (equals the WARP_PUB constant in practice);
- `address` = v4/32 (+ v6/128 when the record has v6), comma-joined then encoded (`,`→%2C, `:`→%3A);
- `mtu=1280`; fragment = the endpoint (remark), url-encoded (`:`→%3A; IPv6 endpoints `[2606:…]:2408` → `%5B…%5D%3A2408`);
- IPv6 hosts are re-bracketed for the URI authority (settings.js stores the host **without** brackets); hostnames and custom ports render directly.

**wg:// link** (Throne) — `buildThrone` from `worker/api-handler.js` replicated verbatim inside sub.js (api-handler.js unmodified): `private_key` = privateKey minus trailing `=` + literal `%3D`; `peer_public_key` = hardcoded `WARP_PUB` constant (legacy parity — see deviations); `reserved` = legacy `reservedToDashed` (base64-decoded bytes joined with `-`, `[0,0,0]` → `0-0-0` when empty/unparseable); all junk-packet/magic-header params are the legacy literals; fragment `#WARP`. One deviation only for an input the legacy path cannot hit (no v6 in record) — see deviations.

## Fallback behaviour

Zero valid endpoint lines (absent ENDPOINTS key, empty text, or **every** line malformed — settings.js flags them at save time; the renderer additionally skips any non-`{host,port}` entry defensively and never errors) → exactly two links, in order: `162.159.192.1:2408` then `engage.cloudflareclient.com:2408` (spec). Applies to both schemes. Full tunnel (`0.0.0.0/0, ::/0`) and DNS `1.1.1.1` are implicit for both link formats (v2rayN/Throne tunnel everything by default — the wireguard:// URI has no allowed-ips/dns fields); MTU 1280 and client addresses come from the account record.

## Test output

`node --test` (repo root; discovers all `worker/*.test.js`):

```
ℹ tests 78   ℹ pass 78   ℹ fail 0   (duration ~2.4–4s)
```

14 auth + 20 account + 20 settings (unchanged, still green) + **24 new sub tests**: golden byte-identical wireguard:// link vs a hand-built §2.1 literal · URL-parses to the exact fields (userinfo=privkey, publickey, address v4/v6, mtu, fragment=endpoint) · hostname+custom port (51820) · IPv6 bracketed in authority & %-encoded fragment · v6-less record → v4-only address · userinfo encoding of `+/=` · golden Throne line (legacy buildThrone parity) incl. WARP_PUB hardcode, `%3D` private_key, dashed reserved (`U4An`→`83-128-39`, `AAAA`→`0-0-0`, empty→`0-0-0`) · Throne local_address v4/32−v6/128 and v4-only fallback · one-config-per-line ordering · malformed entries skipped, never thrown · fallback on empty/undefined/null/all-malformed (both schemes) · unknown scheme → wireguard default · missing account / unknown format → readable SubscriptionError · `resolveEndpoints` contract.

`node --check` green on `worker/index.js`, `worker/sub.js`, `worker/sub.test.js`.

## Smoke results (fetch-level, real handler)

Per tickets 01–03 pattern (no wrangler/node_modules/`./out` in the repo): drove the **real** `worker/index.js` fetch via a loader hook substituting `./api-handler.js` (stub exports `onRequestPost/Get/Options` + `I1_MASKS`/`pickI1`), fake KV bindings (Map), fake ASSETS, real auth (`registerHooks`). **20/20 checks passed**, exit 0:

1. default sub: 200, `Cache-Control: public, max-age=21600, s-maxage=21600`, `text/plain; charset=utf-8`
2. body base64-decodes to **3** links from a 5-line endpoint text — the 2 malformed lines skipped at serve time
3. fields decode per §2.1 (userinfo=privkey, publickey=WARP_PUB, address v4+v6, mtu 1280, fragment=endpoint)
4. IPv6 link: bracketed authority, %-encoded fragment
5. `?scheme=wg`: 3 `wg://` lines, Throne-parity fields (`private_key` %3D form, `reserved=83-128-39`, encoded WARP_PUB, `#WARP`, bracketed v6)
6. wrong token → 404 JSON, no cache header, **never 401**
7. missing `SUB_PATH` env → 404
8. trailing slash `/sub/` → 200
9. missing account in KV → 503 readable, no cache header
10. absent ENDPOINTS key → the two fallback links in order
11. all-malformed endpoints → fallback pair
12. v6-less account → `address=172.16.0.2/32` only
13. v6-less account wg → `local_address=172.16.0.2/32&` + `reserved=0-0-0`
14. POST on sub → 405
15. explicit `?scheme=wireguard` === default payload
16–17. auth gate intact: anon `/api/account` → 401, anon `/` → login page
18. login flow still issues the session cookie (303)
19. legacy `/api/generate` still public
20. near-miss path (`/api/<token>/subzz`) stays behind the auth gate (401 anon)

Harness was throwaway (`$HOME/smoke-04/`), deleted afterwards.

## Surprises

1. **`URL.username` does not percent-decode** in Node — the test parse asserted decoded fixture values, so tests decode via `decodeURIComponent`; no product impact, but a footgun for anyone asserting raw link fields.
2. **`pathToFileURL` rejects URL instances** in Node 26's loader API — my first hook passed `new URL(...)` into it; `.href` directly is the fix. Throwaway-harness only.
3. **The `unknown scheme` test initially failed on the *test*** — the seam was right, but I asserted `includes('wg://')` on the **base64** body. Decode-first is the seam's contract; the test now always decodes. (Same class of stub-vs-code triage ticket 02's result warns about.)
4. **`node --test` still runs every suite in ~2.4 s** — zero-dependency runner holds up with 78 cases across four modules.

## Deviations (with rationale)

- **Base64 payload instead of plain newline list** — the ticket allowed either ("v2rayN auto-detects… follow the research's recommended convention"); base64 is what the research's reference implementation (juerson, §2.7) serves and keeps clients' line handling out of the equation. Convention lives in the renderer, per format.
- **Unknown `?scheme=` values default to wireguard rather than 400** — "default wireguard" per ticket; a 400 would break clients that append junk params. Documented in sub.js. (The other formats are separate paths — `/sub/clash` etc. — not scheme values, so nothing is masked.)
- **wg:// uses the hardcoded `WARP_PUB` constant, not `account.peerPublicKey`** — byte-parity with `buildThrone` is the spec's requirement; the legacy builder hardcodes the constant. They are equal in practice (Cloudflare always returns the WARP public key), so there is no behavioural difference — only exact parity.
- **`buildThroneLink` emits `local_address=<v4>/32` alone when the record has no v6** — `buildThrone` would interpolate `/32-/128` for an empty v6, but the legacy path always had v6 from Cloudflare. Emitting the broken suffix would be wrong parity; the record-extractor can legitimately produce no v6 (account.js tolerates it). Likewise the wireguard:// `address` omits the v6 CIDR when absent.
- **Route accepts an optional trailing `/`** — clients/sub-converters occasionally append one; exact-token + trailing-slash keeps the 404-vs-401 semantics clean instead of leaking a 401 for a legitimately-formed URL.
- **`awg: null` passed by the route** — the link formats cannot express AWG settings (Throne's junk params are legacy parity literals, and the v2rayN URI has no AWG fields), so the route skips the AWG KV read entirely; the seam slot exists for the clash/wg-zip/awg tickets.

## Handoff notes

- Operator provisioning: `wrangler secret put SUB_PATH` (long random value — it is the credential, ADR 0006) alongside `PASSWORD`; local dev placeholder commented in `wrangler.jsonc`.
- Ticket checkbox `wrangler dev` smoke item: covered by the fetch-level smoke (same decision as tickets 01–03); checklist item for the operator once wrangler runs: `curl` the sub URL → base64 -d → paste into v2rayN/Throne.