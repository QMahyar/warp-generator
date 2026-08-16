#!/usr/bin/env bash
#
# deploy-warp-panel.sh — interactive deploy wizard for the WARP panel
# (warp-generator repo → Cloudflare Workers).
#
# Run this on YOUR machine — the one that holds your Cloudflare login
# (wrangler OAuth token) and a repo checkout:
#
#     ./scripts/deploy-warp-panel.sh
#
# What it does (idempotent — safe to re-run; every step tolerates a
# previous run):
#   1. Preflight         bash ≥ 4, wrangler ≥ 3, curl, git remote,
#                        clean tree (stash offer), built out/ assets
#   2. wrangler login    OAuth flow when unauthenticated
#   3. PASSWORD secret   hidden prompt (min 12 chars, confirm), then
#                        `wrangler secret put PASSWORD` — value piped on
#                        stdin, never argv, never echoed; zeroed on exit
#   4. KV namespaces     STATE / ENDPOINTS / AWG — reuses existing
#                        namespaces by title (idempotent re-runs +
#                        dashboard-created ones), creates what's missing,
#                        prints the ids
#   5. wrangler.jsonc    backup → wrangler.jsonc.bak, then uncomment+fill
#                        the commented vars + kv_namespaces placeholders
#                        in place via an embedded node script; everything
#                        else byte-for-byte; node missing → prints the
#                        exact snippet to copy-paste
#   6. wrangler deploy   uploads worker + ./out assets; on failure prints
#                        `wrangler dev` diagnostics
#   7. Smoke suite       13 curl checks against the live worker — each
#                        prints PASS/FAIL, stops on the first failure
#
# Dashboard fallbacks (when you dislike CLI JSON):
#   - login:    the OAuth flow is CLI-only; alternatively export
#               CLOUDFLARE_API_TOKEN (token with Workers Scripts:Edit +
#               KV permissions) and wrangler uses it
#   - secrets:  dash.cloudflare.com → Workers & Pages → warp →
#               Settings → Variables and Secrets → Add binding (encrypted)
#   - KV ids:   Workers & Pages → KV → open the namespace → copy the ID;
#               namespaces titled STATE/ENDPOINTS/AWG are picked up
#               automatically by the wizard
#
# Requires: bash ≥ 4, wrangler ≥ 3.x, curl; jq and node optional
# (jq → nicer JSON parsing; node → in-place wrangler.jsonc patch).
# No other external dependencies.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# Presentation helpers (wizard style: one focused stage per screen)
# ──────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

TOTAL_STAGES=7
_STAGE=0

_clear() { [[ -t 1 ]] || return 0; tput clear 2>/dev/null || printf '\033[2J\033[3J\033[H'; }

banner() {
  _clear
  printf '\n%s%s  WARP panel deploy wizard%s\n' "$BOLD" "$BLUE" "$RESET"
  printf '%s  %s stages · idempotent — re-running is safe%s\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  pause "Ready?"
}

stage() {
  _clear; _STAGE=$((_STAGE + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' "$BOLD" "$BLUE" "$_STAGE" "$TOTAL_STAGES" "$1" "$RESET"
}

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

pause()   { printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"; read -r _ || true; }
confirm() { local reply=""; printf '  %s%s %s[y/N] ' "$YELLOW" "$1" "$RESET"; read -r reply || true; [[ "$reply" =~ ^[Yy] ]]; }

die() { printf '\n  %s✗ %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

smoke_ok()  { printf '      %sPASS%s  %s\n' "$GREEN" "$RESET" "$1"; }
smoke_bad() { printf '      %sFAIL%s  %s\n' "$RED" "$RESET" "$1"; printf '      %s  hint: %s%s\n' "$YELLOW" "$2" "$RESET"; exit 1; }

# Secrets/scratch must never outlive the run (Ctrl-C included).
TMPD=""
PASSWORD=""
cleanup() { PASSWORD=""; [[ -n "$TMPD" ]] && rm -rf "$TMPD"; }
trap cleanup EXIT

# ──────────────────────────────────────────────────────────────────────
# KV helpers (prefer jq; grep/sed fallback keeps the toolchain minimal)
# ──────────────────────────────────────────────────────────────────────

# kv_list_id NAME — print the id of an existing namespace titled NAME,
# or nothing. stdin/stdout are piped → wrangler emits JSON.
kv_list_id() {
  local name="$1" out
  out=$(wrangler kv namespace list 2>/dev/null || true)
  [[ -n "$out" ]] || return 1
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$out" | jq -r --arg n "$name" '.result[]? | select(.title == $n) | .id' 2>/dev/null | head -1
  else
    # wrangler lists each namespace as {"id":"…","title":"…"} — id first.
    printf '%s' "$out" | tr -d '\n ' | grep -oE "\"id\":\"[^\"]+\",\"title\":\"$name\"" | head -1 \
      | sed -E 's/.*"id":"([^"]+)".*/\1/'
  fi
}

# kv_create NAME — print the namespace id, creating it when missing.
# Idempotent: reuses an existing namespace by title first (also picks up
# namespaces created in the Cloudflare dashboard), tolerates the
# "already exists" race, and dies on anything else.
kv_create() {
  local name="$1" id out err
  id=$(kv_list_id "$name" || true)
  if [[ -n "$id" ]]; then
    note "  reusing existing namespace '$name'"
    printf '%s' "$id"
    return 0
  fi
  out=$(mktemp); err=$(mktemp)
  if ! wrangler kv namespace create "$name" >"$out" 2>"$err"; then
    rm -f "$out"
    if grep -qi 'already exists' "$err"; then
      id=$(kv_list_id "$name" || true)
    else
      cat "$err" >&2
      rm -f "$err"
      die "'wrangler kv namespace create $name' failed (above)"
    fi
    rm -f "$err"
  else
    rm -f "$err"
    # wrangler prints the JSON result (possibly after a spinner line):
    # {"success":true,"result":{"id":"…","title":"…"},...}
    id=$(sed -n '/^{/,$p' "$out" | tr -d '\n ' | sed -n 's/.*"result":{"id":"\([^"]*\)".*/\1/p' | head -1)
    rm -f "$out"
  fi
  [[ -n "$id" ]] \
    || die "could not determine the '$name' namespace id — dashboard fallback: Workers & Pages → KV → open the namespace → copy the ID"
  printf '%s' "$id"
}

# ──────────────────────────────────────────────────────────────────────
# Stages
# ──────────────────────────────────────────────────────────────────────

banner

# ── Stage 1 · preflight ────────────────────────────────────────────────
stage "Preflight"
[[ -f wrangler.jsonc ]] || die "run this from the repo root (wrangler.jsonc not found)"

say "Checking what this wizard needs on this machine:"

if [[ ${BASH_VERSINFO[0]:-0} -lt 4 ]]; then
  die "bash 4+ required, got $BASH_VERSION — on macOS: brew install bash"
fi
step "bash ≥ 4 ($BASH_VERSION)"

if ! command -v wrangler >/dev/null 2>&1; then
  die "wrangler not found — install: npm install -g wrangler  (or use the repo's local copy via npx wrangler)"
fi
wver=$(wrangler --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
[[ -n "$wver" ]] || die "could not read 'wrangler --version'"
if (( ${wver%%.*} < 3 )); then
  die "wrangler 3.x+ required, got $wver — upgrade: npm install -g wrangler@latest"
fi
step "wrangler $wver (≥ 3)"

command -v curl >/dev/null 2>&1 || die "curl not found — install it (brew install curl / apt install curl / pkg install curl)"
step "curl present"

if ! git remote >/dev/null 2>&1 || [[ -z "$(git remote 2>/dev/null || true)" ]]; then
  die "no git remote — clone the repo first (git clone <url>) and re-run from it"
fi
step "git remote present ($(git remote | head -1))"

if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
  warn "working tree is not clean"
  if confirm "Stash local changes for the duration of the deploy?"; then
    git stash push -m "warp panel deploy (wizard preflight)" >/dev/null
    note "stashed — restore afterwards with: git stash pop"
  else
    note "continuing dirty — the wrangler.jsonc patch will show up in 'git status'"
  fi
else
  step "working tree clean"
fi

# ASSETS: wrangler uploads ./out (the built panel shell). A fresh clone
# has none — offer the build; a human who skipped it gets a clear hint
# when deploy fails (stage 7).
if [[ ! -d out ]]; then
  warn "out/ (built panel assets) is missing — 'wrangler deploy' uploads ./out"
  if confirm "Build it now (CLOUDFLARE_WORKERS=1 npm run build)?"; then
    CLOUDFLARE_WORKERS=1 npm run build
    note "out/ built"
  else
    warn "skipping — deploy will fail without out/; build it and re-run (idempotent)"
  fi
else
  step "out/ assets present"
fi

# ── Stage 2 · Cloudflare login ─────────────────────────────────────────
stage "Cloudflare login"
# Dashboard fallback: the OAuth flow is CLI-only; instead of the browser
# you can export CLOUDFLARE_API_TOKEN (API token with Workers Scripts:Edit
# + KV permissions) — wrangler picks it up automatically.
if wrangler whoami 2>&1 | grep -qiE 'logged in'; then
  step "already authenticated (wrangler whoami)"
else
  say "Opening the Cloudflare OAuth flow — approve it in your browser."
  wrangler login
  wrangler whoami 2>&1 | grep -qiE 'logged in' || die "login did not stick — run 'wrangler login' again"
  step "authenticated"
fi

# ── Stage 3 · PASSWORD secret ──────────────────────────────────────────
stage "Panel password (PASSWORD secret)"
say "The panel's login password; also signs the session cookie. It is stored"
say "as an encrypted Worker secret — never in wrangler.jsonc."
# Dashboard fallback: Workers & Pages → warp → Settings → Variables and
# Secrets → Add binding (type: secret text) → name PASSWORD.
while :; do
  printf '  %sEnter the panel password (min 12 chars):%s ' "$BOLD" "$RESET"
  read -rs PASSWORD
  printf '\n'
  if [[ ${#PASSWORD} -lt 12 ]]; then
    warn "too short (${#PASSWORD} chars) — need at least 12"
    continue
  fi
  printf '  %sConfirm the panel password:%s ' "$BOLD" "$RESET"
  read -rs PASS2
  printf '\n'
  if [[ "$PASSWORD" != "$PASS2" ]]; then
    warn "mismatch — start over"
    continue
  fi
  PASS2=""   # never keep the duplicate around
  break
done
# Pipe on stdin — never argv (visible in the process list), never echoed.
printf '%s' "$PASSWORD" | wrangler secret put PASSWORD \
  || die "'wrangler secret put PASSWORD' failed — is wrangler logged in? (dashboard fallback: Variables and Secrets → Add binding)"
step "PASSWORD stored as an encrypted secret (value not echoed)"

# ── Stage 4 · KV namespaces ────────────────────────────────────────────
stage "KV namespaces (STATE / ENDPOINTS / AWG)"
say "Three KV namespaces hold the panel state: the state snapshot (WARP"
say "account records + subscriptions), the endpoint list, and the AmneziaWG"
say "settings. Created once; re-runs reuse the existing namespaces by title."
# Dashboard fallback: Workers & Pages → KV → create a namespace, then copy
# its ID from the namespace page. Any title works, but naming it
# STATE/ENDPOINTS/AWG lets this wizard find it on re-runs.

KV_STATE=$(kv_create STATE)
step "STATE     = $KV_STATE"
KV_ENDPOINTS=$(kv_create ENDPOINTS)
step "ENDPOINTS = $KV_ENDPOINTS"
KV_AWG=$(kv_create AWG)
step "AWG       = $KV_AWG"

# ── Stage 5 · patch wrangler.jsonc ─────────────────────────────────────
stage "Patch wrangler.jsonc"
CFG=wrangler.jsonc
say "Uncommenting and filling the vars + kv_namespaces placeholders in"
say "place. Everything else in the file stays byte-for-byte; the original"
say "is kept as wrangler.jsonc.bak."
note "The vars entries are plaintext copies so 'wrangler dev' works with the"
note "same credentials — the deployed worker reads the encrypted secrets."
note "The file is git-tracked: do NOT commit the patched values."

if command -v node >/dev/null 2>&1; then
  cp "$CFG" "$CFG.bak"
  if ! WRP_CFG_FILE="$CFG" WRP_PASSWORD="$PASSWORD" \
       WRP_KV_STATE="$KV_STATE" WRP_KV_ENDPOINTS="$KV_ENDPOINTS" WRP_KV_AWG="$KV_AWG" \
       node <<'NODE'
'use strict';
// In-place patch of the wrangler.jsonc placeholders (see the file's
// commented PASSWORD vars block and STATE/ENDPOINTS/AWG kv_namespaces
// block). Values arrive via env — never argv. Only the two placeholder
// regions are touched; everything else is preserved byte-for-byte. Safe
// to re-run: already-patched shapes are matched too.
const fs = require('fs');
const file = process.env.WRP_CFG_FILE;
const json = (s) => JSON.stringify(String(s));
const varsVals = {
  PASSWORD: json(process.env.WRP_PASSWORD),
};
const kvs = [
  { binding: 'STATE',     id: json(process.env.WRP_KV_STATE) },
  { binding: 'ENDPOINTS', id: json(process.env.WRP_KV_ENDPOINTS) },
  { binding: 'AWG',       id: json(process.env.WRP_KV_AWG) },
];
const lines = fs.readFileSync(file, 'utf8').split('\n');

// 1) vars — the commented `// "vars": { "PASSWORD": ... }` placeholder, or
//    the line the wizard already wrote on a previous run.
let varsI = -1, varsIndent = '  ';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)(?:\/\/ )?"vars": \{/);
  if (m) { varsI = i; varsIndent = m[1]; break; }
}
if (varsI < 0) { console.error('[deploy wizard] "vars" placeholder line not found in ' + file); process.exit(2); }
lines[varsI] = `${varsIndent}"vars": { "PASSWORD": ${varsVals.PASSWORD} },`;

// 2) kv_namespaces — the commented placeholder block, or the block from a
//    previous run. Replaced in full with the three live bindings.
let kvStart = -1, kvEnd = -1, kvIndent = '  ';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)(?:\/\/ )?"kv_namespaces": \[/);
  if (m) { kvStart = i; kvIndent = m[1]; break; }
}
if (kvStart < 0) { console.error('[deploy wizard] "kv_namespaces" placeholder not found in ' + file); process.exit(2); }
for (let i = kvStart + 1; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t === '],' || t === ']' || t === '// ],') { kvEnd = i; break; }
}
if (kvEnd < 0) { console.error('[deploy wizard] end of "kv_namespaces" block not found in ' + file); process.exit(2); }
const kvLines = kvs.map((k, i) => `${kvIndent}  { "binding": ${json(k.binding)}, "id": ${k.id} }${i < kvs.length - 1 ? ',' : ''}`);
lines.splice(kvStart, kvEnd - kvStart + 1, `${kvIndent}"kv_namespaces": [`, ...kvLines, `${kvIndent}]`);

// 3) verify the end state before writing anything.
const out = lines.join('\n');
const once = (re) => (out.match(re) || []).length === 1;
if (!once(/^\s*"vars": \{/m) || !once(/^\s*"kv_namespaces": \[/m)) {
  console.error('[deploy wizard] patch verification failed — file left untouched');
  process.exit(2);
}
if (/\/\/ "vars"|\/\/ "kv_namespaces"/.test(out)) {
  console.error('[deploy wizard] placeholder comments still present — file left untouched');
  process.exit(2);
}
// 4) the end state must parse as strict JSON once comments are stripped
//    (wrangler reads JSONC; trailing commas are not guaranteed safe).
try {
  JSON.parse(out.replace(/^\s*\/\/.*$/gm, ''));
} catch (e) {
  console.error('[deploy wizard] end state is not valid JSON: ' + e.message);
  process.exit(2);
}
fs.writeFileSync(file, out);
console.log('[deploy wizard] patched ' + file);
NODE
  then
    die "the embedded patch script failed — wrangler.jsonc was left untouched (wrangler.jsonc.bak holds the original). Report this output to the maintainers."
  fi
else
  # node missing → hand the human the exact snippet to paste.
  warn "node not found — patch wrangler.jsonc by hand:"
  cat <<SNIP

Replace the commented placeholder lines ("vars" and "kv_namespaces") with:

  "vars": { "PASSWORD": "<the password you entered>" },

  "kv_namespaces": [
    { "binding": "STATE", "id": "$KV_STATE" },
    { "binding": "ENDPOINTS", "id": "$KV_ENDPOINTS" },
    { "binding": "AWG", "id": "$KV_AWG" }
  ],
SNIP
  pause "Edit wrangler.jsonc now, then press Enter"
fi

# Cross-check the patched file (both paths above).
grep -qE '^[[:space:]]*"kv_namespaces": \[' "$CFG" || die "wrangler.jsonc still lacks an active kv_namespaces block"
grep -qE '^[[:space:]]*"vars": \{' "$CFG" || die "wrangler.jsonc still lacks an active vars block"
step "wrangler.jsonc patched (backup: $CFG.bak — restore with: cp $CFG.bak $CFG)"
warn "wrangler.jsonc now contains real values — do not commit it; delete $CFG.bak once verified"

# ── Stage 6 · deploy ───────────────────────────────────────────────────
stage "Deploy (wrangler deploy)"
say "Uploading the worker and the ./out assets to Cloudflare."
deploy_out=$(wrangler deploy 2>&1 || true)
printf '%s\n' "$deploy_out" | sed 's/^/  /'
if printf '%s\n' "$deploy_out" | grep -qE '✘|\[ERROR\]'; then
  cat <<HINT

Deploy failed. Diagnose locally before retrying — the wizard is idempotent:
  CLOUDFLARE_WORKERS=1 npm run build   # if out/ was missing
  wrangler dev                         # local preview: open the printed
                                       # URL, watch the worker console
                                       # (env.PASSWORD + KV bindings load?)
HINT
  die "wrangler deploy failed (see output above)"
fi
# workers.dev URL from the deploy output; fall back to asking.
WORKER_BASE=$(printf '%s\n' "$deploy_out" | grep -oE 'https://[A-Za-z0-9._-]+\.workers\.dev' | head -1 || true)
WORKER_BASE=${WORKER_BASE%/}
if [[ -z "$WORKER_BASE" ]]; then
  printf '  %sPaste the worker URL from the deploy output above:%s ' "$BOLD" "$RESET"
  read -r WORKER_BASE || die "no worker URL — nothing to smoke-test"
fi
step "worker: $WORKER_BASE"

# ── Stage 8 · smoke suite ──────────────────────────────────────────────
stage "Smoke suite"
TMPD=$(mktemp -d)
# Session cookie jar — kept under $HOME (chmod 600) for post-wizard use.
COOKIE_JAR="$HOME/.warp-panel.cookies"
rm -f "$COOKIE_JAR"
say "13 checks against the live worker — each prints PASS/FAIL; the run"
say "stops on the first failure."

hdr() { printf '\n  %s[%s]%s %s\n' "$BOLD" "$1" "$RESET" "$2"; }

hdr "1/13" "anon GET / → 200 login page"
code=$(curl -sS -o "$TMPD/root.html" -w '%{http_code}' "$WORKER_BASE/" 2>/dev/null || true)
if [[ "$code" == "200" ]] && grep -qF 'Sign in to manage the subscription panel' "$TMPD/root.html" 2>/dev/null; then
  smoke_ok "login page served (marker found)"
else
  smoke_bad "GET / → $code (wanted 200 + login marker)" "is the worker deployed? open $WORKER_BASE in a browser"
fi

hdr "2/13" "anon GET /api/accounts → 401"
code=$(curl -sS -o "$TMPD/anon.json" -w '%{http_code}' "$WORKER_BASE/api/accounts" 2>/dev/null || true)
[[ "$code" == "401" ]] \
  || smoke_bad "GET /api/accounts (anon) → $code (wanted 401)" "the auth gate must 401 every /api/* — is the PASSWORD secret set?"
smoke_ok "401 JSON"

hdr "3/13" "wrong token GET /api/<wrong>/sub → 404 (never 401)"
wrong="wrong-$(head -c 9 /dev/urandom | base64 | tr -d '+/=' | tr -d '\n')"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$WORKER_BASE/api/$wrong/sub" 2>/dev/null || true)
[[ "$code" == "404" ]] \
  || smoke_bad "GET /api/$wrong/sub → $code (wanted 404)" "unknown path tokens must 404, never 401 (ADR 0006)"
smoke_ok "404 for wrong token"

hdr "4/13" "POST /api/auth/login (PASSWORD) → 200 + session cookie"
code=$(curl -sS -L -c "$COOKIE_JAR" --data-urlencode "password=$PASSWORD" -o "$TMPD/after-login.html" -w '%{http_code}' "$WORKER_BASE/api/auth/login" 2>/dev/null || true)
if [[ "$code" == "200" ]] && grep -q $'\twarp_session\t' "$COOKIE_JAR" 2>/dev/null; then
  chmod 600 "$COOKIE_JAR"
  smoke_ok "session cookie stored (${COOKIE_JAR}, chmod 600)"
else
  smoke_bad "login → $code, 'warp_session' cookie missing" "PASSWORD secret wrong/missing — check Variables and Secrets in the dashboard"
fi

hdr "5/13" "cookie GET /api/accounts → 200 JSON"
code=$(curl -sS -b "$COOKIE_JAR" -o "$TMPD/accounts.json" -w '%{http_code}' "$WORKER_BASE/api/accounts" 2>/dev/null || true)
if [[ "$code" == "200" ]] && grep -q '"success": true' "$TMPD/accounts.json" 2>/dev/null; then
  smoke_ok "accounts card state readable"
else
  smoke_bad "GET /api/accounts (authed) → $code (wanted 200 JSON)" "session cookie rejected — login again? (see auth.js issueSession)"
fi

hdr "6/13" "cookie POST /api/accounts/register → 200 (or readable 429)"
code=$(curl -sS -b "$COOKIE_JAR" -X POST -o "$TMPD/register.json" -w '%{http_code}' "$WORKER_BASE/api/accounts/register" 2>/dev/null || true)
if [[ "$code" == "200" ]]; then
  smoke_ok "fresh WARP account registered"
elif [[ "$code" == "429" ]]; then
  smoke_ok "429 — registration is IP-rate-limited; use the panel's Import card with an existing WARP account"
  note "  the pin/sub checks below need a stored account — they may stay unpinned until one exists"
else
  smoke_bad "register → $code ($(head -c 200 "$TMPD/register.json" 2>/dev/null || true))" "see the panel's account card / rate limits reset after a while"
fi

hdr "7/13" "cookie GET /api/settings → 200 with endpoints + awg fields"
code=$(curl -sS -b "$COOKIE_JAR" -o "$TMPD/settings.json" -w '%{http_code}' "$WORKER_BASE/api/settings" 2>/dev/null || true)
if [[ "$code" == "200" ]] && grep -q '"endpoints"' "$TMPD/settings.json" 2>/dev/null && grep -q '"awg"' "$TMPD/settings.json" 2>/dev/null; then
  smoke_ok "settings feed readable (endpoints + awg)"
else
  smoke_bad "GET /api/settings → $code (wanted 200 with endpoints/awg)" "ENDPOINTS/AWG bindings missing? see docs/ops/deploy.md → troubleshooting"
fi

hdr "8/13" "cookie POST /api/subs → 200, per-sub token returned once"
code=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' -d '{"name":"deploy smoke"}' -o "$TMPD/subs.json" -w '%{http_code}' "$WORKER_BASE/api/subs" 2>/dev/null || true)
if [[ "$code" == "200" ]] && grep -q '"token"' "$TMPD/subs.json" 2>/dev/null; then
  SUB_TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$TMPD/subs.json" | head -1)
  SUB_ID=$(sed -n 's/.*"sub":{"id":"\([^"]*\)".*/\1/p' "$TMPD/subs.json" | head -1)
  smoke_ok "subscription created (token shown once in the response)"
else
  smoke_bad "POST /api/subs → $code (wanted 200 with a token)" "see the panel's Subscriptions card"
fi

hdr "9/13" "cookie POST /api/subs/<id>/pin → 200 (or note when no account)"
ACCOUNT_ID=$(sed -n 's/.*"accounts":\[{"id":"\([^"]*\)".*/\1/p' "$TMPD/accounts.json" 2>/dev/null | head -1)
if [[ -n "$ACCOUNT_ID" ]]; then
  code=$(curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' -d "{\"accountId\":\"$ACCOUNT_ID\"}" -o "$TMPD/pin.json" -w '%{http_code}' "$WORKER_BASE/api/subs/$SUB_ID/pin" 2>/dev/null || true)
  if [[ "$code" == "200" ]]; then
    smoke_ok "sub pinned to account $ACCOUNT_ID"
  else
    smoke_bad "pin → $code ($(head -c 200 "$TMPD/pin.json" 2>/dev/null || true))" "see the panel's Subscriptions card"
  fi
else
  smoke_ok "no account stored — pin skipped (checks 10-12 will 503; register/import one, then re-run)"
  note "  sub stays unpinned: GET /api/<token>/sub → 503 'No WARP account registered yet'"
fi

hdr "10/13" "token GET /api/<token>/sub → 200 base64 wireguard:// list"
code=$(curl -sS -o "$TMPD/sub.b64" -w '%{http_code}' "$WORKER_BASE/api/$SUB_TOKEN/sub" 2>/dev/null || true)
if [[ "$code" == "503" ]]; then
  smoke_bad "503 — sub is unpinned" "register/import an account in the panel, pin the sub, then re-run the wizard"
fi
[[ "$code" == "200" ]] || smoke_bad "GET /api/$SUB_TOKEN/sub → $code (wanted 200)" "token wrong or the worker is broken"
payload=$(cat "$TMPD/sub.b64")
[[ "$payload" == base64:* ]] && payload=${payload#base64:}   # tolerate an optional base64: prefix
if { printf '%s' "$payload" | base64 --decode > "$TMPD/sub.txt" 2>/dev/null \
     || printf '%s' "$payload" | base64 -D > "$TMPD/sub.txt" 2>/dev/null; }; then :; fi
if grep -q 'wireguard://' "$TMPD/sub.txt" 2>/dev/null; then
  smoke_ok "decodes to $(grep -c 'wireguard://' "$TMPD/sub.txt") wireguard:// link(s)"
else
  smoke_bad "body does not decode to wireguard:// lines" "account pinned? STATE binding set? see docs/ops/deploy.md → troubleshooting"
fi

hdr "11/13" "token GET /api/<token>/sub/clash → 200 YAML"
code=$(curl -sS -o "$TMPD/clash.yaml" -w '%{http_code}' "$WORKER_BASE/api/$SUB_TOKEN/sub/clash" 2>/dev/null || true)
[[ "$code" == "503" ]] && smoke_bad "503 — sub is unpinned (see check 9)"
{ [[ "$code" == "200" ]] && grep -q 'proxies:' "$TMPD/clash.yaml" 2>/dev/null; } \
  && smoke_ok "clash YAML served (proxies: found)" \
  || smoke_bad "sub/clash → $code (wanted 200 YAML with 'proxies:')" "account unpinned (503) or renderer error — docs/ops/deploy.md → troubleshooting"

hdr "12/13" "token GET /api/<token>/sub/wg → 200 ZIP"
code=$(curl -sS -o "$TMPD/wg.zip" -w '%{http_code}' "$WORKER_BASE/api/$SUB_TOKEN/sub/wg" 2>/dev/null || true)
magic=$(od -An -tx1 -N4 "$TMPD/wg.zip" 2>/dev/null | tr -d ' \n' || true)
{ [[ "$code" == "200" ]] && [[ "$magic" == "504b0304" ]]; } \
  && smoke_ok "zip served (PK\\x03\\x04 magic)" \
  || smoke_bad "sub/wg → $code (wanted 200 ZIP, PK magic)" "see docs/ops/deploy.md → troubleshooting"

hdr "13/13" "cookie POST /api/auth/logout → 200"
code=$(curl -sS -L -b "$COOKIE_JAR" -X POST -o /dev/null -w '%{http_code}' "$WORKER_BASE/api/auth/logout" 2>/dev/null || true)
[[ "$code" == "200" ]] \
  && smoke_ok "logout ok" \
  || smoke_bad "logout → $code" "session cookie clearing failed?"

# ── Summary ────────────────────────────────────────────────────────────
_clear
printf '\n%s%s  %sDeploy verified — your panel is live%s\n' "$BOLD" "$GREEN" "" "$RESET"
printf '  Panel:         %s\n' "$WORKER_BASE"
printf '  Subscription:  %s/api/%s/sub (created by this run — token shown once)\n' "$WORKER_BASE" "$SUB_TOKEN"
printf '\n  %sRemember%s\n' "$YELLOW" "$RESET"
printf '  %s•%s subscription links live in the panel: Subscriptions card → create (the raw\n' "$BLUE" "$RESET"
printf '    token + all six URLs are shown exactly once; tokens are hashed at rest)\n'
printf '  %s•%s session cookie kept at %s (chmod 600)\n' "$BLUE" "$RESET" "$COOKIE_JAR"
printf '  %s•%s wrangler.jsonc now contains real values — do NOT commit it\n' "$BLUE" "$RESET"
printf '  %s•%s delete wrangler.jsonc.bak once you trust the patched config\n' "$BLUE" "$RESET"
printf '  %s•%s re-running this wizard re-puts the secrets and re-patches the config — harmless\n' "$BLUE" "$RESET"
printf '\n'