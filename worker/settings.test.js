/**
 * Ticket 03 tests — the pure parts of the settings module: endpoint line
 * parsing/validation, AWG param normalization + validation, and the KV
 * helpers over a fake binding. No network involved; zero npm dependencies.
 * Runs under `node --test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AWG_FIELDS,
  AWG_KV_KEY,
  DEFAULT_AWG,
  ENDPOINTS_KV_KEY,
  normalizeEndpointText,
  parseAwgParams,
  parseEndpointList,
  readAwg,
  readEndpoints,
  SettingsError,
  validateEndpointLine,
  writeAwg,
  writeEndpoints,
} from './settings.js';

// ---- endpoint line parsing ----

test('validateEndpointLine accepts IPv4, hostname and bracketed IPv6, any port 1–65535', () => {
  assert.deepEqual(validateEndpointLine('162.159.192.1:2408'), { ok: true, host: '162.159.192.1', port: 2408, raw: '162.159.192.1:2408' });
  assert.deepEqual(validateEndpointLine(' 162.159.192.1:2408 '), { ok: true, host: '162.159.192.1', port: 2408, raw: '162.159.192.1:2408' });
  assert.deepEqual(validateEndpointLine('engage.cloudflareclient.com:2408'), { ok: true, host: 'engage.cloudflareclient.com', port: 2408, raw: 'engage.cloudflareclient.com:2408' });
  assert.deepEqual(validateEndpointLine('my-host.example.com:51820'), { ok: true, host: 'my-host.example.com', port: 51820, raw: 'my-host.example.com:51820' });
  assert.deepEqual(validateEndpointLine('[2606:4700:4700::1111]:2408'), { ok: true, host: '2606:4700:4700::1111', port: 2408, raw: '[2606:4700:4700::1111]:2408' });
  assert.deepEqual(validateEndpointLine('[::1]:1'), { ok: true, host: '::1', port: 1, raw: '[::1]:1' });
  assert.deepEqual(validateEndpointLine('10.0.0.1:65535'), { ok: true, host: '10.0.0.1', port: 65535, raw: '10.0.0.1:65535' });
  assert.equal(validateEndpointLine('').skip, true);
  assert.equal(validateEndpointLine('   ').skip, true);
});

test('validateEndpointLine flags malformed lines with a reason — never throws', () => {
  const cases = [
    ['162.159.192.1', /Missing port/],
    [':2408', /Missing host/],
    ['162.159.192.1:0', /Port out of range/],
    ['162.159.192.1:65536', /Port out of range/],
    ['162.159.192.1:port', /Port out of range/],
    ['162.159.192.1:24 08', /Port out of range/],
    ['2606:4700:4700::1111:2408', /brackets/], // bare v6 is ambiguous — must be bracketed
    ['[2606:4700:4700::1111]', /must include a port/], // brackets without port
    ['[not-an-ip]:2408', /IPv6/],
    ['http://162.159.192.1:2408', /schemes and paths/],
    ['a b:2408', /not a valid host/],
    ['-bad-h:2408', /not a valid host/],
    ['999.1.1.1:2408', /not a valid host/],
    ['1.2.3:2408', /not a valid host/],
    ['123:2408', /not a valid host/],
  ];
  for (const [line, re] of cases) {
    const r = validateEndpointLine(line);
    assert.equal(r.ok, false, `expected ${JSON.stringify(line)} to be flagged`);
    assert.match(r.reason, re, `reason for ${JSON.stringify(line)}`);
  }
});

test('parseEndpointList splits valid from flagged lines; invalid never blocks valid', () => {
  const text = [
    '162.159.192.1:2408',                  // 0 valid
    '',                                    // blank — ignored
    'junk-line-without-port',              // 2 invalid
    '  engage.cloudflareclient.com:2408 ', // 3 valid (trimmed)
    '[2606:4700:4700::1111]:2408',         // 4 valid
    'nope:99999',                          // 5 invalid
  ].join('\n');
  const { endpoints, invalid } = parseEndpointList(text);
  assert.equal(endpoints.length, 3);
  assert.deepEqual(endpoints.map((e) => e.host), ['162.159.192.1', 'engage.cloudflareclient.com', '2606:4700:4700::1111']);
  assert.deepEqual(endpoints.map((e) => e.port), [2408, 2408, 2408]);
  assert.equal(invalid.length, 2);
  assert.deepEqual(invalid.map((i) => i.index), [2, 5]);
  assert.ok(invalid.every((i) => typeof i.reason === 'string' && i.reason.length > 0));
});

test('parseEndpointList tolerates non-string input and empty text', () => {
  assert.deepEqual(parseEndpointList(null), { endpoints: [], invalid: [] });
  assert.deepEqual(parseEndpointList(''), { endpoints: [], invalid: [] });
  assert.deepEqual(parseEndpointList('\n  \n'), { endpoints: [], invalid: [] });
});

test('normalizeEndpointText trims lines, drops blanks, keeps flagged lines', () => {
  assert.equal(normalizeEndpointText('  a:1  \n\n b:2 \n'), 'a:1\nb:2');
  assert.equal(normalizeEndpointText('  162.159.192.1:2408  \n  \n  broken-line  \n'), '162.159.192.1:2408\nbroken-line');
  assert.equal(normalizeEndpointText(null), '');
});

// ---- AWG params ----

test('parseAwgParams treats anything but enabled as off (absent from KV)', () => {
  assert.deepEqual(parseAwgParams({ enabled: false }), { awg: null, invalid: [] });
  assert.deepEqual(parseAwgParams({}), { awg: null, invalid: [] });
  assert.deepEqual(parseAwgParams(null), { awg: null, invalid: [] });
  assert.deepEqual(parseAwgParams({ enabled: 'false' }), { awg: null, invalid: [] });
  assert.deepEqual(parseAwgParams({ enabled: 'true' }).awg, { enabled: true, ...DEFAULT_AWG });
});

test('parseAwgParams fills legacy builder defaults when enabled with no params', () => {
  const { awg, invalid } = parseAwgParams({ enabled: true });
  assert.deepEqual(awg, { enabled: true, ...DEFAULT_AWG });
  assert.equal(awg.Jc, '4');
  assert.equal(awg.Jmin, '40');
  assert.equal(awg.Jmax, '70');
  assert.equal(awg.S1, '0');
  assert.equal(awg.S3, '');
  assert.equal(awg.H4, '4');
  assert.equal(awg.I1, '');
  assert.deepEqual(invalid, []);
});

test('parseAwgParams normalizes values to trimmed strings, empty fields allowed', () => {
  const { awg, invalid } = parseAwgParams({ enabled: true, Jc: 4, Jmin: ' 40 ', Jmax: 70, S1: '0', S2: '', I1: '', I5: '' });
  assert.equal(awg.Jc, '4');
  assert.equal(awg.Jmin, '40');
  assert.equal(awg.Jmax, '70');
  assert.equal(awg.S2, '');
  assert.equal(awg.I1, '');
  assert.equal(awg.H1, ''); // absent field → empty, not defaulted
  assert.deepEqual(invalid, []);
});

test('parseAwgParams flags out-of-range numeric params without rejecting them', () => {
  const { awg, invalid } = parseAwgParams({ enabled: true, Jc: '11', Jmin: '0', Jmax: '5000', S4: '33', H1: '-1', S1: 'x' });
  assert.equal(awg.Jc, '11'); // saved verbatim — flagging is advisory
  const fields = invalid.map((i) => i.field);
  assert.ok(fields.includes('Jc'));
  assert.ok(fields.includes('Jmin'));
  assert.ok(fields.includes('Jmax'));
  assert.ok(fields.includes('S4'));
  assert.ok(fields.includes('H1'));
  assert.ok(fields.includes('S1'));
  for (const i of invalid) assert.ok(typeof i.reason === 'string' && i.reason.length > 0);
});

test('parseAwgParams flags Jmin > Jmax', () => {
  const { invalid } = parseAwgParams({ enabled: true, Jmin: '200', Jmax: '100' });
  assert.ok(invalid.some((i) => i.field === 'Jmin' && /≤/.test(i.reason)));
});

test('parseAwgParams accepts pool-style and multi-tag CPS lines, flags garbage', () => {
  const poolStyle = 'I1 = <b 0xc10000000114367096bb0fb3f58f3a3fb8aaacd61d63a1c8a40e14f7374b8a62>'; // trimmed fixture
  const multiTag = 'i2 = <b 0xd100000001><rc 8><t><r 50>';
  const { awg, invalid } = parseAwgParams({ enabled: true, I1: poolStyle, I2: multiTag, I3: 'not a cps line' });
  assert.equal(awg.I1, poolStyle);
  assert.equal(awg.I2, multiTag);
  assert.deepEqual(invalid.map((i) => i.field), ['I3']);
});

test('DEFAULT_AWG itself passes validation (self-consistency)', () => {
  const { invalid } = parseAwgParams({ enabled: true, ...DEFAULT_AWG });
  assert.deepEqual(invalid, []);
});

// ---- KV helpers (fake binding) ----

function fakeKvBinding() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
  };
}

test('writeEndpoints → readEndpoints roundtrip under the endpoints key', async () => {
  const kv = fakeKvBinding();
  const text = '162.159.192.1:2408\n  engage.cloudflareclient.com:2408 \nbroken:bad\n';
  const saved = await writeEndpoints(kv, text);
  assert.ok(kv.map.has(ENDPOINTS_KV_KEY));
  assert.equal(kv.map.get(ENDPOINTS_KV_KEY), '162.159.192.1:2408\nengage.cloudflareclient.com:2408\nbroken:bad');
  assert.equal(saved.count, 2);
  assert.equal(saved.invalid.length, 1);
  assert.equal(saved.text, kv.map.get(ENDPOINTS_KV_KEY));

  const read = await readEndpoints(kv);
  assert.deepEqual(read, saved);
});

test('an empty endpoint list deletes the key (empty list is legal)', async () => {
  const kv = fakeKvBinding();
  await writeEndpoints(kv, '162.159.192.1:2408');
  const saved = await writeEndpoints(kv, '  \n ');
  assert.equal(saved.text, '');
  assert.equal(kv.map.has(ENDPOINTS_KV_KEY), false);
  assert.equal(await readEndpoints(kv), null);
});

test('readEndpoints returns null for missing binding or empty store', async () => {
  assert.equal(await readEndpoints(null), null);
  assert.equal(await readEndpoints(fakeKvBinding()), null);
});

test('writeEndpoints throws a readable error when the binding is missing', async () => {
  await assert.rejects(() => writeEndpoints(null, 'a:1'),
    (err) => err instanceof SettingsError && /ENDPOINTS KV binding is missing/.test(err.message));
});

test('writeAwg stores the record; disabling deletes the key', async () => {
  const kv = fakeKvBinding();
  const { awg } = parseAwgParams({ enabled: true, ...DEFAULT_AWG, I1: 'I1 = <b 0xaa>' });
  await writeAwg(kv, awg);
  assert.ok(kv.map.has(AWG_KV_KEY));
  assert.deepEqual(JSON.parse(kv.map.get(AWG_KV_KEY)), awg);
  assert.deepEqual(await readAwg(kv), awg);

  assert.equal(await writeAwg(kv, { enabled: false }), null);
  assert.equal(kv.map.has(AWG_KV_KEY), false);
  assert.equal(await readAwg(kv), null);

  assert.equal(await writeAwg(kv, null), null); // tolerant even without a binding
  assert.equal(await writeAwg(null, null), null);
});

test('writeAwg throws a readable error when enabling without the binding', async () => {
  await assert.rejects(() => writeAwg(null, { enabled: true, ...DEFAULT_AWG }),
    (err) => err instanceof SettingsError && /AWG KV binding is missing/.test(err.message));
});

test('readAwg tolerates corrupt and foreign values', async () => {
  const kv = fakeKvBinding();
  await kv.put(AWG_KV_KEY, '{not json');
  assert.equal(await readAwg(kv), null);
  await kv.put(AWG_KV_KEY, JSON.stringify({ hello: 'world' }));
  assert.equal(await readAwg(kv), null);
  await kv.put(AWG_KV_KEY, JSON.stringify({ ...DEFAULT_AWG, enabled: false }));
  assert.equal(await readAwg(kv), null); // stored-but-off record is foreign → null
  const missing = { ...DEFAULT_AWG };
  delete missing.I2;
  await kv.put(AWG_KV_KEY, JSON.stringify({ enabled: true, ...missing }));
  assert.equal(await readAwg(kv), null);
  assert.equal(await readAwg(null), null);
});

test('AWG_FIELDS covers every conf param the record stores', () => {
  assert.deepEqual(AWG_FIELDS, ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4', 'I1', 'I2', 'I3', 'I4', 'I5']);
});