# Result — ticket 03: Panel settings — endpoint editor + AWG params (KV)

**Date:** 2026-08-17 · **Status:** implemented, verified, not committed (per protocol)

## What was built

### Files

| File | Change |
|---|---|
| `worker/settings.js` | **new** — the settings module (pure, zero imports, runs identically in the Worker and under `node --test`): endpoint line parse/validate/canonicalize, AWG param normalize/validate, and read/write helpers over the `ENDPOINTS` and `AWG` KV bindings with `SettingsError` + fail-fast binding asserts. |
| `worker/settings.test.js` | **new** — 20 `node:test` cases (pure parts + KV helpers over a fake binding; no network). |
| `worker/index.js` | 3 new session-gated routes: `GET /api/settings`, `POST /api/settings/endpoints`, `POST /api/settings/awg`; route-map header updated. |
| `worker/panel.js` | two new cards in the shell — Endpoints (textarea + live per-line flags + Save with saved feedback) and AmneziaWG (toggle + Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5 grid, I1 Pick button, flag list, Save feedback). Inline script: client-side validators mirror `settings.js`; all dynamic values via `textContent`/`.value` (never innerHTML). Account card untouched. |
| `worker/api-handler.js` | one added line — `export { I1_MASKS, pickI1 };` placed **outside** the `// I1_MASKS:BEGIN/END` auto-generated region so `scripts/build-i1-masks.mjs` regeneration preserves it (verified by simulation). This is the "pull from the I1 mask pool in the worker's builders copy" seam: `panel.js` imports the pool and embeds it into the AWG card so the operator can prefill I1 on enable. |
| `wrangler.jsonc` | commented `ENDPOINTS` / `AWG` kv_namespaces placeholders (same shape as the ACCOUNT one). |

Forbidden dirs (`lib/`, `app/`, `components/`, `functions/`, `config/`, `public/`, `scripts/`, docs, `package.json`) and `worker/auth.js` / `worker/account.js` untouched — confirmed by `git status`.

### Routes (all session-gated like the account routes; anon → 401 JSON)

| Route | Behaviour |
|---|---|
| `GET /api/settings` | → `{"success":true,"settings":{"endpoints":{text,count,invalid}\|null,"awg":{...}\|null}}` — the state feed both cards render on open. `endpoints` is null when absent/empty/binding-missing; `awg` is null when off/unset/corrupt/binding-missing. Stored text is re-parsed on read so malformed lines are re-flagged on load. |
| `POST /api/settings/endpoints` | body `{"text": "<the textarea>"}` → canonical form stored (lines trimmed, blanks dropped, malformed lines **kept**) under key `endpoints`; response `{success, endpoints:{text,count,invalid}}`. Empty text **deletes** the key (empty list is legal — ticket 04's fallback territory). Non-string body → 400. |
| `POST /api/settings/awg` | body `{enabled:true, Jc:'4', …, I1:'I1 = <b 0x…>', …}` (flat, AmneziaWG conf names; values as strings) → stored as JSON under key `awg`; response `{success, awg, invalid}`. `enabled:false` (or absent) → **the key is deleted — "off" and "unset" are the same state: absent from KV**. |
| failures | missing binding on save → 500 with a readable `ENDPOINTS/AWG KV binding is missing` message (fail-fast, like `assertAccountBinding`); GET tolerates missing bindings (nulls, no crash). |

### KV payload shapes

- **ENDPOINTS** binding, key `endpoints` → **plain text**, the canonical line list:
  ```
  162.159.192.1:2408
  engage.cloudflareclient.com:2408
  [2606:4700:4700::1111]:2408
  ```
  Stored verbatim (canonicalized), so the editor round-trips exactly what the operator typed; malformed lines are preserved and skipped by renderers at serve time (ticket 04). No key = empty list.
- **AWG** binding, key `awg` → JSON, key absent entirely while off:
  ```json
  { "enabled": true, "Jc": "4", "Jmin": "40", "Jmax": "70",
    "S1": "0", "S2": "0", "S3": "", "S4": "",
    "H1": "1", "H2": "2", "H3": "3", "H4": "4",
    "I1": "I1 = <b 0x…>", "I2": "", "I3": "", "I4": "", "I5": "" }
  ```
  All param values are strings (empty string = line omitted from rendered confs); I values are full CPS lines. `isValidAwgRecord` requires `enabled === true` + all 15 fields as strings (corrupt/foreign records → null on read).

### Endpoint validation rules

One `host:port` per line. Blank lines ignored. `host` = IPv4 (octets ≤ 255) · hostname (RFC-ish labels, total ≤ 253, **last label must contain a letter** — rejects all-numeric labels so typos like `999.1.1.1:2408` can't sneak through as hostnames) · IPv6 **in brackets** `[2606:…]:2408` (bare v6 with embedded port is ambiguous → flagged with a bracket hint; bracketed-without-port → flagged). Port 1–65535. Schemes (`http://…`) and paths flagged. Flagged lines carry `{index, line, reason}` and **never block** the valid ones — the whole text is saved; flags are advisory (server response) and shown live (client mirror).

### AWG validation rules (bounds per docs.amnezia.org — see notes)

| Field | Rule |
|---|---|
| Jc | empty, or integer 0–10 |
| Jmin / Jmax | empty, or integer 1–4096; Jmin ≤ Jmax when both set |
| S1–S3 / S4 | empty, or integer 0–64 / 0–32 |
| H1–H4 | empty, or integer 0–4294967295 |
| I1–I5 | empty, or a CPS line `/^I[1-5]\s*=\s*<b 0x[0-9a-fA-F]+>(?:\s*<[^<>]+>)*\s*$/i` (accepts the pool format and the multi-tag CPS form) |

Defaults (ported from the legacy builders): Jc 4, Jmin 40, Jmax 70, S1 0, S2 0, H1–H4 1–4, S3/S4/I1–I5 empty. Server applies them only when enabling with **no** params at all; the card prefills them client-side on toggle-on. Range violations are **flagged, never rejected** (same "flag don't block" principle as endpoints) — the record is saved verbatim so the operator sees exactly what they typed.

### I1 default — decision (documented per ticket's "your call")

The card prefills I1 **client-side** with a random mask from the embedded `I1_MASKS` pool when the operator **toggles AWG on** (and a "Pick" button re-rolls it); loading stored state never mutates fields. I2–I5 have no pool equivalent — left empty. If I1 is empty when saved, renderers pick a mask at serve time (ticket 04). The pool is imported from `api-handler.js` (single source of truth, survives the mask generator) and embedded in the shell as a JS array — the mask strings contain `<b 0x…>` but no `</script`, so the embed is safe.

## Test output

`node --test` (repo root; discovers all `worker/*.test.js`):

```
ℹ tests 54   ℹ pass 54   ℹ fail 0   (duration ~1.6–2.3s)
```

14 auth (unchanged) + 20 account (unchanged) + **20 new settings tests**: endpoint line acceptance (v4/hostname/[v6], ports 1/2408/65535, trimming); malformed-line table (missing port/host, port 0/65536/non-numeric, unbracketed v6, brackets-without-port, scheme, whitespace, leading-hyphen, 999.x, numeric TLD); split valid/flagged with line indexes; blank-line tolerance; normalize (trim/drop-blank/keep malformed); AWG off/on/defaults/normalization; per-field range flags incl. Jmin>Jmax; CPS line accept (pool + multi-tag) & reject; DEFAULT_AWG self-consistency; KV roundtrips (endpoints verbatim, empty-deletes-key, awg on/off-deletes, missing-binding errors, corrupt/foreign tolerance, field coverage).

## Smoke results (fetch-level, real handler)

Per tickets 01/02 pattern (wrangler not installed here — no node_modules/`./out`): drove the **real** `worker/index.js` fetch via a loader hook substituting `./api-handler.js` (stub exports `onRequestPost/Options/Get` + `I1_MASKS`/`pickI1`), fake KV bindings (Map), fake ASSETS, real auth (`registerHooks`, not the deprecated `module.register`). **43/43 checks passed**, exit 0:

- anon settings routes → 401 (×3) · login → 303+cookie
- fresh state: endpoints null + awg null
- save 3 valid endpoints (v4/hostname/[v6]) → canned canonical KV text; GET reload roundtrips, no flags
- save mixed list (2 valid + `not-an-endpoint` + `999.999.999.999:2408`) → 200; count 2, 2 flagged with index+reason; KV stores **verbatim incl. malformed lines**; reload re-flags
- empty save → count 0, KV key deleted, reload → null
- AWG on (full params + I1 pool line) → KV JSON matches record; reload carries all fields
- AWG off → `{"awg":null}`, KV key deleted, reload → null
- AWG on with minimal params → 200, I1 stored empty (renderers pick later)
- out-of-range AWG save (Jc 11, Jmin 200 > Jmax 100, I garbage) → 200 + 3 flags, values saved verbatim
- non-string endpoints body → 400 · missing ENDPOINTS/AWG bindings on save → 500 readable · GET with missing bindings → nulls, no crash · corrupt `awg` JSON and malformed stored endpoints → null / flagged, no crash
- GET on the POST routes + POST on `/api/settings` → 405
- shell: both cards present, `I1_POOL` embedded from the builder copy, account card intact, zero `.innerHTML` usage

Harness was throwaway (`$HOME/smoke-03/`), deleted afterwards.

## Surprises

1. **`999.1.1.1:2408` passed as a hostname** — my first hostname regex accepted all-numeric labels, so a typo'd IP silently became a "valid" endpoint. Fixed by requiring the last label to contain a letter (no numeric TLDs); unit + smoke tests lock it in.
2. **`http://x:1` collided with the unbracketed-v6 rule** — a URL has more than one colon, so it hit the "need brackets" message. Added an explicit `://` check with its own reason; mirrored in the client validator.
3. **`[2606:…]` without a port** produced the unbracketed-v6 message — confusing for an input that IS bracketed. Added a "Bracketed IPv6 must include a port" reason (server + client).
4. **Prefill-on-load would silently mutate stored state** — calling the toggle-on prefill while hydrating an existing record filled a stored-empty I1 with a picked mask. Split `setAwgEnabled(on, prefill)`: real toggles prefill, loading never mutates.
5. **Multi-edit tool calls: mixing two files in one `edit` call** silently dropped the second file's change (the shared path slot) — caught by the failing test, no product impact.
6. Amnezia docs fetched for grounding: Jc 0–10, Jmin/Jmax 64–1024 (AWG 2.0), S1–S3 0–64, S4 0–32, H1–H4 uint32, I1–I5 CPS blobs — matches/motivates the bounds above (see deviations for Jmin/Jmax).

## Deviations (with rationale)

- **Jmin/Jmax bounds 1–4096 instead of the docs' 64–1024** — the legacy builders here ship defaults Jmin 40 / Jmax 70 (widely deployed, working configs); the docs' tighter range would flag the panel's own defaults. Bounds widened to accept both; documented in `settings.js`.
- **Server never picks I1** — the ticket allowed either client prefill or renderer-pick. Chose client-side prefill-from-pool (visible, editable, WYSIWYG) + renderers pick when I1 empty; the server stores exactly what the operator saves and never fabricates masks (no pool dependency in `settings.js`, which keeps it import-free for `node --test`).
- **`worker/api-handler.js` touched (1 line)** — not in the forbidden list; the export sits outside the auto-generated markers (regeneration preserved, verified by simulation) and is required for the single-source-of-truth pool seam.
- **Flag-but-save applies to AWG params too** — the ticket mandates it for endpoint lines; extended to AWG for consistency (advisory `invalid[]` in responses; values stored verbatim). Renderers (ticket 04) skip invalid values.
- **Empty endpoint save deletes the key** — "empty list is legal" expressed as absence; `GET` then returns `endpoints: null` (same shape as never-configured).
- **`registerHooks` instead of `module.register`** in the smoke harness — only the throwaway harness; Node 26 deprecates `module.register` (DEP0205 noted in ticket 02's result).