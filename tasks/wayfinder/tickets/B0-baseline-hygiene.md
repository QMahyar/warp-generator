# B0 — Baseline & repo hygiene

Status: OPEN
Type: task (AFK)
Blocks: B1

## Question / Work

Clean the deck so all batches land on a tidy base:
1. Remove `.wrangler-dev.log` from git tracking + add `.gitignore` entry (`.wrangler-dev.log`, `dist/`, `.wrangler/`).
2. Delete stale duplicate templates `html/dashboard.html`, `html/login.html`, `html/setup.html` (inline consts in `_worker.js` are canonical).
3. Sync docs that lie: package.json version vs CHANGELOG vs AGENTS.md (line count ~3432, version v1.3.x). Final numbers re-checked at ship time (B11), here just fix obvious falsehoods.

## Acceptance

- `git status` clean after; no `html/` dir; log file ignored.
- Repo still passes `node --check _worker.js`.

## Answer

(resolved on close)
