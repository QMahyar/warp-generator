# Review — SPEC axis (whole implementation)

## Scope

Diff `6495a67...HEAD`: **41 files, +8169/−148** (worker: index, panel, sub,
account, auth, settings, import, generate, zip, 10 test files; wrangler.jsonc).
**21 commits** = 10 ticket commits (01–10) + 10 "tracker" marks + 1 spec-ticket-10
update. All 218 `node:test` tests pass (ran via `node --test worker/*.test.js`).

## (a) Missing / partial

1. **`npm test` runner missing — partial.** Spec (Testing): "New runner:
   `node:test` via `npm test`". `package.json` is **unchanged** in the diff and
   has no `test` script; `npm test` → "Missing script: test". Files exist and
   pass headless, but the promised entry point doesn't. File: package.json.
2. **No Subscriptions card — partial (spec gap).** Spec (Solution): "the worker
   renders those into six per-client subscription URLs". panel.js nav shows a
   "Subscriptions" tab, but `<main>` has only Account/Endpoints/AWG/Generator
   cards — no URL listing (operator must assemble URLs from the SUB_PATH they
   set themselves). The spec never explicitly demands the panel list them.
3. **JSON import needs hand-editing — spec gap.** Ticket 10: "paste … a
   registration JSON (warp-reg style: full record incl. client id, token,
   reserved)". `parseRegistrationJson` additionally **requires**
   `interface.private_key`, which raw warp-reg exports lack (import.js header
   admits this; error message instructs pasting it in). Conf import is the
   frictionless path; both parsers, auto-detect, soft verify (2xx-only),
   unverified confs, `[0,0,0]` reserved, Endpoint ignored, 429 message pointing
   at Import (account.js:70), confirm-before-replace all present and correct.

## (b) Creep

1. AWG card "Pick" button + automatic random-I1 prefill on toggle-on
   (panel.js `setAwgEnabled(…, true)`) — beyond the spec'd "toggle + params"
   decision, though consistent with "defaults from the existing I1 mask pool".
   Minor. No extra routes/formats/knobs elsewhere (`?legacy=1`, `?scheme=`,
   legacy 7-format generator, cache/404/503 contracts all spec'd).

## (c) Implemented but wrong

1. **AWG toggle ignored by `/sub/awg` when off — wrong (low) / spec gap.**
   Story 16: "I want a toggle … so that I control which formats carry
   obfuscation"; decision: AWG "honored by clash, wg-zip and awg renderers".
   But sub.js `renderAwg`/`buildAwgLink`: "The conf ALWAYS carries AWG params
   here: the stored record when enabled, else the legacy defaults" — toggle
   off still ships obfuscated confs (hardcoded Jc 4/Jmin 40/Jmax 70/H1–H4),
   while clash/wg-zip correctly go plain. Defensible (awg:// is AWG-only), but
   the off-state contradicts the toggle contract; spec never defines it.
2. **Everything else checks out**: `wireguard://` matches §2.1 (private key in
   userinfo, encoded `publickey/address/mtu`, `#<endpoint>` fragment — golden
   test sub.test.js:60); `wg://` byte-parity with legacy buildThrone
   (api-handler@6495a67, incl. `#WARP`); clash §2.4 shape + `amnezia-wg-option`
   mapping; singbox 1.13 endpoint/legacy outbound shapes; neko CustomBean;
   storeless zip layout (CRC-32, fixed dates); `s-maxage=21600`; 404-not-401 on
   token; 503 on missing account; `162.159.192.1:2408` + `engage…:2408`
   fallback; 7-day HMAC sessions, constant-time login, KV written only by
   panel actions.

## Verdict

Spec 22/22 stories and every Implementation Decision are implemented except the
`npm test` entry point (partial) and the unlisted-URL nicety; one real toggle
semantics mismatch in `/sub/awg`; three items are genuine spec gaps.