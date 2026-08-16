# WARP Generator (warp-generator)

A password-gated WARP subscription panel deployed to Cloudflare Workers:
multiple registered WARP accounts (a `state` snapshot), each rendered as a
config per endpoint and served to sub clients in client-specific formats
through per-subscription tokens. Also carries the original single-config
generator as a secondary page.

## Language

**State snapshot**:
The single KV value under the `state` key (binding `STATE`): the stored
accounts, the subscriptions and a bumping `revision`. All panel mutations
flow through it.
_Avoid_: store, database

**WARP account**:
The registered identity obtained from `api.cloudflareclient.com` (keypair,
client id, token, interface/peer material). Stored as a per-slot entry in the
state snapshot with its own `id` and an editable `label`; a deployment can
hold several, and each subscription pins exactly one.
_Avoid_: profile, registration, user

**Registration**:
The act of calling Cloudflare's `/reg` API to obtain a WARP account. Happens
in the panel (Register or Rotate) for one account slot at a time, never per
request; calls are spaced (min ~8 s) and hardened (`CF-Client-Version`
header, `v0a1922` endpoint version).
_Avoid_: signup

**Rotate**:
Replacing one account slot's stored record with a freshly registered one,
because the old one was flagged or expired. Per-account: `id` and `label`
survive, so pinned subscription URLs are unaffected — only their content
changes.
_Avoid_: renew

**Endpoint**:
A `host:port` WARP server address, entered by the panel operator. Each
endpoint becomes exactly one config inside a subscription.
_Avoid_: server, node, IP

**Subscription**:
A named entity (editable name) with its own unguessable token and a pinned
account. Its URL returns a list of configs — one per endpoint — in a sub
format; wrong tokens 404. Tokens are SHA-256-hashed at rest and shown in
full exactly once, at create/reset.
_Avoid_: sub link, feed

**Subscription token**:
The per-subscription path credential: 32 random bytes → 43-char base64url,
stored only as its SHA-256 hash (`tokenHash`). The path IS the credential —
no session.
_Avoid_: secret, SUB_PATH

**Sub format**:
The payload shape a subscription serves for a client family (e.g. `wg://`
base64 list, Clash YAML proxy list). One sub format per client family.
_Avoid_: protocol, config type

**Panel**:
The password-gated UI served by the worker: accounts card (label,
Register/Rotate/Import/Delete per slot), subscriptions card (create, name,
re-pin, reset token, delete), endpoint editor, and the generator page.
_Avoid_: dashboard, admin

**Generator**:
The original single-config feature: pick a stored account and a format, get
one config (+QR). Secondary to subscriptions.
_Avoid_: quick generate