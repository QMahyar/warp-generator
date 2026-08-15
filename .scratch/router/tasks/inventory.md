# Task: pivot inventory — map existing code for the panel rebuild

We are pivoting this repo (see CONTEXT.md, docs/adr/0001-warp-subscription-panel.md,
docs/adr/0004-lean-built-in-panel-ui.md, docs/research/bpb-panel.md) to a
Cloudflare Worker panel: password gate, one WARP account in KV, endpoint
editor, per-format subscription endpoints, plus a generator page. The worker
bundle (worker/api-handler.js) becomes the whole app. No code changes — read
and produce a precise inventory.

## Read and map

1. **worker/api-handler.js** — full route map: which URL paths it handles,
   what each returns, which npm libs it imports (tweetnacl, qrcode, buffer…),
   what state it keeps, how errors are shaped.
2. **functions/api/generate.js** — same; note parity differences with the
   worker handler.
3. **lib/builders/**, lib/quic.ts, lib/qr-generator.ts, lib/crypto.ts,
   lib/cloudflare-client.ts, lib/warp-service.ts, lib/ip-ranges.ts,
   config/* (formats, dns, endpoints, services*, services-loader) — for each:
   exported functions worth reusing in the panel (name + one-line signature),
   and warn on anything NOT worker-safe (imports like 'server-only', node fs,
   etc.).
4. **app/ + components/ + hooks/** — the UI surface: which pages/components
   exist, which are dead (e.g. formats tab), the generator page flow
   (use-generator.ts state), what would port to a lean static panel UI and
   what would not.
5. **Subscription-building blocks** — where in the worker the "one config per
   request" flow would need splitting: registration (network call) vs config
   rendering (pure), and where wg:// line building, reserved/MTU handling and
   DNS lines live.

## Deliverable

Write `docs/plans/pivot-inventory.md` (create the dir): sections — Routes
today / Reusable engine / UI surface / Dead code / Subscription-building
blocks / Risks & parity notes. Cite file paths. Under 250 lines. Reply with
exactly DONE when written.