# Results — deploy wizard slice (shipping)

**Session**: worker `wg-deploy` · slice owns exactly two files · nothing
committed (working tree files only).

## Deliverables

| File | Status |
|---|---|
| `scripts/deploy-warp-panel.sh` | new, executable (755), `bash -n` clean |
| `docs/ops/deploy.md` | new prose walkthrough (preflight table, secrets, KV, jsonc end-state, smoke table, troubleshooting, legacy note) |

Scope guard: `git diff` for `wrangler.jsonc` and `worker/*` is **empty** — the
wizard only edits the config at runtime on the operator's machine. Note: the
router (or a parallel worker) modified `README.md`/`README_fa.md`/
`README_ru.md`/`scripts/build-ip-ranges.mjs` during this session — not this
slice, untouched by it.

## Wizard step list (8 stages)

1. **Preflight** — bash ≥ 4, `command -v wrangler` + `wrangler --version` ≥ 3,
   curl, `git remote` present, clean tree (offers `git stash push`); plus an
   additive check: `out/` (ASSETS build) with an offer to build it.
2. **Login** — `wrangler whoami` gate → `wrangler login` → re-verify.
3. **PASSWORD** — hidden `read -rs`, min 12, entered twice, `wrangler secret put
   PASSWORD` (value piped on stdin, never argv/echo, `trap EXIT` zeroes it).
4. **SUB_PATH** — auto-gen (`openssl rand -base64 32` → `tr '+/' '-_'` →
   `tr -d '='`) or manual (charset-validated, min 12), `secret put`, then the
   token printed exactly once with a keep-it-secret warning + the 6 sub URL
   shapes.
5. **KV namespaces** — ACCOUNT/ENDPOINTS/AWG: `kv namespace list` reuse by
   title first (idempotent re-runs, picks up dashboard-created namespaces),
   else `kv namespace create` (JSON parsed via jq or grep/sed; "already
   exists" tolerated); dashboard fallback noted per step.
6. **Patch wrangler.jsonc** — `cp` → `.bak`, then an embedded node script
   uncomments+fills exactly the two placeholder regions; node missing → exact
   snippet printed for manual paste; post-patch grep verification both paths.
7. **Deploy** — `wrangler deploy`, URL auto-extracted from output (prompt
   fallback), on failure prints `wrangler dev` diagnostics.
8. **Smoke suite** — 11 curl checks, PASS/FAIL each, stops on first failure;
   session cookie jar under `$HOME/.warp-panel.cookies` chmod 600; summary
   prints panel + all 6 subscription URLs.

## Patch method (embedded node)

- Values passed via **env vars, never argv** (secret-safe, JSON-escaped via
  `JSON.stringify` — verified with a password containing `&"` + non-ASCII).
- Line-indexed replacement of the two placeholder regions only; everything
  else preserved byte-for-byte (verified with `diff` against the untouched
  original: exactly two hunks).
- Already-patched shapes are matched too → re-runs/rotation replace in place.
- Self-verification before write: exactly one active `"vars"` line, one active
  `"kv_namespaces"` header, no leftover `// "vars"`/`// "kv_namespaces"`
  comments, and the comment-stripped result must `JSON.parse` as **strict
  JSON** (exit 2, file untouched, `.bak` intact on any failure).

### Dry-run output (against a COPY of wrangler.jsonc, `$PREFIX/tmp/wg-dryrun3` — the real file never touched)

```
[deploy wizard] patched wrangler.jsonc        (first run)
[deploy wizard] patched wrangler.jsonc        (re-run with rotated values)
--- diff original vs patched ---
23c23
<   // "vars": { "PASSWORD": "local-dev-change-me" }
---
>   "vars": { "PASSWORD": "rotated-pass!", "SUB_PATH": "rotated-token-999" },
35,37c35,39
<   // "kv_namespaces": [
<   //   { "binding": "ACCOUNT", "id": "<namespace-id>" }
<   // ],
---
>   "kv_namespaces": [
>     { "binding": "ACCOUNT", "id": "ns-acc-1111111111111111" },
>     { "binding": "ENDPOINTS", "id": "ns-end-2222222222222222" },
>     { "binding": "AWG", "id": "ns-awg-3333333333333333" }
>   ]
--- strict JSON check ---
valid strict JSON after comment-strip ✓
vars → {"PASSWORD":"rotated-pass!","SUB_PATH":"rotated-token-999"}
kv_namespaces → [{"binding":"ACCOUNT","id":"ns-acc-…"},{"binding":"ENDPOINTS","id":"ns-end-…"},{"binding":"AWG","id":"ns-awg-…"}]
```

Re-run idempotency also proven byte-identical (`patched-run1 == re-run`).

## Smoke results

Not executed live here: the wizard needs wrangler + a Cloudflare login (this
machine is Termux, no wrangler/credentials — per task). Instead the smoke
suite is a static trace against the committed route map (`worker/index.js`,
read in full): every target route exists with the asserted status contract
(`/` login HTML, `/api/account` 401 anon, sub routes 404-on-wrong-token before
the auth gate, `/api/auth/login` 303→200 with `warp_session` cookie, register
200/429 passthrough, `/api/settings` endpoints+awg fields, `/sub` base64 of
`wireguard://` lines, `/sub/clash` `proxies:`, `/sub/wg` PK zip, logout). The
node-patch dry-run above is the executable-portion verification the task
required; `node --test` stays green at **218/218** (nothing under `worker/`
changed).

## Surprises

1. **`/sub` has no `base64:` prefix** — the spec said the payload "starts with
   `base64:`"; the shipped renderer (`worker/sub.js`, ticket 04) serves bare
   base64 (per `docs/research/sub-formats.md` §2.1 / juerson parity). The
   smoke check therefore strips an optional `base64:` prefix and requires the
   body to decode to `wireguard://` lines — passes against the real product
   and stays correct if a prefix is ever added.
2. **Cookie is `warp_session`, not `_warp_session`** — `worker/auth.js`
   `SESSION_COOKIE = 'warp_session'`. Smoke greps the real name.
3. **Trailing commas would have shipped** — first patch version emitted
   `… },` / `],` (kv block is the file's last property, so the comma was
   invalid strict JSON). Fixed to emit no trailing commas + added the
   comment-stripped `JSON.parse` gate inside the patch script (JSONC parsers
   tolerate comments everywhere; trailing-comma tolerance is parser-specific —
   why we don't rely on it).
4. **`wrangler login` / KV JSON** — wrangler 3.x prints JSON for piped
   `kv namespace list`/`create`; spinner text guarded by `sed -n '/^{/,$p'`.
5. READMEs were modified mid-session by the router — not my slice (see scope
   guard).

## Deviations (rationale)

1. **vars block filled with the real PASSWORD/SUB_PATH values** (spec said
   "replace with real values"). Cloudflare docs say vars shouldn't hold
   secrets and the file's own comment says "never commit it here" — so the
   wizard fills vars as a plaintext convenience copy for `wrangler dev`,
   warns loudly post-patch ("do not commit wrangler.jsonc", delete `.bak`),
   and `deploy.md` documents that deleting the vars line doesn't affect
   production (identical values are also set as encrypted secrets; either way
   the runtime env is correct).
2. **PASSWORD zero-out moved from "after secret put" to the `EXIT` trap** —
   the value is legitimately needed later (vars patch, smoke login). The trap
   covers Ctrl-C/normal/error exits; smoke runs are still secret-safe
   (`--data-urlencode` keeps it out of argv).
3. **Added an `out/` (ASSETS) preflight check + build offer** — `wrangler
   deploy` hard-fails without `./out` (a fresh clone has none; it's
   gitignored). Spec preflight didn't list it; skipped at the operator's
   choice, stage 7 still prints the build hint.
4. **Additive smoke guards beyond spec** — `503` on sub checks is reported as
   FAIL with an explicit "Register/Import an account then re-run" hint (the
   product's real missing-account signal), and `429` on register is PASS with
   the Import instruction (registration is IP-rate-limited by design).
5. **Manual SUB_PATH is charset-validated** (`[A-Za-z0-9._~-]`, min 12) —
   keeps the path token URL-safe for clients and the smoke curls.
6. **Wizard-style but not the skill's template.sh library** — the template's
   library is GitHub-secret/.env oriented; this is a wrangler-oriented deploy
   wizard, so it reuses the template's UX conventions (stage/say/step/note/
   warn/confirm/pause/colors) with a purpose-built CLI core, per the task's
   explicit step-by-step spec.

## Verification performed

- `bash -n scripts/deploy-warp-panel.sh` — clean (re-run after every edit).
- `chmod +x` applied.
- Patch dry-run on a COPY in `$PREFIX/tmp` (three runs: fresh, idempotent
  re-run byte-identical, rotated values replace in place) + strict-JSON
  validation of the end state.
- `node --test` → **218/218 pass** (baseline confirmed twice, mid- and
  post-slice; no worker file touched).
- `git diff` confirms `wrangler.jsonc` and `worker/*` untouched; nothing
  committed.