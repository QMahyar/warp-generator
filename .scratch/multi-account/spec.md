# Spec: Multi-account + multi-subscription panel

**Status:** done
**Shipped:** 2026-08-16
**Tracker:** local — `.scratch/multi-account/`
**Companion docs:** CONTEXT.md (glossary), docs/adr/0001–0007,
docs/research/multi-account-subs.md, docs/research/source-updates.md,
docs/research/targets-audit.md, docs/research/amneziawg-updates.md,
docs/research/warp-plus-fragmentation.md, docs/research/backend-ui-audit.md

## Problem Statement

The panel holds exactly ONE WARP account and serves exactly ONE subscription
URL (the `SUB_PATH` secret). When that account is flagged or expired, every
subscription link breaks until the operator performs a global rotation — and
rotation today is all-or-nothing. There is no way to serve separate consumers
separate accounts, no way to fail over one subscription without touching
everyone, and no way to keep spare accounts warm.

## Solution

The panel stores multiple WARP accounts (register / import / rotate / delete
per account, editable label) and multiple subscriptions. Each subscription has
its own unguessable path token, an editable name, and a pinned account that can
be re-pinned at any time; a re-pin takes effect within the edge-cache window.
The generator page gains an account picker. Storage moves from the single
`account` KV key to one `state` snapshot (accounts + subs + revision); tokens
are SHA-256-hashed at rest and shown in full exactly once, at creation.

## User Stories

1. As a panel operator, I want to register more than one WARP account, so that a flagged account does not take down every subscription.
2. As a panel operator, I want each account to have an editable label, so that I can tell them apart at a glance.
3. As a panel operator, I want to rotate a single account, so that a flagged account is replaced without touching the other accounts.
4. As a panel operator, I want to import a WARP account (conf or registration JSON) into a specific account slot, so that I can add residential-IP registrations without waiting out rate limits.
5. As a panel operator, I want to delete an account, so that I can remove spares; deleting one that is pinned leaves the pinned subscription returning 503 until re-pinned (accepted trade-off, confirmed).
6. As a panel operator, I want to create a subscription with its own token and name, so that I can hand different consumers different URLs backed by different accounts.
7. As a panel operator, I want to re-pin a subscription to another account anytime, so that failover does not require recreating the link.
8. As a panel operator, I want to see the full subscription links at creation time with a "copy now" warning, so that I can distribute them while the token is still visible (tokens are hashed at rest).
9. As a panel operator, I want a per-subscription token reset, so that a leaked link can be retired without deleting the subscription.
10. As a panel operator, I want to rename and delete subscriptions, so that the list stays organized.
11. As a subscriber, I want my subscription URL to keep working across account rotations and re-pins (within ~5 min), so that I never re-paste links.
12. As a subscriber, I want my subscription URL to return 404 when the token is wrong, so that probing cannot distinguish real from fake paths.
13. As a generator user, I want an account picker on the generator page, so that I can build a single config from any stored account.
14. As a v2rayN-family user, I want `wireguard://` links to carry `reserved=`, so that handshakes succeed (WARP reserved derives from the client id — today the field is missing).
15. As a Clash user, I want the generated YAML to carry the canonical H3/H4 header values and `ipv6:` when IPv6 is on, so that my proxies match the other formats.
16. As a panel operator, I want registration calls hardened (CF-Client-Version header, current endpoint version, spacing between calls), so that rate-limit failures are rarer.
17. As a panel operator, I want the six subscription routes to stay cheap (snapshot read + endpoints [+ AWG]), so that repeated client refreshes never strain the worker.

## Implementation Decisions

- **Seam — one new module**: `worker/state.js` owning the whole feature:
  `readState / writeState / mutateState / hashToken / lookupSubByToken /
  accountById / publicAccounts / publicSubs`. All accounts/subs mutations and
  reads flow through it; everything else (registerAccount, import parsers,
  renderers, generator seam, auth) stays untouched behind it.
- **KV schema** — single snapshot key `state` in the `ACCOUNT` binding
  (binding renamed to `STATE` in wrangler config; endpoints/AWG bindings
  unchanged). Schema (from the backend audit):

```json
{
  "schema": 1,
  "revision": 42,
  "accounts": [
    {
      "id": "a1",
      "label": "Home",
      "privateKey": "…", "peerPublicKey": "…",
      "clientId": null, "token": null,
      "v4": "172.16.0.2", "v6": "…", "reserved": "…",
      "source": "register" | "import",
      "verified": false, "verifiedAt": null,
      "registeredAt": "2026-08-15T…"
    }
  ],
  "subs": [
    {
      "id": "s1",
      "name": "Family",
      "tokenHash": "<sha256 base64url of the token>",
      "accountId": "a1",
      "createdAt": "2026-08-15T…"
    }
  ]
}
```

  - Account entries reuse the existing record fields verbatim (existing
    validator stays the per-entry validator) plus `id` + `label`.
  - `revision` bumps on every write; advisory conflict detector only (KV has
    no CAS — mutations are serialized by the UI's in-flight disable and a
    per-isolate write queue; no Durable Object).
  - Rotation keeps `id` + `label` and replaces the record body (links stay
    stable across rotations). Delete removes the entry and leaves subs'
    `accountId` dangling → sub routes 503 with the existing readable message.
  - Import replaces that account only (never the whole store).
- **Tokens**: 32 random bytes → 43-char base64url, stored ONLY as
  SHA-256 → base64url. The raw token exists in exactly two places: the create
  response and the operator's clipboard. Sub rows show a hash-prefix
  fingerprint. `reset-token` regenerates the token (old links 404 after the
  cache window).
- **Sub route matching**: `sha256(submitted)` → compare against
  `subs[].tokenHash` with the existing constant-time compare; no match → 404
  (never 401 — ADR 0006 posture preserved). Sub found but pinned account
  missing → 503 `missingAccount()`.
- **Cache**: all six sub routes move from 6 h to `public, max-age=300,
  s-maxage=300` (5 min — re-pin lag bound; `s-maxage` also disables
  stale-while-revalidate per RFC 9111, giving block-on-revalidate freshness).
  Every non-200 sub-route response (404/503/405) gets an explicit
  `Cache-Control: no-store` (Workers heuristically caches uncached responses:
  ~2 h for 200s, ~3 min for 404s).
- **API surface** (accounts/subs routes behind the auth gate; the six
  `/api/<token>/sub*` routes stay pre-gate):
  - `GET /api/accounts` → public accounts (never keys)
  - `POST /api/accounts/register` (body `{ label? }`) → appends
  - `POST /api/accounts/:id/rotate` → replaces that record, keeps id/label
  - `POST /api/accounts/:id/import` (body `{ text }`) → replaces that account
    only; parse errors → 400, contract unchanged
  - `POST /api/accounts/:id/rename` (body `{ label }`)
  - `POST /api/accounts/:id/delete` → removes; pinned subs then 503
  - `GET /api/subs` → subs with tokenHashPrefix, never the token
  - `POST /api/subs` (body `{ name }`) → creates; response carries
    `{ id, name, token, links }` — full links returned exactly once
  - `POST /api/subs/:id/rename` (body `{ name }`)
  - `POST /api/subs/:id/pin` (body `{ accountId }`) — re-pin anytime; null
    unpins → 503
  - `POST /api/subs/:id/reset-token` → new token returned once
  - `POST /api/subs/:id/delete`
  - `POST /api/generator` body gains optional `accountId` (default: first
    account; none → existing 503 message)
- **Registration hardening**: `lib/cloudflare-client.ts` sends
  `CF-Client-Version: a-6.38.6-5101`-era headers — concretely: add the
  `CF-Client-Version` header and use the wgcf-proven `v0a1922` endpoint
  version (live-probed alive; minimal-header requests observed dropping).
  Panel register actions are spaced sequentially (min ~8 s between /reg
  calls) — enforced by the UI's in-flight disable plus a worker-side
  last-registration timestamp guard.
- **SUB_PATH retirement**: the env secret, its route gates, the wrangler
  config entry, deploy-script stage, and README references are removed; the
  panel's subscription card is fed by `/api/subs`. No migration, no legacy
  `account`-key fallback (confirmed).
- **Targets drift fixes** (folded in):
  - `wireguard://` links gain `reserved=` (WARP reserved derives from
    client_id; v2rayN-family clients now parse it — missing = rejected
    handshake).
  - Clash builder: swap H3/H4 to canonical (H3 = underload = 3,
    H4 = transport = 4) and emit `ipv6:` when IPv6 is included.
  - Generator/worker divergence: converge the generator's hardcoded
    template values with the worker's renderers (documented per-format
    deltas; generator keeps its legacy parity where intentional).
- **WARP+ / fragmentation / AWG**: no new surface. Configs are plan-agnostic
  (WARP+ changes nothing in config content); fragmentation for WG clients is
  not expressible in NekoRay/Clash; AWG junk params stay as-is with the
  operator's explicit toggle. Panel Jmin/Jmax bounds stay (1–4096) — the
  Amnezia docs' 64–1024 is a recommendation, not a constraint.

## Testing Decisions

- **What makes a good test**: only external behavior through the seams —
  `state.js` functions against a fake KV binding (same pattern as
  account.test.js today), route behavior through `index.js` handlers with
  stubbed fetch, renderer outputs byte-exact per format. No HTTP, no real
  Cloudflare traffic, no network in tests.
- **Modules tested**: new `worker/state.test.js` (snapshot read/write/
  mutate, token hash + lookup incl. constant-time posture, public views),
  extended `worker/sub.test.js` (token-matched rendering, dangling pin →
  SubscriptionError, cache headers), `worker/panel.test.js` (shell renders
  with/without accounts/subs), `worker/account.test.js` (per-account
  register/rotate semantics), `worker/import.test.js` (import targets one
  account), and the builder-level tests for the drift fixes
  (reserved= present, H3/H4 canonical, ipv6: emitted).
- **Prior art**: worker/*.test.js under `node --test`, zero npm
  dependencies, canned fixtures, stubbed global fetch and fake KV
  (account.test.js, sub.test.js, import.test.js).

## Out of Scope

- WARP+ license attach / quota / usage display (plan is server-side; configs
  unchanged — research verdict).
- Fragmentation features (not expressible for WG in target clients).
- Auto-failover / health checks / account monitoring.
- Fleet management (search, pagination, bulk ops, hundreds of accounts).
- Multi-user provisioning / per-consumer quotas.
- Cache purge / ETag-304 revalidation machinery.
- Legacy migration (SUB_PATH → subs, `account` key → snapshot).
- Browser-side registration (CORS-verified impossible).
- Login rate limiting / Turnstile (pre-existing gap, unchanged).

## Further Notes

- ADR 0002 (single shared account), ADR 0005 (account in KV), and ADR 0006
  (subscriptions = unguessable path) need amendments recording this change;
  CONTEXT.md glossary updated: **Account** is now a per-slot identity with
  id/label; **Subscription** is a named, token-addressed entity with a
  pinned account; **Rotate** is per-account.
- The Next.js app (unmaintained, ADR 0004) still POSTs to `/api/generate` —
  untouched; the worker's `/api/generator` route is the maintained surface.
- Deploy docs (docs/ops/deploy.md, scripts/deploy-warp-panel.sh) updated:
  no SUB_PATH secret, no ACCOUNT binding name change surprises (binding
  rename to STATE is a wrangler.jsonc + .dev.vars edit only).