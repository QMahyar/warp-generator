# Task: deploy wizard script + ops doc

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). This is the shipping slice. The product is
COMPLETE (all 10 feature tickets done, committed). Your job is the
**operator-side provisioning wizard**: an interactive bash script the human
runs **on their own machine** (it needs their Cloudflare credentials —
wrangler, login state, etc.). Do NOT attempt to run it here (no wrangler,
no node_modules, this is Termux).

## Read first (in this order)

1. `docs/router.md`; 2. `~/.pi/agent/skills/mattpocock-skills/skills/
engineering/wizard/SKILL.md` (the wizard pattern — steps only the human can
perform, verify-after-each-step, idempotent re-runs); 3. `wrangler.jsonc`
(the commented placeholders you must patch — PASSWORD/SUB_PATH vars block +
ACCOUNT/ENDPOINTS/AWG kv_namespaces); 4. `worker/index.js` (route map —
smoke steps target real routes); 5. `README.md` (won't edit it — the router
rewrites it separately; but match its tone/structure for the doc you ship).

## Deliverables (exactly two files, elsewhere NOTHING)

- **`scripts/deploy-warp-panel.sh`** — interactive bash wizard:
  1. Preflight: bash ≥ 4, `command -v wrangler`, `wrangler --version`
     (>= 3.x), `git remote` present, working tree clean (offer `git stash`
     warning otherwise).
  2. `wrangler login` if unauthenticated.
  3. **PASSWORD**: prompt (hidden input, `-s`), min length 12, confirm
     twice, then `wrangler secret put PASSWORD` (pipe the value, never
     echo it; zero out the variable after).
  4. **SUB_PATH**: offer auto-generate (`openssl rand -base64 32` or
     `head -c 32 /dev/urandom | base64`, sanitize `+/=` → URL-safe) or
     manual entry; `wrangler secret put SUB_PATH`; afterwards PRINT the
     token once with a clear "save this — it IS the subscription
     credential (do not share)" warning, and the exact sub URL shapes
     (`https://<worker>/api/<SUB_PATH>/sub`, …/sub/clash, …/sub/neko,
     …/sub/wg, …/sub/awg, …/sub/singbox).
  5. **KV namespaces**: `wrangler kv namespace create ACCOUNT|ENDPOINTS|
     AWG` (tolerate "already exists" errors; survive re-runs by checking
     real IDs first — parse the JSON output), then **patch wrangler.jsonc**
     in place: uncomment+fill the vars block and kv_namespaces block via a
     small embedded node script (repo has node; find the exact
     placeholder-shaped lines and replace with real values). Preserve the
     rest of the file byte-for-byte. Back up to wrangler.jsonc.bak first.
     (If node is missing: fall back to printing the exact snippet to
     copy-paste.)
  6. `wrangler deploy`; on failure suggest `wrangler dev` diagnostics.
  7. **Smoke suite** (each step prints PASS/FAIL and stops on failure):
     - anon GET `/` → 200 HTML containing the login marker;
     - anon GET `/api/account` → 401;
     - wrong-token GET `/api/<wrong>/sub` → 404 (never 401);
     - `POST /api/auth/login` with the PASSWORD → 200 + `_warp_session`
       cookie (store it in a file under $HOME, chmod 600);
     - cookie GET `/api/account` → 200 JSON;
     - cookie `POST /api/account/register` → 200 (or a readable 429 —
       registration is rate-limited by IP; if 429, instruct Import);
     - cookie GET `/api/settings` → 200 with endpoints/awg fields;
     - real-token GET `/api/<SUB_PATH>/sub` → 200 starting with `base64:`
       and decodes to `wireguard://` lines;
     - real-token GET `/api/<SUB_PATH>/sub/clash` → 200 `proxies:`;
     - real-token GET `/api/<SUB_PATH>/sub/wg` → 200 `PK\x03\x04` bytes;
     - cookie `POST /api/account/logout` → 200.
     Use curl with `--fail-with-body` where appropriate; print the panel
     URL + subscription URLs at the end.
  Seed/env notes: the script must be **idempotent** (safe to re-run; secrets
  re-put is harmless, KV create is checked, jsonc patch replaces cleanly),
  POSIX-safe under bash, `set -euo pipefail`, no external deps beyond
  curl/jq(optional; prefer grep/sed parsing)/node(optional), and comment
  every step with the Cloudflare dashboard fallback (Dash → Workers → KV →
  copy id) for humans who dislike CLI JSON.
- **`docs/ops/deploy.md`** — the same walkthrough in prose: preflight table,
  the two secrets, KV ids, the exact jsonc end-state snippet (commented
  template), smoke table (command → expected), troubleshooting (429 on
  register, bindings missing → "D1 is undefined"-style errors, SPA fallback
  404s), and the "unmaintained legacy" note (Next.js app + README_ru/fa).

## Constraints

- This slice owns ONLY `scripts/deploy-warp-panel.sh` + `docs/ops/deploy.md`.
  Nothing else may change: no worker/*.js, no README, no wrangler.jsonc in
  the working tree (the wizard edits it at RUNTIME on the operator's
  machine, not here).
- **Do not git commit.** Leave files in the working tree.
- Verify before finishing: `bash -n` on the script; a dry-run of the
  jsonc-patch node snippet against a COPY of wrangler.jsonc (in $PREFIX/tmp
  or $HOME — never touching the real file) showing vars + kv_namespaces
  blocks end-state; `node --test` untouched-but-green is a bonus check
  (must stay 218/218 — you changed nothing).

## Deliver

Write `.scratch/router/results/deploy.md`: files, wizard step list, patch
method, smoke results (the dry-run output), surprises, deviations (with
rationale). Reply with exactly DONE.