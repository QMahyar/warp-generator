# Plan: Frontend tests + state refactor + stale-notice cleanup

## Context

The Next.js frontend (the actively-maintained product) has grown logic with zero test coverage:

- `useDebouncedCommit` (hooks/use-generator.ts:9) — a debounce/pending state machine, previously a source of drift bugs.
- Generator state invariants in `useGenerator` (hooks/use-generator.ts:112-138) — community DNS forces `siteMode='all'` and clears services; `'specific'` mode clears `excludeLan`; `toggleService` interacts with `excludeLan`.
- A hand-rolled ARIA dropdown (components/generator/config-selectors.tsx:26-183) claiming full keyboard navigation.

Worker code has a healthy `node --test` culture (worker/*.test.js); the frontend has no runner at all. Also, the app carries stale "unmaintained" notices (banner in app/page.tsx, README warning, ADR 0004) that are fork debris — the owner actively maintains the app.

## Global constraints

1. Worker tests stay on `node --test` — do NOT migrate them. Frontend tests run under vitest.
2. New devDependencies (installed once, Task 1): `vitest`, `jsdom`, `@testing-library/react` (v16+), `@testing-library/user-event`. No other new deps.
3. `npm run lint` (tsc --noEmit) must stay green — test files are typechecked too.
4. Generated config output and the public API never change. State-machine behavior must be preserved **exactly** as it is today — tests document current behavior, they do not redesign it.
5. Existing code style: no comments unless explanatory, arrow functions, single quotes, 2-space indent, no semicolons.
6. No UI redesign. Visual output stays pixel-identical.

## Out-of-scope rulings

- **Ruling 1 (deferred from review):** Worker tests not migrated to vitest — churn without benefit; two runners coexist (`test` = worker, `test:front` = vitest).
- **Ruling 2 (deferred from review):** Service `category` stays in the per-service JSON files — it is data about data; centralizing into a code map would make adding a service require a code edit. Not duplication.
- **Ruling 3:** Test files colocate with source (`hooks/x.test.ts`, `components/y.test.tsx`). Next ignores `.test.*` for routing; tsconfig already includes them.

## Task 1 — Frontend test infra

Install devDeps (exact: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`), add `vitest.config.ts` (`environment: 'jsdom'`, `globals: true` — required for RTL auto-cleanup), add scripts `"test:front": "vitest run"` and `"test:all": "node --test && vitest run"`.

Add one smoke test that proves the full stack (vitest + TS + jsdom + RTL + user-event): render a trivial inline component, assert it appears, click it with user-event. Name it `components/generator/toggle.test.tsx` if `Toggle` is simple to render (read it first); otherwise inline component in the test file. Do NOT test real feature code here — that is Tasks 2-4.

Verify: `npm run test:front` passes; `npm run lint` passes.

## Task 2 — Extract pure generator state transitions + tests

New file `hooks/generator-state.ts` — pure TS, NO React import. It owns the `GeneratorState` interface and three pure functions, logic copied verbatim from the current `useCallback` bodies:

- `applyDnsSelection(state, id)` — from `setDnsId` (hooks/use-generator.ts:112-119)
- `applySiteMode(state, mode)` — from `setSiteMode` (hooks/use-generator.ts:122-128)
- `applyServiceToggle(state, key)` — from `toggleService` (hooks/use-generator.ts:130-138)

Refactor `use-generator.ts` to consume these (the three callbacks become thin `setState(prev => fn(prev, arg))` wrappers). Import `GeneratorState` type from the new file. Keep `set`, `setEndpoint`, `handleGenerate`, `reset`, `copyConfig`, `downloadConfig` untouched.

Tests in `hooks/generator-state.test.ts` (vitest), documenting current behavior:

1. `applyDnsSelection` with community DNS → `siteMode: 'all'`, `selectedServices: []`, dnsId set.
2. `applyDnsSelection` with non-community DNS → only dnsId changes.
3. `applySiteMode('specific')` → `excludeLan: false`.
4. `applySiteMode('specific')` when communityDns → state unchanged (same reference or deep-equal).
5. `applyServiceToggle` adds key; adding a key clears `excludeLan`; removing the last key does NOT restore `excludeLan` (documents current behavior).
6. `applyServiceToggle` no-op when communityDns.
7. `applySiteMode('all')` → siteMode changes, excludeLan untouched.

## Task 3 — Extract useDebouncedCommit + tests

Move `useDebouncedCommit` from hooks/use-generator.ts to new file `hooks/use-debounced-commit.ts`. In `use-generator.ts` keep a re-export (`export { useDebouncedCommit } from './use-debounced-commit'`) so imports in `components/generator/advanced-settings.tsx` keep working. Behavior unchanged.

Tests in `hooks/use-debounced-commit.test.ts` (vitest, `renderHook` from `@testing-library/react`, fake timers):

1. Initial local value = externalValue.
2. `setValue` updates local immediately; `onChange` NOT called before delay.
3. Rapid successive `setValue` calls → exactly one `onChange`, with the last value, after the delay.
4. `commitNow` → immediate `onChange` with local value; pending timer cancelled (no second `onChange` later).
5. externalValue changes while idle → local syncs.
6. externalValue changes while a local edit is pending → NOT applied (documented current behavior).
7. Unmount with pending timer → no `onChange` after unmount.
8. `delayMs` prop is honored.

## Task 4 — Dropdown fixes + component tests

Fix in `components/generator/config-selectors.tsx` `Dropdown`:

1. **Type-ahead:** printable characters (letters/digits) move the active option to the next option whose label starts with the typed prefix (case-insensitive, wraps around, skips disabled). Reset the accumulated buffer after ~500ms idle (timer cleared on each keystroke). `aria-activedescendant` continues to track it.
2. **Stale refs:** clear `optionRefs` when the list closes and null them on unmount.

Everything else (open/close, Arrow keys, Home/End, Enter/Space, Escape, Tab, pointerdown click-outside, disabled handling) stays as-is.

Tests in `components/generator/config-selectors.test.tsx` (vitest + jsdom + user-event), rendering `ConfigSelectors` with spy callbacks:

1. Click opens listbox; click outside closes; Escape closes and refocuses trigger; Tab closes.
2. ArrowDown/ArrowUp move highlight, skipping disabled options; Home/End jump; Enter selects highlighted + closes; Space same; click selects + closes.
3. Type-ahead: pressing `q`/`Q` highlights next option starting with that letter, wraps, skips disabled; buffer resets after idle.
4. `aria-expanded`, `aria-activedescendant`, `aria-selected` on options reflect state.
5. Disabled option: `aria-disabled="true"`, not reachable by keyboard, not selectable.
6. `onChange` fires with correct id; never fires for disabled options.

## Task 5 — Remove stale unmaintained notices

- app/page.tsx: remove the legacy/retired banner that points to the wrangler panel.
- README.md: remove the prominent "Next.js app is unmaintained" warning; keep factual references to wrangler panel features.
- Check README_fa.md and README_ru.md for the same warning; remove if present.
- docs/adr/0004*: update to state the Next.js app is actively maintained (read it first; edit the section that claims unmaintained; keep the rest of the ADR's substance intact).
- Verify: `npm run lint` and `npm run test:front` still green; no dangling references to the banner text anywhere (`rg` for "unmaintained" / "retired" / "legacy").

## Review gates

- After each task: review package (diff BASE..HEAD) → task reviewer subagent → fix rounds (≤5) if needed.
- Final: whole-branch review from merge-base, most capable model, ledger's deferred items triaged.
- Ledger: `.superpowers/sdd/frontend-tests-refactor/progress.md` (this plan's workspace).
