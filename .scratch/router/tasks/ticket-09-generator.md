# Task: implement ticket 09 — Generator page reusing the stored account

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 09:
`.scratch/warp-panel/issues/09-generator-page-reusing-stored-account.md`.

## Read first (in this order)

1. `CONTEXT.md` (glossary — Generator); 2. `.scratch/warp-panel/spec.md`
(Generator page decision line); 3. `docs/adr/0001-warp-subscription-panel.md`,
`docs/adr/0002-single-shared-warp-account.md` (no per-request registration);
4. `docs/plans/pivot-inventory.md` (the full inventory — generator flow,
   engine location, parity quirks, dead code);
5. `worker/api-handler.js` (the legacy generator engine: BUILDERS,
   resolveAllowedIPs, IP_RANGES, I1/pickI1, QR, `onRequestPost` body fields,
   the extractBuildParams equivalent), `worker/account.js` (stored record
   fields — the generator's account source), `worker/index.js` (legacy
   public /api/generate routes — to be retired), `worker/auth.js`,
   `worker/settings.js`, `worker/sub.js` (patterns to match), `worker/panel.js`
   (add the generator page), `wrangler.jsonc`, `config/services/*.json`
   (service names — read-only reference).

## What to build

- **Generator engine change**: a generate-on-demand path in the worker that
  renders **from the stored WARP account** — `POST /api/generate`'s logic
  moves to reading account material (`privateKey`, `peerPublicKey`, `v4`,
  `v6`, `reserved`) from the ACCOUNT KV binding instead of
  `registerClient→enableWarp` per request. **No `/reg` network calls** in the
  generate path (logs/tests prove it). Missing account → 503 readable
  ("register or import one first") — the panel page links to the account
  card.
- **The generator page** in the panel (framework-less, textContent-only):
  format selector (all 7 formats incl. wireguard/amneziawg, throne, clash,
  nekoray, husi, karing, wiresock), device type, endpoint override (text
  input defaulting to the first stored endpoint), DNS selector,
  site-mode (all/specific) + service picker (name-only chips — no icons —
  from a static list; embed the 26 services' names from `config/services/`
  data — wrangler/esbuild JSON imports are allowed if you import a generated
  or copied JSON under `worker/`, else embed the names as a plain array;
  document the choice), IPv6 toggle, exclude-LAN + persistent-keepalive
  (keep the existing semantics), custom I1 (advanced, only when AWG/I1
  relevant), result panel with config copy/download + QR (qrcode import
  works in the worker bundle, nodejs_compat — same as legacy api-handler.js).
- **Parity quirks preserved exactly** (inventory "Format parity quirks"):
  community-DNS forces siteMode 'all' (server-side rule + UI mirror);
  wiresock `Id` masking; husi keepalive 600; clash `allowed-ips
  ['0.0.0.0/0']`; throne/QR forms (strip MTU for QR); MTU 1280; I1 pick for
  awg15 device; reserved dashed/CSV forms. The generate API response keeps
  the legacy shape (`success/content/base64/configFormat/fileName/...` per
  the current contract) so nothing downstream that exists today breaks.
- **Retire the legacy public `/api/generate`**: GET (format list) moves to a
  session-gated route or feeds the page statically from a format list the
  page embeds (your call — but /api/generate GET/POST/OPTIONS public routes
  are REMOVED from the worker router; the panel's generator page uses the
  new gated route; update the route-map comment). Confirm nothing else in
  the repo calls the old route (the Next.js app is unmaintained — document
  that it still points at it and why that's fine).
- **Do not modify** `worker/auth.js`, `worker/account.js`, `worker/settings.js`,
  `worker/sub.js`, `worker/zip.js`, or any non-worker dirs; `package.json`
  untouched. `worker/api-handler.js` may be modified ONLY to remove its
  per-request registration and route handler (its builders/constants may be
  moved into the new generate module — or imported from it if cleaner;
  keep single-engine discipline: no duplicated builder logic).
- Tests: `node:test` — pure parts (config-building from a stored record
  across the formats: smoke-assert each format's output contains the record
  key/addresses; QR function returns a data URL; community-DNS forcing;
  missing-account error). Keep the suite green (183 tests today).
- **Do not git commit.** Leave everything in the working tree.
- Verify: `node --test` green, `node --check`, fetch-level smoke per the
  established pattern: generate each format with a fake-KV stored account →
  parses/decodes; no fetch calls to api.cloudflareclient.com during
  generation (assert via stub); missing account → 503; gated routes anon →
  401; old /api/generate → 404.

## Deliver

Write `.scratch/router/results/09-generator.md`: files, route map, page
surface, parity decisions, services-names approach, test output, smoke
results, surprises, deviations (with rationale). Reply with exactly DONE.