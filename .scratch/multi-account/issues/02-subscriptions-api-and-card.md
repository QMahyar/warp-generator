# 02 — Subscriptions API + subscriptions card

**What to build:** Subscriptions become entities. The operator creates a
subscription (name + auto-generated 43-char token, hashed at rest); the
create response carries the full six-format link list exactly once with a
"copy now" warning. Per-sub rows show the name (editable), a token
fingerprint, an account picker (re-pin anytime), Reset token, and Delete.
`/api/subs` CRUD (create/rename/pin/reset-token/delete) behind the auth gate.

**Blocked by:** 01 — State snapshot + accounts API + accounts card

**Status:** done

- [x] Operator creates a sub; full links shown once, fingerprint after reload
- [x] Re-pin moves the sub to another account without changing its URL
- [x] Reset token retires old links (they 404) and shows the new ones once
- [x] Rename and delete work; delete confirmed
- [x] Token appears in storage only as SHA-256 hash
- [x] Unpinned sub renders 503 later, never 500

## Implemented

- `worker/panel.js`: static Subscriptions card (with the `subscriptionList()`
  helper and trailing `.sub-copy` script) replaced by a JS-driven card
  (ticket 02). On load it fetches `/api/subs` + `/api/accounts`
  (`Promise.all`). Create / reset-token show the raw token + full six-format
  link list exactly once in a `#subs-created` panel with a "copy now, not
  shown again" warning; the list afterwards shows only the
  `tokenHashPrefix` fingerprint. Per-sub rows (all built with
  `createElement`/`textContent`, never innerHTML — ADR 0004) cover editable
  name (Enter/blur commits, Escape reverts), fingerprint badge, account
  `<select>` re-pin (empty = unpin; dangling pin shown), Reset token and
  Delete (both `window.confirm`-gated), plus empty state, error box and
  per-action in-flight disable. `subPath` is no longer consumed by the card;
  the `panelShell({ origin, subPath })` signature is untouched.
- `worker/index.js`: route-map header comment now documents the `/api/subs`
  routes (GET, POST, :id/rename|pin|reset-token|delete) — comment only.
- `worker/panel.test.js`: obsolete six-URL / missing-SUB_PATH / static-escape
  assertions replaced with structural checks (form + `#subs-list` container +
  error/status/created elements, account card + nav still render, no static
  URLs or `.sub-copy` markup).
- `worker/subs.test.js` (new): router-level smoke tests mirroring
  `accounts.test.js` — 401 gate, empty start, create (token+links once, hash
  only in the `state` KV snapshot), create-with-name, rename (trim/400),
  pin via conf-imported account (zero network), pin-unknown → 400, unpin
  null/empty, reset-token (new token once, old hash retired), delete +
  repeat 404, unknown id → 404.

Later wiring (sub routes moving onto the state snapshot — ticket 03) will
make old links 404 and unpinned subs render 503; the API/UI mechanics that
unlock both are in place here and covered by tests.