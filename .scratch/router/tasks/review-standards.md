# Task: code review — STANDARDS axis (whole implementation)

You are a review worker (router protocol: `docs/router.md` — read it).
You are **read-only**: no file may be modified, nothing committed. Your
deliverable is a single result file.

## Scope

Review the diff of the entire subscription-panel implementation:

```
git diff 6495a67...HEAD --stat   # the change to review
git log 6495a67..HEAD --oneline  # the commit list
```

Fixed point `6495a67` = "spec + 9 tickets" (pre-implementation). 6495a67 must
resolve; diff must be non-empty (verify first; fail loudly otherwise).

## Standards sources (cite file + rule for every finding)

1. `AGENTS.md` (repo-level agent/worker discipline).
2. `docs/router.md` (worker protocol: forbidden files, no commits, result-file contract).
3. `.scratch/warp-panel/spec.md` → "Implementation Decisions" (the strongest
   standards source: textContent-only UI — never innerHTML; constant-time
   compares; 404-not-401 on sub tokens; 503 helper for missing account;
   KV writes strictly after network success; fail-fast binding asserts;
   seam purity `renderSubscription` + RENDERERS registry; no network at
   serve time; 6 h cache headers; zero new npm dependencies; tests via
   node:test).
4. ADRs 0001–0007 under `docs/adr/` where they constrain code shape.
5. The security discipline inherited from tickets 01–02: constant-time
   compares, publicAccount never exposing keys/token, no logging of tokens.

## Smell baseline (applies even beyond repo docs; repo standards override)

- **Mysterious Name** — a function/variable whose name doesn't reveal what it does → rename.
- **Duplicated Code** — same logic shape in more than one hunk/file → extract the shared shape.
- **Feature Envy** — a method reaching into another object's data more than its own → move it.
- **Data Clumps** — same few fields travel together repeatedly → bundle into one type.
- **Primitive Obsession** — a primitive standing in for a domain concept → give it a type.
- **Repeated Switches** — same switch/if-cascade on the same type recurs → polymorphism or one shared map.
- **Shotgun Surgery** — one logical change forces scattered edits across many files → gather into one module.
- **Divergent Change** — one module edited for several unrelated reasons → split.
- **Speculative Generality** — abstraction added for needs the spec doesn't have → delete.
- **Message Chains** — long a.b().c().d() navigation the caller shouldn't depend on → hide behind one method.
- **Middle Man** — a function that mostly delegates onward → cut it.
- **Refused Bequest** — an implementer ignoring most of what it inherits → composition over inheritance.

Each is a labelled heuristic (judgement call), never a hard violation; skip
anything tooling enforces (e.g. node --check). A documented repo standard
overrides the baseline — note when you're suppressing one.

## Brief

Read the full diff (all hunks, all changed files in `worker/` and the
tracker/docs edits in range). Then report — per file/hunk where relevant —
(a) every place the diff violates a documented standard: cite the standard
(file + rule); and (b) any baseline smell you spot: name it and quote the
hunk. Distinguish hard violations from judgement calls (documented-standard
breaches can be hard; baseline smells are always judgement calls). Skip
anything tooling enforces. Note (c) any place the diff *fixes* a standard
violation from earlier tickets (e.g. guard updates, api-handler retirement).

## Deliver

Write `.scratch/router/results/review-standards.md`: scope recap (diff
stat + commit count), findings grouped (a)/(b)/(c), each finding with file,
line/hunk quote, standard citation, and severity (hard / judgement).
**Under 400 words for the findings section itself.** Then reply exactly DONE.