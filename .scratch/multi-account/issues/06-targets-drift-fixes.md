# 06 — Targets drift fixes (reserved=, clash H3/H4 + ipv6, convergence)

**What to build:** Fix client-format drift found by the targets audit:
`wireguard://` links carry `reserved=` (WARP reserved derives from the
client id; v2rayN-family clients parse it — missing means rejected
handshake); the Clash builder emits canonical H3/H4 (H3 = underload = 3,
H4 = transport = 4) and `ipv6:` when IPv6 is included; the generator's
hardcoded template values converge with the worker's renderers (legacy
parity kept where intentional, documented).

**Blocked by:** None — can start immediately

**Status:** done

- [x] Every wireguard:// link carries a valid reserved= value
- [x] Clash YAML matches canonical H3/H4 and carries ipv6: when enabled
- [x] Generator output matches worker output for the same inputs (documented exceptions)
- [x] All renderer tests updated and green

## Implemented (2026-08-16)

- `worker/sub.js` `buildWireguardLink` now emits `&reserved=<b64>` on every
  `wireguard://` link — the record's base64 when set, else the [0,0,0] → "AAAA"
  convention, re-encoded through `reservedToBytes` so the value is always valid
  base64 (v2rayN parses it; WARP rejects the handshake without it).
- `worker/sub.js` `renderClash` was already canonical (stored-record H3=3/H4=4 +
  `ipv6:` at line 247) — the drift was generator-only.
- `worker/generate.js` `buildClash` fixed to canonical H3=underload=3 /
  H4=transport=4 and emits `ipv6:` when IPv6 is on and the record has v6.
- Generator/worker convergence: only the clash h3/h4 swap + missing `ipv6:`
  were undocumented drifts (fixed). Kept as documented intentional parity:
  `allowed-ips: ['0.0.0.0/0']`, the hardcoded WARP `amnezia-wg-option`
  template (seam has no AWG record — equals worker's DEFAULT_AWG output), the
  wireguard .conf bare-address form (worker /sub/wg uses CIDR; both valid),
  throne v4/32-v6/128. Audit's "no drift" verdicts (wireguard .conf, throne
  junk params) confirmed.
- Tests: `worker/sub.test.js` golden link + parse helper + new
  "reserved always present/valid" test; `worker/generate.test.js` clash
  assertions + new ipv6-gating test. `npm test` 258 pass / 0 fail;
  `npm run lint` clean. Note: `lib/builders/clash.ts` and
  `functions/api/generate.js` still carry the old h4:3/h3:4 + missing ipv6
  (outside this ticket's file scope — follow-up needed).