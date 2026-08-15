# Task: implement ticket 01 — Password gate + panel shell

You are a worker session in the warp-generator repo (router protocol:
`docs/router.md` — read it). Implement **exactly** ticket 01:
`.scratch/warp-panel/issues/01-password-gate-and-panel-shell.md`.

## Read first (in this order)

1. `CONTEXT.md` (glossary — use its vocabulary)
2. `.scratch/warp-panel/spec.md` (Spec: WARP subscription panel)
3. `docs/adr/0004-lean-built-in-panel-ui.md`, `docs/adr/0006-subscriptions-unguessable-path.md`
4. `docs/plans/pivot-inventory.md` (routes today, ASSETS binding, env passing)
5. `worker/index.js`, `worker/api-handler.js`, `wrangler.jsonc`

## Constraints

- Plain-JS Cloudflare Worker. The JS engine in `worker/` is the single engine
  (ADR 0004, 0001). **Do not modify** `lib/`, `app/`, `components/`, `functions/`,
  `config/`, `public/`, `scripts/`, docs, or package.json.
- New code lives in `worker/` (e.g. `worker/auth.js` + wiring in
  `worker/index.js`). `worker/index.js` currently ignores `env` — ticket 01
  must start passing `env` through as the auth secret source.
- Keep existing behaviour: `POST/GET /api/generate` unchanged and still
  public. Everything else gated per the ticket.
- The panel shell: a minimal static login page + empty authenticated shell
  (plain HTML/CSS/JS). Follow ADR 0004 (framework-less). You decide how to
  serve it (worker-rendered HTML or an assets binding) — keep it simple.
- Session cookie: HMAC-signed via Web Crypto, `PASSWORD` secret, ~7-day
  expiry, constant-time compare, logout. `PASSWORD` read from `env`
  (`wrangler.jsonc` may need a placeholder commented for local dev — don't
  add real secrets).
- Tests: `node:test` (`node --test`). Cover the cookie sign/verify logic as
  pure functions. Do not add npm dependencies.
- **Do not git commit.** Leave everything in the working tree.
- Verify before finishing: `node --test` green; `node --check` on changed
  worker files.

## Deliver

Write `.scratch/router/results/01-auth.md`: what you built (files, routes,
cookie mechanics), test output, verification results, anything surprising,
any deviation from the ticket (with rationale). Then reply with exactly
DONE.