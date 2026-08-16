/**
 * Subscription renderers (ticket 04) — the `renderSubscription` seam.
 *
 * renderSubscription(format, opts, { account, endpoints, awg }) → { body, contentType }
 *
 * The single seam every subscription format renders through (spec —
 * "Implementation Decisions → Seam"). Pure: no fetch, no env, no KV — the
 * route handlers read KV and pass plain data in. Later tickets add more
 * renderers to the RENDERERS registry (wg-zip, awg).
 *
 * Ticket 07 shipped the `neko` format — NekoBox desktop: base64 of one
 * `nekoray://custom#` link per valid endpoint, each wrapping the NekoBox
 * CustomBean JSON with the sing-box wireguard outbound (the ticket-06
 * legacy shape + the §2.2 fields) as `cs`. See renderNeko.
 *
 * Ticket 08 ships `wg` and `awg`:
 *   - `wg`  — a ZIP archive (application/zip, storeless — see zip.js) of
 *     one `.conf` per valid endpoint for the official WireGuard app
 *     (§2.6: Android imports a .zip of confs). Conf = standard WG
 *     [Interface] (PrivateKey, Address, DNS 1.1.1.1, MTU 1280) + [Peer]
 *     (PublicKey, Endpoint, AllowedIPs 0.0.0.0/0, ::/0); when the stored
 *     AWG record is enabled, the [Interface] also carries the AmneziaWG
 *     Jc/Jmin/Jmax/S1–S4/H1–H4 lines (empty params omitted) and the
 *     I1–I5 CPS lines verbatim — the J/S/H/I line style matching the
 *     legacy buildWireguard format (api-handler.js; read-only).
 *   - `awg` — base64 (whole-blob /sub envelope) of one `awg://` link per
 *     valid endpoint for LxBox/INCY-style clients (§2.5 community scheme:
 *     awg://<base64url of the conf>#name). The conf carries the stored
 *     AWG params when the record is enabled, else a plain WireGuard conf —
 *     the toggle governs which formats carry obfuscation (clash, wg-zip
 *     and awg renderers all go plain when off). See renderAwg / buildAwgLink.
 * Ticket 06 shipped the `singbox` format — a full minimal sing-box
 * `config.json` for SFA/SFI remote profiles: the 1.13+ WireGuard
 * ENDPOINT shape by default, the pre-1.13 wireguard OUTBOUND shape under
 * `?legacy=1` (NekoBox Android / Husi). See renderSingbox.
 *
 * Ticket 04 shipped the `sub` format — the wireguard:// link family:
 *
 *   opts.scheme = 'wireguard' (default)  — one v2rayN-family `wireguard://`
 *     link per valid endpoint: private key in userinfo (url-encoded),
 *     `publickey` / `address` (v4[+v6] CIDRs from the account record) / `mtu`
 *     / `reserved` (base64 of the WARP client id) in the query, fragment =
 *     the endpoint. Payload shape per docs/research/sub-formats.md §2.1
 *     (WireguardFmt.cs; juerson sample).
 *
 *   opts.scheme = 'wg'                   — Throne-style `wg://` links: the
 *     legacy buildThrone line shape from worker/api-handler.js, replicated
 *     here verbatim (api-handler.js is NOT modified; output parity is a
 *     spec requirement). The AmneziaWG junk-packet params are hardcoded
 *     legacy values — parity, not the AWG settings record.
 *
 * Endpoint semantics (spec): one config per VALID endpoint line; malformed
 * lines are already flagged by settings.js at save time — the renderer
 * skips anything that does not look like `{host, port}` and never errors
 * on it. Zero valid endpoints → the two known-good defaults. Full tunnel
 * and DNS 1.1.1.1 are implicit for both link formats (v2rayN/Throne tunnel
 * everything by default); MTU 1280 and the client addresses come from the
 * account record.
 *
 * Payload convention: base64 of the newline-joined link list
 * (content-type text/plain). v2rayN-family clients auto-detect plain vs
 * base64 (SubscriptionHandler tries base64 first, falls back to plain
 * links); base64 matches the reference implementation (juerson
 * wireguard-subconverter-worker serves base64 for ?target=v2rayn) and is
 * opaque against line-mangling by intermediate proxies. See results/04.
 */

import { Buffer } from 'buffer';
import { buildZip } from './zip.js';

/** The registered WARP peer public key — same constant the legacy builders use. */
export const WARP_PUB = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=';

export const SUB_MTU = 1280;

/**
 * Known-good fallback endpoints (spec — Endpoint semantics). Used when the
 * stored endpoint list has zero valid lines (absent, empty, or all
 * malformed).
 */
export const DEFAULT_ENDPOINTS = [
  { host: '162.159.192.1', port: 2408, raw: '162.159.192.1:2408' },
  { host: 'engage.cloudflareclient.com', port: 2408, raw: 'engage.cloudflareclient.com:2408' },
];

/** Errors thrown by this module carry a renderer-readable message. */
export class SubscriptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/** The URI authority for an endpoint: IPv6 hosts get re-bracketed. */
function authorityOf(ep) {
  const host = ep.host.includes(':') ? `[${ep.host}]` : ep.host;
  return `${host}:${ep.port}`;
}

/**
 * Keep only well-formed endpoints; anything else is skipped (never an
 * error). Zero valid endpoints → the fallback list.
 */
export function resolveEndpoints(endpoints) {
  if (!Array.isArray(endpoints)) return DEFAULT_ENDPOINTS;
  const valid = endpoints.filter(
    (ep) => ep && typeof ep.host === 'string' && ep.host !== '' && Number.isInteger(ep.port) && ep.port >= 1 && ep.port <= 65535,
  );
  return valid.length > 0 ? valid : DEFAULT_ENDPOINTS;
}

/** The comma-separated client addresses (CIDRs) from the account record. */
function clientAddresses(account) {
  const addresses = [`${account.v4}/32`];
  if (account.v6) addresses.push(`${account.v6}/128`);
  return addresses.join(',');
}

// ---- wireguard:// (v2rayN family, sub-formats.md §2.1) ----

/**
 * One v2rayN `wireguard://` link per endpoint:
 *   wireguard://<private-key>@<host>[:port]/?publickey=<b64>&address=<cidrs>&mtu=1280&reserved=<b64>#<endpoint>
 * Private key in userinfo; publickey / address / mtu / reserved in the query;
 * fragment is the endpoint (the client's remark). Everything but the
 * authority is url-encoded, exactly like the §2.1 sample (`/`→%2F, `+`→%2B,
 * `=`→%3D, `,`→%2C, `:`→%3A).
 *
 * `reserved` is the base64 WARP client id — v2rayN's WireguardFmt parses it
 * and WARP rejects the handshake without it (audit fix: the param was
 * missing). Same bytes the other renderers derive from the record: the
 * record's base64 when set, else the [0,0,0] → "AAAA" convention (see
 * reservedToBytes) — re-encoded through the bytes so the query value is
 * always valid base64.
 */
export function buildWireguardLink(account, ep) {
  const authority = authorityOf(ep);
  const reserved = Buffer.from(reservedToBytes(account.reserved)).toString('base64');
  return (
    `wireguard://${encodeURIComponent(account.privateKey)}@${authority}/` +
    `?publickey=${encodeURIComponent(account.peerPublicKey)}` +
    `&address=${encodeURIComponent(clientAddresses(account))}` +
    `&mtu=${SUB_MTU}` +
    `&reserved=${encodeURIComponent(reserved)}` +
    `#${encodeURIComponent(authority)}`
  );
}

// ---- wg:// (Throne — literal parity with the legacy buildThrone) ----

/** Legacy reserved→dashed (api-handler.js reservedToDashed/reservedToBytes). */
function reservedToDashed(reserved) {
  if (!reserved) return '0-0-0';
  try { return Array.from(Buffer.from(reserved, 'base64')).join('-'); }
  catch { return '0-0-0'; }
}

/**
 * The Throne wg:// line, byte-identical to what buildThrone in
 * worker/api-handler.js produces for the same inputs (parity per spec; the
 * legacy file is not modified). `peer_public_key` is the WARP_PUB constant
 * the legacy builder hardcodes; the junk-packet/magic-header params are the
 * legacy literals. Deviation from buildThrone, only for the case it cannot
 * hit: when the record has no v6, `local_address` is just `<v4>/32`
 * (buildThrone would emit `/32-/128` — Cloudflare always sends v6).
 */
export function buildThroneLink(account, ep) {
  const key = account.privateKey.replace(/=$/, '');
  const reserved = reservedToDashed(account.reserved);
  const authority = authorityOf(ep);
  const localAddress = account.v6 ? `${account.v4}/32-${account.v6}/128` : `${account.v4}/32`;
  return (
    `wg://${authority}?private_key=${key}%3D` +
    `&peer_public_key=${encodeURIComponent(WARP_PUB)}` +
    `&pre_shared_key=&reserved=${reserved}&persistent_keepalive=0&mtu=${SUB_MTU}` +
    `&use_system_interface=false&local_address=${localAddress}&workers=0` +
    `&enable_amnezia=true&junk_packet_count=4&junk_packet_min_size=40&junk_packet_max_size=70` +
    `&init_packet_junk_size=0&response_packet_junk_size=0` +
    `&init_packet_magic_header=1&response_packet_magic_header=2` +
    `&underload_packet_magic_header=3&transport_packet_magic_header=4#WARP`
  );
}

// ---- clash (Clash Meta / Mihomo — sub-formats.md §2.4) ----

/**
 * Legacy reserved→bytes (api-handler.js reservedToBytes, unmodified):
 * base64-decode the record's reserved field to the `[a,b,c]` bytes clash
 * expects. Empty or unparseable → [0,0,0]. Note: a record whose reserved
 * does not decode to exactly 3 bytes would produce a different-length
 * array here (same as the legacy builder) — mihomo rejects non-3-byte
 * `reserved`, but WARP's client_id always decodes to 3 bytes.
 */
function reservedToBytes(reserved) {
  if (!reserved) return [0, 0, 0];
  try { return Array.from(Buffer.from(reserved, 'base64')); }
  catch { return [0, 0, 0]; }
}

/** The endpoint's proxy name — `warp-<host>:<port>` (IPv6 re-bracketed). */
function proxyNameOf(ep) {
  return `warp-${authorityOf(ep)}`;
}

/**
 * The mihomo `amnezia-wg-option` block lines (already indented for the
 * proxy body), or null when AWG is off/absent. Only the keys mihomo's
 * AmneziaWGOption documents are emitted: jc/jmin/jmax/s1–s4 (ints),
 * h1–h4 (strings — numeric or v2 range form) and i1–i5 (CPS chains).
 * Empty fields are omitted entirely (mihomo's genIpcConf likewise skips
 * zero/empty option values). The settings record stores I1–I5 as full
 * .conf lines ("I1 = <b 0x…>", see settings.js); clash's `i` values are
 * the chain alone (mihomo passes the YAML value verbatim into the
 * amneziawg-go uapi `i1=…` line, which parses `<tag …>` elements), so the
 * "I<n> = " prefix is stripped here. No non-empty values → null (a bare
 * `amnezia-wg-option:` would parse as nil and be treated as absent
 * anyway).
 */
export function buildAmneziaWgOption(awg) {
  if (!awg || awg.enabled !== true) return null;
  const NUMERIC = [['Jc', 'jc'], ['Jmin', 'jmin'], ['Jmax', 'jmax'], ['S1', 's1'], ['S2', 's2'], ['S3', 's3'], ['S4', 's4']];
  const STRING = [['H1', 'h1'], ['H2', 'h2'], ['H3', 'h3'], ['H4', 'h4'], ['I1', 'i1'], ['I2', 'i2'], ['I3', 'i3'], ['I4', 'i4'], ['I5', 'i5']];
  const out = [];
  for (const [stored, yaml] of NUMERIC) {
    const v = awg[stored];
    if (typeof v === 'string' && /^\d+$/.test(v) && v !== '') out.push(`      ${yaml}: ${v}`);
  }
  for (const [stored, yaml] of STRING) {
    const v = awg[stored];
    if (typeof v !== 'string' || v === '') continue;
    const chain = v.replace(/^I[1-5]\s*=\s*/, ''); // .conf "I<n> = " prefix → bare chain
    out.push(`      ${yaml}: ${yamlQuote(chain)}`);
  }
  return out.length > 0 ? out : null;
}

/** Double-quote a YAML scalar (values here never contain quotes/backslashes). */
function yamlQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * One `type: wireguard` proxy block for an endpoint — the §2.4 shape
 * (name/type/server/port/ip[+ipv6]/private-key/public-key/reserved/udp/
 * mtu/remote-dns-resolve/dns, then amnezia-wg-option when AWG is on).
 * `server` is the stored host (IPv6 unbracketed — settings.js stores it
 * bracket-free; the bracketed form is only for the name/authority).`
 */
export function buildClashProxy(account, ep, awg) {
  const lines = [
    `  - name: ${yamlQuote(proxyNameOf(ep))}`,
    '    type: wireguard',
    `    server: ${yamlQuote(ep.host)}`,
    `    port: ${ep.port}`,
    `    ip: ${yamlQuote(account.v4)}`,
  ];
  if (account.v6) lines.push(`    ipv6: ${yamlQuote(account.v6)}`);
  lines.push(
    `    private-key: ${yamlQuote(account.privateKey)}`,
    `    public-key: ${yamlQuote(account.peerPublicKey)}`,
    `    reserved: [${reservedToBytes(account.reserved).join(',')}]`,
    '    udp: true',
    `    mtu: ${SUB_MTU}`,
    '    remote-dns-resolve: true',
    '    dns: [1.1.1.1]',
  );
  const awgOption = buildAmneziaWgOption(awg);
  if (awgOption) {
    lines.push('    amnezia-wg-option:');
    lines.push(...awgOption);
  }
  return lines.join('\n');
}

/**
 * The clash renderer: raw YAML (never base64), one wireguard proxy per
 * valid endpoint, a minimal `proxy-groups` (one select group `PROXY` with
 * every proxy name) and `rules` (MATCH,PROXY). Endpoint semantics are
 * identical to the `sub` renderer (resolveEndpoints — malformed skipped,
 * zero valid → the fallback pair). `awg` enables per-proxy
 * amnezia-wg-option. Content-type matches the reference implementation
 * (juerson wireguard-subconverter-worker serves clash as
 * text/plain; charset=utf-8); clash clients parse the body as YAML
 * regardless of content type.
 */
export function renderClash(opts, { account, endpoints, awg } = {}) {
  if (!account || typeof account.privateKey !== 'string' || !account.privateKey) {
    throw new SubscriptionError('No WARP account stored — register one in the panel first.');
  }
  const eps = resolveEndpoints(endpoints);
  const body = [
    'proxies:',
    ...eps.map((ep) => buildClashProxy(account, ep, awg)),
    'proxy-groups:',
    '  - name: "PROXY"',
    '    type: select',
    '    proxies:',
    ...eps.map((ep) => `      - ${yamlQuote(proxyNameOf(ep))}`),
    'rules:',
    '  - MATCH,PROXY',
    '',
  ].join('\n');
  return { body, contentType: 'text/plain; charset=utf-8' };
}

// ---- singbox (SFA/SFI remote profile — sub-formats.md §2.3) ----

/**
 * The client addresses as a CIDR array — v4/32 plus v6/128 when the
 * account record has v6. Used as the endpoint `address` and the legacy
 * outbound `local_address`.
 */
function clientAddressCidrs(account) {
  const addresses = [`${account.v4}/32`];
  if (account.v6) addresses.push(`${account.v6}/128`);
  return addresses;
}

/**
 * One `endpoints` entry per endpoint — the sing-box 1.13+ WireGuard
 * endpoint shape (research §2.3 second block; verified against
 * sing-box.sagernet.org/configuration/endpoint/wireguard/ and the option
 * source): type wireguard, tag `warp-<host>:<port>` (the same naming
 * convention as the clash proxies; IPv6 hosts re-bracketed in the tag
 * only — the peer `address` is the bare host), `mtu` 1280, `address` =
 * the account client CIDRs, `private_key`, and exactly one peer carrying
 * the server address/port, the peer public key, full-tunnel
 * `allowed_ips` ["0.0.0.0/0", "::/0"] and the reserved bytes. `system`
 * stays at its default (false — userspace) so the profile needs no
 * privileges on any platform.
 */
export function buildSingboxEndpoint(account, ep) {
  return {
    type: 'wireguard',
    tag: proxyNameOf(ep),
    mtu: SUB_MTU,
    address: clientAddressCidrs(account),
    private_key: account.privateKey,
    peers: [
      {
        address: ep.host,
        port: ep.port,
        public_key: account.peerPublicKey,
        allowed_ips: ['0.0.0.0/0', '::/0'],
        reserved: reservedToBytes(account.reserved),
      },
    ],
  };
}

/**
 * The pre-1.13 wireguard OUTBOUND shape (research §2.3 first block), used
 * under `?legacy=1` — NekoBox Android and Husi parse the `outbounds`
 * list of a sing-box JSON and need the classic fields
 * (server/server_port/local_address/private_key/peer_public_key/
 * reserved/mtu). Same tag convention, account values and MTU as the
 * endpoint entry — only the shape differs.
 */
export function buildLegacyWireguardOutbound(account, ep) {
  return {
    type: 'wireguard',
    tag: proxyNameOf(ep),
    server: ep.host,
    server_port: ep.port,
    local_address: clientAddressCidrs(account),
    private_key: account.privateKey,
    peer_public_key: account.peerPublicKey,
    reserved: reservedToBytes(account.reserved),
    mtu: SUB_MTU,
  };
}

/** One select group over the endpoint tags; default = the first. */
function buildSelector(tags) {
  return { type: 'selector', tag: 'select', outbounds: tags, default: tags[0] };
}

/**
 * The minimal runnable-profile skeleton shared by both payloads:
 *   log      — info + timestamps (the standard for GUI clients).
 *   dns      — 1.1.1.1, tagged, as the `final` resolver. The server entry
 *              uses the era-correct schema: the typed form
 *              (`type: "udp"`, canonical since 1.12) for the 1.13+
 *              payload — the legacy `address` form was REMOVED in
 *              sing-box 1.14 — and the legacy `address` form (still
 *              accepted up to 1.13) for the legacy payload.
 *   inbounds — one `mixed` inbound on 0.0.0.0:2080: SOCKS+HTTP on one
 *              port, no privileges and no per-platform tuning. (A `tun`
 *              inbound needs VPN permission + platform-specific
 *              auto_route/stack options, so it is the operator's choice
 *              to layer on top, not part of the minimal skeleton.)
 *   outbounds— one `selector` over the endpoint tags, default = the
 *              first endpoint. Selectors resolve endpoint tags through
 *              the outbound manager (endpoints and outbounds share one
 *              tag namespace — adapter/outbound/manager.go falls back to
 *              the endpoint manager), and SFA/SFI render a dashboard
 *              group for selector outbounds (clients/general docs), so
 *              subscribers can switch endpoints without re-importing.
 *   route    — `final` = the selector: full tunnel through the chosen
 *              endpoint.
 */
function buildSingboxSkeleton(tags, legacy) {
  return {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: legacy
        ? [{ tag: 'cloudflare-dns', address: '1.1.1.1' }]
        : [{ type: 'udp', tag: 'cloudflare-dns', server: '1.1.1.1' }],
      final: 'cloudflare-dns',
    },
    inbounds: [{ type: 'mixed', tag: 'mixed-in', listen: '0.0.0.0', listen_port: 2080 }],
    outbounds: [buildSelector(tags)],
    route: { final: 'select' },
  };
}

/**
 * The sing-box renderer: a full minimal `config.json` (raw JSON, never
 * base64) for SFA/SFI remote profiles (research §2.3 + §3; the client
 * docs require the profile to be a single remote sing-box config.json).
 * Default payload: the 1.13+ WireGuard ENDPOINT shape — one `endpoints`
 * entry per valid endpoint plus the skeleton above. `?legacy=1`: the
 * same skeleton with the pre-1.13 wireguard OUTBOUND shape as the
 * `outbounds` entries (NekoBox Android / Husi — the research notes both
 * parse the outbound list of a sing-box JSON). Endpoint semantics are
 * identical to the other renderers (resolveEndpoints — malformed
 * skipped, zero valid → the fallback pair). `awg` is accepted for seam
 * uniformity but ignored: sing-box cannot express AmneziaWG (same as
 * the `sub` link formats).
 */
export function renderSingbox(opts, { account, endpoints } = {}) {
  if (!account || typeof account.privateKey !== 'string' || !account.privateKey) {
    throw new SubscriptionError('No WARP account stored — register one in the panel first.');
  }
  const legacy = !!(opts && opts.legacy === '1');
  const eps = resolveEndpoints(endpoints);
  const tags = eps.map((ep) => proxyNameOf(ep));
  const config = buildSingboxSkeleton(tags, legacy);
  if (legacy) {
    config.outbounds = [
      ...eps.map((ep) => buildLegacyWireguardOutbound(account, ep)),
      ...config.outbounds,
    ];
  } else {
    config.endpoints = eps.map((ep) => buildSingboxEndpoint(account, ep));
  }
  const body = `${JSON.stringify(config, null, 2)}\n`;
  return { body, contentType: 'application/json; charset=utf-8' };
}

// ---- neko (NekoBox desktop — sub-formats.md §2.2) ----

/**
 * URL-safe base64 (RFC 4648 §5): standard base64 with `+`→`-`, `/`→`_`,
 * padding retained. NekoBox desktop REQUIRES this alphabet for the
 * custom-link fragment: its share writer uses Base64UrlEncoding
 * (AbstractBean::ToNekorayShareLink) and its importer rejects the
 * standard alphabet outright (`+`/`/` are IllegalCharacter under
 * Base64UrlEncoding — sub/GroupUpdater.cpp → 3rdparty/base64.cpp), so
 * standard base64 would silently drop every imported profile.
 */
function toUrlSafeBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * The `cs` JSON for one endpoint: the ticket-06 pre-1.13 wireguard
 * OUTBOUND object (same builder — values identical to the ?legacy=1
 * outbound by construction) plus the three fields the §2.2 sample
 * carries that the legacy outbound shape omits: `system_interface` false
 * (userspace — the NekoBox GUI default), NekoBox's `interface_name`
 * "warp-wg" (only consulted when system_interface is true, but the
 * sample emits it), and `pre_shared_key` "" (the sample's explicit
 * empty). The `tag` is the per-endpoint warp-<host>:<port> convention
 * shared by every renderer (deviation from the sample's static
 * "wireguard-out" — NekoBox feeds the cs JSON to the core as the
 * profile's outbound, so the tag is the outbound id; per-endpoint tags
 * keep one-per-link imports distinguishable).
 */
function buildNekoCs(account, ep) {
  return {
    ...buildLegacyWireguardOutbound(account, ep),
    system_interface: false,
    interface_name: 'warp-wg',
    pre_shared_key: '',
  };
}

/**
 * One `nekoray://custom#` link (sub-formats.md §2.2; fields verified
 * against nekoray fmt/CustomBean.hpp + fmt/AbstractBean.cpp): the
 * CustomBean JSON — `_v` 0 (CustomBean default), `addr` "127.0.0.1" +
 * `port` 1080 (the local SOCKS listen address/port the desktop client
 * maps the profile to; sample values — NekoBox re-allocates per running
 * profile), `cmd` [""] (external-core command list; unused for
 * core "internal"), `core` "internal" (the bundled sing-box core),
 * `cs` = the wireguard outbound JSON as a STRING, `mapping_port`/`socks_port`
 * 0 (external-core mapping only), `name` = `warp-<host>:<port>` (IPv6
 * re-bracketed) — URL-safe base64 of the whole JSON as the fragment
 * (see toUrlSafeBase64). NekoBox's import path parses the fragment as
 * the bean JSON (GroupUpdater RawUpdater: nekoray:// → host "custom" →
 * NewProxyEntity("custom") → FromJsonBytes(DecodeB64IfValid(fragment)))
 * and feeds `cs` straight into the core as the outbound object
 * (CustomBean::BuildCoreObjSingBox).
 */
export function buildNekoLink(account, ep) {
  const bean = {
    _v: 0,
    addr: '127.0.0.1',
    cmd: [''],
    core: 'internal',
    cs: JSON.stringify(buildNekoCs(account, ep)),
    mapping_port: 0,
    name: proxyNameOf(ep),
    port: 1080,
    socks_port: 0,
  };
  return `nekoray://custom#${toUrlSafeBase64(JSON.stringify(bean))}`;
}

/**
 * The NekoBox desktop renderer: base64 of newline-joined
 * `nekoray://custom#` links, one per valid endpoint — the same envelope
 * convention as `/sub` (the desktop updater tries whole-body base64
 * first, then raw multi-line; sub/GroupUpdater.cpp). Endpoint semantics
 * are identical to every other renderer (resolveEndpoints — malformed
 * skipped, zero valid → the fallback pair). `awg` is accepted for seam
 * uniformity but ignored: the wrapped sing-box wireguard outbound cannot
 * express AmneziaWG (same as `sub`/`singbox`).
 */
export function renderNeko(opts, { account, endpoints } = {}) {
  if (!account || typeof account.privateKey !== 'string' || !account.privateKey) {
    throw new SubscriptionError('No WARP account stored — register one in the panel first.');
  }
  const lines = resolveEndpoints(endpoints).map((ep) => buildNekoLink(account, ep));
  const body = Buffer.from(lines.join('\n')).toString('base64');
  return { body, contentType: 'text/plain; charset=utf-8' };
}

// ---- wg (ZIP of .confs — official WireGuard app, sub-formats.md §2.6) ----

/** DNS line for the .conf files (the ticket's fixed value). */
export const CONF_DNS = '1.1.1.1';

/** Full-tunnel AllowedIPs line for the .conf files (spec). */
export const CONF_ALLOWED_IPS = '0.0.0.0/0, ::/0';

/**
 * The .conf Address line: v4/32 plus v6/128 when the record has v6 (the
 * same CIDR form every other renderer uses — sub links, clash ip, singbox
 * address). The legacy buildWireguard emitted bare addresses; the official
 * app's parser (ipaddress.c parse_cidr) defaults a bare address to /32, so
 * both work — CIDR is the unambiguous standard for .conf files.
 */
function confAddress(account) {
  const addresses = [`${account.v4}/32`];
  if (account.v6) addresses.push(`${account.v6}/128`);
  return addresses.join(', ');
}

/**
 * One AmneziaWG param line per stored field, in the canonical conf order
 * (Jc, Jmin, Jmax, S1–S4, H1–H4, I1–I5 — the order per docs.amnezia.org
 * and the ticket), formatted exactly like the legacy buildWireguard lines
 * (`Jc = 4`, `I1 = <b 0x…>` — the settings record stores I1–I5 as full
 * CPS lines, emitted as-is). Empty params are omitted entirely. AWG off or
 * absent → [] (plain WireGuard conf).
 */
export function awgConfLines(awg) {
  if (!awg || awg.enabled !== true) return [];
  const ORDER = ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4', 'I1', 'I2', 'I3', 'I4', 'I5'];
  const lines = [];
  for (const field of ORDER) {
    const value = awg[field];
    if (typeof value !== 'string' || value === '') continue;
    // I1–I5 are stored as COMPLETE CPS lines ("I1 = <b 0x…>", see
    // settings.js) — emitted as-is; the J/S/H fields are bare values that
    // get the legacy `Field = value` wrapping.
    lines.push(field.startsWith('I') ? value : `${field} = ${value}`);
  }
  return lines;
}

/**
 * Safe .conf filename for an endpoint: `warp-<host>-<port>.conf` with
 * every character outside [a-zA-Z0-9.-] replaced by `-` — IPv6 colons
 * (`2606:4700:…` → `2606-4700-…`), brackets and any path separators are
 * neutralized, so the name can never smuggle a path (`../`, `C:\`): zip
 * entry names are extracted to the filesystem by the importing app.
 */
export function confFileNameOf(ep) {
  const host = String(ep.host)
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .replace(/\.{2,}/g, '.'); // no dot-dot runs (zip names are extracted to a filesystem)
  return `warp-${host || 'endpoint'}-${ep.port}.conf`;
}

/**
 * One .conf for an endpoint — standard WireGuard [Interface]/[Peer]
 * (PrivateKey, Address v4[/v6], DNS 1.1.1.1, MTU 1280; PublicKey,
 * Endpoint, AllowedIPs 0.0.0.0/0, ::/0 — full tunnel); the AmneziaWG
 * lines slot between MTU and [Peer] when `awg` is enabled (same position
 * as the legacy builder). IPv6 endpoints are re-bracketed in the Endpoint
 * line (settings.js stores the host bracket-free). No trailing newline,
 * matching the legacy buildWireguard output.
 */
export function buildWgConf(account, ep, awg) {
  const lines = [
    '[Interface]',
    `PrivateKey = ${account.privateKey}`,
    `Address = ${confAddress(account)}`,
    `DNS = ${CONF_DNS}`,
    `MTU = ${SUB_MTU}`,
    ...awgConfLines(awg),
    '',
    '[Peer]',
    `PublicKey = ${account.peerPublicKey}`,
    `AllowedIPs = ${CONF_ALLOWED_IPS}`,
    `Endpoint = ${authorityOf(ep)}`,
  ];
  return lines.join('\n');
}

/**
 * The wg renderer: a ZIP archive (application/zip — the first binary
 * payload in the registry) containing one .conf per valid endpoint. The
 * WireGuard Android app imports a .zip of .confs directly (§2.6); the
 * archive is storeless (zip.js) — no compression dependency in the
 * bundle. Endpoint semantics are identical to every other renderer
 * (resolveEndpoints — malformed skipped, zero valid → the fallback pair).
 * `awg` enables the J/S/H/I lines inside each conf.
 */
export function renderWg(opts, { account, endpoints, awg } = {}) {
  if (!account || typeof account.privateKey !== 'string' || !account.privateKey) {
    throw new SubscriptionError('No WARP account stored — register one in the panel first.');
  }
  const entries = resolveEndpoints(endpoints).map((ep) => ({
    name: confFileNameOf(ep),
    data: buildWgConf(account, ep, awg),
  }));
  return { body: buildZip(entries), contentType: 'application/zip' };
}

// ---- awg (awg:// links — LxBox/INCY, sub-formats.md §2.5) ----

/**
 * One awg:// link (community scheme §2.5, docs.incy.cc / LxBox):
 *   awg://<base64url of the .conf>#<name>
 * The conf is the stored AWG conf when the record is enabled (buildWgConf
 * with the record), else a plain WireGuard conf — the AWG toggle governs
 * obfuscation here too. The segment is padded URL-safe base64 (the
 * same RFC 4648 §5 alphabet the neko fragment uses; padding retained —
 * decoders accept it, and the round-trip is exact). `#name` = the shared
 * `warp-<host>:<port>` convention (IPv6 re-bracketed), matching the zip
 * filenames (minus .conf) and the clash/singbox tags — a subscriber can
 * correlate one endpoint across every format.
 */
export function buildAwgLink(account, ep, awg) {
  const effective = awg && awg.enabled === true ? awg : null;
  const conf = buildWgConf(account, ep, effective);
  return `awg://${toUrlSafeBase64(conf)}#${proxyNameOf(ep)}`;
}

/**
 * The awg renderer: base64 (whole-blob /sub envelope) of one awg:// link
 * per valid endpoint. Endpoint semantics identical to every other
 * renderer. The link carries AWG params only when the stored record is
 * enabled (buildAwgLink); off → plain confs, like the wg-zip renderer.
 */
export function renderAwg(opts, { account, endpoints, awg } = {}) {
  if (!account || typeof account.privateKey !== 'string' || !account.privateKey) {
    throw new SubscriptionError('No WARP account stored — register one in the panel first.');
  }
  const lines = resolveEndpoints(endpoints).map((ep) => buildAwgLink(account, ep, awg));
  const body = Buffer.from(lines.join('\n')).toString('base64');
  return { body, contentType: 'text/plain; charset=utf-8' };
}

// ---- the `sub` renderer ----

/**
 * The wireguard:// family: base64 of newline-joined links, one per valid
 * endpoint. `opts.scheme` picks the variant — anything but 'wg' defaults
 * to 'wireguard'. `awg` is accepted for seam uniformity but ignored: the
 * link formats cannot express AWG settings (Throne's junk params are
 * legacy parity values, see buildThroneLink).
 */
export function renderSub(opts, { account, endpoints } = {}) {
  if (!account || typeof account.privateKey !== 'string' || !account.privateKey) {
    throw new SubscriptionError('No WARP account stored — register one in the panel first.');
  }
  const scheme = opts && opts.scheme === 'wg' ? 'wg' : 'wireguard';
  const buildLink = scheme === 'wg' ? buildThroneLink : buildWireguardLink;
  const lines = resolveEndpoints(endpoints).map((ep) => buildLink(account, ep));
  const body = Buffer.from(lines.join('\n')).toString('base64');
  return { body, contentType: 'text/plain; charset=utf-8' };
}

// ---- the seam (registry — later tickets add entries) ----

const RENDERERS = {
  sub: renderSub,
  clash: renderClash,
  singbox: renderSingbox,
  neko: renderNeko,
  wg: renderWg,
  awg: renderAwg,
};

/**
 * renderSubscription(format, opts, { account, endpoints, awg }) → { body, contentType }
 * The subscription seam (spec). Pure: no fetch, no env, no KV. Unknown
 * format → SubscriptionError.
 */
export function renderSubscription(format, opts, data) {
  const renderer = RENDERERS[format];
  if (!renderer) throw new SubscriptionError(`Unknown subscription format: "${format}".`);
  return renderer(opts || {}, data || {});
}