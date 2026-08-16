# Research: AmneziaWG status 2025–2026 — parameter set (1.5→2.0→3.0), I1 mask mechanics, awg:// scheme, client support matrix, multi-endpoint interplay

Sources: see per-section links (amneziawg-go repo/README — the primary protocol implementation, docs.amnezia.org, amnezia.org blog, GitHub issues in amnezia-client / amneziawg-linux-kernel-module / mihomo / sing-box / Throne / Karing / NekoBoxForAndroid, INCY docs, LxBox README, wg-easy docs, AirVPN forum + installer field reports).
Research date: 2026-08-15. Findings only — no code copied.

Context: our panel stores an AWG record (`Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5`, worker/settings.js,
panel.js card, validation ranges in panel.js:693) and renders it into: AmneziaWG confs with
J/S/H/I lines (lib/builders/wireguard.ts, wiresock.ts, clash.ts → mihomo `amnezia-wg-option`),
`awg://` links (worker/sub.js §2.5, LxBox/INCY), wg-zip .confs, and Throne `wg://` links with
amnezia query params (lib/builders/throne.ts). I1 is picked randomly from a 2-entry pool
(lib/builders/shared.ts) or generated fresh as a QUIC Initial for a user-chosen SNI
(lib/quic.ts). Target design: multi-account + multi-subscription. Question: is our AWG handling current?

## Q1: Parameter set status — AWG 1.0 → 1.5 → 2.0 → 3.0

### Version timeline (official blog + docs)
- **AWG 1.0** released 2024; **1.5** added the I1–I5 "signature chain" (CPS) and junk timing
  params (`j1/j2/j3/itime` — since **removed in 2.0**; see mihomo source note
  https://core-tutorial.argsment.com/mihomo/wireguard : "`j1`/`j2`/`j3`/`itime` are v1.5-only (removed in v2.0)",
  source `adapter/outbound/wireguard.go:94-108`).
- **AWG 2.0** (late 2025; self-hosted blog https://amnezia.org/blog/amneziawg-2-0-available-for-self-hosted,
  app ≥ 4.8.12.9): **H1–H4 become ranges** (random value picked per packet from `x-y`), **S3/S4 added**
  (cookie / transport-data padding), CPS fully supported. AWG 1.0 is renamed "AmneziaWG Legacy" in the app;
  2.0 needs fresh configs, new servers default to 2.0, no rollback.
- **AWG 3.0** (app 5.0.0.5, Jul 2026; blog
  https://amnezia.org/blog/amneziavpn-5-0-0-5-update , docs page): header protection + content
  padding + timing randomization; **self-hosted support not yet released** — the docs page says details
  come "after Self-hosted support for the protocol is released in AmneziaVPN".

### Current parameter set (canonical: amneziawg-go README, https://github.com/amnezia-vpn/amnezia-wg → amneziawg-go)
- `Jc/Jmin/Jmax` — junk-train; **client-side only** ("no need to specify it on both sides"), Jc rec 4–12,
  Jmin ≤ Jmax, Jmax must stay below system MTU (fragmentation looks suspicious).
- `S1..S4` — padding of init / response / **cookie** / **transport** messages; **server-side** (must match).
  Docs table: S1–S3 0–64 bytes, S4 0–32 bytes (https://docs.amnezia.org/documentation/amnezia-wg/).
- `H1..H4` — header of init / response / cookie / transport; **server-side**; value is now either a
  single value or a **range `x-y`** (2.0+); ranges must not overlap; 0–2³²−1.
- `I1..I5` — CPS signature packets, **client-side only**; sent in order before every handshake
  (~120 s rekey); tags `<b 0x…>`, `<r N>`, `<rd N>`, `<rc N>`, `<t>` (README list). Source
  `device/obf.go` adds internal tags `d`, `ds`, `dz` (header-protection data, not for I-lines). The
  older 1.5-era docs listed a `<c>` counter tag — **no longer in the implementation**; our CPS
  validation only accepts `<b …>` + generic tags, which stays compatible.
- **AWG 3.0+** (README): `HeaderProtectionKey` (server-side, requires S1–S4 ≥ 12), `ContentPaddingAddition`
  (client-side), timing ranges `RekeyAfterTime/RekeyTimeout/RejectAfterTime/KeepaliveTimeout/MaxHandshakeAttempts`,
  and ranged `PersistentKeepalive`.

### What changed vs what we store
Nothing removed from our set (Jc/Jmin/Jmax/S1–S4/H1–H4/I1–I5 all still live); the changes are:
S3/S4 got real semantics (2.0), H1–H4 gained range syntax, and I1–I5 are now fully first-class (2.0).

### Verdict for our design
Our field set and validation ranges (Jc 0–10, S1–S3 0–64, S4 0–32, H1–H4 0–2³²−1, CPS-line I1) match
the current docs. Two deltas to consider: (a) Jmin/Jmax upper bound is 4096 in the panel vs docs
recommend 64–1024 / community ≤1280 (podkop.net) / "below system MTU" (README) — harmless for WARP
but flag-worthy; (b) H1–H4 range syntax (`N-M`) is only meaningful for AWG 2.0 servers, never for
WARP's plain-WG endpoint (see Q5) — no panel change needed yet.

## Q2: I1 ("initial packet mask") mechanics

### How I1 works
- I1 is the first of up to five **CPS signature packets** sent before the real handshake
  initiation (`SendHandshakeInitiation`; see maintainer's description in
  https://github.com/amnezia-vpn/amnezia-client/issues/2857#comment). Docs:
  https://docs.amnezia.org/documentation/amnezia-wg/ — "The primary packet I1 contains a hex
  snapshot of an actual protocol (e.g., a QUIC Initial handshake), which can also be randomized."
- `<b 0x…>` dumps the hex blob verbatim as the whole UDP packet. For QUIC-shaped I1s the blob is a
  real QUIC Initial datagram (RFC 9000) carrying a TLS ClientHello with an SNI; randomizing the
  DCID makes every client's I1 unique. This is exactly what lib/quic.ts does (SNI-only ClientHello,
  random DCID, header protection, level-4 two-CRYPTO-frame cut).
- Sent **before every handshake** (default rekey ≈ every 120 s), so it repeats regularly, not once.

### How I1 is chosen (official + community practice)
- Docs: "simply specify the signature of the masking protocol; remaining parameters are filled
  automatically"; the self-host guide ships an **example** I1 (a DNS response for icloud.com).
- Open issue https://github.com/amnezia-vpn/amnezia-client/issues/2857 : a static, doc-shipped I1 is
  a **cross-deployment DPI fingerprint**; per-deployment/per-client randomization is the fix.
  Field reports in the thread: QUIC-shaped I1s work "each time", random-bytes `<r N>` works only
  intermittently (bivlked installer issues #42/#196).
- AirVPN community thread https://airvpn.org/forums/topic/65417-amneziawg-config-patcher-cps-db/ :
  "It is highly preferred that you get your own QUIC packet for I1" — capture with Wireshark +
  `curl --http3-only`; tools: Mini QUIC Generator (sageptr.github.io/mini_quic_generator), Junker
  (spatiumstas.github.io/junker). An allowlisted SNI inside the I1 even revives tunnels through
  Russian AS-allowlist filtering (zimbabwe's test stand in the same thread).
- Nuance worth knowing: real QUIC Initials are padded to **≥1200 bytes** (RFC 9000 §14.1); a
  ~100-byte mask is length-distinguishable from a genuine QUIC Initial (bivlked comment in #2857).

### Whether per-endpoint I1 differs
- I1–I5 are **interface-level config values**: one CPS chain per config, applied to the handshake
  with whichever endpoint is in use. The protocol has no per-endpoint I1 concept; nothing in
  amneziawg-go keys junk to peers. Different clients/configs may of course carry different I1s.

### Verdict for our design
Our approach (random mask from a pool, or a fresh QUIC Initial generated for a user-chosen SNI at
generate time) is current recommended practice. Improvements that match 2026 guidance: (a) generate
a fresh I1 per subscription/token instead of rotating a 2-entry pool (static pool = shared
fingerprint across all our subscribers, exactly what #2857 warns about); (b) optionally pad
generated QUIC Initials to 1200 bytes per RFC 9000 §14.1 to survive a length check; (c) keep the
pool as a fallback for users who don't pick a domain.

## Q3: The awg:// link scheme

### Is there a standard?
- **INCY docs define it** (https://docs.incy.cc/en/subscription-format and
  https://incy.gitbook.io/docs/docs-en/subscription-format.md ):
  `amneziawg://<base64url-conf>` is **canonical**, `awg://` is an equivalent **short alias**;
  everything after `#` is the display name; url-safe base64 (padding optional); links can be mixed
  with vless:// etc. in one body; base64-wrapped body supported.
- **Multi-server extension (INCY)**: JSON container `{"type":"amneziawg","version":1,"servers":[{name,config}]}`
  — one subscription, many AWG locations; malformed entries are skipped (one bad server doesn't
  break the sub). **iOS/Android only**: "The Desktop client does not support AmneziaWG — a `.conf` in
  the body is parsed there as plain WireGuard, and the `amneziawg://`/`awg://` schemes and the JSON
  container are ignored."
- Amnezia's own `vpn://` scheme (zlib-compressed base64 config; amnezia-client #1407 + config-decoder)
  is the official AmneziaVPN import format — separate from awg://.

### Which clients accept awg://
- **LxBox** (Leadaxe/LxBox, Android, sing-box-lx fork): README lists `awg://` URI, AmneziaWG `.conf`,
  Amnezia `vpn://`, and JSON under WireGuard; "AWG 1.x/2.0 obfuscation (jc/jmin/jmax, s1–s4, h1–h4
  incl. `N-M` ranges, i1–i5)". https://github.com/Leadaxe/LxBox
- **INCY** mobile (iOS/Android): yes, per the docs above.
- **Throne** (desktop): **no** — AWG unsupported; `.conf` imported as plain WG (INCY docs). Throne's
  `wg://` deep links are a different, undocumented scheme (see below).

### Throne wg:// with amnezia params — still the alternative?
- Throne's official import surface is `throne://` deep links (https://throneproj.github.io/advanced/deeplinks);
  there is **no official `wg://` scheme doc**. The `wg://<endpoint>?…&enable_amnezia=true&junk_packet_count=…&init_packet_magic_header=…`
  form our panel emits (lib/builders/throne.ts, "legacy parity") is community convention from the
  warp-generator lineage (warp-generator.vercel.app / BPB panel), not a Throne-published spec.
- Throne AWG status: #672 (AWG 1.5, 2025) "not possible unless there is clear documentation for the
  library"; #1353 (AWG 2.0, 2026) closed as duplicate with the maintainer expecting upstream
  sing-box to add AWG — but sing-box #4045 was closed **not_planned** (2026-04-30). So desktop
  Throne has no native AWG, and its wg:// junk scheme remains the only AWG-ish path; it stays
  undocumented.

### Verdict for our design
Our `awg://<base64url conf>#name` per-endpoint lines and the base64 envelope body are exactly the
INCY-documented scheme — current. Keep the label "awg:// clients (LxBox, INCY)". Two options worth
adding later: (a) the INCY JSON container as an alternative multi-endpoint body (directly relevant
to multi-account subs), (b) an `amneziawg://` canonical-scheme variant if any client stops aliasing
`awg://`. Throne wg:// stays as-is (legacy alternative, no official spec to chase).

## Q4: Client-side AWG support status 2025–2026

- **Official clients**: AmneziaVPN (AWG 2.0 from 4.8.12.9; AWG 3.0 in 5.0.0.5); standalone
  AmneziaWG apps — Android (org.amnezia.awg), iOS (id6478942365), Windows (amneziawg-windows-client,
  ≥ 2.0.0; RomikB/amneziawg-windows-client); awg-android / awg-apple / awg-windows repos; WG Tunnel
  (zaneschepke, F-Droid) documents full AWG params incl. I1–I5 (https://wgtunnel.com/docs/tunnels).
- **Known official-app bug**: https://github.com/amnezia-vpn/amnezia-client/issues/2219 — the
  AmneziaVPN app (iOS/Android) never passes **S3/S4 to amneziawg-go via UAPI**, so with an AWG 2.0
  server configured S3/S4>0 the handshake completes but **no transport data flows** (closed
  not_planned; linked PR #2648 open). Keepalive packets got the S4 fix in amneziawg-go v0.2.18
  ("fix: apply S4 transport padding to keepalive packets", per mihomo #2890).
- **mihomo**: `amnezia-wg-option` (jc/jmin/jmax/s1–s4/h1–h4/i1–i5; H as ranges) documented at
  https://wiki.metacubex.one/en/config/proxies/wg ; uses fork `metacubex/amneziawg-go`; crash bug
  with S4 > packet length (#2890) fixed by syncing the fork with upstream. Clash MI added the same
  option (#395, completed 2026-04).
- **sing-box**: **no AWG upstream** (#3159 spam-closed, #4045 not_planned). AWG lives in forks:
  hoaxisr/amnezia-box, Leadaxe/sing-box-lx, spoofi/sing-box-awg, onucb/amnezia-box; the Throne #1353
  thread shows the practical `awg` endpoint JSON (type `awg`, s1–s4/jc…/h1–h4/i1–i5).
- **Karing**: #1136 "Full support for AmneziaWG" closed **completed** 2026-03-08 (resolution
  details not published in the issue; requested format was sing-box-shaped `amneziawg` JSON).
- **NekoRay / NekoBoxForAndroid**: **no AWG**. nekoray is archived ("不再维护…");
  NekoBoxForAndroid #1062 (AWG option) closed **not_planned** 2026-01, pointing at
  wireproxy-awg instead. Our `nekoray://` custom outbound stays WG-only.
- **LxBox**: full AWG 1.x/2.0 via sing-box-lx (see Q3) — the strongest new mobile client.
- **Servers/routers**: wg-easy v16 enables AWG by default (EXPERIMENTAL_AWG);
  amneziawg-linux-kernel-module; OpenWRT packages (Slava-Shchipunov/lolo6oT), Keenetic AWG Manager,
  ASUS Merlin fork, Mikrotik C implementation (timbrs/amneziawg-mikrotik-c); GL.iNet docs cover AWG 2.0.

### Verdict for our design
The panel's "AmneziaWG 1.5" label is fine: AWG 1.5-style configs (S1/S2=0, H1–H4=1–4 + Jc + I1)
remain the only shape that works against WARP's plain-WG endpoint, and every AWG client
backwards-compatibly accepts them. Do **not** ship nonzero S3/S4 today: the official app can't
handle them (#2219) and they're meaningless for WARP anyway. Desktop remains the weak spot
(Throne/NekoRay: no AWG) — wg:// junk links stay our only desktop-ish option.

## Q5: AWG × multi-account / multi-endpoint setups

- **Protocol level**: obfuscation params are **per-interface (device-level)** on AWG servers —
  one param set for all peers on that interface. Server-side, per-*peer* capability flags exist:
  `advanced_security` (legacy WG vs AWG), `ranged_headers` (AWG 1.0 vs 2.0), and a proposed
  `junk_offsets` for S3/S4 — so a single AWG endpoint can serve mixed client populations, but the
  *parameters themselves* are not per-peer (kernel module issues #162, #163, #168,
  https://github.com/amnezia-vpn/amneziawg-linux-kernel-module/issues/168).
- **Client side**: Jc/Jmin/Jmax and I1–I5 are per-config (client-side only); S1–S4/H1–H4 must match
  the server. No per-endpoint or per-account junk mechanism exists anywhere.
- **WARP constraint** (critical for us): the WARP endpoint is a **standard WireGuard server**, so
  only client-side junk works: S1–S4 must be 0, H1–H4 must stay 1–4 (wire-identical to WG headers).
  Documented community practice: AirVPN thread ("To use the S1 and S2 parameters you have to have
  the forks installed on the server as well, thus they are set to 0"), podkop.net guide
  (https://podkop.net/docs/tunnels/awg_settings — obfuscating a WG config without touching the
  server: S1=0, S2=0, H1=1…H4=4, Jc/Jmin/Jmax free), r/AmneziaVPN on WARP+AWG 2.0 ("S3, S4 … only
  work with the AmneziaWG server; not compatible with regular WireGuard").
- **Precedents for multi-account WARP+AWG**: multiple generators already do WARP + AWG in one shot —
  Skiro1/warp-awg-gen (registers WARP account, emits AWG 2.0 config), HereIamGosu/amnezia-config-gen
  (Legacy + AWG 2.0 + CPS), keysconf.com/amneziawg, WVFWARP, darknessshade config gen. All use **one
  shared obfuscation profile** regardless of account/endpoint; none vary junk per account.
- **Multi-server delivery precedent**: INCY's JSON container / line-per-server format (Q3) is the
  only "one subscription, many AWG configs" pattern, and it's client-side packaging, not per-server
  parameters.

### Verdict for our design
Multi-account + multi-subscription imposes **no AWG changes**: keep one panel-wide AWG profile
(toggle + params) applied to every account/endpoint, with the WARP-safe default shape (S1–S4=0,
H1–H4=1–4, Jc/Jmin/Jmax + I1 client-side). The only per-subscription knob worth having is **I1
randomization at serve time** (already implemented — pool pick; consider per-token fresh QUIC
generation per Q2). If we ever add non-WARP (self-hosted AWG 2.0) endpoints, per-server param sets
would become real — track that as future scope, not now.

## Open questions this raises
1. **Per-token I1**: move from a 2-mask pool to a fresh QUIC Initial per subscription/token
   (kills the cross-subscriber fingerprint, #2857)? Cost: crypto in the request path
   (lib/quic.ts already runs in the worker).
2. **RFC 9000 §14.1 padding**: pad generated QUIC Initial masks to 1200 bytes so a length check
   can't tell them from real QUIC Initials — or does that bloat configs/subscription bodies?
3. **INCY JSON container**: should `/sub/awg` also offer the
   `{"type":"amneziawg","servers":[…]}` multi-server body (or is line-per-server enough)?
4. **S3/S4 exposure in the panel**: keep S3/S4 fields (future AWG-2.0-server value) with a warning
   that they only work with AWG servers — or hide them entirely (WARP never uses them)?
5. **H1–H4 range syntax**: add `N-M` range validation for a future AWG-2.0-server path, or keep
   single values only?
6. **Jmin/Jmax bounds**: align panel validation (1–4096) with docs (64–1024 rec) / community
   (≤1280) / "below system MTU" guidance?
7. **AWG 3.0 watch**: HeaderProtectionKey/ContentPaddingAddition/timing ranges — monitor
   self-hosted release; irrelevant to WARP (plain WG server) but relevant if the panel ever
   targets AmneziaVPN-managed servers.