# Deploying the WARP subscription panel (Cloudflare Workers)

Operator-side guide for the **panel worker** — the maintained product of this
repo (ADR 0003: Cloudflare-first). The interactive wizard
[`scripts/deploy-warp-panel.sh`](../../scripts/deploy-warp-panel.sh) automates
this whole page; the sections below are the same walkthrough in prose, plus
the exact end-state config and the troubleshooting table.

> **Unmaintained legacy — read this first.** The Next.js app (`app/`,
> `components/`, `lib/`, `config/`, `functions/`) and the Docker / Vercel /
> Netlify sections of the root `README.md` describe the **old** single-config
> generator product and are **unmaintained** (ADR 0004). Its public
> `POST /api/generate` route was **removed** from the worker (ADR 0002) — the
> worker now serves the password-gated panel + subscription endpoints only.
> `README_ru.md` / `README_fa.md` are translations of that legacy README and
> do not describe this deployment. The only surfaces that matter here are
> `worker/` and `wrangler.jsonc`.

---

## Preflight

| Requirement | Check | If missing |
|---|---|---|
| Repo checkout | `git remote -v` prints a remote | `git clone <url>` and re-run |
| Clean tree | `git status --porcelain` empty | stash (`git stash`) or review before deploying — the wizard offers to stash |
| bash ≥ 4 | `bash --version` | macOS: `brew install bash` |
| wrangler ≥ 3.x | `wrangler --version` | `npm install -g wrangler@latest` |
| curl | `command -v curl` | `brew install curl` / `apt install curl` |
| node (optional) | `node --version` | only needed for the automatic `wrangler.jsonc` patch; without it the wizard prints the snippet to paste |
| jq (optional) | `command -v jq` | the wizard falls back to grep/sed for KV JSON parsing |
| Built assets | `out/` exists (from `CLOUDFLARE_WORKERS=1 npm run build`) | the wizard offers to build it; `wrangler deploy` fails without it |
| Cloudflare login | `wrangler whoami` says "logged in" | `wrangler login` (browser OAuth); or `export CLOUDFLARE_API_TOKEN=…` |

There is **no `node_modules`/npm install requirement** for deploying — wrangler
reads the config from `wrangler.jsonc` and the worker is plain JS; only the
assets build needs npm.

---

## Quick start

```bash
./scripts/deploy-warp-panel.sh
```

One interactive run, 8 stages, **idempotent** (every re-run re-puts the
secrets harmlessly, reuses the existing KV namespaces, and patches
`wrangler.jsonc` in place from the same placeholders):

1. **Preflight** — bash/wrangler/curl/git checks, stash offer, assets build offer.
2. **Login** — `wrangler login` when unauthenticated.
3. **PASSWORD** — hidden prompt, min 12 chars, entered twice, then
   `wrangler secret put PASSWORD` (piped on stdin; never echoed, zeroed on exit).
4. **SUB_PATH** — auto-generated URL-safe token (or manual entry), stored as a
   secret; the wizard prints it **once** — it is the subscription credential.
5. **KV namespaces** — `ACCOUNT`, `ENDPOINTS`, `AWG` created via
   `wrangler kv namespace create`; existing namespaces are reused by title.
6. **`wrangler.jsonc`** — backed up to `wrangler.jsonc.bak`, then the commented
   `vars` + `kv_namespaces` placeholders are uncommented and filled in place
   (embedded node script; without node, the exact snippet is printed for a
   manual paste). Everything else in the file stays byte-for-byte.
7. **Deploy** — `wrangler deploy`; on failure it suggests `wrangler dev`.
8. **Smoke suite** — 11 curl checks against the live worker (see table below);
   each prints PASS/FAIL and the run stops on the first failure.

---

## The two secrets

Both are Worker secrets — encrypted, set via `wrangler secret put`, never
committed. Dashboard fallback: *Workers & Pages → warp → Settings → Variables
and Secrets → Add binding (type: secret text)*.

### `PASSWORD`

The panel login password; it also signs the `warp_session` cookie
(`worker/auth.js`). Min 12 chars. Login without it redirects with
`/?error=config`.

```bash
wrangler secret put PASSWORD     # then type the value (or pipe it)
```

### `SUB_PATH`

The unguessable path token for the subscription endpoints — **the path IS the
credential** (ADR 0006): no session is needed to fetch a sub URL, and
wrong/missing tokens get a **404, never a 401**. Recommend a 32+ byte random
URL-safe value (`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`).

```bash
wrangler secret put SUB_PATH
```

The subscription URLs are:

```
https://<worker>/api/<SUB_PATH>/sub          v2rayN / v2rayNG / Streisand / Husi (base64 wireguard:// list)
https://<worker>/api/<SUB_PATH>/sub/clash    Clash / Mihomo YAML
https://<worker>/api/<SUB_PATH>/sub/neko     NekoBox desktop (nekoray://custom# links)
https://<worker>/api/<SUB_PATH>/sub/wg       official WireGuard app (.zip of .conf)
https://<worker>/api/<SUB_PATH>/sub/awg      LxBox / INCY (awg:// links)
https://<worker>/api/<SUB_PATH>/sub/singbox  sing-box (SFA/SFI; ?legacy=1 for pre-1.13)
```

---

## KV namespaces

Three namespaces back the panel state (ADR 0005):

| Binding | Holds | Written by |
|---|---|---|
| `ACCOUNT` | the stored WARP account record (key from `registerAccount`) | panel Register / Rotate / Import |
| `ENDPOINTS` | the endpoint list (key `endpoints`) | panel endpoints card |
| `AWG` | AmneziaWG toggle + params (key `awg`, absent when off) | panel AWG card |

```bash
wrangler kv namespace create ACCOUNT
wrangler kv namespace create ENDPOINTS
wrangler kv namespace create AWG
```

Each prints a JSON result — copy the `result.id`. Re-runs: the wizard checks
`wrangler kv namespace list` for namespaces titled `ACCOUNT`/`ENDPOINTS`/`AWG`
and reuses them, so creating them in the dashboard (or a previous run) is fine.
Dashboard fallback: *Workers & Pages → KV* → open the namespace → copy the ID.

The IDs are not secret — but `wrangler.jsonc` is and must contain the real IDs
or every KV call fails with a "binding is missing"-style error (see
troubleshooting).

---

## `wrangler.jsonc` end state

The repository ships the config with **commented placeholders** for local dev.
The wizard uncomments exactly these two regions and fills them (original →
`wrangler.jsonc.bak`). Everything else is untouched, byte-for-byte. The end
state, with annotations:

```jsonc
{
  // … top of the file unchanged (name, compatibility_date, assets, …) …

  // ── patched by the wizard (was: // "vars": { "PASSWORD": "local-dev-change-me" })
  // PASSWORD/SUB_PATH here are plaintext COPIES of the secrets so that
  // `wrangler dev` works with the same credentials; the deployed worker
  // reads the encrypted secrets. Do NOT commit this file once patched.
  "vars": { "PASSWORD": "<panel-password>", "SUB_PATH": "<subscription-token>" },

  // … the surrounding PASSWORD/SUB_PATH/ACCOUNT comment block is preserved …

  // ── patched by the wizard (was: the commented three-line template)
  "kv_namespaces": [
    { "binding": "ACCOUNT", "id": "<namespace-id>" },
    { "binding": "ENDPOINTS", "id": "<namespace-id>" },
    { "binding": "AWG", "id": "<namespace-id>" }
  ]

  // … trailing comments + closing brace unchanged …
}
```

If you prefer to keep plaintext values out of a tracked file, delete the
`"vars"` line after patching — production behavior is driven entirely by the
secrets, so the deployed worker is unaffected (only `wrangler dev` loses its
local values).

---

## Deploy

```bash
wrangler deploy    # uploads worker + ./out assets
```

Output ends with the worker URL, e.g. `https://warp.<subdomain>.workers.dev`.
`wrangler deploy` fails immediately if `out/` is missing — run
`CLOUDFLARE_WORKERS=1 npm run build` first (the wizard offers this).

If deploy fails for a subtler reason, go local first:

```bash
wrangler dev       # local preview on localhost — open it, watch the console
```

---

## Smoke suite (command → expected)

The wizard runs these 11 checks against the live worker and stops on the first
failure (`$B` = worker base URL, `$J` = cookie jar, `$T` = SUB_PATH token):

| # | Command | Expected |
|---|---|---|
| 1 | `curl $B/` (anon) | `200`, HTML containing `Sign in to manage the subscription panel` |
| 2 | `curl $B/api/account` (anon) | `401` JSON |
| 3 | `curl $B/api/<wrong-token>/sub` | `404` — never `401` |
| 4 | `curl -L -c $J --data-urlencode password=… $B/api/auth/login` | `200`, `warp_session` cookie in `$J` (`.warp-panel.cookies` under `$HOME`, chmod 600) |
| 5 | `curl -b $J $B/api/account` | `200` JSON with `"success": true` |
| 6 | `curl -b $J -X POST $B/api/account/register` | `200` — or read a `429` (IP rate limit; use Import) |
| 7 | `curl -b $J $B/api/settings` | `200` JSON with `endpoints` and `awg` fields |
| 8 | `curl $B/api/$T/sub` | `200`, body is base64 decoding to `wireguard://` lines |
| 9 | `curl $B/api/$T/sub/clash` | `200` YAML containing `proxies:` |
| 10 | `curl $B/api/$T/sub/wg` | `200`, `application/zip`, magic bytes `PK\x03\x04` |
| 11 | `curl -b $J -X POST $B/api/auth/logout` | `200` |

Notes:

- Checks 8–10 need a stored account (any of: register succeeded just now, a
  previous run registered one, or you Imported one). Without one they fail
  with `503` + "No WARP account registered yet" — that is the worker telling
  you to open the panel and Register/Import, not a deploy bug.
- Subscription responses are cached 6 h at the edge (`s-maxage=21600`); after
  a content change (rotate/endpoints), the old payload may linger briefly.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `POST /api/account/register` → `429` | Cloudflare's registration API is IP-rate-limited (the limit is shared across all deployments, since the worker calls it from Cloudflare's egress). Not a bug. Register later, or use the Import card with an existing WARP account (.conf or registration JSON) — Import is never rate-limited. |
| `ACCOUNT KV binding is missing — add a kv_namespaces entry named ACCOUNT (see wrangler.jsonc)` (and the same for ENDPOINTS/AWG) | "D1 is undefined"-style binding error: `env.ACCOUNT` is undefined because `kv_namespaces` is still commented/empty in `wrangler.jsonc`, or the id is wrong. Open the file, confirm the three bindings; the wizard writes them — or paste them manually from *Workers & Pages → KV*. |
| Login redirects to `/?error=config` | The `PASSWORD` secret is missing on the deployed worker (env.PASSWORD unset). Set it (`wrangler secret put PASSWORD` or dashboard) — the wizard's smoke checks catch this. |
| `/?error=invalid` after a correct-looking password | The worker has a *different* PASSWORD than the one you typed (rotated mid-way, or var/secret mismatch). Re-put both or re-run the wizard. |
| `/api/<token>/sub*` → `404` | Wrong/old token — the path IS the credential and the worker deliberately 404s unknown tokens. Did you rotate SUB_PATH on one side only? |
| `/api/<token>/sub*` → `503` "No WARP account registered yet" | No account stored in `ACCOUNT` KV. Open the panel → Register (may 429 — see above) or Import. |
| Unknown paths return the panel HTML with `200` instead of `404` | Expected: `assets.not_found_handling: "single-page-application"` serves the shell for any unknown path to an *authenticated* caller. `wrangler dev` shows the same. Not breakage. |
| `wrangler secret put` fails with "could not find worker" on a brand-new account | Secrets attach to the script; deploy once (`wrangler deploy`), then re-run the wizard — it is idempotent. |
| `wrangler deploy` fails mentioning `out` | Assets not built: `CLOUDFLARE_WORKERS=1 npm run build`. |

## Rotating secrets / re-running

- **PASSWORD or SUB_PATH change**: `wrangler secret put PASSWORD` /
  `wrangler secret put SUB_PATH` (they take effect on the next deploy —
  `wrangler secret put` deploys immediately). Then re-run the wizard to
  re-patch the `vars` copy and re-run the smoke suite. After rotating
  SUB_PATH, old subscription URLs in clients' hands stop working — that's the
  point.
- **Re-running the wizard** is safe: secrets re-put (same or new values), KV
  namespaces reused by title, `wrangler.jsonc` patched from the current state
  (previous run's patch replaces cleanly), `.bak` refreshed.
- `wrangler.jsonc.bak` is your rollback: `cp wrangler.jsonc.bak wrangler.jsonc`.
  Delete it once the deploy is verified — and **never commit the patched
  `wrangler.jsonc`** (it carries plaintext copies of the secrets).