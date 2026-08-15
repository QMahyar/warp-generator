/**
 * Subscription renderers (ticket 04) — the `renderSubscription` seam.
 *
 * renderSubscription(format, opts, { account, endpoints, awg }) → { body, contentType }
 *
 * The single seam every subscription format renders through (spec —
 * "Implementation Decisions → Seam"). Pure: no fetch, no env, no KV — the
 * route handlers read KV and pass plain data in. Later tickets add more
 * renderers to the RENDERERS registry (clash, singbox, neko, wg-zip, awg).
 *
 * This ticket ships the `sub` format — the wireguard:// link family:
 *
 *   opts.scheme = 'wireguard' (default)  — one v2rayN-family `wireguard://`
 *     link per valid endpoint: private key in userinfo (url-encoded),
 *     `publickey` / `address` (v4[+v6] CIDRs from the account record) / `mtu`
 *     in the query, fragment = the endpoint. Payload shape per
 *     docs/research/sub-formats.md §2.1 (WireguardFmt.cs; juerson sample).
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
 *   wireguard://<private-key>@<host>[:port]/?publickey=<b64>&address=<cidrs>&mtu=1280#<endpoint>
 * Private key in userinfo; publickey / address / mtu in the query; fragment
 * is the endpoint (the client's remark). Everything but the authority is
 * url-encoded, exactly like the §2.1 sample (`/`→%2F, `+`→%2B, `=`→%3D,
 * `,`→%2C, `:`→%3A).
 */
export function buildWireguardLink(account, ep) {
  const authority = authorityOf(ep);
  return (
    `wireguard://${encodeURIComponent(account.privateKey)}@${authority}/` +
    `?publickey=${encodeURIComponent(account.peerPublicKey)}` +
    `&address=${encodeURIComponent(clientAddresses(account))}` +
    `&mtu=${SUB_MTU}` +
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
  // Later tickets: clash, singbox, neko, wg (zip), awg.
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