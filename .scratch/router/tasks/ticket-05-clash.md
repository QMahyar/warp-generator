# Task: implement ticket 05 — /sub/clash

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 05:
`.scratch/warp-panel/issues/05-sub-clash.md`.

## Read first (in this order)

1. `CONTEXT.md`; 2. `.scratch/warp-panel/spec.md` (Renderers, AWG);
3. `docs/adr/0007-per-client-sub-formats.md`;
4. `docs/research/sub-formats.md` §2.4 (Clash Meta wireguard proxy shape);
5. `worker/sub.js` (the seam + registry — ticket 04, committed; extend it),
   `worker/settings.js` (endpoint parse + AWG record), `worker/account.js`
   (record fields), `worker/index.js` (route wiring + SUB_PATH pattern +
   cache headers), `worker/api-handler.js` (only to READ the legacy
   buildClash for parity notes — do not modify), `wrangler.jsonc`.

## What to build

- Extend `worker/sub.js` (or a sibling module it composes) with the `clash`
  renderer entry in the `RENDERERS` registry — the seam signature stays:
  `renderSubscription('clash', opts, { account, endpoints, awg })` →
  `{ body, contentType }`.
- Raw Clash YAML (never base64 — research §2.4): one `type: wireguard`
  proxy per **valid** endpoint (name = `warp-<host>:<port>` style; fields
  `server`, `port`, `ip` (+`ipv6` when the account record has v6),
  `private-key`, `public-key`, `reserved` (the account's reserved as the
  `[a,b,c]` array form), `udp: true`, `mtu: 1280`, `remote-dns-resolve:
  true`, `dns: [1.1.1.1]`), plus a minimal but valid document: a
  `proxy-groups` section (one `select` group `PROXY` containing the proxy
  names) and a `rules` section (e.g. `MATCH,PROXY`).
- **AWG**: when the stored AWG record is enabled and carries params, each
  proxy gains `amnezia-wg-option` with Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5
  (omit empty fields; only include the keys AmneziaWG expects in Clash —
  check mihomo's documented option shape, research §2.4, and the values
  stored by settings.js). When AWG is off/absent → no option anywhere.
- Endpoint semantics: same as ticket 04 — valid lines only, malformed
  skipped, zero valid → the two fallback endpoints. Fallback applies
  identically here.
- Route: `GET /api/<SUB_PATH>/sub/clash` — no session, wrong token → 404,
  missing account → 503, 6 h cache headers, `Content-Type` for raw YAML
  (clash clients accept `text/plain` or `application/octet-stream`-ish —
  pick what the research/reference implementations use and justify).
- **Do not modify** `worker/auth.js`, `worker/account.js`,
  `worker/settings.js`, `worker/panel.js`, `worker/api-handler.js`, or any
  non-worker dirs; `package.json` untouched. New code in `worker/`; route
  wiring in `worker/index.js`; `wrangler.jsonc` untouched unless you need a
  comment (it already has the SUB_PATH placeholder).
- Tests: extend the `node:test` suite (`worker/sub.test.js` or a new
  `worker/clash.test.js` — your call, keep the seam contract). Assert the
  YAML structure: parse it with a tiny YAML subset parser *you write in the
  test* (no new deps — indentation-line assertions are fine), one proxy per
  valid endpoint, required fields, `amnezia-wg-option` present/absent,
  fallback pair, v6 omitted when absent. Fixtures: reuse the throwaway
  account records from ticket 04's tests if importable, else regenerate.
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green (all suites), `node --check`,
  fetch-level smoke of the real handler (per tickets 01–04 results): anon →
  401 on other routes, sub/clash 200 with cache headers, wrong token 404,
  missing account 503, AWG on/off payloads, fallback, POST → 405.

## Deliver

Write `.scratch/router/results/05-clash.md`: files, route, YAML shape,
amnezia-wg-option mapping, content-type choice + why, test output, smoke
results, surprises, deviations (with rationale). Then reply with exactly
DONE.