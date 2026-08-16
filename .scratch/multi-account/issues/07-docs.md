# 07 — Docs: ADR amendments + CONTEXT glossary + deploy docs

**What to build:** Record the decisions: ADR 0002 (single shared account →
multiple accounts), ADR 0005 (account key → state snapshot), ADR 0006
(subscription = named token-addressed entity with pinned account; cache
5 min). CONTEXT.md glossary updated (Account gains id/label; Subscription is
now an entity; Rotate is per-account). Deploy docs and README updated for the
SUB_PATH removal and STATE binding.

**Blocked by:** 01, 02, 03, 04 — the decisions land with the code

**Status:** done

- [x] ADR amendments written and consistent with the code
- [x] CONTEXT.md glossary matches the shipped behavior
- [x] README + deploy docs reflect the new secrets/bindings surface

**Implemented (2026-08-16):** ADR 0002/0005/0006 amended in place (top
amendment marker + bottom notes; original text kept verbatim) — 0002: single
shared account → multiple labeled slots; 0005: `account` KV key retired, KV
binding renamed `ACCOUNT` → `STATE`, one `state` snapshot (accounts + subs +
revision), endpoints/AWG unchanged; 0006: subscriptions are named,
token-addressed entities with pinned accounts, tokens SHA-256-hashed at rest,
404-not-401 posture preserved, edge cache 5 min + explicit no-store on
non-200, `SUB_PATH` retired with no legacy fallback. CONTEXT.md glossary
updated (State snapshot, WARP account as per-slot identity, Subscription as
entity with token + pinned account, per-account Rotate, Subscription token,
Registration spacing/hardening, Panel/Generator wording). Verified
deploy docs / README / deploy script: no leftover `SUB_PATH` or 6-h/21600
references beyond the intentional retirement note in docs/ops/deploy.md.