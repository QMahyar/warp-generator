# WARP Generator (warp-generator)

A password-gated WARP subscription panel deployed to Cloudflare Workers: one
registered WARP account, rendered as a config per endpoint, served to sub
clients in client-specific formats. Also carries the original single-config
generator as a secondary page.

## Language

**WARP account**:
The registered identity obtained from `api.cloudflareclient.com` (keypair,
client id, token, interface/peer material). One per deployment, shared by all
subscription configs.
_Avoid_: profile, registration, user

**Registration**:
The act of calling Cloudflare's `/reg` API to obtain a WARP account. Happens
in the panel (Register), never per request.
_Avoid_: signup

**Rotate**:
Replacing the stored WARP account with a freshly registered one, because the
old one was flagged or expired. Subscription URLs are unaffected; their
content changes.
_Avoid_: renew

**Endpoint**:
A `host:port` WARP server address, entered by the panel operator. Each
endpoint becomes exactly one config inside a subscription.
_Avoid_: server, node, IP

**Subscription**:
A URL that returns a list of configs — one per endpoint — in a sub format.
The URL is stable and unguessable and carries no credentials beyond the path
token itself.
_Avoid_: sub link, feed

**Sub format**:
The payload shape a subscription serves for a client family (e.g. `wg://`
base64 list, Clash YAML proxy list). One sub format per client family.
_Avoid_: protocol, config type

**Panel**:
The password-gated UI served by the worker: account card, endpoint editor,
subscription links, and the generator page.
_Avoid_: dashboard, admin

**Generator**:
The original single-config feature: pick a format, get one config (+QR).
Secondary to subscriptions.
_Avoid_: quick generate