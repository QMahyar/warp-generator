# Plan 002: Verification baseline — typecheck gate + lint cleanup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 68b3da8..HEAD -- components/icons/icon-resolver.tsx next.config.mjs package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `68b3da8`, 2026-08-15
- **Issue**: —

## Why this matters

The build currently runs with `typescript.ignoreBuildErrors: true`
(`next.config.mjs:3-5`), so every type error in the repo is invisible at build
time. The one live error today — `SiCanva` doesn't exist in `react-icons/si`
(it's `SiCanvas`) — has been shipping silently. There is no `typecheck` script,
and the `lint` script runs `next lint`, which is deprecated in the installed
Next 15.5.23 and has no ESLint config/deps (it drops into an interactive setup
prompt). This plan makes type errors visible and gives a working, runnable
verification command for every other plan in this repo.

## Current state

- `next.config.mjs:1-9`:
  ```js
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    typescript: {
      ignoreBuildErrors: true,
    },
    images: {
      unoptimized: true,
    },
  };
  ```
- `package.json:5-10` scripts:
  ```json
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
  ```
- `package.json` has NO `eslint` / `eslint-config-next` dependency and no
  eslint config file exists (`eslint.config.*` / `.eslintrc.*` absent —
  confirmed via glob during recon).
- `components/icons/icon-resolver.tsx:7` and `:48`:
  ```tsx
  import { SiPatreon, SiCanva, SiProtonvpn, SiModrinth } from 'react-icons/si';
  ...
    SiCanva,
  ```
  `tsc --noEmit` output: `error TS2724: '"react-icons/si"' has no exported
  member named 'SiCanva'. Did you mean 'SiCanvas'?`
- `tsconfig.json` — `strict: true`, `noEmit: true`; `npx tsc --noEmit` runs
  cleanly against the whole project (verified: the ONLY current error is the
  `SiCanva` one).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0, no errors   |
| Build     | `npm run build`          | exit 0              |
| Lint      | `npm run lint`           | exit 0 (after step 3) |

## Scope

**In scope** (the only files you should modify):
- `components/icons/icon-resolver.tsx` (SiCanva → SiCanvas)
- `next.config.mjs` (remove `typescript.ignoreBuildErrors`)
- `package.json` (add `typecheck` script; replace `lint` script)

**Out of scope** (do NOT touch, even though they look related):
- Any other component or source file.
- Adding ESLint dependencies/config — the repo has none, and this plan's goal
  is a working typecheck gate, not standing up a full ESLint pipeline. Replacing
  `next lint` with `tsc --noEmit` is intentional (see steps).
- `package-lock.json` — plan 005 handles lockfile/reproducibility.

## Git workflow

- Branch: `advisor/002-verification-baseline`
- Commit message style (conventional, matches repo): `fix: enable typecheck gate and replace deprecated lint script`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the SiCanva import

In `components/icons/icon-resolver.tsx`, replace both occurrences of `SiCanva`
with `SiCanvas` (the import on line 7 and the ICON_MAP entry on line 48).

**Verify**: `npx tsc --noEmit` → exit 0, zero errors.

### Step 2: Stop ignoring build type errors

In `next.config.mjs`, remove the `typescript: { ignoreBuildErrors: true }`
block entirely, keeping `images: { unoptimized: true }`.

**Verify**: `Get-Content next.config.mjs` → no `typescript` key remains, and
`npx tsc --noEmit` still exits 0.

### Step 3: Replace the deprecated lint script with a working one

`next lint` is deprecated in Next 15.5 and this repo has no ESLint setup, so
`npm run lint` cannot work without a new dependency + config. Replace the
`lint` script value with `tsc --noEmit` so `npm run lint` becomes a real,
non-interactive verification command:

```json
"lint": "tsc --noEmit"
```

Then add a `typecheck` script (same command, conventional name):

```json
"typecheck": "tsc --noEmit"
```

**Verify**: `npm run lint` → exit 0. `npm run typecheck` → exit 0.

### Step 4: Confirm the full build still succeeds

**Verify**: `npm run build` → exit 0, completes with the production build
(now with real type checking enabled).

## Test plan

No test runner exists in this repo; verification is the typecheck/lint/build
gates above. These gates are what every subsequent plan uses as its
verification baseline.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0 (no `SiCanva` error anywhere)
- [ ] `next.config.mjs` contains no `ignoreBuildErrors`
- [ ] `package.json` has `typecheck` and `lint` scripts; `lint` is no longer `next lint`
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` all exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 002 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `npx tsc --noEmit` still reports errors after Step 1 (there may be a *second*
  pre-existing error this plan didn't anticipate — report the full error list
  rather than fixing unrelated files).
- `npm run build` fails after Step 2 for a reason other than a type error.
- The code at the locations in "Current state" doesn't match the excerpts.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- Every plan written after this one may use `npm run typecheck` as its gate.
- If ESLint is ever properly added, restore a real `lint` script then; until
  then `lint` deliberately aliases the typecheck to stay non-interactive.
- `next build` (not just `tsc`) now fails on type errors — this is the intended
  safety improvement.