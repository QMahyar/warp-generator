/**
 * Panel settings module (ticket 03) — endpoints list + AmneziaWG params.
 *
 * Owns the two mutable panel settings, both stored in KV, both written
 * only by panel actions (the Endpoints and AmneziaWG cards):
 *
 *  - ENDPOINTS binding, key "endpoints": the raw endpoint list text — one
 *    host:port per line, v4 / hostname / [IPv6] with any port. The value is
 *    stored VERBATIM (canonicalized: lines trimmed, blank lines dropped) so
 *    the editor round-trips what the operator typed. Malformed lines are
 *    FLAGGED (parseEndpointList) but never block saving — renderers skip
 *    them at serve time (ticket 04). An empty list is legal: nothing is
 *    stored, subscriptions fall back to default endpoints.
 *
 *  - AWG binding, key "awg": JSON `{ enabled, Jc, Jmin, Jmax, S1–S4,
 *    H1–H4, I1–I5 }` using the AmneziaWG conf names. All param values are
 *    strings (empty string = the line is omitted from rendered confs); the
 *    I values are full CPS lines ("I1 = <b 0x…>"). The key is ABSENT while
 *    AWG is off or unset — presence in KV IS the toggle.
 *
 * Validation bounds (per docs.amnezia.org/documentation/amnezia-wg, unless
 * noted): Jc 0–10 · Jmin/Jmax 1–4096 (docs say 64–1024 for AWG 2.0, but the
 * legacy builders here ship 40/70 — bounds widened to accept them) with
 * Jmin ≤ Jmax · S1–S3 0–64, S4 0–32 · H1–H4 0–4294967295 · I1–I5 empty or a
 * CPS line. Wildly off-range values are flagged, never rejected: the panel
 * flags but does not block (same principle as malformed endpoint lines).
 *
 * All exports are pure (parse/validate/read/write over an injected KV
 * binding with a get/put/delete interface), so they run identically in the
 * Worker and under `node --test`.
 */

export const ENDPOINTS_KV_KEY = 'endpoints';
export const AWG_KV_KEY = 'awg';

/** AmneziaWG defaults ported from the legacy builders (S3/S4 and I1–I5 unset). */
export const DEFAULT_AWG = {
  Jc: '4', Jmin: '40', Jmax: '70',
  S1: '0', S2: '0', S3: '', S4: '',
  H1: '1', H2: '2', H3: '3', H4: '4',
  I1: '', I2: '', I3: '', I4: '', I5: '',
};

const NUMERIC_FIELDS = ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4'];
const I_FIELDS = ['I1', 'I2', 'I3', 'I4', 'I5'];
export const AWG_FIELDS = [...NUMERIC_FIELDS, ...I_FIELDS];

/** Ranges per the AmneziaWG protocol docs (fields not listed = para args). */
const NUMERIC_RANGES = {
  Jc: [0, 10], // junk packet count
  Jmin: [1, 4096], Jmax: [1, 4096], // junk packet size bounds (see module header)
  S1: [0, 64], S2: [0, 64], S3: [0, 64], S4: [0, 32], // random prefix bytes
  H1: [0, 4294967295], H2: [0, 4294967295], H3: [0, 4294967295], H4: [0, 4294967295], // magic headers
};

/** Errors thrown by this module carry an operator-readable message. */
export class SettingsError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = 'SettingsError';
    this.status = status;
    if (cause !== null) this.cause = cause;
  }
}

// ---- endpoint line parsing (pure) ----

const IPv4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function isValidIPv4(host) {
  return IPv4_RE.test(host) && host.split('.').every((octet) => Number(octet) <= 255);
}

function isValidIPv6(host) {
  if (host.length === 0 || host.length > 45) return false;
  const parts = host.split(':');
  const emptyCount = parts.filter((p) => p === '').length;
  const hasDouble = host.includes('::');
  if (emptyCount > 2) return false;
  if (!hasDouble && emptyCount > 0) return false;
  if (emptyCount === 0 && parts.length !== 8) return false;
  if (emptyCount > 0 && parts.length > 8) return false;
  let seen = false;
  for (let i = 0; i < host.length - 1; i++) {
    if (host[i] === ':' && host[i + 1] === ':') {
      if (seen || host[i + 2] === ':') return false; // more than one '::' or ':::'
      seen = true;
    }
  }
  if (emptyCount > 0 && !seen) return false;
  for (const p of parts) {
    if (p !== '' && !/^[0-9a-fA-F]{1,4}$/.test(p)) return false;
  }
  return true;
}

function isValidPort(portPart) {
  if (!/^\d+$/.test(portPart)) return false;
  const n = Number(portPart);
  return n >= 1 && n <= 65535;
}

/**
 * Validate one endpoint line. Returns { ok:true, host, port, raw } for a
 * valid line; { ok:false, reason } for a malformed one; { skip:true } for a
 * blank line (never an error). IPv6 endpoints MUST be bracketed — a bare
 * v6 address with an embedded port is ambiguous, so it is flagged.
 */
export function validateEndpointLine(raw) {
  const line = String(raw).trim();
  if (line === '') return { skip: true };

  // [v6]:port
  const bracket = line.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracket) {
    if (!isValidIPv6(bracket[1])) return { ok: false, reason: `"${bracket[1]}" is not a valid IPv6 address.` };
    if (!isValidPort(bracket[2])) return { ok: false, reason: `Port out of range (1–65535): ${bracket[2]}.` };
    return { ok: true, host: bracket[1], port: Number(bracket[2]), raw: line };
  }

  const colonCount = (line.match(/:/g) || []).length;
  if (colonCount === 0) return { ok: false, reason: 'Missing port — expected host:port.' };
  if (line.includes('://')) return { ok: false, reason: 'Not a host:port line — schemes and paths are not allowed.' };
  if (line.startsWith('[')) return { ok: false, reason: 'Bracketed IPv6 must include a port: [addr]:port.' };
  if (colonCount > 1) return { ok: false, reason: 'IPv6 endpoints need brackets: [addr]:port.' };

  const idx = line.lastIndexOf(':');
  const host = line.slice(0, idx);
  const portPart = line.slice(idx + 1);
  if (host === '') return { ok: false, reason: 'Missing host before the port.' };
  if (!isValidPort(portPart)) return { ok: false, reason: `Port out of range (1–65535): "${portPart}".` };

  if (isValidIPv4(host)) return { ok: true, host, port: Number(portPart), raw: line };
  // Last label must contain a letter — rejects all-numeric labels (no numeric
  // TLDs) so typos like `999.1.1.1:2408` are flagged, not treated as hostnames.
  const lastLabel = host.slice(host.lastIndexOf('.') + 1);
  if (host.length <= 253 && HOSTNAME_RE.test(host) && /[a-zA-Z]/.test(lastLabel)) return { ok: true, host, port: Number(portPart), raw: line };
  return { ok: false, reason: `"${host}" is not a valid host (IPv4, hostname, or [IPv6]).` };
}

/**
 * Parse endpoint list text into valid endpoints and flagged lines.
 * Invalid lines never block the valid ones; blank lines are ignored.
 */
export function parseEndpointList(text) {
  const endpoints = [];
  const invalid = [];
  if (typeof text !== 'string') return { endpoints, invalid };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const result = validateEndpointLine(lines[i]);
    if (result.skip) continue;
    if (result.ok) endpoints.push({ host: result.host, port: result.port, raw: result.raw });
    else invalid.push({ index: i, line: String(lines[i]).trim(), reason: result.reason });
  }
  return { endpoints, invalid };
}

/**
 * Canonical form for storage: lines trimmed, blank lines dropped, joined
 * with \n. Malformed lines are PRESERVED (flagging is advisory; renderers
 * skip them), so saving never silently discards the operator's input.
 */
export function normalizeEndpointText(text) {
  if (typeof text !== 'string') return '';
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '').join('\n');
}

// ---- AWG params (pure) ----

/**
 * Normalize + validate a POST body for the AWG card.
 * `{ enabled: true|'true', Jc: '4', …, I1: 'I1 = <b 0x…>' }` → `{ awg }`.
 * `{ enabled: false }` (or anything else) → `{ awg: null }` (absent from KV).
 * Returns `{ awg, invalid }` — invalid is advisory, the record is still
 * returned so the panel can save verbatim and flag (see module header).
 */
export function parseAwgParams(body) {
  const invalid = [];
  const src = body && typeof body === 'object' ? body : {};
  const enabled = src.enabled === true || src.enabled === 'true';
  if (!enabled) return { awg: null, invalid };

  const awg = { enabled: true };
  for (const f of AWG_FIELDS) {
    awg[f] = src[f] === undefined || src[f] === null ? '' : String(src[f]).trim();
  }
  const sentAny = AWG_FIELDS.some((f) => src[f] !== undefined && src[f] !== null && String(src[f]) !== '');
  if (!sentAny) {
    for (const f of AWG_FIELDS) awg[f] = DEFAULT_AWG[f];
  }

  for (const f of NUMERIC_FIELDS) {
    const v = awg[f];
    if (v === '') continue;
    if (!/^\d+$/.test(v)) {
      invalid.push({ field: f, value: v, reason: `${f} must be an integer.` });
      continue;
    }
    const [lo, hi] = NUMERIC_RANGES[f];
    if (Number(v) < lo || Number(v) > hi) {
      invalid.push({ field: f, value: v, reason: `${f} out of range (${lo}–${hi}).` });
    }
  }
  const jmin = awg.Jmin === '' ? null : Number(awg.Jmin);
  const jmax = awg.Jmax === '' ? null : Number(awg.Jmax);
  if (jmin !== null && jmax !== null && jmin > jmax) {
    invalid.push({ field: 'Jmin', value: awg.Jmin, reason: 'Jmin must be ≤ Jmax.' });
  }

  const I_RE = /^I[1-5]\s*=\s*<b 0x[0-9a-fA-F]+>(?:\s*<[^<>]+>)*\s*$/i;
  for (const f of I_FIELDS) {
    const v = awg[f];
    if (v === '') continue;
    if (!I_RE.test(v)) {
      invalid.push({ field: f, value: v.length > 32 ? `${v.slice(0, 32)}…` : v, reason: `${f} must be a CPS line, e.g. "I1 = <b 0x…>".` });
    }
  }

  return { awg, invalid };
}

/** Shape check for AWG records read back from KV (corrupt/foreign → null). */
export function isValidAwgRecord(record) {
  if (!record || typeof record !== 'object' || record.enabled !== true) return false;
  for (const f of AWG_FIELDS) {
    if (typeof record[f] !== 'string') return false;
  }
  return true;
}

// ---- KV helpers (binding injected; fake-friendly for tests) ----

/**
 * Read the stored endpoint list; null when absent, empty, or the binding
 * is not configured. The parsed line flags are included so the card can
 * re-flag malformed lines on load.
 */
export async function readEndpoints(binding) {
  if (!binding) return null;
  const raw = await binding.get(ENDPOINTS_KV_KEY);
  if (raw == null) return null;
  const text = String(raw);
  const { endpoints, invalid } = parseEndpointList(text);
  return { text, count: endpoints.length, invalid };
}

/** Fail fast when the ENDPOINTS binding is not configured (before any write). */
export function assertEndpointBinding(binding) {
  if (!binding) {
    throw new SettingsError('ENDPOINTS KV binding is missing — add a kv_namespaces entry named ENDPOINTS (see wrangler.jsonc).');
  }
}

/**
 * Persist the endpoint list (canonical form). An empty list deletes the
 * key — absence is the legal "no endpoints" state. Returns the stored
 * shape (`{ text, count, invalid }`), equal to what readEndpoints yields
 * for the saved value.
 */
export async function writeEndpoints(binding, text) {
  assertEndpointBinding(binding);
  const canonical = normalizeEndpointText(text);
  if (canonical === '') {
    await binding.delete(ENDPOINTS_KV_KEY);
    return { text: '', count: 0, invalid: [] };
  }
  await binding.put(ENDPOINTS_KV_KEY, canonical);
  return readEndpoints(binding);
}

/** Read the stored AWG record; null when off, absent, corrupt or binding missing. */
export async function readAwg(binding) {
  if (!binding) return null;
  const raw = await binding.get(AWG_KV_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    return isValidAwgRecord(record) ? record : null;
  } catch {
    return null;
  }
}

/** Fail fast when the AWG binding is not configured (before any write). */
export function assertAwgBinding(binding) {
  if (!binding) {
    throw new SettingsError('AWG KV binding is missing — add a kv_namespaces entry named AWG (see wrangler.jsonc).');
  }
}

/**
 * Persist the AWG record. When disabled (or null), the key is DELETED —
 * "AWG off" and "AWG unset" are the same state: absent from KV.
 */
export async function writeAwg(binding, awg) {
  if (!awg || awg.enabled !== true) {
    // Disable/absent is a safe no-op without a binding — AWG off == AWG
    // unset (same state: key absent). Only ENABLING must fail fast.
    if (binding) await binding.delete(AWG_KV_KEY);
    return null;
  }
  assertAwgBinding(binding);
  await binding.put(AWG_KV_KEY, JSON.stringify(awg));
  return awg;
}