import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { inflateRawSync } from 'node:zlib';
import { testHooks, deepLinkUrl, formatsForClient, zipFindEntry, subscriptionHeaders } from '../_worker.js';

const hooks = testHooks();
const SOURCE = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');

const dashStart = SOURCE.indexOf('const DASHBOARD_HTML');
const dashEnd = SOURCE.indexOf('</html>`;', dashStart);
const DASH = SOURCE.slice(dashStart, dashEnd);

function parseSubFormats() {
  const block = DASH.match(/var SUB_FORMATS = \[([\s\S]*?)\];/);
  assert.ok(block, 'SUB_FORMATS array not found');
  return new Function('return [' + block[1] + '];')();
}
const SUB_FORMATS_UI = parseSubFormats();

test('deepLinkUrl: builds scheme + encoded subscription URL', () => {
  assert.equal(
    deepLinkUrl('https://x.workers.dev/sub/tok/clash', 'clash://install-subscription?url='),
    'clash://install-subscription?url=' + encodeURIComponent('https://x.workers.dev/sub/tok/clash')
  );
});

test('deepLinkUrl: encodes query strings and special chars in sub URL', () => {
  const out = deepLinkUrl('https://h/?a=1&b=2#frag', 'hiddify://import-subscription?url=');
  assert.ok(out.startsWith('hiddify://import-subscription?url='));
  assert.ok(out.includes('%3F'), 'query string percent-encoded');
  assert.ok(out.includes('%26'), 'ampersand percent-encoded');
  assert.ok(out.includes('%23'), 'hash percent-encoded');
  assert.equal(decodeURIComponent(out.slice('hiddify://import-subscription?url='.length)), 'https://h/?a=1&b=2#frag');
});

test('deepLinkUrl: rejects missing or invalid input', () => {
  assert.equal(deepLinkUrl('', 'clash://install-subscription?url='), null);
  assert.equal(deepLinkUrl('https://x/sub/t', ''), null);
  assert.equal(deepLinkUrl('https://x/sub/t', null), null);
  assert.equal(deepLinkUrl(null, 'singbox://import-remote-profile?url='), null);
  assert.equal(deepLinkUrl(undefined, undefined), null);
  assert.equal(deepLinkUrl(42, 'clash://install-subscription?url='), null);
});

test('deepLinkUrl: rejects schemes that already carry query params', () => {
  assert.equal(deepLinkUrl('https://x/sub/t', 'foo://bar?already='), null);
  assert.equal(deepLinkUrl('https://x/sub/t', 'foo://bar#anchor'), null);
});

const FORMATS_LIKE = [
  { key: 'a', clients: ['wireguard'], rec: true },
  { key: 'b', clients: ['wiresock'], rec: false },
  { key: 'c', clients: [] },
  { key: 'd' }
];

test('formatsForClient: "all" and default return every format', () => {
  assert.deepEqual(formatsForClient(FORMATS_LIKE, 'all').map(f => f.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual(formatsForClient(FORMATS_LIKE).map(f => f.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual(formatsForClient(FORMATS_LIKE, '').map(f => f.key), ['a', 'b', 'c', 'd']);
});

test('formatsForClient: filters by client membership', () => {
  assert.deepEqual(formatsForClient(FORMATS_LIKE, 'wireguard').map(f => f.key), ['a']);
  assert.deepEqual(formatsForClient(FORMATS_LIKE, 'wiresock').map(f => f.key), ['b']);
});

test('formatsForClient: unknown client or missing clients yields nothing', () => {
  assert.deepEqual(formatsForClient(FORMATS_LIKE, 'nonexistent'), []);
  assert.deepEqual(formatsForClient(FORMATS_LIKE.filter(f => !f.clients), 'wireguard'), []);
  assert.deepEqual(formatsForClient([], 'wireguard'), []);
  assert.deepEqual(formatsForClient(null, 'wireguard'), []);
});

test('formatsForClient: returns a copy for "all", not the source array', () => {
  const all = formatsForClient(FORMATS_LIKE, 'all');
  assert.notEqual(all, FORMATS_LIKE);
});

test('UI SUB_FORMATS keys match server FORMATS keys exactly (order included)', () => {
  assert.deepEqual(SUB_FORMATS_UI.map(f => f.key), Object.keys(hooks.FORMATS));
});

const PILL_IDS = ['hiddify', 'nekobox', 'throne', 'wiresock', 'wireguard', 'clash'];

test('every client pill resolves to 1-2 formats with a recommendation', () => {
  for (const id of PILL_IDS) {
    const hits = formatsForClient(SUB_FORMATS_UI, id);
    assert.ok(hits.length >= 1 && hits.length <= 2, `client ${id} should map to 1-2 formats, got ${hits.length}`);
    assert.ok(hits.some(f => f.rec), `client ${id} needs a recommended format`);
    assert.ok(hits.every(f => f.hint), `client ${id} formats need hint copy`);
  }
});

test('client coverage across formats equals the pill set exactly', () => {
  const union = new Set();
  for (const f of SUB_FORMATS_UI) for (const c of f.clients || []) union.add(c);
  assert.deepEqual(
    [...union].sort(),
    [...PILL_IDS].sort()
  );
});

const EXPECTED_SCHEMES = [
  'throne://install-subscription?url=',
  'singbox://import-remote-profile?url=',
  'hiddify://import-subscription?url=',
  'hiddify://import/<url>',
  'clash://install-subscription?url=',
  'clash://install-config?url=',
  'stash://install-config?url=',
  'loon://import?sub='
];

test('deep-link schemes are data-driven, param-style or templated, and labeled in the SPA', () => {
  const seen = [];
  for (const f of SUB_FORMATS_UI) {
    for (const s of f.dl || []) {
      seen.push(s);
      assert.ok(s.endsWith('=') || s.includes('<url>'), `${f.key} scheme must take a url=/sub= param`);
      assert.match(s, /^[a-z]+:\/\//, `${f.key} scheme must be a URI scheme`);
    }
  }
  for (const want of EXPECTED_SCHEMES) {
    assert.ok(seen.includes(want), `missing scheme ${want}`);
  }
  assert.match(DASH, /var DL_LABELS = \{/, 'DL_LABELS map must exist in SPA');
  for (const s of EXPECTED_SCHEMES) {
    assert.ok(DASH.includes("'" + s + "'"), `SPA must carry scheme ${s} in SUB_FORMATS`);
  }
});

test('deepLinkUrl: builds stash/clash install-config twins and loon sub= link', () => {
  const enc = encodeURIComponent('https://x/sub/t/clash');
  assert.equal(deepLinkUrl('https://x/sub/t/clash', 'stash://install-config?url='), 'stash://install-config?url=' + enc);
  assert.equal(deepLinkUrl('https://x/sub/t/clash', 'clash://install-config?url='), 'clash://install-config?url=' + enc);
  assert.equal(deepLinkUrl('https://x/sub/t/clash', 'loon://import?sub='), 'loon://import?sub=' + enc);
});

test('deepLinkUrl: <url> template schemes substitute an encoded URL', () => {
  assert.equal(
    deepLinkUrl('https://x/s/t/singbox-legacy?a=1', 'hiddify://import/<url>'),
    'hiddify://import/https%3A%2F%2Fx%2Fs%2Ft%2Fsingbox-legacy%3Fa%3D1'
  );
  assert.equal(deepLinkUrl('https://x/s/t', 'foo://bar/<nope>'), null, 'non-url placeholders rejected');
});

const EXPIRE_UNIX = Math.floor(Date.parse('2027-01-01T00:00:00.000Z') / 1000);

test('subscriptionHeaders: profile-title, userinfo, web-page-url, disposition on text formats', () => {
  const h = subscriptionHeaders(hooks.FORMATS['clash'], 'clash', 'Home-ISP', {
    origin: 'https://w.example.com',
    label: 'Home ISP',
    expiresAt: '2027-01-01T00:00:00.000Z'
  });
  assert.equal(h['profile-title'], 'Home ISP');
  assert.equal(h['subscription-userinfo'], `upload=0; download=0; total=0; expire=${EXPIRE_UNIX}`);
  assert.equal(h['profile-web-page-url'], 'https://w.example.com/admin');
  assert.match(h['Content-Disposition'], /attachment; filename="Home-ISP-clash\.yaml"/);
  assert.equal(h['Profile-Update-Interval'], '24');
  assert.equal(h['Cache-Control'], 'max-age=300');
  assert.equal(h['X-WG-Version'], hooks.VERSION);
});

test('subscriptionHeaders: no expiry omits expire, zip gets disposition too', () => {
  const zip = subscriptionHeaders(hooks.FORMATS['wireguard-conf'], 'wireguard-conf', 'n', {});
  assert.equal(zip['subscription-userinfo'], 'upload=0; download=0; total=0');
  assert.match(zip['Content-Disposition'], /attachment; filename="n-wireguard-conf\.zip"/);
});

test('subscriptionHeaders: non-ASCII label is base64-encoded in profile-title', () => {
  const h = subscriptionHeaders(hooks.FORMATS['v2rayn'], 'v2rayn', 'u', { label: 'خانه' });
  const expected = Buffer.from('خانه', 'utf8').toString('base64');
  assert.equal(h['profile-title'], expected);
  assert.equal(subscriptionHeaders(hooks.FORMATS['v2rayn'], 'v2rayn', 'u', {}).hasOwnProperty('profile-title'), false);
});

test('formats without client support expose no deep links (v2rayn, xray, wireguard-uri)', () => {
  for (const key of ['v2rayn', 'xray', 'wireguard-uri']) {
    const f = SUB_FORMATS_UI.find(x => x.key === key);
    assert.ok(f, `${key} missing`);
    assert.equal((f.dl || []).length, 0, `${key} should have no deep-link schemes`);
  }
});

test('injected helper chain carries the new B8 helpers', () => {
  const sandbox = new Function(hooks.CLIENT_HELPERS_JS + '\nreturn { deepLinkUrl, formatsForClient, zipFindEntry };')();
  assert.equal(sandbox.deepLinkUrl('https://x/s/t/c', 'clash://install-subscription?url='), 'clash://install-subscription?url=https%3A%2F%2Fx%2Fs%2Ft%2Fc');
  assert.equal(sandbox.formatsForClient([{ key: 'k', clients: ['x'] }], 'x').length, 1);
  assert.equal(typeof sandbox.zipFindEntry, 'function');
});



test('zipFindEntry: finds .conf in stored (method 0) zip', () => {
  const confText = '[Interface]\nPrivateKey = abc\n';
  const zipped = zipSync({ 'readme.txt': strToU8('hello'), 'home.conf': strToU8(confText) }, { level: 0 });
  const entry = zipFindEntry(zipped, n => n.toLowerCase().endsWith('.conf'));
  assert.ok(entry, 'entry found');
  assert.equal(entry.name, 'home.conf');
  assert.equal(entry.method, 0);
  assert.equal(new TextDecoder().decode(entry.data), confText);
});

test('zipFindEntry: finds nested-path .conf in deflated zip (inflate step)', () => {
  const confText = '[Interface]\nPrivateKey = xyz\nAddress = 172.16.0.2/32\n';
  const zipped = zipSync({ 'dir/warp.conf': strToU8(confText), 'other.bin': strToU8('\x00\x01\x02') }, { level: 6 });
  const entry = zipFindEntry(new Uint8Array(zipped), n => n.toLowerCase().indexOf('.conf') !== -1);
  assert.ok(entry, 'entry found');
  assert.equal(entry.name, 'dir/warp.conf');
  assert.equal(entry.method, 8);
  const raw = new Uint8Array(inflateRawSync(entry.data));
  assert.equal(new TextDecoder().decode(raw), confText);
});

test('zipFindEntry: returns first match when multiple candidates', () => {
  const zipped = zipSync({ 'a.conf': strToU8('AAA'), 'b.conf': strToU8('BBB') }, { level: 0 });
  const entry = zipFindEntry(zipped, n => n.endsWith('.conf'));
  assert.ok(entry);
  assert.equal(new TextDecoder().decode(entry.data), 'AAA');
});

test('zipFindEntry: null when no match / not a zip / empty', () => {
  const zipped = zipSync({ 'only.txt': strToU8('nope') }, { level: 0 });
  assert.equal(zipFindEntry(zipped, n => n.endsWith('.conf')), null);
  assert.equal(zipFindEntry(new Uint8Array([1, 2, 3, 4]), () => true), null);
  assert.equal(zipFindEntry(new Uint8Array(0), () => true), null);
});

const QR_MARKER = 'const QR_LIB_JS = String.raw`';

function loadQrLib() {
  const si = SOURCE.indexOf(QR_MARKER);
  assert.ok(si >= 0, 'QR_LIB_JS not found');
  const codeStart = si + QR_MARKER.length;
  const ei = SOURCE.indexOf('`;', codeStart);
  assert.ok(ei > codeStart, 'QR_LIB_JS not terminated');
  return new Function(SOURCE.slice(codeStart, ei) + '\nreturn qrSvg;')();
}

test('QR lib: inlines as a self-contained String.raw const of ~10KB', () => {
  const si = SOURCE.indexOf(QR_MARKER);
  const ei = SOURCE.indexOf('`;', si);
  const size = ei - si - QR_MARKER.length;
  assert.ok(size > 4000 && size < 20000, `QR lib size ${size} outside sane inline range`);
  assert.ok(si >= 0 && (si < dashStart || si > dashEnd), 'QR_LIB_JS must live outside DASHBOARD_HTML template');
  assert.ok(!SOURCE.slice(si, ei).includes('${'), 'QR lib must not use template interpolation');
});

test('QR lib: emits an SVG with quiet zone and crisp edges for a real sub URL', () => {
  const qrSvg = loadQrLib();
  const url = 'https://warp.example.workers.dev/sub/6be81f3e-1c29-4f8a-9d0e-6f2b7c1d5a44/singbox';
  const svg = qrSvg(url, 200);
  assert.ok(typeof svg === 'string' && svg.startsWith('<svg'), 'svg string returned');
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(vb, 'viewBox present');
  const dim = parseInt(vb[1], 10);
  const gridSize = dim - 8; // 4-module quiet zone per side
  assert.equal((gridSize - 17) % 4, 0, 'module grid must be version-shaped');
  const modules = svg.match(/h1v1h-1z/g) || [];
  assert.ok(modules.length > 100, 'a realistic number of dark modules expected');
  assert.ok(svg.includes('<rect width="' + dim + '"'), 'white background rect present');
});

test('QR lib: grows with payload and fails gracefully on overflow', () => {
  const qrSvg = loadQrLib();
  const small = qrSvg('https://x.co/a', 200);
  const big = qrSvg('https://x.co/' + 'b'.repeat(600), 200);
  const dimOf = s => parseInt(s.match(/viewBox="0 0 (\d+) (\d+)"/)[1], 10);
  assert.ok(dimOf(big) > dimOf(small), 'larger payload needs larger grid');
  assert.equal(qrSvg('', 200), null, 'empty input rejected');
  assert.equal(qrSvg(null, 200), null, 'null input rejected');
  assert.equal(qrSvg('https://x.co/' + 'x'.repeat(700), 200), null, 'oversized URL returns null');
});

