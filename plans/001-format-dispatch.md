# Plan 001: Fix format dispatch — support all 7 formats on Vercel/Netlify/Docker

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 68b3da8..HEAD -- config/formats.ts lib/warp-service.ts lib/builders types`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `68b3da8`, 2026-08-15
- **Issue**: —

## Why this matters

The type system and the Cloudflare Workers path accept 7 config formats
(`wireguard`, `throne`, `clash`, `nekoray`, `husi`, `karing`, `wiresock`), but
the Vercel/Netlify/Docker path only exposes 3 of them in `config/formats.ts`.
For the 4 missing formats, `lib/warp-service.ts` first registers with
Cloudflare and enables WARP (two paid API calls), then throws
`Unknown format: <format>` when it reaches `supportsQR()`/`getFormatInfo()`.
The user gets a 500 after their request already consumed two Cloudflare
registration slots. The builders for all 7 formats are already implemented in
`lib/builders/` and are proven to work on the Workers path — they just need to
be listed. After this plan, requesting any of the 7 formats on
Vercel/Netlify/Docker succeeds exactly like the Workers path.

## Current state

- `types/config.ts:1` — the source-of-truth union:
  ```ts
  export type ConfigFormat = 'wireguard' | 'throne' | 'clash' | 'nekoray' | 'husi' | 'karing' | 'wiresock';
  ```
- `config/formats.ts:3-25` — `CONFIG_FORMATS` lists only 3 of the 7:
  ```ts
  export const CONFIG_FORMATS: ConfigFormatInfo[] = [
    { id: 'wireguard', name: 'AmneziaWG', description: 'Стандартный формат WireGuard (.conf)', extension: 'conf', supportsQR: false },
    { id: 'clash', name: 'Clash', description: 'Конфигурация для Clash Meta (.yaml)', extension: 'yaml', supportsQR: false },
    { id: 'wiresock', name: 'WireSock', description: 'WireGuard с маскировкой протокола (.conf)', extension: 'conf', supportsQR: false },
  ];
  ```
- `config/formats.ts:27-42` — `getFormatInfo` throws `Unknown format: ${format}`
  for any id not in the list; `supportsQR()` calls it.
- `lib/warp-service.ts:82-85` — validation accepts all 7:
  ```ts
  const validFormats: ConfigFormat[] = ['wireguard', 'throne', 'clash', 'nekoray', 'husi', 'karing', 'wiresock'];
  if (!validFormats.includes(req.configFormat)) {
    throw new WarpGenerationError(`Unsupported format: ${req.configFormat}`);
  }
  ```
- `lib/warp-service.ts:44-54` — the crash site: `buildConfig` succeeds (all 7
  builders exist in `lib/builders/index.ts:10-18`), then
  `supportsQR(format)` → `getFormatInfo()` throws for the 4 unwired formats.
- `lib/builders/index.ts:10-18` — `BUILDERS` map already contains all 7.
- `worker/api-handler.js:343-345` — the Workers reference behavior this plan
  aligns to: `BUILDERS` (all 7), `EXTENSIONS = { wireguard: 'conf', throne: 'txt', clash: 'yaml', nekoray: 'json', husi: 'json', karing: 'json', wiresock: 'conf' }`, `QR_FORMATS = ['wireguard', 'throne', 'wiresock']`.
- `lib/qr-generator.ts:22-30` — `unsupportedQR(name)` returns a placeholder SVG
  (translated to English by plan 003); used when `supportsQR` is false.

Note: descriptions are currently Russian; plan 003 translates them to English.
Match the existing Russian style here so 003 is a pure find/replace — do not
write English descriptions in this plan.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`       | exit 0 (currently fails on the known `SiCanva` error — plan 002 fixes it; for 001, verify this plan's file only has no *new* errors) |

## Scope

**In scope** (the only files you should modify):
- `config/formats.ts` (add 4 entries to `CONFIG_FORMATS`)

**Out of scope** (do NOT touch, even though they look related):
- `lib/builders/*` — builders already handle all 7 formats correctly.
- `config/formats.ts` descriptions — leave them Russian; plan 003 translates.
- `worker/api-handler.js`, `functions/api/generate.js` — they already support
  all 7 formats.
- `supportsQR` values — leave all 7 as `false` for now; plan 004 flips the
  three QR-capable formats after fixing the QR privacy leak.

## Git workflow

- Branch: `advisor/001-format-dispatch`
- Commit message style (conventional, matches repo): `fix: support all 7 config formats on Vercel/Netlify/Docker path`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the 4 missing format entries

In `config/formats.ts`, add four entries to `CONFIG_FORMATS` for `throne`,
`nekoray`, `husi`, `karing`, keeping the array ordered to match the
`ConfigFormat` union order (`wireguard, throne, clash, nekoray, husi, karing,
wiresock`). Use the same field style as the existing entries, with Russian
descriptions (to be translated by 003). Extensions and QR support follow the
Workers reference (`worker/api-handler.js:344-345`):

```ts
{
  id: 'throne',
  name: 'Throne',
  description: 'WireGuard-конфигурация для Throne (wg://)',
  extension: 'txt',
  supportsQR: false,
},
{
  id: 'nekoray',
  name: 'NekoRay',
  description: 'Конфигурация для NekoRay (.json)',
  extension: 'json',
  supportsQR: false,
},
{
  id: 'husi',
  name: 'Husi',
  description: 'Конфигурация для Husi (.json)',
  extension: 'json',
  supportsQR: false,
},
{
  id: 'karing',
  name: 'Karing',
  description: 'Конфигурация для Karing (.json)',
  extension: 'json',
  supportsQR: false,
},
```

After this, `CONFIG_FORMATS` must contain exactly 7 entries whose `id` values
match `ConfigFormat` 1:1.

**Verify**:
- `npx tsc --noEmit` shows no errors in `config/formats.ts` (the pre-existing
  `icon-resolver.tsx` error from the baseline may still appear — that is
  expected and fixed by plan 002).
- `npx tsc --noEmit 2>&1 | Select-String -Pattern "formats"` → no matches.
- Grep the ids: `Get-Content config/formats.ts | Select-String "id: '"` →
  exactly `wireguard, throne, clash, nekoray, husi, karing, wiresock`.

### Step 2: Sanity-check the dispatch no longer throws

No code change is needed in `lib/warp-service.ts`; the fix is purely that
`getFormatInfo`/`supportsQR`/`getFileName` now find every format. Confirm by
inspection that `config/formats.ts:27-42` (`getFormatInfo`, `getFileName`,
`supportsQR`) operate on the 7-entry array with no hardcoded 3.

**Verify**: `Get-Content config/formats.ts` → the file reads cleanly with 7
entries and no syntax errors.

## Test plan

There is no test runner in this repo (verified during recon — `package.json`
has no `test` script). Verification is typecheck + structural grep above. Plan
003 adds nothing test-related either. A manual curl is impractical here
(requires live Cloudflare registration); the structural check that every
`ConfigFormat` has a `getFormatInfo`-visible entry is the machine-checkable
guarantee.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `config/formats.ts` `CONFIG_FORMATS` contains exactly the 7 ids from `ConfigFormat`
- [ ] `npx tsc --noEmit` reports no errors in `config/formats.ts` / `lib/warp-service.ts`
- [ ] No files outside `config/formats.ts` are modified (`git status`)
- [ ] `plans/README.md` status row for 001 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase has drifted since this plan was written).
- Any format id in `types/config.ts` is missing from the updated
  `CONFIG_FORMATS` (i.e. the union and the array drifted apart).
- `npx tsc --noEmit` shows a NEW error introduced by this change.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- Plan 004 will set `supportsQR: true` on `wireguard`, `throne`, `wiresock`
  (matching `worker/api-handler.js:345`) after making QR generation local.
- Plan 003 will translate the Russian `description` strings in this file.
- If a new format is ever added to `ConfigFormat`, it must be added here too —
  this array is the Vercel/Netlify/Docker registration of supported formats.