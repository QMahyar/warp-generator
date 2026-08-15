/**
 * Minimal storeless ZIP writer (ticket 08 — /sub/wg).
 *
 * Produces a valid ZIP archive with STORED (uncompressed) entries: local
 * file headers + entry data, a central directory, and the end-of-central-
 * directory record. No compression, no third-party dependency, no stream
 * state — the writer is a pure function over `[{ name, data }]` and runs
 * identically under `node --test` and in the Worker bundle.
 *
 * Why storeless:
 *  - The payload is a handful of small .conf texts (a few hundred bytes
 *    each); deflate would save ~50% of a payload that is already tiny, at
 *    the cost of a compression dependency (package.json must stay
 *    untouched — and the Worker bundle has no zip library).
 *  - The official WireGuard Android importer (TunnelImporter.kt) walks
 *    zip entries with java.util.zip.ZipFile — it accepts stored entries
 *    without any special handling, and the archive is single-use (the app
 *    extracts every *.conf entry once at import).
 *  - Stored entries make the writer trivially checkable: every size field
 *    equals the entry byte length, method = 0, CRC-32 over the raw data.
 *
 * Layout (all integers little-endian, per the ZIP Appnote):
 *   [local file header + data]×n → [central directory] → [EOCD]
 *
 * Determinism: the last-mod date is fixed to 1980-01-01 and time to
 * midnight (a standard "unset" convention; DOS date 0x21), so identical
 * inputs produce byte-identical archives — golden tests and stable CDN
 * caching.
 */

const LOCAL_HEADER_SIZE = 30; // signature 0x04034b50 + 26 fixed bytes
const CENTRAL_HEADER_SIZE = 46; // signature 0x02014b50 + 42 fixed bytes
const EOCD_SIZE = 22; // signature 0x06054b50 + 18 fixed bytes
const FIXED_MOD_DATE = 0x21; // DOS date: 1980-01-01 (deterministic archives)

/** CRC-32 table (IEEE 802.3, reflected polynomial 0xEDB88320). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 over a byte array (init 0xFFFFFFFF, final XOR 0xFFFFFFFF). */
export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Build a ZIP archive from `[{ name, data }]` where `data` is a string or
 * Uint8Array. Entry names are UTF-8 encoded (ASCII in practice — see
 * confFileNameOf in sub.js). Returns the complete archive as a Uint8Array.
 * An empty entry list produces a valid archive with just the EOCD.
 */
export function buildZip(entries) {
  const enc = new TextEncoder();
  const prepared = entries.map((entry) => {
    const name = enc.encode(String(entry.name));
    const data = typeof entry.data === 'string' ? enc.encode(entry.data) : new Uint8Array(entry.data);
    return { name, data, crc: crc32(data) };
  });

  // Layout: local headers + data first, central directory after.
  let offset = 0;
  for (const e of prepared) {
    e.offset = offset;
    offset += LOCAL_HEADER_SIZE + e.name.length + e.data.length;
  }
  const centralOffset = offset;
  const centralSize = prepared.reduce((sum, e) => sum + CENTRAL_HEADER_SIZE + e.name.length, 0);
  const total = centralOffset + centralSize + EOCD_SIZE;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;

  for (const e of prepared) {
    // Local file header — PK\x03\x04, version 2.0, no flags, method 0.
    view.setUint32(pos, 0x04034b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2; // version needed to extract
    view.setUint16(pos, 0, true); pos += 2; // general purpose bit flag
    view.setUint16(pos, 0, true); pos += 2; // compression method: stored
    view.setUint16(pos, 0, true); pos += 2; // last mod time (midnight)
    view.setUint16(pos, FIXED_MOD_DATE, true); pos += 2;
    view.setUint32(pos, e.crc, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4; // compressed size == raw size
    view.setUint32(pos, e.data.length, true); pos += 4; // uncompressed size
    view.setUint16(pos, e.name.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2; // extra field length
    out.set(e.name, pos); pos += e.name.length;
    out.set(e.data, pos); pos += e.data.length;
  }

  const cdStart = pos;
  for (const e of prepared) {
    // Central directory header — PK\x01\x02.
    view.setUint32(pos, 0x02014b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2; // version made by
    view.setUint16(pos, 20, true); pos += 2; // version needed
    view.setUint16(pos, 0, true); pos += 2; // flags
    view.setUint16(pos, 0, true); pos += 2; // method: stored
    view.setUint16(pos, 0, true); pos += 2; // mod time
    view.setUint16(pos, FIXED_MOD_DATE, true); pos += 2;
    view.setUint32(pos, e.crc, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint16(pos, e.name.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2; // extra field length
    view.setUint16(pos, 0, true); pos += 2; // file comment length
    view.setUint16(pos, 0, true); pos += 2; // disk number start
    view.setUint16(pos, 0, true); pos += 2; // internal attrs
    view.setUint32(pos, 0, true); pos += 4; // external attrs
    view.setUint32(pos, e.offset, true); pos += 4; // local header offset
    out.set(e.name, pos); pos += e.name.length;
  }

  // End of central directory — PK\x05\x06.
  view.setUint32(pos, 0x06054b50, true); pos += 4;
  view.setUint16(pos, 0, true); pos += 2; // disk number
  view.setUint16(pos, 0, true); pos += 2; // disk with the central directory
  view.setUint16(pos, prepared.length, true); pos += 2; // entries on this disk
  view.setUint16(pos, prepared.length, true); pos += 2; // total entries
  view.setUint32(pos, centralSize, true); pos += 4;
  view.setUint32(pos, centralOffset, true); pos += 4;
  view.setUint16(pos, 0, true); pos += 2; // comment length

  return out;
}