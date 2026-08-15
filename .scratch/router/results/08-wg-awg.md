# Result — ticket 08: /sub/wg (ZIP of .confs) + /sub/awg (awg:// links)

**Date:** 2026-08-19 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files

| File | Change |
|---|---|
| `worker/zip.js` | **new** — minimal storeless ZIP writer: `buildZip([{ name, data }])` → `Uint8Array` + exported `crc32`. Local file headers (`PK\x03\x04`), central directory (`PK\x01\x02`), EOCD (`PK\x05\x06`), all integers little-endian via DataView; compression method 0 (stored) throughout; CRC-32 (IEEE, reflected poly 0xEDB88320). Zero dependencies, pure, deterministic (fixed DOS date 1980-01-01). |
| `worker/sub.js` | **extended** — `wg` and `awg` entries in the `RENDERERS` registry behind the unchanged seam. New exports: `renderWg`, `renderAwg`, `buildWgConf`, `buildAwgLink`, `awgConfLines`, `confFileNameOf`, `CONF_DNS`, `CONF_ALLOWED_IPS`. Imports `buildZip` from `./zip.js` and `DEFAULT_AWG` from `./settings.js` (read-only import — settings.js untouched). Reuses `resolveEndpoints`/`DEFAULT_ENDPOINTS`/`SUB_MTU`/`authorityOf`/`proxyNameOf`/`toUrlSafeBase64`/`SubscriptionError` from tickets 04–07. |
| `worker/index.js` | route wiring: `GET /api/<SUB_PATH>/sub/wg` and `GET /api/<SUB_PATH>/sub/awg` (+ optional trailing `/`), registered **before** the auth gate among the ticket 04–07 sub-format routes; constant-time token compare; `handleSubWg` / `handleSubAwg` (KV-only reads — account + endpoints + AWG; 503 via the shared `missingAccount()` helper; 6 h cache headers; `Response` body is the renderer's `Uint8Array` for the zip); route-map comment updated. |
| `worker/wg.test.js` | **new** — 20 `node:test` cases (seam-level + zip-writer units). Fixtures: fresh throwaway records (generated once with `crypto.randomBytes`, hardcoded — never real). The ZIP is parsed byte-by-byte with an **independent** walker + a bitwise reference CRC-32 (never reusing the production writer's own code), and the awg:// links are base64url-decoded back into confs asserted line-by-line. |
| `worker/sub.test.js` | one assertion updated: the unknown-format guard asserted `'wg'` (registered by this ticket) → switched to the nonsense name `'bogus'` (per the ticket instruction; `'awg'` is registered too, so no real format remains). |

Forbidden files untouched — confirmed by `git status`: `worker/auth.js`, `worker/account.js`, `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, `wrangler.jsonc`, `package.json` and all non-worker dirs unmodified (only `worker/index.js` + `worker/sub.js` + `worker/sub.test.js` modified, `worker/zip.js` + `worker/wg.test.js` added; the other untracked paths are the router's own files, untouched).

## Routes

| Route | Behaviour |
|---|---|
| `GET /api/<token>/sub/wg` (token = `SUB_PATH` env/secret) | **No session** — the path IS the credential (ADR 0006); wrong or missing token → **404** (never 401). Non-GET → 405. Missing account in KV → **503** (shared `missingAccount()` helper — identical bytes to the other five sub routes). Headers: `Content-Type: application/zip`, `Cache-Control: public, max-age=21600, s-maxage=21600` (6 h, spec). Body: a storeless ZIP of one `.conf` per valid endpoint (plain WG confs; AmneziaWG confs when the stored AWG record is enabled). Trailing `/` accepted; near-misses (`/sub/wgzz`) stay behind the auth gate (anon → 401). |
| `GET /api/<token>/sub/awg` | Same contract; `Content-Type: text/plain; charset=utf-8` — base64 (whole-blob `/sub` envelope) of one `awg://` link per valid endpoint. The conf inside every link **always** carries AWG params (stored record when enabled, else the legacy defaults — see below). |

## ZIP format (and why storeless)

```
[local file header PK\x03\x04 (30 B) + filename + data]×n
[central directory PK\x01\x02 (46 B + filename)×n]
[EOCD PK\x05\x06 (22 B)]
```

- **Method 0 (stored)** everywhere; version 2.0; no flags; CRC-32 over the raw entry bytes; compressed size = uncompressed size = data length; DOS date fixed to 1980-01-01 / time 00:00 → byte-deterministic archives (stable CDN cache keys, golden tests).
- **Why storeless**: (1) the payload is a handful of small `.conf` texts — deflate would save ~50% of a sub-kilobyte archive at the cost of a compression dependency, and `package.json` must stay untouched (no jszip/fflate); (2) the official WireGuard Android importer (`TunnelImporter.kt` → `java.util.zip.ZipFile`) reads entries regardless of method — stored entries need zero special handling; (3) a storeless writer is trivially checkable (every size field equals the entry length, method = 0, CRC over raw data).
- **Validated with two independent tools** during smoke: Python `zipfile.testzip()` → GOOD, and Info-ZIP `unzip -l` lists both entries correctly (method 0, 1980-01-01).
- Filenames: `warp-<host>-<port>.conf`, with every char outside `[a-zA-Z0-9.-]` replaced by `-` and dot-runs collapsed — IPv6 colons become dashes (`warp-2606-4700-4700--1111-2408.conf`), and `/`, `\`, `[`, `]`, `:` can never appear, so an entry name can't smuggle a path (zip names land on the importing device's filesystem).

## Conf / AWG line mapping

Plain conf (AWG off/absent) — the standard WireGuard shape per the ticket:

```
[Interface]
PrivateKey = <account.privateKey>
Address = <v4>/32[, <v6>/128]        ← CIDR form, shared by every renderer
DNS = 1.1.1.1
MTU = 1280

[Peer]
PublicKey = <account.peerPublicKey>
AllowedIPs = 0.0.0.0/0, ::/0          ← full tunnel
Endpoint = <host>:<port>              ← IPv6 re-bracketed [2606:…]:2408
```

AWG on — `awgConfLines(awg)` emits one line per **non-empty** stored field between `MTU` and the blank line before `[Peer]` (same position as the legacy builder), in the canonical protocol order `Jc, Jmin, Jmax, S1–S4, H1–H4, I1–I5`:

- J/S/H fields: bare values get the legacy `Field = value` wrapping (`Jc = 4`, `S1 = 0`, `H1 = 1` — the exact line style of `buildWireguard` in api-handler.js, which was read-only).
- I1–I5: stored **as complete CPS lines** (`I1 = <b 0x…>`, settings.js record shape) and emitted **as-is** — the same "stored value is the full line" convention clash's `buildAmneziaWgOption` handles by stripping the prefix for its `i1:` YAML values. Empty params (e.g. S3/S4, I2–I5 when unset) are omitted entirely.
- Legacy parity note: the legacy builder hardcoded a fixed set (S1, S2, Jc, Jmin, Jmax, H1–H4 in that order, I1 only for `awg15`); the ticket's set is Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5 with per-param values from the panel. The **line formatting and placement** are parity; the **set and order** follow the ticket + docs.amnezia.org (the legacy order was never protocol-meaningful — AWG confs are key-value sections, order-insensitive). Documented in sub.js.

## awg:// encoding decisions (§2.5 community scheme)

- Link shape: `awg://<base64url of the .conf>#<name>`, one per valid endpoint, newline-joined and base64'd **whole-blob** (the `/sub` envelope convention — INCY/LxBox subscription importers decode the whole body).
- Segment: **padded** URL-safe base64 (RFC 4648 §5, `+`→`-`, `/`→`_`, padding kept) — the same alphabet `toUrlSafeBase64` already uses for the neko fragments; decoders accept padded input and the round-trip is byte-exact.
- `#name` = the shared `warp-<host>:<port>` convention (`proxyNameOf`; IPv6 re-bracketed: `warp-[2606:…]:2408`) — correlates one endpoint across the zip filenames, clash/singbox tags and neko names.
- **AWG always on here** — decision: when the stored record is enabled → its params; when AWG is off/absent → `{ enabled: true, ...DEFAULT_AWG }` (settings.js), i.e. the exact J/S/H literals the legacy generator hardcoded into every conf (Jc 4, Jmin 40, Jmax 70, S1 0, S2 0, H1–H4 1–4; S3/S4/I1–I5 unset in DEFAULT_AWG → omitted). Rationale: this endpoint exists for AWG-capable clients, so its confs never lose the obfuscation params (a plain conf would defeat the endpoint's purpose); the I1 mask pool lives in api-handler.js (unimportable — it drags tweetnacl/qrcode into the bundle and breaks `node --test`), and the settings module itself defines the legacy defaults with I lines unset — an AmneziaWG conf without I lines is valid (they're optional; the server's params are what matter).

## Endpoint semantics (identical to tickets 04–07, by construction)

One conf/link per **valid** endpoint line, in stored order; malformed entries skipped, never an error; zero valid endpoints (absent/empty/all-malformed) → exactly the two defaults `162.159.192.1:2408` then `engage.cloudflareclient.com:2408` (routes feed the parsed list from `readEndpoints` like the other handlers). The `wg` route reads AWG from KV; the `awg` route reads it too (null → legacy defaults inside the links).

## Test output

`node --test` (repo root; discovers all `worker/*.test.js`):

```
ℹ tests 146   ℹ pass 146   ℹ fail 0
```

126 prior (14 auth + 20 account + 20 settings + 24 sub + 14 clash + 18 singbox + 16 neko — all still green; the one sub.test.js guard updated as instructed) + **20 new wg tests**: `crc32` matches the IEEE check value `0xCBF43926` and a bitwise reference · zip magic `PK\x03\x04` + entries parse back byte-exact · stored method 0 with matching size fields · string and byte-array data, empty list → EOCD-only archive · filename sanitization (IPv6 colons, `/`, `\`, `[`, `]`, `..` runs) · golden plain conf (`[Interface]`/`[Peer]` field-for-field) · IPv6 Endpoint re-bracketed + v6-less record → v4-only Address · AWG on → J/S/H/I block in canonical order with empties omitted and the verbatim CPS line · `awgConfLines` guards (null/undefined/`{}`/`{enabled:false}` → none) · zip renderer: application/zip with one conf per valid endpoint in order, entry content ≡ `buildWgConf` · AWG on/off/absent variants in the zip · malformed skipped + fallback pair (both renderers) · awg envelope: standard base64 → one `awg://` link per endpoint · segment round-trips (base64url decode ≡ `buildWgConf`) · `#name` convention incl. bracketed IPv6 · AWG on → stored params in decoded conf · AWG off → legacy defaults, no I lines · missing account → readable `SubscriptionError` (both formats) · deterministic zip bytes for identical inputs.

`node --check` green on `worker/zip.js`, `worker/sub.js`, `worker/index.js`, `worker/wg.test.js`, `worker/sub.test.js`.

## Smoke results (fetch-level, real handler)

Per tickets 01–07 pattern (no wrangler/node_modules/`./out` in the repo): drove the **real** `worker/index.js` fetch via a loader hook substituting `./api-handler.js` (stub exports `onRequestPost/Get/Options` + `I1_MASKS`/`pickI1` — the module-scope imports of index.js/panel.js; SUB_PATH/PASSWORD/account/settings/auth all real), fake KV bindings (Map), fake ASSETS. **38/38 checks passed**, exit 0:

1–4. `/sub/wg` 200 · `application/zip` · 6 h cache headers · magic `PK\x03\x04`
5–10. one conf per **valid** endpoint (5 stored lines, 2 malformed skipped) · names in order (`warp-162.159.192.1-2408.conf`, `warp-engage.cloudflareclient.com-51820.conf`, `warp-2606-4700-4700--1111-2408.conf`) · [Interface] fields (PrivateKey/Address v4+v6 CIDRs/DNS 1.1.1.1/MTU 1280) · [Peer] fields (PublicKey/Endpoint/AllowedIPs full tunnel) · no AWG lines when absent · IPv6 re-bracketed + sanitized name
11–14. AWG record in KV → J lines, H lines, verbatim `I1 = <b 0x…>` CPS line · empty params omitted (S2/S4/I2)
15–21. `/sub/awg` 200 · text/plain + 6 h cache · base64 blob → 3 `awg://` links · `#warp-162.159.192.1:2408` name · AWG off → legacy defaults (Jc 4/Jmin 40/Jmax 70/S1 0/S2 0/H1–H4) · no I/S3/S4 lines · AWG on → stored params incl. CPS line
22–23. fallback: absent ENDPOINTS key → zip + links for the two default endpoints
24–26. wrong token → 404 JSON, no cache header, never 401 (both routes) · near-miss `/sub/wgzz` → 401 anon (stays gated)
27–28. trailing slash → 200 (both routes)
29–30. missing account → 503 readable, no cache header (both routes)
31–32. POST → 405 (both routes)
33–34. anon `/api/account` → 401 · anon `/` → login page (auth gate intact)
35–38. regressions: `/sub`, `/sub/clash`, `/sub/singbox`, `/sub/neko` all still 200 with their payload shapes

The zip from the smoke was additionally validated by Python `zipfile.testzip()` (GOOD) and Info-ZIP `unzip -l` (both entries listed, method 0). Harness was throwaway (`$HOME/smoke-08/`), deleted afterwards.

## Surprises

1. **`Response` accepts a `Uint8Array` body — but only when `env` is passed as the second fetch arg.** The worker's `fetch(request, env, ctx)` signature means the smoke harness must pass `env` explicitly; my first harness call omitted it and the router crashed with `env is undefined` inside the new handler. (Harness bug, not product code — the same class of harness-vs-product triage the earlier results warn about.)
2. **`I1 = I1 = <b 0x…>` duplication trap.** The stored I values are *complete* CPS lines (`I1 = <b 0x…>`), so wrapping them in `${field} = ${value}` double-prefixes them. Caught by the very first test run — the fix is the documented convention: J/S/H bare values wrapped, I lines emitted as-is. (The clash renderer had already hit the same shape and solved it by *stripping* the prefix for YAML; the .conf keeps it.)
3. **Windows-era zip checks in the official app are forgiving, but date zero is not worth it.** Some extractors warn on a zero DOS date; a fixed 1980-01-01 (0x21) is the standard "unset" and reads cleanly in Info-ZIP — and keeps the archive deterministic.
4. **The dot-dot run in a hostname cannot traverse, but cost a line to kill anyway** — `foo..bar` survives a `[a-zA-Z0-9.-]` allowlist, and since zip names are extracted to filesystems, collapsing `..` runs is free defense (a validated endpoint host can never contain them, but the renderer defends regardless).

## Deviations (with rationale)

- **Legacy-parity scope narrowed to line formatting/placement, not set/order.** The legacy `buildWireguard` hardcodes a fixed subset (S1/S2 only, no S3/S4, I1 only for its `awg15` device type); the ticket demands the full Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5 set with the panel's values and empty params omitted. "Exactly like the legacy format" is therefore honored as: `Field = value` line style, CPS lines verbatim, section position (between `MTU` and `[Peer]`), no trailing newline. Order follows the ticket/doc order — AWG confs are order-insensitive key-value sections.
- **`Address` uses CIDR (`v4/32, v6/128`), not the legacy builder's bare addresses.** The official apps default a bare address to /32 anyway (ipaddress.c `parse_cidr`), and CIDR is what every other renderer in this panel emits (wireguard:// address, clash ip, singbox address) — one convention across formats.
- **DNS is the ticket's fixed `1.1.1.1`, not the legacy multi-server line** — the ticket specifies it explicitly for this format; the legacy builder's DNS list was a generator-page feature.
- **AWG off → `awg://` confs carry the legacy defaults (J/S/H only, no I lines)** — decision documented above; the alternative (no AWG params at all) would make the endpoint pointless, and the I1 mask pool is unavailable outside api-handler.js (which cannot be imported by the pure test path).
- **`sub.test.js` one-assertion update** — the unknown-format guard asserted `'wg'` throws, which this ticket invalidates; switched to `'bogus'` per the ticket's instruction. No product code changed to make tests pass.

## Handoff notes

- Ticket checkboxes: zip opens with one well-named conf per endpoint, AWG confs carry J/S/H/I lines when enabled ✓ (unit + smoke + external-tool zip validation); awg:// links decode to valid confs, absent AWG toggle → endpoint still serves wg zip ✓; seam unit-tested + fetch-level smoke ✓ (the `wrangler dev` item covered by the fetch-level smoke, same decision as tickets 01–07).
- Operator checklist once wrangler runs: `curl <sub-wg-url> -o warp.zip` → import into the WireGuard Android app ("Import from file or archive") → one tunnel per endpoint appears, each connects; paste the `/sub/awg` URL (or its decoded links) into LxBox/INCY; toggle the AWG card in the panel and re-fetch — `/sub/wg` confs gain the J/S/H/I lines, `/sub/awg` links switch to the stored params (both still serve with AWG off).