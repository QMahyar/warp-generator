# B11 — Ship: docs, deploy button, Persian README, deploy, live test

Status: OPEN
Type: task (AFK, needs human for `wrangler login`)
Blocked by: B8, B9, B10

## Question / Work

1. Version bump (v2.0.0), CHANGELOG entry covering all batches, README rewrite of changed sections (new endpoints /healthz, token lifecycle, backup, aggregate subs, client picker; de-CDN note; setup checklist), AGENTS.md refresh (real line counts, new conventions: route table, kvSafe, registry pattern, test commands), SPEC.md AC updates.
2. Persian README (README.fa.md) mirroring English structure.
3. Deploy-to-Cloudflare button metadata (repo deploy button config) + one-command quickstart in README.
4. Full local verification pass (wrangler dev): auth flow, generate/import account, all formats fetch, QR/picker UI, export/import.
5. Human runs `wrangler login` → `wrangler deploy` to production KV namespace.
6. Live testing against production URL: api-tester agent (all endpoints incl. auth, 401/404/405/410 paths, format content-types, healthz) + visual QA agent (desktop+mobile) + real subscription import spot-checks.

## Acceptance

- Production serving correct subs for existing tokens (backward compat with current KV data!).
- Zero console errors in QA matrix; CI green.

## Answer

(resolved on close)
