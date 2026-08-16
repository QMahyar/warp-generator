# WARP account and endpoints live in KV

**Amended 2026-08-16 — single `state` snapshot in the renamed `STATE` binding
(multi-account feature). The original decision below is kept verbatim; the
amendment notes are at the bottom of this file.**

Two pieces of mutable state, both stored in a KV binding, both written only by
panel actions: the WARP account (Register/Rotate) and the endpoint list (the
editor's Save). Not env secrets (rotation would mean redeploying), not memory
(a redeploy would wipe the account and break every subscriber). On an empty
endpoint list the subscriptions fall back to two known-good endpoints so a
fresh deploy's links still work.

Status: accepted.

---

## Amendment notes (2026-08-16)

Storage layout changed: the single `account` KV key is retired. All account
records, subscriptions and a monotonically bumping `revision` live in **one**
snapshot under the key `state` (`STATE_KV_KEY`, `worker/state.js`), in the KV
binding renamed `ACCOUNT` → `STATE` (wrangler.jsonc). The `ENDPOINTS` key and
the `AWG` key/binding are unchanged. All reads/writes flow through
`worker/state.js` (`readState` / `writeState` / `mutateState`); KV has no CAS,
so concurrent writers are serialized by the panel's in-flight disable plus a
per-isolate write queue, and the snapshot `revision` acts as an advisory
conflict detector only. The "not env secrets, not memory" reasoning is
unchanged: accounts and endpoints stay operator-editable without redeploying,
and a redeploy does not wipe state. The two known-good fallback endpoints on
an empty list are unchanged.