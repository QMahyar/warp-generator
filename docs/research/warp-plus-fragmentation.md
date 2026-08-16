# Research: WARP+ licensing and "fragmentation" in the WARP ecosystem

Research date: 2026-08-15. Findings only — no code copied. Primary sources:
private WARP API dumps, client/core source code and issues, Cloudflare docs and
blog, panel docs. Companion docs: `multi-account-subs.md`, `sub-formats.md`.

Context: we are adding multi-account + multi-subscription support to a panel
that renders one registered WARP account into per-client configs (`/sub`,
`/sub/clash`, `/sub/singbox`, `/sub/neko`, `/sub/wg`, `/sub/awg`, see ADR 0007).
Questions: does WARP+ change anything we render? What are "gool" accounts?
What does "fragmentation" mean across the sub-format ecosystem and can our
formats carry it? Do clients render WARP+ in configs?

## Q1: WARP+ (paid plan) — license flow, key format/origins, warp_plus semantics, effect on configs

### 1.1 The attach-license flow (private API)

- `PUT /v0a2158/reg/{device_id}/account` with JSON body `{"license": "<key>"}`
  and `Authorization: Bearer <device token>` returns the updated **account
  object only** (`premium_data`, `quota`, `warp_plus`, `referral_count`,
  `referral_renewal_countdown`, `role`) — no `config`, no `key`, no `token`.
  — [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt)
- Sibling endpoints (same dump + [bepass-org/warp-plus `warp/api.go`](https://github.com/bepass-org/warp-plus/blob/master/warp/api.go)):
  `GET /reg/{id}/account` (account state), `GET /reg/{id}/account/devices`
  (bound devices, each with `role: parent|child`), `PATCH
  /reg/{id}/account/reg/{other}` (`{"active":false}` deactivates a bound
  device), `POST /reg/{id}/account/license` (reset/rotate license),
  `DELETE /reg/{id}` (204, full delete).
- API version prefix drifts over time and all work: badafans dump uses
  `v0a2158` + `CF-Client-Version: a-6.10-2158`; warp-plus uses `v0a4005` +
  `a-6.30-3596`; other tools observed on `v0a2223`, `v0a884`. The `/reg`
  endpoints and payload shapes are otherwise stable.
  — [badafans/warp-reg](https://github.com/badafans/warp-reg),
  [bepass-org/warp-plus `warp/api.go`](https://github.com/bepass-org/warp-plus/blob/master/warp/api.go),
  [hmjz100/WARP-EveryTool `main.py`](https://github.com/hmjz100/WARP-EveryTool/blob/main/main.py),
  [hiddify/Hiddify-Manager `other/warp/singbox/check-quota.sh`](https://github.com/hiddify/Hiddify-Manager/blob/f56fe53f/other/warp/singbox/check-quota.sh)
- One license binds at most **5 devices**: "Each Warp+ license can only be
  bound to 5 terminal devices. If exceeded, an error will be reported as 'Too
  many connected devices.'" — [ViRb3/wgcf issue #211](https://github.com/ViRb3/wgcf/issues/211); official docs: "You can use your license key on up to five devices." — [Cloudflare WARP client docs, WARP modes](https://developers.cloudflare.com/warp-client/warp-modes/)

### 1.2 What a license key is, where keys come from

- Format: `XXXXXXXX-XXXXXXXX-XXXXXXXX` (three 8-char alnum groups, 26 chars).
  — [hmjz100/WARP-EveryTool `main.py`](https://github.com/hmjz100/WARP-EveryTool/blob/main/main.py)
- Legit origins, per Cloudflare:
  - **In-app purchase**: WARP+ Unlimited is a paid monthly subscription
    purchased via Apple App Store / Google Play (regionally priced; $4.99/mo
    "or less", "Big Mac" regional pricing). — [Cloudflare blog "WARP is here" (2019-09-25)](https://blog.cloudflare.com/announcing-warp-plus/), [Cloudflare WARP client docs, WARP modes](https://developers.cloudflare.com/warp-client/warp-modes/)
  - Key is displayed in the app: Android `Account > Key` (hamburger menu);
    also under `Advanced > Connection options`. — [ViRb3/wgcf README](https://github.com/ViRb3/wgcf), [Vauth/warp menu.sh](https://github.com/Vauth/warp/blob/main/menu.sh)
  - **Promo/referral credits are NOT the same as license keys**: wgcf warns
    "Only subscriptions purchased directly from the official 1.1.1.1 app are
    supported. Keys obtained by any other means, including referrals, will not
    work." The referral program (1 GB per referral, unlimited) ended
    2024-11-01; unused credits expired and accounts migrated to the free
    plan. — [ViRb3/wgcf README](https://github.com/ViRb3/wgcf), [Cloudflare WARP+ Referral Program Rules](https://www.cloudflare.com/application/referral-program/), [AnswerOverflow: referral migration (2024-08)](https://www.answeroverflow.com/m/1268560095164366981)
- Gray-market origins (relevant for a multi-account panel):
  - Shared account/license distribution via Telegram channels (a bound device
    with `"model": "t.me/warpplus"` appears in the official API dump's device
    list). — [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt)
  - "WARP+ key generator" scripts that create accounts, farm referral credit
    via `PATCH /reg/{id}` `{"referrer": "<other account id>"}`, and return the
    account's license key (which holds referral quota); base-key lists also
    circulate. — [hmjz100/WARP-EveryTool `main.py`](https://github.com/hmjz100/WARP-EveryTool/blob/main/main.py), [maple3142/cf-warp](https://github.com/maple3142/cf-warp/) ("It currently get quota by faking referrers since there is no way to pay for premium version outside of 1.1.1.1 app")
- **Every fresh registration already returns a license key**: badafans' reg
  response shows `account_type: "free"`, `warp_plus: true`, `quota: 0`, and an
  auto-assigned `license`; a 2024 dump from wgcf issue #211 shows the same
  shape plus a `ttl` field. So "has a license string" ≠ "paid". — [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt), [ViRb3/wgcf issue #211](https://github.com/ViRb3/wgcf/issues/211)

### 1.3 warp_plus flag semantics — what actually indicates "WARP+"

- Observed `account_type` values: `free` (fresh reg), `unlimited` (paid
  subscription), `teams` (WARP Teams). — [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt), [dalion619 gist: Cloudflare WARP Reg Response (`account_type: "unlimited"`)](https://gist.github.com/dalion619/2bfa05fdf66ad35a4d758cc750969f9a), [Vauth/warp menu.sh (teams)](https://github.com/Vauth/warp/blob/main/menu.sh)
- `warp_plus: true` appears on **free accounts too** — it is not a reliable
  paid indicator. Tools decide by `account_type` instead: wgcf.py only sends
  `PUT .../account` when `account_type == "free"` and a key is supplied; for
  `account_type == "unlimited"` it skips. — [ViRb3/cloudflare-warp-wireguard-client `wgcf.py`](https://github.com/ViRb3/cloudflare-warp-wireguard-client/blob/master/wgcf.py)
- `quota` is metered in bytes for non-unlimited accounts: Hiddify-Manager
  converts `quota` by dividing by 1e9 to show GB; free accounts report
  `Quota = 0.00 B` (quota 0 = unmetered). — [hiddify/Hiddify-Manager `check-quota.sh`](https://github.com/hiddify/Hiddify-Manager/blob/f56fe53f/other/warp/singbox/check-quota.sh), [ViRb3/wgcf issue #233](https://github.com/ViRb3/wgcf/issues/158) (referenced comment), [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt)
- Free WARP is "free without bandwidth caps or limitations" but deprioritized;
  WARP+ routes over the Argo backbone ("larger network. More cities"),
  which is the entire paid difference. — [Cloudflare blog "WARP is here" (2019-09-25)](https://blog.cloudflare.com/announcing-warp-plus/), [one.one.one.one](https://one.one.one.one/), [GL.iNet forum guide](https://forum.gl-inet.com/t/guide-connect-to-cloudflares-free-warp-pseudo-vpn-service-using-built-in-wireguard-client/10508)

### 1.4 Does WARP+ alter the WireGuard config content (reserved / peer key)?

- **No.** License attach returns the account object only; `config` (client_id,
  peers, interface addresses) is untouched by the PUT. wgcf's flow is
  register → `wgcf update --license-key` → `wgcf generate`, producing the same
  profile shape as a free account. — [ViRb3/wgcf README](https://github.com/ViRb3/wgcf), [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt)
- `reserved` is derived from the **device's** `config.client_id` (first 3
  bytes of the base64-decoded client_id), not from any plan state; warp-plus
  builds `Reserved: [3]byte{clientID[0], clientID[1], clientID[2]}` when
  generating a config. — [bepass-org/warp-plus `app/app.go` (`generateWireguardConfig`)](https://github.com/bepass-org/warp-plus/blob/master/app/app.go)
- Reserved bytes themselves are sometimes flagged by ISPs to block WARP
  handshakes (BPB made them optional for that reason) — again a
  connectivity/DPI matter, not a plan matter. — [BPB Panel docs: Warp General settings (Reserved Bytes)](https://bia-pain-bache.github.io/BPB-Worker-Panel/configuration/warp/)

### Verdict for our design (Q1)

- The panel **can offer "attach WARP+ license" per account** with one
  authenticated `PUT`; the response's `account_type`/`quota` are the fields to
  surface (ignore `warp_plus`). Watch the **5-device cap**: attaching a
  subscriber's key to our panel device consumes one slot (deactivating via
  `PATCH active:false` frees it).
- **Config rendering is plan-independent** — free vs plus changes nothing in
  any of our six formats. Only the panel UI/status display would differ.
- Rotation story from `multi-account-subs.md` is unchanged; a new wrinkle:
  2024 registrations carry a `ttl` on the account — worth monitoring whether
  "free accounts never expire" still holds (see open questions).

## Q2: "Gool" accounts (WARP-on-WARP)

- **"Gool" is warp-plus's name for WARP-on-WARP chaining** (`--gool` flag =
  "enable gool mode (warp in warp)"; feature: "Warp in Warp Chaining: Chaining
  two instances of warp together to bypass location restrictions"). — [bepass-org/warp-plus README](https://github.com/bepass-org/warp-plus)
- Implementation: two **independent WARP identities** (primary + secondary,
  cached under `primary/` and `secondary/` dirs), both created by the **same
  registration flow** (`LoadOrCreateIdentity` → `POST /reg`) — there is no
  separate "gool" endpoint or account type. The inner tunnel's peer endpoint
  is a UDP port-forward through the outer tunnel (`127.0.0.1:0` →
  endpoint); outer MTU 1330, inner MTU 1280 to survive double encapsulation. — [bepass-org/warp-plus `app/app.go` (`runWarpInWarp`)](https://github.com/bepass-org/warp-plus/blob/master/app/app.go), [DeepWiki: WARP-in-WARP (Gool) Mode](https://deepwiki.com/bepass-org/warp-plus/5.2-warp-in-warp-%28gool%29-mode)
- Purpose: change the apparent egress location beyond a single WARP hop
  (double NAT/location hop). The name appears to be Persian slang ("gool" ≈
  fool/deceive); not documented officially — treat as unverified.
- **Different thing, same acronym**: BPB's "Warp on Warp (WoW)" config is a
  single-config subscription variant pointed at foreign Cloudflare endpoints
  ("node IPs from foreign Cloudflare IPs (primarily Germany)"), not a
  two-tunnel chain. — [BPB Panel docs: Warp subscription](https://bia-pain-bache.github.io/BPB-Worker-Panel/usage/warp/)
- Does it matter for a panel serving WARP as WireGuard to third-party
  clients? **No.** Gool is a runtime chain inside warp-plus; the second
  account is an ordinary registered account, and standard sub formats
  (`wireguard://`, Clash YAML, sing-box JSON, `.conf`) express one tunnel per
  config. No WARP sub generator renders WoW/gool chains.

### Verdict for our design (Q2)

Nothing to build. The only carry-over: a "gool" account is just a second
registration, so our 2–10-account model already covers anyone who wants
WARP-on-WARP — they'd take two of our configs and chain them client-side.
No new endpoint, no new format.

## Q3: "Fragmentation" in the WARP/subscription ecosystem

Two different anti-DPI techniques get called "fragmentation", plus one
unrelated option with the same name:

1. **TCP/TLS packet fragmentation** — splitting a TCP stream / TLS ClientHello
   into small segments (usually with inter-segment delay) so SNI-matching DPI
   can't read the domain. Applies to TLS-based transports (VLESS/VMess/WS/
   gRPC), **not** to WireGuard (UDP).
2. **UDP noise / junk decoy packets** — random packets sent before/around the
   WireGuard handshake so first-packet UDP inspectors don't recognize WG.
   This is the WG-relevant technique.
3. **sing-box `udp_fragment`** — unrelated: toggles whether the OS may
   fragment oversized UDP datagrams at the IP layer (DF bit); blocked by
   default since 1.1-beta1. It is not a payload-splitting anti-DPI feature.
   — [SagerNet/sing-box v1.1-beta1 release notes](https://github.com/SagerNet/sing-box/releases/tag/v1.1-beta1), [sing-box Dial Fields (`udp_fragment`)](https://sing-box.sagernet.org/configuration/shared/dial/), [sing-box DeepWiki (inbound `udp_fragment`)](https://deepwiki.com/SagerNet/sing-box/3.2-inbound-configuration)

### (a) NekoRay / NekoBox CustomBean — can our `/sub/neko` carry it?

- The CustomBean link fields are `core, cmd, cs, cs_suffix, mapping_port,
  socks_port` — **no fragment fields**. `cs` is an outbound JSON (sing-box
  wireguard outbound for `core: "internal"`). — [MatsuriDayo/nekoray `fmt/CustomBean.hpp`](https://github.com/MatsuriDayo/nekoray/blob/main/fmt/CustomBean.hpp)
- NekoBox for Android has **no fragment upstream** (maintainer: "Nekobox is
  simply a GUI for sing-box and sing-box does not implement fragment"); it
  exists only in the maskedeken fork with a patched sing-box. — [MatsuriDayo/NekoBoxForAndroid issue #556](https://github.com/MatsuriDayo/NekoBoxForAndroid/issues/556), [MatsuriDayo/NekoBoxForAndroid issue #619](https://github.com/MatsuriDayo/NekoBoxForAndroid/issues/619)
- NekoRay (PC) gets fragment only by using the **Custom (Xray config)** bean
  with an Xray `freedom` outbound fragment block — i.e. an Xray-side feature,
  nothing in the `nekoray://custom#` WG link. — [MatsuriDayo/nekoray issue #1191](https://github.com/MatsuriDayo/nekoray/issues/1191)
- v2rayNG/Streisand carry fragment as **query params on TCP-protocol links**
  (`fragment-packets/length/interval`; Streisand `&fragment=length,interval,packet`),
  not on WG links. — [MatsuriDayo/NekoBoxForAndroid issue #556 (v2rayNG PR #2839)](https://github.com/MatsuriDayo/NekoBoxForAndroid/issues/556), [MatsuriDayo/nekoray issue #1191](https://github.com/MatsuriDayo/nekoray/issues/1191)

### (b) Clash / Mihomo — tcp-fragment / udp-fragment?

- **They do not exist.** "Add fragment to configs" has been an open feature
  request since 2024-02 and is still open in 2026 ("in 2026 it is not an
  enhancement it's a must"); BPB's compatibility table also lists Clash-Meta
  fragment support as ❌. — [MetaCubeX/mihomo issue #1046](https://github.com/MetaCubeX/mihomo/issues/1046), [BPB Panel docs: Fragment](https://bia-pain-bache.github.io/BPB-Worker-Panel/configuration/fragment/)
- What Mihomo **does** have for WG obfuscation: AmneziaWG junk params via
  `amnezia-wg-option` on the wireguard proxy, and wireguard noise/padding
  support since v1.18.9 (referenced from Xray's obfuscation request and the
  Exclave tracker). — [wiki.metacubex.one: WireGuard proxy](https://wiki.metacubex.one/en/config/proxies/wg/), [XTLS/Xray-core issue #4372](https://github.com/XTLS/Xray-core/issues/4372), [dyhkwong/Exclave issue #141](https://github.com/dyhkwong/Exclave/issues/141), [MetaCubeX/mihomo v1.18.9 release](https://github.com/MetaCubeX/mihomo/releases/tag/v1.18.9)
- UDP noise for mihomo is itself an open request (#1795); Xray's `finalmask`
  (fragment moved from freedom into `finalmask`) is tracked in #2604 as
  "not in mihomo yet". — [MetaCubeX/mihomo issue #1795](https://github.com/MetaCubeX/mihomo/issues/1795), [MetaCubeX/mihomo issue #2604](https://github.com/MetaCubeX/mihomo/issues/2604)

### (c) AmneziaWG junk-packet params (Jc/Jmin/Jmax/S1–S4) — our `/sub/awg` + `/sub/wg`

- **Jc/Jmin/Jmax** (junk packets before each handshake): decoy-only, **no
  need to match the server** ("General recommendation is to use it on the
  client side only"; the peer discards them). Warning: `Jmax >= system MTU`
  causes real IP-layer fragmentation, "which looks suspicious from the censor
  side". — [amnezia-vpn/amneziawg-go README](https://github.com/amnezia-vpn/amneziawg-go/), [docs.amnezia.org: AmneziaWG](https://docs.amnezia.org/documentation/amnezia-wg/)
- **S1–S4** (random padding per packet type: init 148+S1, resp 92+S2, cookie
  64+S3, data payload+S4) and **H1–H4** (dynamic uint32 packet-type headers,
  ranges must not overlap) **must be identical on server and client** — the
  receiver strips/validates them. **I1–I5** (signature/concealment packets,
  CPS) are client-side only. AWG 2.0 added S3/S4, H-ranges, I1–I5. — [docs.amnezia.org: AmneziaWG](https://docs.amnezia.org/documentation/amnezia-wg/), [bivlked/amneziawg-installer ADVANCED.en.md](https://github.com/bivlked/amneziawg-installer/blob/main/ADVANCED.en.md), [GL.iNet docs: AmneziaWG obfuscation parameters](https://docs.gl-inet.com/router/en/4/faq/amneziawg_obfuscation_parameters/), [DeepWiki: amneziawg-linux-kernel-module (junk.c / magic_header.c)](https://deepwiki.com/amnezia-vpn/amneziawg-linux-kernel-module)
- **For WARP this is mostly unusable**: WARP peers are vanilla WireGuard —
  S1–S4/H1–H4 cannot be set (server won't strip/validate them, handshake
  fails). Only Jc/Jmin/Jmax-type client-side decoys are even theoretically
  possible against a vanilla WG peer (see open questions).

### (d) sing-box fragment outbound

- The standalone `fragment` outbound is **gone** (docs URL 404s); since 1.12
  fragmentation is **TLS-layer only**: `tls.fragment` / `tls.record_fragment`
  on outbound TLS options, plus `tls_fragment` / `tls_record_fragment` route
  actions ("Fragment TLS handshakes to bypass firewalls"). TCP-only, for
  TLS-based outbounds — nothing applies to the WireGuard outbound/endpoint.
  — [SagerNet/sing-box v1.12.0 release notes](https://github.com/SagerNet/sing-box/releases/tag/v1.12.0), [sing-box TLS options](https://sing-box.sagernet.org/configuration/shared/tls/), [sing-box Rule Action (`tls_fragment`)](https://sing-box.sagernet.org/configuration/route/rule_action/)
- BPB mirrors this: sing-box gets fragment only in its own TLS-layer form,
  and BPB lists sing-box as ❌ for "Warp Pro" (noise). — [BPB Panel docs: Fragment](https://bia-pain-bache.github.io/BPB-Worker-Panel/configuration/fragment/), [BPB Panel v5.1.0 release notes (client table)](https://github.com/bia-pain-bache/BPB-Worker-Panel/releases/tag/v5.1.0)

### Which WARP panels/clients use fragmentation against DPI, and how

- **BPB Worker Panel** — the reference WARP panel: "Fragment" (Xray freedom
  outbound, TCP/SNI hiding: length 100–200, delay 1–1 ms, packets tlshello,
  caps 500/30 ms) for v2rayNG/v2rayN/Streisand/Nekoray/Hiddify/NikaNG; and
  **"Warp Pro"** = UDP **noise/fake packets** around the WARP handshake
  (modes: none/quic/random/custom hex; noise count + min/max sizes for
  Amnezia, WG Tunnel, Clash-Mihomo cores) to reach WARP on ISPs that block
  plain WARP. — [BPB Panel docs: Fragment](https://bia-pain-bache.github.io/BPB-Worker-Panel/configuration/fragment/), [BPB Panel docs: Warp Pro](https://bia-pain-bache.github.io/BPB-Worker-Panel/configuration/warp-pro/), [BPB Panel docs: Warp Pro subscription](https://bia-pain-bache.github.io/BPB-Worker-Panel/usage/warp-pro/)
- **Hiddify** — TLS tricks (fragment) plus **wireguard noise** in its
  sing-box fork ("sends a custom range of random packets with random sizes
  and then starts to initiate the handshake of Wireguard"); Hiddify-core
  patches `tls_fragment` / `xray_fragment` into outbounds. — [MatsuriDayo/sing-box-extra issue #8](https://github.com/MatsuriDayo/sing-box-extra/issues/8), [hiddify/hiddify-core `config/outbound.go`](https://github.com/hiddify/hiddify-core/blob/4e7fe336/config/outbound.go)
- **warp-plus** — `peer.Trick = true` on every WARP peer (decoy/noise packets
  before the handshake; `Trick` is a wiresocks peer option) — the same noise
  idea, applied to WARP's own WG tunnel by default. — [bepass-org/warp-plus `app/app.go`](https://github.com/bepass-org/warp-plus/blob/master/app/app.go), [bepass-org/warp-plus `wiresocks/config.go`](https://github.com/bepass-org/warp-plus/blob/master/wiresocks/config.go)
- **Xray-core** — the reference implementation of both: `freedom` outbound
  `fragment` (TCP: `packets: tlshello|1-3|""`, length/interval ranges) and
  `noises` (UDP: `type: rand|str|hex|base64`, `packet`, `delay`, `applyTo`),
  moved into `finalmask` in 2026. — [XTLS docs: Freedom outbound](https://xtls.github.io/en/config/outbounds/freedom.html), [XTLS docs: FinalMask](https://xtls.github.io/en/config/transports/finalmask.html), [XTLS/Xray-core PR #3711 (UDP noise rationale)](https://github.com/XTLS/Xray-core/pull/3711)
- **AmneziaWG** — protocol-level obfuscation (junk + paddings + magic
  headers) as described in (c); used by Amnezia apps, wg-easy, mihomo via
  `amnezia-wg-option`. WARP servers are vanilla WG, so AWG params don't apply
  to WARP.

### Verdict for our design (Q3)

- **TCP/TLS fragmentation cannot ride our WARP configs** (all our formats are
  WG). It would only apply if we ever wrap WARP in VLESS/VMess (BPB-style) —
  out of scope for a WG panel; if ISPs block WARP, the ecosystem's answer is
  noise (below), not TCP fragment.
- **UDP noise/junk is the only anti-DPI technique a WG config can carry** —
  but only via formats/cores that express it: Xray-family (`noises`/finalmask
  — not our formats), mihomo wireguard (noise since v1.18.9, AWG option),
  AmneziaWG `.conf` (Jc/Jmin/Jmax client-side only), warp-plus-style custom
  cores. Our `/sub/neko` (sing-box internal core) and `/sub/singbox` cannot
  carry it; `/sub/clash` could via `amnezia-wg-option`/noise only for
  mihomo-capable clients.
- **AmneziaWG params against WARP must default to "off"** (S1–S4/H1–H4 need a
  matching server; WARP is vanilla WG). ADR 0007's panel AWG settings are
  therefore only meaningful for non-WARP endpoints; for WARP endpoints only
  client-side Jc decoys are even arguable (unverified, see open questions).

## Q4: Do client families render WARP+ or per-account differencing in the config?

- **No.** Verified payload shapes for every family we serve (`wireguard://`,
  Clash YAML `type: wireguard`, sing-box WireGuard outbound/endpoint JSON,
  `nekoray://custom#` cs JSON, `.conf`, `awg://`) contain no plan/license
  field; the license attach response doesn't touch `config` at all
  (Q1.4). — [docs/research/sub-formats.md](sub-formats.md) (shapes + sources),
  [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt)
- WARP+/plan status is displayed **at runtime, from the account API**, never
  from the config: the 1.1.1.1 app (account page), `wgcf status`/`wgcf trace`
  (`warp=on` vs `warp=plus`), warp-plus logs. — [ViRb3/wgcf README](https://github.com/ViRb3/wgcf)
- Per-account differencing in rendered configs is limited to
  **device-level** material: private key, `client_id`-derived `reserved`,
  assigned 172.16.0.2/2606:... addresses — all plan-independent; endpoint
  choice is panel-level. — [bepass-org/warp-plus `app/app.go`](https://github.com/bepass-org/warp-plus/blob/master/app/app.go)
- Panel-side "WARP+" labels are cosmetic: BPB's "Warp Pro" names a
  **noise-enabled** config (not WARP+); node names like "WARP+" in other
  panels are just names. — [BPB Panel docs: Warp Pro](https://bia-pain-bache.github.io/BPB-Worker-Panel/configuration/warp-pro/)

### Verdict for our design (Q4)

Config rendering is fully plan-agnostic: multi-account support needs no
per-plan logic anywhere in the six sub-format renderers. WARP+ (and
quota/usage) belong only in the panel UI (via `GET /reg/{id}` account
polling) — consistent with keeping "panel" and "subscription" concerns
separate per CONTEXT.md.

## Open questions

1. **Junk decoys against a vanilla WG peer**: do client-only noise/junk
   packets (warp-plus `Trick`, Xray `noises`, AWG `Jc>0`) actually work
   against WARP's vanilla WireGuard edge, or does Cloudflare's first-packet
   inspection/handshake-cookie logic drop flows with preceding junk? BPB
   sells "Warp Pro" noise against WARP and warp-plus defaults Trick on, so
   empirically yes — but nothing authoritative documents it.
2. **Noise + reserved interaction**: community note that "with noise, it's
   always better to set reserved to 0,0,0 … not compatible with obfuscation".
   If we ever emit noise configs, does reserved still derive from client_id?
   — [XTLS/Xray-core issue #4372](https://github.com/XTLS/Xray-core/issues/4372)
3. **License slot accounting**: attaching a subscriber's license to a panel
   device consumes one of 5 slots. Is a slot freed by `PATCH active:false`
   instantly, and can a panel safely attach the same key to rotated accounts
   repeatedly, or does Cloudflare throttle license PUTs per key/IP?
4. **License key validation**: do referral-credit-derived and gray-market
   ("base_keys"/generator) keys still pass `PUT .../account` in 2026, or has
   Cloudflare tightened validation (wgcf says referral keys "will not work")?
5. **quota semantics for display**: `quota`/`usage`/`premium_data` units and
   meaning (bytes per Hiddify-Manager; free = 0.00 B per wgcf #233); is there
   an official statement? Does `premium_data` = paid data allotment?
6. **Account TTL**: 2024-era registrations carry `ttl` on the account
   (observed in wgcf #211 dump). Does that mean free accounts now expire
   (contradicting multi-account-subs.md Q2's "no expiry")? If so, rotation
   cadence changes from ban-driven to time-driven.
7. **warp_plus flag**: is `warp_plus: false` ever returned for modern
   registrations, or is it unconditionally true since the waitlist was
   removed? (Drives whether the panel should display it at all.)
8. **Mihomo noise field**: confirm the exact YAML shape mihomo ≥ v1.18.9
   uses for wireguard noise/padding (and whether stock mihomo or a fork is
   what BPB's Clash "Warp Pro" targets) before promising anything in
   `/sub/clash`.
9. **sing-box `udp_fragment`**: should the panel ever emit it for WARP
   (likely never — DF default is correct for WG; also AWG's own warning that
   IP-layer fragmentation looks suspicious).
10. **Gool/WoW in a panel**: any demand for a "second-registration for
    WARP-on-WARP" convenience (two configs that chain), or is per-token
    pinning to one account enough? (warp-plus gool and BPB WoW show the
    use-case exists in the ecosystem.)

## Sources (primary)

- [badafans/warp-reg `official-warp-api.txt`](https://github.com/badafans/warp-reg/blob/main/official-warp-api.txt)
- [bepass-org/warp-plus](https://github.com/bepass-org/warp-plus) — README, `app/app.go`, `warp/api.go`, `warp/account.go`, `wiresocks/config.go`
- [DeepWiki: bepass-org/warp-plus — WARP-in-WARP (Gool) Mode](https://deepwiki.com/bepass-org/warp-plus/5.2-warp-in-warp-%28gool%29-mode)
- [ViRb3/wgcf README](https://github.com/ViRb3/wgcf), [wgcf issue #211](https://github.com/ViRb3/wgcf/issues/211), [cloudflare-warp-wireguard-client `wgcf.py`](https://github.com/ViRb3/cloudflare-warp-wireguard-client/blob/master/wgcf.py)
- [Cloudflare blog: "WARP is here (sorry it took so long)" (2019-09-25)](https://blog.cloudflare.com/announcing-warp-plus/)
- [Cloudflare WARP client docs: WARP modes](https://developers.cloudflare.com/warp-client/warp-modes/)
- [Cloudflare WARP+ Referral Program Rules](https://www.cloudflare.com/application/referral-program/)
- [sing-box: Dial Fields](https://sing-box.sagernet.org/configuration/shared/dial/), [TLS options](https://sing-box.sagernet.org/configuration/shared/tls/), [Rule Action](https://sing-box.sagernet.org/configuration/route/rule_action/), [v1.12.0 release](https://github.com/SagerNet/sing-box/releases/tag/v1.12.0), [v1.1-beta1 release](https://github.com/SagerNet/sing-box/releases/tag/v1.1-beta1)
- [MetaCubeX/mihomo: issue #1046 (fragment)](https://github.com/MetaCubeX/mihomo/issues/1046), [#1795 (UDP noise)](https://github.com/MetaCubeX/mihomo/issues/1795), [#2604 (finalmask)](https://github.com/MetaCubeX/mihomo/issues/2604), [v1.18.9](https://github.com/MetaCubeX/mihomo/releases/tag/v1.18.9), [wiki: WireGuard proxy](https://wiki.metacubex.one/en/config/proxies/wg/)
- [MatsuriDayo: nekoray `CustomBean.hpp`](https://github.com/MatsuriDayo/nekoray/blob/main/fmt/CustomBean.hpp), [nekoray issue #1191](https://github.com/MatsuriDayo/nekoray/issues/1191), [NekoBoxForAndroid issues #556 / #619](https://github.com/MatsuriDayo/NekoBoxForAndroid/issues/556), [sing-box-extra issue #8](https://github.com/MatsuriDayo/sing-box-extra/issues/8)
- [docs.amnezia.org: AmneziaWG](https://docs.amnezia.org/documentation/amnezia-wg/), [amneziawg-go README](https://github.com/amnezia-vpn/amneziawg-go/), [GL.iNet: AWG obfuscation parameters](https://docs.gl-inet.com/router/en/4/faq/amneziawg_obfuscation_parameters/), [bivlked/amneziawg-installer ADVANCED.en.md](https://github.com/bivlked/amneziawg-installer/blob/main/ADVANCED.en.md)
- [XTLS docs: Freedom (fragment/noises)](https://xtls.github.io/en/config/outbounds/freedom.html), [FinalMask](https://xtls.github.io/en/config/transports/finalmask.html), [Xray PR #3711](https://github.com/XTLS/Xray-core/pull/3711), [Xray issue #4372](https://github.com/XTLS/Xray-core/issues/4372)
- [BPB Worker Panel docs](https://bia-pain-bache.github.io/BPB-Worker-Panel/): Fragment, Warp, Warp Pro, [v5.1.0 release notes](https://github.com/bia-pain-bache/BPB-Worker-Panel/releases/tag/v5.1.0)
- [hiddify/Hiddify-Manager `check-quota.sh`](https://github.com/hiddify/Hiddify-Manager/blob/f56fe53f/other/warp/singbox/check-quota.sh), [hiddify-core `config/outbound.go`](https://github.com/hiddify/hiddify-core/blob/4e7fe336/config/outbound.go)
- [hmjz100/WARP-EveryTool `main.py`](https://github.com/hmjz100/WARP-EveryTool/blob/main/main.py), [maple3142/cf-warp](https://github.com/maple3142/cf-warp/), [dalion619 gist: WARP reg response](https://gist.github.com/dalion619/2bfa05fdf66ad35a4d758cc750969f9a)