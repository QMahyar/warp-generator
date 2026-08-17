# Wrangler on Android / Termux

Everything needed to run `wrangler` (≥ 4) on Termux and deploy this repo
from the phone. Written from the first real deployment
(`warp.qhorror13194.workers.dev`, 2026-08-15) — every quirk below is the one
we actually hit and the fix that worked.

TL;DR — the full working environment is three exports + two forced npm
installs:

```sh
# ~/.wrangler-termux/platform-shim.cjs  (see §2)
export NODE_OPTIONS="--require=$HOME/.wrangler-termux/platform-shim.cjs"
export ESBUILD_BINARY_PATH=/data/data/com.termux/files/usr/lib/node_modules/@esbuild/android-arm64/bin/esbuild
export GOMAXPROCS=1   # insurance against thread-limit EPIPE crashes
```

## 1. Root cause

Termux's Node (26.x) reports `process.platform === 'android'`. Two native
tools wrangler imports **at CLI start** don't ship Android builds:

- **workerd** (the local dev runtime) — `workerd/lib/main.js` throws
  `Unsupported platform: android arm64 LE` at module load. This is a known,
  unfixed Cloudflare issue (workerd#5178 / workers-sdk#3746, closed
  by-design). It blocks `wrangler` from *starting at all*, even for commands
  that never use workerd (deploy, kv, secrets, login).
- **esbuild** (the bundler) — its launcher maps `android arm64 LE` →
  `@esbuild/android-arm64` and works fine **if that package is present**.
  npm skips it because the platform package declares `os: ["linux"]`… no —
  esbuild's android entry exists in `knownUnixlikePackages`, but npm
  installs optional deps against the package's own `os` field, so forcing
  the *linux-arm64* binary instead makes the Go helper crash on bionic
  (`The service was stopped: write EPIPE`).

Neither package manager nor Cloudflare support Android officially; the
following makes it work anyway by (a) faking the platform string for
workerd, and (b) giving esbuild its *native android* binary.

## 2. Install

```sh
pkg install nodejs       # or upgrade: pkg upgrade

# 1) wrangler itself, skipping the broken workerd postinstall:
npm install -g wrangler --ignore-scripts

# 2) platform-shim — Node 26's process.platform is a configurable data
#    property, so a preload can rewrite it before wrangler loads workerd:
mkdir -p ~/.wrangler-termux
cat > ~/.wrangler-termux/platform-shim.cjs <<'EOF'
// Termux: Node reports process.platform === 'android'; workerd's loader
// only accepts linux/darwin/win32. deploy/kv/secret/login never RUN the
// workerd binary — they only resolve its path. See workerd#5178.
Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
EOF

# 3) workerd's loader must RESOLVE a linux-arm64 package (it never execs it;
#    `wrangler dev` will not work on Android — deploy is unaffected):
npm install -g @cloudflare/workerd-linux-arm64 --os=linux --cpu=arm64 --force

# 4) esbuild's ANDROID binary — this is the key one. Match the exact
#    version wrangler pins (check its nested package):
#    grep '"version"' /usr/lib/node_modules/wrangler/node_modules/esbuild/package.json
npm install -g @esbuild/android-arm64@0.28.1   # ⚠ use the version from the grep
```

Verify:

```sh
export NODE_OPTIONS="--require=$HOME/.wrangler-termux/platform-shim.cjs"
wrangler --version                          # → 4.123.0 (not the android error)
wrangler whoami                             # → logged in / not authenticated
```

The shim must be present for **every** wrangler invocation (incl. inside
the deploy wizard — `export NODE_OPTIONS=...` before running it).

## 3. Auth

`wrangler login` prints a `dash.cloudflare.com/oauth2` URL and waits for the
localhost callback. On the phone the browser can't open it by itself — open
it manually:

```sh
# in a tmux session (survives app closure):
tmux new -s wrangler-login
wrangler login
# in another shell, copy the URL from the tmux pane and open it:
termux-open-url 'https://dash.cloudflare.com/oauth2/auth?...'
```

Tap **Allow** in the Android browser; the callback to
`http://localhost:8976/oauth/callback` lands in Termux (loopback is shared
across apps). Verify with `wrangler whoami`. If the callback never arrives,
fall back to an API token: `export CLOUDFLARE_API_TOKEN=<token>` (scopes:
Workers Scripts + KV + Account Settings).

## 4. Known quirks and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `Unsupported platform: android arm64 LE` during `npm i -g wrangler` | workerd postinstall | `npm install -g wrangler --ignore-scripts` |
| Same error on *every* `wrangler ...` command | workerd loader at CLI import | platform-shim (§2), `NODE_OPTIONS="--require=$HOME/.wrangler-termux/platform-shim.cjs"` |
| `The package "@cloudflare/workerd-linux-arm64" could not be found` | npm skipped the optional dep | `npm i -g @cloudflare/workerd-linux-arm64 --os=linux --cpu=arm64 --force` |
| `The service was stopped: write EPIPE` during `wrangler deploy` | linux-arm64 esbuild helper crashes on bionic | `npm i -g @esbuild/android-arm64@<wrangler's esbuild version>` + `ESBUILD_BINARY_PATH=...android-arm64/bin/esbuild` |
| `runtime: failed to create new OS thread` / sporadic EPIPE | Android per-uid thread limits | `export GOMAXPROCS=1` |
| Version mismatch `Host version … does not match binary version …` | ESBUILD_BINARY_PATH binary ≠ wrangler's esbuild version | match versions exactly |
| `kv namespace create` prints the id on its own line; asks “add it on your behalf?” | wrangler 4 output/UX change | parse the JSON with jq/`grep -oE '"id": "[0-9a-f]+"'`; answer the prompt or let it auto-patch |
| `Disallowed operation … global scope` (error 10021) at deploy validation | module-scope `new Response()`/async/crypto in the worker | move to factories inside handlers (see worker/index.js `methodNotAllowed()`) |
| Deploy succeeds but `wrangler dev` fails | workerd binary is not executable on Android (glibc) | use `wrangler deploy` + curl smoke; dev requires a desktop machine |

### The deploy wizard

`scripts/deploy-warp-panel.sh` handles secrets, KV, jsonc patching, deploy
and smoke. On Android: export the three env vars first, and be aware its KV
parser predates the wrangler-4 output shape (stage 5 may die with
"could not determine the 'STATE' namespace id") — create the namespaces
manually and paste the ids into `wrangler.jsonc`:

```sh
wrangler kv namespace create STATE       # copy "id" from the JSON output
wrangler kv namespace create ENDPOINTS
wrangler kv namespace create AWG
```

then edit `wrangler.jsonc`'s `kv_namespaces` array (ids are not secrets).
The wizard's jsonc patch + deploy stages then work as written.

## 5. Sanity smoke after deploy

```sh
B=https://<worker>.workers.dev      # printed by wrangler deploy
T=<your SUB_PATH secret>            # the path token — keep it secret
curl -s -o /dev/null -w '%{http_code}\n' "$B/"                       # 200 (login page)
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/account"            # 401
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/wrong-token/sub"    # 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"password":"<panel password>"}' -c jar
curl -s -b jar "$B/api/account"                                      # 200 {"success":true,...}
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/$T/sub"             # 503 until an account exists
```

Registration from the worker is rate-limited by Cloudflare (expect 429 when
abusing /reg) — the panel's **Import** card (paste a WireGuard `.conf` or a
warp-reg JSON) is the reliable path for a second account.

## 6. What does NOT work on Android

- `wrangler dev` / miniflare local preview (workerd binary).
- `wrangler tail` — the interactive stream (it needs the dev runtime);
  `wrangler tail --format pretty` may still open a socket — treat tail as
  desktop-only.
- Anything else that executes workerd processes.

Deploy, secrets, KV, assets, login and the deploy wizard all work.