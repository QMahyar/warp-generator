# Task: code review — SPEC axis (whole implementation)

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

## Spec source

`.scratch/warp-panel/spec.md` — the full spec: 22 user stories (slides in as
ticket 10), the Status line, "Implementation Decisions", "Seam" (the
`renderSubscription` contract), "Renderers" (six sub endpoints + format
details), "Testing" decision, and the registration/import lines. The
per-ticket acceptance criteria in `.scratch/warp-panel/issues/05-*.md`
through `10-*.md` (Status: done — committed `<sha>`) narrow what each diff
portion was supposed to do — read them as the per-commit requirements.
Research pinning the format shapes lives in `docs/research/sub-formats.md`
and `docs/research/bpb-panel.md` — treat format conformance to those
sources as part of the requirement where the spec defers to them.

## Brief

Report:
(a) **requirements the spec asked for that are missing or partial** — walk
    the 22 stories and every Implementation Decision; for each, verify
    evidence in the diff (route, module, test). Include the ticket-10
    addition (import: both parsers, soft verify, rate-limit message, UI).
(b) **behaviour in the diff that wasn't asked for** (scope creep) — e.g.
    formats/options shipped beyond the spec, extra routes, extra knobs.
(c) **requirements that look implemented but where the implementation looks
    wrong** — mismatches vs the spec's decision lines or the research
    sources' exact format shapes (link encoding, ZIP structure, AWG line
    formats, cache headers, 404-vs-401, 503 semantics, fallback endpoint
    policy).

Quote the spec line (and, for (c), the code) for each finding. Under 400
words. If something is genuinely under-specified in the spec, note it as
"spec gap" rather than a code failure.

## Deliver

Write `.scratch/router/results/review-spec.md`: scope recap (diff stat +
commit count), findings grouped (a)/(b)/(c), each with spec quote, file,
and severity (missing / partial / creep / wrong). Under 400 words for the
findings. Then reply exactly DONE.