# WARP subscription & generator targets — currency audit

Date: 2026-08-15. Read-only audit; no code was changed.

Scope: every format emitted by the worker (`worker/sub.js` — `sub` / `clash` / `singbox` / `neko` / `wg` / `awg`) and the generator page (`lib/builders/*.ts` — wireguard, throne, clash, nekoray, husi, karing, wiresock), checked against current (2025–2026) client documentation, plus the multi-account subscription grain and the "new client families" question.

Method: primary-source docs, GitHub sources and open issues fetched 2026-08-15; all `file:line` references are to repo HEAD. Prior research consulted: `docs/research/sub-formats.md`, `docs/research/bpb-panel.md`, `docs/research/multi-account-subs.md`.

Correction to planning context: `plans/004-cross-target-parity.md` is about **deployment**-target parity (DNS drift, fetch timeouts, QR privacy across Vercel/Netlify/Docker/Workers), not client-format parity. This audit is the client-format counterpart.

## Verdict per target

| Target / format | Emitter | Verdict |
|---|---|---|
| sing-box ≥1.13 endpoint | `worker/sub.js` `renderSingbox` | Current ✓ |
| sing-box ≤1.13 legacy outbound | `worker/sub.js` `?legacy=1`; generator nekoray/husi | Era-correct ✓ (outbound removed upstream in 1.13) |
| v2rayN `wireguard://` | `worker/sub.js` `buildWireguardLink` | Drift: `reserved` param missing |
| `wg://` (Throne) | `worker/sub.js` `buildThroneLink`; generator throne.ts | Param names match AmneziaWG uapi; scheme provenance unverified |
| Clash / Mihomo | `worker/sub.js` `renderClash` ✓; generator `clash.ts` | Drift (generator only): h3/h4 swapped, no `ipv6` |
| Karing | generator `karing.ts` | `fake_packets*` fields unverifiable from public source |
| Husi | generator `husi.ts` | Client archived; shape OK for what Husi parses |
| WireSock | generator `wiresock.ts` | OK for WARP; S3/S4 absent (strict AWG needs all 8) |
| `awg://` | `worker/sub.js` `renderAwg` | Current ✓ (LxBox + INCY confirm) |
| NekoRay / NekoBox | `worker/sub.js` `renderNeko`; generator nekoray.ts | NekoRay archived; bean format still consumed by NekoBox forks |
| Outline | — | Not a target (Shadowsocks only) |

## 1. sing-box — endpoint shape current, legacy shape era-coded

- Endpoint shape (`worker/sub.js:322-339`): `type/tag/mtu/address/private_key/peers[{address,port,public_key,allowed_ips,reserved}]` matches the current docs (sing-box.sagernet.org/configuration/endpoint/wireguard/): "Since sing-box 1.11.0"; only changes since are the optional 1.14 UDP NAT fields (`udp_mapping`/`udp_filtering`/`udp_nat_max`, changelog 1.14.0-alpha.46) — absent here, fine (optional, defaults apply).
- Changelog (sing-box.sagernet.org/changelog/) fetched 2026-08-15 tops out at 1.14.0-beta.15 / 1.13.18 — no wireguard field additions or removals after the UDP NAT fields; no 1.15/1.16 entries.
- Legacy outbound shape (`worker/sub.js:349-361`) — pre-1.13 `server/server_port/local_address/private_key/peer_public_key/reserved/mtu` — is the era-correct form for NekoBox Android and Husi, both pinned to pre-1.13 cores; upstream removed the outbound in 1.13, so the shape must not be used for SFA/SFI (it isn't — gated behind `?legacy=1`).
- DNS is era-coded correctly: typed `type: "udp"` for 1.13+ vs legacy `address` form for the legacy payload (`worker/sub.js:396-398`); the legacy DNS server format was removed in 1.14 (deprecated page).

## 2. v2rayN `wireguard://` — drift: missing `reserved`

- `worker/sub.js:128-137` emits `wireguard://<pk>@<authority>/?publickey=…&address=…&mtu=1280#<endpoint>` — no `reserved` query param.
- v2rayN `WireguardFmt.cs` (master) now **parses** `reserved` (alongside publickey/presharedkey/address/mtu) and `ToUri` emits it when set. WARP's 3-byte `reserved` is the Cloudflare client_id returned at registration; with `[0,0,0]` the handshake is rejected by Cloudflare, so v2rayN users of this sub must patch `reserved` in manually.
- Actionable: add `&reserved=<base64>` to `buildWireguardLink`. Reference implementation parity was documented in `sub-formats.md` §2.1 before v2rayN added the param — the doc should be rechecked.

## 3. `wg://` (Throne) and the nekoray family

- `worker/sub.js:157-172` / `lib/builders/throne.ts:10` emit `wg://` with `private_key/peer_public_key/pre_shared_key/reserved/persistent_keepalive/mtu/use_system_interface/local_address/workers/enable_amnezia/junk_packet_*/magic_header_*` — the param names match the AmneziaWG user-api names (uapi), and the magic-header mapping (init=1, response=2, underload=3, transport=4) matches the canonical WARP template (see §4).
- **Throne** (github.com/throneproj/Throne, "Formerly Nekoray") is the active successor of NekoRay — Qt desktop, sing-box powered, supports Wireguard + AmneziaWG. But its deep links are `throne://`, **not** `wg://`; which client actually consumes `wg://` with these junk-packet params remains unverified (see Open questions).
- **NekoRay** (MatsuriDayo) is archived (dev abandoned Dec 2023; repo read-only). `config/formats.ts:26-31` still lists it as a generator format; `worker/sub.js:496-509` wraps the legacy outbound in the `nekoray://custom#` bean — the bean format is still the import format of NekoBox desktop/Android forks, so it is not dead, but the "NekoRay" label is historical.
- NekoBox Android docs (matsuridayo.github.io/nb4a-configuration): Wireguard `reserved` is a base64 string; it parses sing-box / V2rayN / Clash formats.

## 4. Clash / Mihomo

- Current mihomo proxy docs (wiki.metacubex.one/en/config/proxies/wg/, dated 2026-05-14): `type: wireguard` proxy with `amnezia-wg-option` block: `jc/jmin/jmax`, `s1-s4`, `h1-h4` (int or v2 range string like `"123456-123500"`), `i1-i5`; an `ipv6` field exists; `allowed-ips` optional; `dialer-proxy` added.
- Canonical magic-header mapping (Amnezia dev quote via celzero/rethink-app issue #1437): H1=init, H2=response, **H4=transport(data), H3=underload** — i.e. H3=3, H4=4.
- **Drift (generator page only): `lib/builders/clash.ts:36-37` emits `h4: 3` then `h3: 4` — swapped** vs the canonical mapping. `lib/builders/wireguard.ts:21-22`, `lib/builders/throne.ts:10`, `lib/builders/wiresock.ts:32-33` and the worker's `renderClash` (which uses stored record values, `worker/sub.js:209-225`) all emit H3=3/H4=4 correctly. Impact for WARP is nil (the WARP server is stock WireGuard and ignores header values; the headers matter only against an AmneziaWG server), but the value is wrong relative to the canonical template.
- **Drift (generator page only): `lib/builders/clash.ts:20` emits `ip:` but never `ipv6:` even when `includeIPv6` is on** (mihomo supports the `ipv6` field). The worker's `renderClash` does emit it (`worker/sub.js:247`). Two divergent code paths for the same format — divergence is itself the finding.

## 5. Karing — `fake_packets*` unverifiable

- `lib/builders/karing.ts:13-16` emits `fake_packets: '5-10'`, `fake_packets_size: '40-100'`, `fake_packets_delay: '20-250'`, `fake_packets_mode: 'm4'` in a sing-box wireguard **outbound** object (pre-1.13 shape).
- The feature is real: KaringX/karing issue #639 (2025-03-29) "Critical Bug: WireGuard fake_packets Parameters" confirms Karing's profile editor carries fake_packets params. But neither `KaringX/sing-box` main `option/wireguard.go` nor the `Nriver/karing-sing-box` `dev-next` docs (fetched; they show standard fields + `udp_timeout`) contains `fake_packets`. The exact field names/shape cannot be confirmed from public source today.
- Risk: worst case the fields are ignored (sing-box logs unknown-field warnings, does not reject), i.e. no obfuscation — not a hard break.

## 6. Husi — archived client, shape matches what it parses

- Repo archived on Codeberg (codeberg.org/xchacha20-poly1305/husi). Wiki documents `reserved` accepted as an int list **or comma-split string or base64** — which explains `lib/builders/husi.ts:22` emitting `reserved: "1, 2, 3"` (string from `lib/crypto.ts:34-35`) instead of the standard sing-box `[1,2,3]` array. Fine for Husi; non-standard for any other sing-box client (file is labeled Husi-only).

## 7. WireSock — OK for WARP; magic headers incomplete for strict AWG

- WireSock docs (wiresock.net/documentation/wiresock-secure-connect/connection-profiles.html): junk packets `Jc/Jmin/Jmax` (+ new `Jd` delay param, not emitted), magic headers `S1-S4/H1-H4` — **all 8 required for a valid Amnezia config**; protocol masking `Id`, `Ip` (QUIC|DNS), `Ib` (Chrome|Firefox|cURL).
- `lib/builders/wiresock.ts:25-33` emits S1/S2 only (no S3/S4) plus H1-H4; `:35-37` emits `Id = <domain>`, `Ip = quic`, `Ib = firefox` per the docs. For WARP the headers are cosmetic (server is stock WG); the conf would be rejected only by a strict AmneziaWG server.

## 8. `awg://` — confirmed current (LxBox + INCY)

- INCY docs (docs.incy.cc/en/subscription-format/): `awg://` is an alias of `amneziawg://`, body = base64url of the .conf, `#name` fragment; multiple AWG servers per sub body supported; AWG 3.0 conf params exist (HeaderProtectionKey, ContentPaddingAddition, RekeyAfterTime, …).
- LxBox (github.com/Leadaxe/LxBox README): imports `wireguard://`, `awg://`, INI/.conf and Amnezia `vpn://`; AWG 1.x/2.0 obfuscation with `jc/jmin/jmax, s1-s4, h1-h4 incl. N-M ranges, i1-i5`; core is the sing-box-lx fork (1.14 branch) — this is the main consumer of our `awg` renderer, and our shape (`worker/sub.js:648-652`: `awg://<base64url conf>#warp-<host>:<port>`) matches.
- LxBox's `wireguard://` support also confirms the v2rayN-family link shape is still a live import format beyond v2rayN itself.

## 9. Outline — not a target

- github.com/OutlineFoundation/outline-server: "runs a Shadowsocks instance … via outline-ss-server". Shadowsocks-only protocol stack; no WireGuard format exists in the Outline ecosystem, so no WARP subscription target there. No action.

## 10. Multi-account grain

- BPB (bia-pain-bache.github.io/BPB-Worker-Panel/usage/warp): one Warp + one WoW config per subscription, expanded per endpoint from the Endpoints setting; "Renew Warp Accounts" re-registers (single account per sub, not multi-account mixing). Same grain as ours: one stored account record served across all endpoints per format (`worker/sub.js` renderers all take `{ account, endpoints }`; generator page builds per-account config files via `lib/warp-service.ts`).
- INCY docs show multi-server (multi-account) bodies are legal for `awg://` subs — an optional future enhancement, not a drift.

## Drift / findings list (actionable, with file:line)

1. **`worker/sub.js:128-137`** — `buildWireguardLink` omits `reserved=`; v2rayN `WireguardFmt.cs` (master) now parses it. WARP requires the 3-byte client_id, so v2rayN users can't connect without manual patching. Highest-value fix.
2. **`lib/builders/clash.ts:36-37`** — `h4: 3` / `h3: 4` swapped vs canonical H3=underload=3, H4=transport=4 (all other emitters correct). Cosmetic for WARP; wrong for an AmneziaWG server.
3. **`lib/builders/clash.ts:20`** — no `ipv6:` when `includeIPv6` (worker `renderClash` emits it, `worker/sub.js:247`). Generator-page Clash loses v6 client addressing.
4. **Generator vs worker divergence for the same format** — `clash.ts` hardcodes the template's AWG values + h-swap; `worker/sub.js:209-225,239-263` uses the stored AWG record + correct headers + ipv6. The two code paths should converge (documented divergence risk).
5. **`lib/builders/karing.ts:13-16`** — `fake_packets*` field names unverifiable against public Karing source; treat as best-effort, revisit when Karing publishes fork docs.
6. **`lib/builders/husi.ts:22`** — `reserved` emitted as comma-string (Husi-accepted, non-standard sing-box). OK as long as the format stays Husi-labeled.
7. **`lib/builders/wiresock.ts:25-33`** — S3/S4 omitted (strict AWG needs all 8 magic-header params); fine for WARP. Optional: add `Jd` junk delay.
8. **`lib/builders/wireguard.ts:25`** — I1 CPS line emitted only for `deviceType === 'awg15'`; other profiles never carry CPS chains (consistent with `DEVICE_PROFILES`; flag as intended, verify).
9. **Archived-client labels** — `config/formats.ts:26-45` still presents NekoRay and Husi as first-class generator formats; NekoBox forks keep the bean format alive, Husi is archived. Consider relabeling or keeping as-is with a note.
10. **No drift** in: sing-box endpoint (current), sing-box legacy gating, `awg://` (confirmed by LxBox/INCY), DNS era-coding, neko bean, wireguard .conf + H3/H4 ordering, Throne junk params (parity values), BPB grain.

## Open questions

1. **Jmin/Jmax 40/70 vs 64-1024** — canonical WARP template ships 40/70; Amnezia docs state 64–1024 for AWG 2.0 junk sizes. The panel documents this widening (`worker/settings.js:22-24,51`). What is the primary source for 40/70, and does any current client reject it?
2. **`wg://` provenance** — Throne's deep links are `throne://`; which client(s) consume `wg://` with `junk_packet_*`/`magic_header_*` params? Not verifiable from public Throne source; the legacy parity line is preserved in `worker/sub.js` but the consumer is unidentified.
3. **Karing `fake_packets` field names** — confirm against the current Karing app (or its fork docs when published) before treating `karing.ts` as verified.
4. **clash h3/h4 swap** — was it intentional in the original generator? All canonical sources say H3=3/H4=4.
5. **Multi-account subs** — INCY allows multiple AWG servers per sub body; do we want a per-account-pair grain (BPB-style) or keep one account per sub? No drift either way today.
6. **Jd (WireSock junk delay)** — new optional param; add when WireSock surfaces it in the UI?

## Sources (fetched 2026-08-15)

- sing-box endpoint: sing-box.sagernet.org/configuration/endpoint/wireguard/
- sing-box changelog: sing-box.sagernet.org/changelog/
- mihomo wg proxy: wiki.metacubex.one/en/config/proxies/wg/
- v2rayN: github.com/2dust/v2rayN (WireguardFmt.cs, master)
- v2rayNG issue #5507 (AWG — closed, not planned)
- Throne: github.com/throneproj/Throne (Formerly Nekoray); NekoRay archived: github.com/MatsuriDayo/nekoray
- NekoBox Android: matsuridayo.github.io/nb4a-configuration
- Amnezia magic-header mapping: celzero/rethink-app issue #1437 (Amnezia dev quote)
- Karing: github.com/KaringX/karing issue #639; github.com/KaringX/sing-box; github.com/Nriver/karing-sing-box (dev-next docs)
- Husi: codeberg.org/xchacha20-poly1305/husi (archived)
- WireSock: wiresock.net/documentation/wiresock-secure-connect/connection-profiles.html
- INCY: docs.incy.cc/en/subscription-format/
- LxBox: github.com/Leadaxe/LxBox README
- Outline: github.com/OutlineFoundation/outline-server
- BPB: bia-pain-bache.github.io/BPB-Worker-Panel/usage/warp