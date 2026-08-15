# Task: implement ticket 08 — /sub/wg zip + /sub/awg

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 08:
`.scratch/warp-panel/issues/08-sub-wg-zip-and-awg.md`.

## Read first (in this order)

1. `CONTEXT.md`; 2. `.scratch/warp-panel/spec.md` (Renderers, AWG settings);
3. `docs/adr/0007-per-client-sub-formats.md`;
4. `docs/research/sub-formats.md` §2.5, §2.6 (AmneziaWG .conf params and the
   awg:// community scheme — exact shapes), plus the settings record shape
   in `worker/settings.js` (AWG params as strings incl. `I1 = <b 0x…>` CPS
   lines) and the legacy `.conf` builder in `worker/api-handler.js`
   (`buildWireguard` — READ only, do not modify: how AMNEZIA lines
   S1/S2/Jc/Jmin/Jmax/H1–H4 are formatted, MTU, DNS lines);
5. `worker/sub.js` (seam + registry, tickets 04–07), `worker/account.js`,
   `worker/index.js` (route pattern, headers, missingAccount helper),
   `wrangler.jsonc`.

## What to build

- `wg` entry in the `RENDERERS` registry: `GET /api/<SUB_PATH>/sub/wg` →
  a **zip** (Content-Type `application/zip`) containing one `.conf` per
  **valid** endpoint, filenames `warp-<host>-<port>.conf` (or a safe
  variant — no path tricks, brackets in filenames sanitized). Each conf:
  standard WireGuard `[Interface]` (PrivateKey, Address v4[/v6], DNS
  1.1.1.1, MTU 1280) + `[Peer]` (PublicKey, Endpoint, AllowedIPs
  `0.0.0.0/0, ::/0`). **No zip dependency**: a minimal storeless ZIP
  writer (local file headers + central directory + CRC32, no compression —
  stored entries) implemented in the worker or a small pure module, with
  unit tests (magic bytes `PK\x03\x04`, entries parse, CRC matches). This is
  the official WireGuard app import format (§2.6: Android imports a `.zip`
  of confs).
- **AWG**: when the stored AWG record is enabled, the confs become
  **AmneziaWG confs**: `[Interface]` gains the `Jc/Jmin/Jmax/S1–S4/H1–H4`
  lines (omitting empty params) and `I1–I5` lines (emit the stored CPS
  lines as-is, e.g. `I1 = <b 0x…>`); AMNEZIA lines exactly like the legacy
  buildWireguard format (parity, READ api-handler.js). AWG off/absent →
  plain confs.
- `awg` entry: `GET /api/<SUB_PATH>/sub/awg` → base64 (whole blob, `/sub`
  envelope) of one **`awg://` link per valid endpoint** (community scheme
  §2.5: `awg://<base64url of the awg conf>#name` — the conf includes the
  AWG params **always** here: this endpoint exists for AWG-capable clients;
  if AWG is off, still emit awg:// links with the panel's AWG params or the
  legacy defaults — decide and document; conform to §2.5's exact encoding).
- Endpoint semantics: valid lines only, malformed skipped, zero valid →
  the two fallback endpoints (both renderers).
- Routes: both under SUB_PATH, no session, wrong token → 404, missing
  account → 503 (shared helper), 6 h cache headers.
- **Do not modify** `worker/auth.js`, `worker/account.js`,
  `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, or any
  non-worker dirs; `package.json` untouched. New code in `worker/`; wiring
  in `worker/index.js` only.
- Tests: extend `node:test` — zip structure (parse the produced bytes in the
  test: entries, names, CRC), wg conf content per endpoint, AWG on/off
  variants (J lines present/absent, I line formatting), awg:// link
  encoding round-trip (base64url decode → conf), fallback. Update the
  `unknown format` guard if it asserts `'wg'` → switch to the last remaining
  format (`'awg'` is registered by this ticket too — use a nonsense format
  name like `'bogus'` instead).
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green, `node --check`, fetch-level
  smoke per the established pattern: zip + awg payloads, AWG on/off,
  fallback, wrong token 404, missing account 503, POST 405, anon routes 401.

## Deliver

Write `.scratch/router/results/08-wg-awg.md`: files, routes, zip format
details (why storeless), conf/AWG line mapping, awg:// encoding decisions,
test output, smoke results, surprises, deviations (with rationale). Reply
with exactly DONE.