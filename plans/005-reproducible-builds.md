# Plan 005: Reproducible builds + client bundle — lockfile, pinned deps, flag icons

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 68b3da8..HEAD -- package.json .gitignore Dockerfile components/icons/flag-icon.tsx package-lock.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 002 (package.json now has `typecheck`/`lint` scripts to preserve)
- **Category**: tech-debt / perf
- **Planned at**: commit `68b3da8`, 2026-08-15
- **Issue**: —

## Why this matters

Builds are not reproducible: `package-lock.json` is in `.gitignore` (line 9),
the Dockerfile copies only `package.json` and runs `npm install`, and two
dependencies are pinned to `"latest"` (`buffer`, `tweetnacl`). Any future
release of those packages can silently change the generated configs (crypto
output, Buffer behavior). Separately, the client bundle ships all ~198 flag
SVGs from `country-flag-icons` via a namespace import, when only 5 flags are
ever rendered. After this plan: builds resolve from a committed lockfile,
`buffer`/`tweetnacl` are version-pinned, the Dockerfile installs from the
lockfile, and the bundle only contains the 5 used flags.

## Current state

- `.gitignore:9` → `package-lock.json` (lockfile exists locally but is untracked — `Test-Path package-lock.json` is True).
- `package.json:15` → `"buffer": "latest"`; `package.json:28` → `"tweetnacl": "latest"`.
- `Dockerfile:4-5`:
  ```dockerfile
  COPY package.json ./
  RUN npm install --legacy-peer-deps
  ```
  (no lockfile copy, no `npm ci`).
- `components/icons/flag-icon.tsx:1-3`:
  ```tsx
  'use client';
  import * as Flags from 'country-flag-icons/react/3x2';
  ```
  `flag-icon.tsx:13` does a dynamic lookup `(Flags as Record<string, ...>)[upperCode]`,
  which defeats tree-shaking — every flag module is bundled.
- The only flags actually used in the app (verified via grep of `config/endpoints.ts`
  and all `FlagIcon` call sites in `components/layout/sidebar.tsx:77`,
  `components/generator/config-selectors.tsx:45,62,74`): `DE`, `NL`, `FI`, `PL`, `LV`.
- `package.json` scripts after plan 002: `dev`, `build`, `start`, `lint` (`tsc --noEmit`), `typecheck` (`tsc --noEmit`). Preserve all of them.
- Repo convention: no `npm-shrinkwrap`; single `package.json` at root; Docker uses `--legacy-peer-deps`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Lockfile  | `npm install --package-lock-only --legacy-peer-deps` | exit 0, `package-lock.json` updated |
| Typecheck | `npm run typecheck`      | exit 0              |
| Build     | `npm run build`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Bundle check | `npm run build` output / `Get-ChildItem .next/static/chunks -Filter *.js | Measure-Object` | build succeeds; optionally compare chunk list before/after |

## Scope

**In scope** (the only files you should modify):
- `package.json` (pin `buffer` and `tweetnacl` to the resolved versions; do NOT touch scripts)
- `package-lock.json` (commit it — remove from `.gitignore` first, then regenerate if needed)
- `.gitignore` (remove line 9 `package-lock.json`)
- `Dockerfile` (copy lockfile, use `npm ci`)
- `components/icons/flag-icon.tsx` (explicit flag imports)

**Out of scope** (do NOT touch, even though they look related):
- `components/icons/icon-resolver.tsx`, `components/icons/custom-icons.tsx` — unrelated icon files.
- Other dependencies — pin only `buffer` and `tweetnacl` (the two `"latest"` ones). All others already use `^` ranges and are lockfile-managed.
- The `country-flag-icons` package version — keep `^1.6.15`; only the import style changes.
- `worker/`, `functions/`, `lib/`, `app/` — no code changes.

## Git workflow

- Branch: `advisor/005-reproducible-builds`
- Commit message style (conventional, matches repo): `build: commit lockfile, pin buffer/tweetnacl, tree-shake flag icons`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Un-ignore and regenerate the lockfile

1. Remove line 9 (`package-lock.json`) from `.gitignore`.
2. Determine the currently-resolved versions (from the existing lockfile, or run `npm ls buffer tweetnacl` — on this machine: `buffer@6.0.3`, `tweetnacl@1.0.3`).
3. Update `package.json`:
   - `"buffer": "6.0.3"` (exact, matching resolved version)
   - `"tweetnacl": "1.0.3"` (exact, matching resolved version)
4. Run `npm install --package-lock-only --legacy-peer-deps` so the lockfile reflects the pinned versions.

**Verify**:
- `Get-Content .gitignore` → no `package-lock.json` line
- `Get-Content package.json | Select-String '"buffer"|"tweetnacl"'` → `"6.0.3"` and `"1.0.3"` (exact pins)
- `Test-Path package-lock.json` → True
- `git status` shows `package-lock.json` as untracked (will be added in step 4)

### Step 2: Install from lockfile in Docker

Update `Dockerfile` stage 1:

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
```

**Verify**: `Get-Content Dockerfile` → contains `COPY package.json package-lock.json ./` and `npm ci --legacy-peer-deps`. (Do not run a full Docker build; no Docker daemon assumed.)

### Step 3: Tree-shake the flag icons

Rewrite `components/icons/flag-icon.tsx` to import only the 5 used flags:

```tsx
'use client';

import { DE, NL, FI, PL, LV } from 'country-flag-icons/react/3x2';
import type { ComponentType, SVGProps } from 'react';

const FLAGS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  DE,
  NL,
  FI,
  PL,
  LV,
};

interface FlagIconProps {
  code: string;
  size?: number;
}

export function FlagIcon({ code, size = 20 }: FlagIconProps) {
  const FlagComponent = FLAGS[code.toUpperCase()];
  const h = Math.round(size * 0.67);

  if (!FlagComponent) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: size,
          height: h,
          background: 'var(--surface-3)',
          borderRadius: 3,
        }}
      />
    );
  }

  return (
    <FlagComponent
      style={{
        width: size,
        height: h,
        borderRadius: 3,
        display: 'block',
      }}
    />
  );
}
```

Preserve the existing props API and fallback span exactly — callers
(`sidebar.tsx:77`, `config-selectors.tsx:45,62,74`) must not change.

**Verify**:
- `npm run typecheck` → exit 0
- `rg -n "import \* as Flags|Flags as Record" components/icons/flag-icon.tsx` → no matches

### Step 4: Stage everything and verify

**Verify**:
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm run build` → exit 0 (this also proves the lockfile/pins resolve cleanly)
- `git status` → modified: `package.json`, `.gitignore`, `Dockerfile`, `components/icons/flag-icon.tsx`; untracked: `package-lock.json`; nothing else.

## Test plan

No test runner exists. Verification is the typecheck/build gates above, plus a
bundle sanity check: after `npm run build`, confirm the flag-icon chunk no
longer references all flag modules —
`rg -l "Flag_of" .next/static/chunks -g "*.js"` should return no matches (the
flag SVGs contain `Flag_of_` in their paths/definitions; if none appear, the
namespace import is gone). If that grep is noisy, fall back to comparing the
largest chunk file size before/after (should shrink by ~200 KB) — either
evidence is acceptable.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.gitignore` no longer contains `package-lock.json`
- [ ] `package.json` pins `buffer` and `tweetnacl` to exact versions (no `latest`)
- [ ] `package-lock.json` exists in the working tree (untracked or staged)
- [ ] `Dockerfile` uses `COPY package.json package-lock.json ./` and `npm ci --legacy-peer-deps`
- [ ] `components/icons/flag-icon.tsx` has no `import * as Flags` namespace import; only 5 named flag imports
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` all exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 005 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The resolved versions of `buffer`/`tweetnacl` differ from `6.0.3`/`1.0.3` (use the LIVE resolved versions from `npm ls` instead, and report).
- `npm ci --legacy-peer-deps` would fail against the committed lockfile (test locally with `npm ci --dry-run --legacy-peer-deps` before editing the Dockerfile).
- The `country-flag-icons` export names (`DE`, `NL`, `FI`, `PL`, `LV`) don't exist in `react/3x2` (verify with a typecheck; if any fails, report).
- `npm run build` fails for a reason outside the in-scope files.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- Future `npm install` runs will now update the lockfile — commit it alongside
  dependency changes. Consider a CI check `git diff --exit-code package-lock.json`
  once CI is added.
- If a new endpoint flag is added (e.g. a server in another country), add its
  flag import to `FLAGS` in `flag-icon.tsx` — the fallback span renders a blank
  placeholder otherwise.
- The Docker image previously relied on `npm install`; `npm ci` is stricter
  (fails if lockfile and package.json disagree) — that's the intended guard.