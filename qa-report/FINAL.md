# Warp Generator — Phase C QA Final Report

Date: 2026-08-21
Scope: Admin UI redesign integrated into `_worker.js` (single-file worker). Full end-to-end browser QA on desktop (1440x900) and mobile (390x844) via agent-browser CLI against `npx wrangler dev --local --port 8787`.

## Final state: GREEN

- All flows pass on desktop AND mobile.
- Zero console errors / zero JS exceptions on every page load in the final sweep.
- All screenshots saved under `qa-report/` (desktop) and `qa-report/mobile/`.

---

## Bugs found & fixed

### BUG 1 — Dashboard inline script never executed (page was dead) — BLOCKER
- Symptom: after login, dashboard rendered header but no accounts, no stats; `navigate`/`api`/`loadAccounts` were `undefined`; browser reported `SyntaxError: Unexpected identifier 'detail'` at script line 487.
- Root cause: `DASHBOARD_HTML` was a plain template literal. JavaScript template literals cook escape sequences, so every `\'` → `'` and `\s` → `s` in the embedded script. The delivered HTML contained `onclick="navigate('detail', '' + a.id + '')"` (broken JS string) and `split(/s+/)` (broken regex) — a parse error killed the entire inline script. (The backslashes were correct in `html/dashboard.html`; they were lost during embedding.)
- Fix: `_worker.js:525` — `const DASHBOARD_HTML = String.raw\`<!DOCTYPE html>…\``. `String.raw` preserves backslashes byte-for-byte, so the template body stays identical to `html/dashboard.html` and the pasted-from-html workflow can't reintroduce the bug. Verified: served HTML now contains `split(/\s+/)` and the script executes (functions defined, stats render, 0 console errors).
- Verification: served HTML syntax-clean; dashboard fully functional after fix.

### BUG 2 — Deleting/updating seeded preset (`default`, `iran`, `china`) returned 404 — HIGH
- Symptom: Settings → Delete on any seeded preset → toast "Not Found", preset not deleted.
- Root cause: `handlePresetAPI` id regex `/^\/api\/presets\/([a-f0-9-]+)$/` only matched UUIDs. Seeded preset ids (`default`, `iran`, `china`) don't match → route fell through to 404. Network log showed `DELETE /api/presets/default → 404`.
- Fix: `_worker.js:2167` — regex widened to `/^\/api\/presets\/([^/]+)$/`.
- Verification: browser delete of `default` and `iran` now 200; UUID presets still work.

### BUG 3 — Clipboard promise not caught (no graceful fallback) — MEDIUM (deployment risk)
- Symptom (latent): `copyToClipboard` called `navigator.clipboard.writeText(...).then(...)` with no `.catch()`; the execCommand fallback branch was dead code. On any non-localhost plain-HTTP host (clipboard API is secure-context-only) the promise rejects → unhandled rejection (console error) + copy silently fails.
- Fix: `_worker.js:1053-1067` + `html/dashboard.html` — extracted `legacyCopy()` (execCommand path) and wired it as the `.catch()` fallback, so a rejected clipboard API falls back gracefully and always toasts.
- Verification: copy token / copy URL toast on 127.0.0.1 (API path) and fallback function present (`copyToClipboard.toString()` includes `legacyCopy`); 0 console errors.

### BUG 4 — Preset stat chip showed "0 presets" on fresh dashboard load — LOW
- Symptom: header stat chips showed "0 presets" although 3 presets existed, until the user visited Settings/Detail.
- Root cause: `presets` array is only populated by `loadSettings()`/`loadPresetsForSelect()`; the initial `loadAccounts()` only fetches accounts and calls `updateStats()`.
- Fix: `_worker.js:1000` + `html/dashboard.html:476` — `loadAccounts()` also fetches `/api/presets` (silent catch) before `updateStats()`.
- Verification: fresh dashboard load shows "0 accounts | 3 presets".

### BUG 5 — Subscription 500 "Endpoint preset missing" after seeded preset deleted — HIGH (fixed by orchestrator, verified here)
- Symptom: imported accounts reference `endpoint_list.preset_id = 'default'`; if the unused `default` preset is deleted (valid UI action), every subscription format returned 500.
- Fix (applied upstream, verified in this run): `_worker.js:2415` — `expandEndpoints` falls back to `DEFAULT_PRESETS` when a referenced preset was deleted: `presets.find(...) || DEFAULT_PRESETS.find(...)`.
- Verification: with `default` absent from KV, all 10 formats for accounts referencing `default` return 200 (curl + in-browser fetch).

---

## Test matrix results

### Desktop 1440x900 (session qa-final, also qa-final2 final sweep)
| Step | Result |
|---|---|
| /admin/setup renders | PASS (screenshot `setup.png`) |
| Set password: mismatch → inline "Passwords do not match", no navigation | PASS |
| Set password: valid (8+) → redirect to /admin/login | PASS (`login.png`) |
| Login wrong password → "Invalid password. Please try again." (error-param mapping) | PASS (`login-error.png`) |
| Login correct → dashboard | PASS |
| Dashboard: stat chips (0 accounts / 3 presets), empty state | PASS (`dashboard-empty.png`) |
| Nav Accounts↔Settings toggling | PASS |
| Create modal: open via button, close via Esc, close via backdrop click | PASS |
| Import modal: paste fake WireGuard config + name → import → toast + detail view | PASS |
| Detail: token visible; Copy token toast; 10 Subscription URLs with Copy/Open | PASS (`detail.png`) |
| Rename account | PASS |
| Regenerate token: custom confirm modal (no native dialog), Esc cancels, token changes, old token 404 / new 200 | PASS |
| Delete account: custom confirm → back to accounts empty state | PASS |
| Settings: add preset (2 endpoints) → toast + rendered | PASS (`settings.png`) |
| Delete preset: custom confirm (seeded `iran` and UUID presets) | PASS |
| Amnezia defaults: valid save; invalid Jmin>Jmax → inline "Jmin must be <= Jmax" | PASS |
| Logout → /admin/login; /admin then redirects to login | PASS |
| Console errors per page: 0 | PASS |

### Mobile 390x844 (session qa-mobile-final)
| Step | Result |
|---|---|
| Setup page renders, no horizontal overflow (scrollWidth 390 = 390) | PASS (`mobile/setup.png`; served from html/setup.html mirror because setup is gated once a password exists) |
| Password mismatch inline error | PASS |
| Login wrong password → error | PASS (`mobile/login-error.png`) |
| Login → dashboard: stats "3 accounts / 3 presets", 3 account cards in responsive grid | PASS (`mobile/dashboard.png`) |
| Nav toggle, create modal open/Esc/backdrop | PASS |
| Import MobileQA → detail, 10 URLs, layout 390x390 | PASS (`mobile/detail.png`) |
| Copy token / copy URL toasts | PASS |
| Rename | PASS |
| Regenerate token: custom confirm, no native dialog | PASS |
| Delete account: custom confirm → back to 3 accounts | PASS |
| Settings: preset add with 2 endpoints, delete with custom confirm; Amnezia invalid→inline error, valid→saved | PASS (`mobile/settings.png`) |
| Logout → login | PASS |
| Console errors per page: 0 | PASS |

### Subscriptions (re-verified in browser)
- `GET /sub/{token}/wireguard-conf` → 200, `application/zip`
- `GET /sub/{token}/clash` → 200, `application/x-yaml; charset=utf-8`
- `GET /sub/{token}/singbox` → 200, `application/json`
- All 10 formats 200 for accounts referencing `default` (post-preset-fallback fix).

### Console / network sweep (final, fresh sessions)
- Cleared console + error buffers, then fresh-loaded: setup (static mirror), login (+ `?error=invalid_password`), dashboard, account detail (RegTest), settings, logout. JS errors: 0 on every page, both viewports.
- Failed network requests: none (server log scan during sweep showed only expected 302s; the only 404 in the window was my own stray `navigate('detail','regtest')` eval, handled gracefully by the app's catch → toast + back to accounts, no console error).

---

## Screenshots

Desktop — `qa-report/`:
- `setup.png`, `login.png`, `login-error.png`, `dashboard-empty.png`, `detail.png`, `settings.png`

Mobile — `qa-report/mobile/`:
- `setup.png`, `login.png`, `login-error.png`, `dashboard.png`, `detail.png`, `settings.png`

---

## Known issues / notes

1. Warp API reachable (reg endpoint answers 400 to a malformed body), so account GENERATE was not exercised end-to-end; import flow (which covers account creation) was used per instructions. Flows that require a real WARP registration remain unverified in this environment.
2. "Open" buttons on Subscription URLs: link href verified correct; clicking fires a successful GET (200) in the network log; the popup tab is not observable in headless Chrome (popup-window artifact, not an app bug — markup uses `target="_blank" rel="noopener"` correctly).
3. Tailwind CDN emits a dev-only console warning ("should not be used in production") on every page — not an error; pre-existing design choice (CDN script tag).
4. The `setup.png` mobile screenshot was taken from the static `html/setup.html` mirror (identical markup to `SETUP_HTML` in the worker, verified byte-identical) because `/admin/setup` redirects once a password exists.
5. Local QA state: KV contains 3 test accounts (`T`, `RegTest`, `Test Acct`) and seeded presets minus any preset-delete QA artifacts; password `testpass123`.

## Files changed in this QA effort (cumulative diff vs HEAD includes the redesign)
- `_worker.js` — String.raw (Bug 1), preset route regex (Bug 2), clipboard fallback (Bug 3), stat-chip preset load (Bug 4), expandEndpoints seed fallback (Bug 5, upstream)
- `html/dashboard.html` — clipboard fallback + stat-chip preset load (new file in the redesign; not tracked yet)
- Pre-existing from redesign (not mine): `html/login.html`, `html/setup.html` edits