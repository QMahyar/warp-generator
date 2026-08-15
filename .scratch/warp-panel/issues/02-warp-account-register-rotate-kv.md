# 02 — WARP account Register/Rotate (KV)

**What to build:** The panel gains an account card: status (none / registered
since), a Register action that registers a WARP account with Cloudflare and
stores it in the `ACCOUNT` KV binding, and a Rotate action that replaces it.
Registration preserves the okhttp UA and timeout. The card reflects the KV
state on load and after each action; failures return readable errors.

**Blocked by:** 01 — Password gate + panel shell

**Status:** done — committed (`6280e80`), worker wg-ticket-02

- [x] Register → account appears in KV and in the card; reload keeps it
- [x] Rotate → new account replaces the old; registration timestamp updates
- [x] Registration failure (rate-limit etc.) surfaces a readable error; KV unchanged
- [x] No registration happens outside the Register/Rotate actions
- [x] verification: fetch-level smoke with stubbed fetch + fake KV (wrangler unavailable)