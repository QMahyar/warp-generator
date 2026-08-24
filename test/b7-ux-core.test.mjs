import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testHooks, parseEndpointLine, parseEndpointBulk, validateAmneziaValues } from '../_worker.js';

const hooks = testHooks();
const SOURCE = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');

test('parseEndpointLine: ipv4 host:port', () => {
  assert.deepEqual(parseEndpointLine('162.159.192.1:2408'), { endpoint: { ip: '162.159.192.1', port: 2408 } });
});

test('parseEndpointLine: domain host:port with surrounding whitespace', () => {
  assert.deepEqual(parseEndpointLine('  engage.cloudflareclient.com:2408  '), {
    endpoint: { ip: 'engage.cloudflareclient.com', port: 2408 }
  });
});

test('parseEndpointLine: bracketed IPv6 [v6]:port', () => {
  assert.deepEqual(parseEndpointLine('[2606:4700:d0::a29f:c001]:2408'), {
    endpoint: { ip: '2606:4700:d0::a29f:c001', port: 2408 }
  });
  assert.deepEqual(parseEndpointLine('[::1]:443'), { endpoint: { ip: '::1', port: 443 } });
});

test('parseEndpointLine rejects: missing port, empty host, bad ports', () => {
  assert.ok(parseEndpointLine('162.159.192.1').error);
  assert.ok(parseEndpointLine(':2408').error);
  assert.ok(parseEndpointLine('host.com:').error);
  assert.match(parseEndpointLine('host.com:0').error, /port/);
  assert.match(parseEndpointLine('host.com:70000').error, /port/);
  assert.match(parseEndpointLine('host.com:abc').error, /port/);
});

test('parseEndpointLine rejects bare IPv6 without brackets (hint)', () => {
  const r = parseEndpointLine('2606:4700:d0::a29f:c001:2408');
  assert.ok(r.error);
  assert.match(r.error, /bracket/i);
});

test('parseEndpointLine rejects malformed bracketed IPv6 and bad hosts', () => {
  assert.match(parseEndpointLine('[abcdef]:80').error, /IPv6/i);
  assert.match(parseEndpointLine('bad_host:80').error, /invalid host/);
  assert.match(parseEndpointLine('bad..dots:80').error, /invalid host/);
  assert.match(parseEndpointLine('a'.repeat(254) + ':80').error, /too long/);
  assert.match(parseEndpointLine('300.1.1.1:80').error, /invalid IPv4/);
});

test('parseEndpointBulk: valid multi-line input preserves order', () => {
  const text = '1.2.3.4:100\nexample.com:200\n\n[::1]:300\n';
  const { endpoints, errors } = parseEndpointBulk(text);
  assert.deepEqual(endpoints, [
    { ip: '1.2.3.4', port: 100 },
    { ip: 'example.com', port: 200 },
    { ip: '::1', port: 300 }
  ]);
  assert.equal(errors.length, 0);
});

test('parseEndpointBulk: blank lines skipped, errors carry 1-based line numbers', () => {
  const text = '1.2.3.4:100\nnoport\n5.6.7.8:99999\n\nbad host:0\n';
  const { endpoints, errors } = parseEndpointBulk(text);
  assert.deepEqual(endpoints, [{ ip: '1.2.3.4', port: 100 }]);
  assert.deepEqual(errors.map(e => e.line), [2, 3, 5]);
  assert.ok(errors.every(e => typeof e.error === 'string' && e.error.length > 0));
});

test('parseEndpointBulk: duplicate entries rejected with line number', () => {
  const text = '1.2.3.4:100\n1.2.3.4:100\n[::1]:443';
  const { endpoints, errors } = parseEndpointBulk(text);
  assert.equal(endpoints.length, 2);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.match(errors[0].error, /duplicate/i);
});

test('parseEndpointBulk: null/whitespace-only input yields nothing', () => {
  assert.deepEqual(parseEndpointBulk(null), { endpoints: [], errors: [] });
  assert.deepEqual(parseEndpointBulk('   \n \n'), { endpoints: [], errors: [] });
});

test('validateAmneziaValues: accepts full valid set incl int32 max', () => {
  const v = { Jc: 128, Jmin: 1280, Jmax: 1280, S1: 255, S2: 255, H1: 2147483647, H2: 0, H3: 42, H4: 7 };
  assert.equal(validateAmneziaValues(v), null);
});

test('validateAmneziaValues: numeric strings accepted (form inputs)', () => {
  const v = { Jc: '4', Jmin: '40', Jmax: '70', S1: '15', S2: '30', H1: '1237', H2: '3456', H3: '5280', H4: '8912' };
  assert.equal(validateAmneziaValues(v), null);
});

test('validateAmneziaValues: range violations name the field', () => {
  const base = { Jc: 0, Jmin: 0, Jmax: 0, S1: 0, S2: 0, H1: 0, H2: 0, H3: 0, H4: 0 };
  assert.match(validateAmneziaValues({ ...base, Jc: -1 }), /Jc/);
  assert.match(validateAmneziaValues({ ...base, Jc: 129 }), /Jc/);
  assert.match(validateAmneziaValues({ ...base, Jmin: 1281 }), /Jmin/);
  assert.match(validateAmneziaValues({ ...base, S1: 256 }), /S1/);
  assert.match(validateAmneziaValues({ ...base, H1: 2147483648 }), /H1/);
});

test('validateAmneziaValues: Jmin <= Jmax enforced', () => {
  const v = { Jc: 0, Jmin: 100, Jmax: 50, S1: 0, S2: 0, H1: 0, H2: 0, H3: 0, H4: 0 };
  assert.match(validateAmneziaValues(v), /Jmin/);
});

test('validateAmneziaValues: empty/missing/non-integer fields rejected', () => {
  assert.match(validateAmneziaValues({ Jc: '' }), /Jc/);
  assert.match(validateAmneziaValues({}), /must be a whole number/);
  assert.match(
    validateAmneziaValues({ Jc: 1.5, Jmin: 0, Jmax: 0, S1: 0, S2: 0, H1: 0, H2: 0, H3: 0, H4: 0 }),
    /Jc/
  );
  assert.equal(validateAmneziaValues(null), 'Invalid Amnezia values');
});

test('AMNEZIA_UI_PRESETS Mild and Aggressive pass client validator', () => {
  for (const key of ['mild', 'aggressive']) {
    const p = hooks.AMNEZIA_UI_PRESETS[key];
    assert.ok(p, `preset ${key} missing`);
    assert.equal(validateAmneziaValues(p), null);
  }
  assert.equal(hooks.AMNEZIA_UI_PRESETS.mild.Jc, 4);
  assert.equal(hooks.AMNEZIA_UI_PRESETS.aggressive.Jc, 128);
  assert.equal(hooks.AMNEZIA_UI_PRESETS.aggressive.Jmax, 1200);
});

test('dashboard injects the exact exported helper sources (single source of truth)', () => {
  assert.ok(SOURCE.includes(parseEndpointLine.toString()), 'parseEndpointLine source injected');
  assert.ok(SOURCE.includes(parseEndpointBulk.toString()), 'parseEndpointBulk source injected');
  assert.ok(SOURCE.includes(validateAmneziaValues.toString()), 'validateAmneziaValues source injected');
});

test('injected helper chain is self-contained and executable in isolation', () => {
  const sandbox = new Function(hooks.CLIENT_HELPERS_JS + '\nreturn { parseEndpointLine, parseEndpointBulk, validateAmneziaValues };')();
  assert.deepEqual(sandbox.parseEndpointLine('1.2.3.4:80'), { endpoint: { ip: '1.2.3.4', port: 80 } });
  assert.deepEqual(sandbox.parseEndpointLine('[::1]:443'), { endpoint: { ip: '::1', port: 443 } });
  assert.deepEqual(sandbox.parseEndpointBulk('5.6.7.8:1\njunk'), {
    endpoints: [{ ip: '5.6.7.8', port: 1 }],
    errors: [{ line: 2, error: 'missing :port' }]
  });
  assert.match(sandbox.validateAmneziaValues({ Jc: 999 }), /Jc/);
});

test('hash router wiring present in dashboard SPA', () => {
  assert.match(SOURCE, /window\.addEventListener\('hashchange', applyRoute\)/);
  assert.match(SOURCE, /#\/accounts/);
  assert.match(SOURCE, /#\/account\/\$\{id\}|'#\/account\/' \+/);
  assert.match(SOURCE, /#\/settings/);
  assert.match(SOURCE, /#\/presets/);
  assert.doesNotMatch(SOURCE, /\bnavigate\('accounts'\);\s*<\/script>/);
});

test('api() wrapper redirects to login on session loss', () => {
  const dashStart = SOURCE.indexOf('const DASHBOARD_HTML');
  const dash = SOURCE.slice(dashStart, SOURCE.indexOf('</html>`;', dashStart));
  assert.match(dash, /status === 401 \|\| ctype\.indexOf\('text\/html'\)/);
  assert.match(dash, /\/admin\/login\?error=session/);
  assert.match(dash, /var routeSeq = 0;/);
  assert.match(dash, /isStale\(\)/);
  assert.match(dash, /setTimeout\(function\(\) \{ if \(!isStale\(\)\) renderSkeleton\(\); \}, 400\)/);
});

test('a11y structural markers in templates', () => {
  const setupStart = SOURCE.indexOf('const SETUP_HTML');
  const loginEnd = SOURCE.indexOf('const DASHBOARD_HTML');
  const authTemplates = SOURCE.slice(setupStart, loginEnd);
  assert.doesNotMatch(authTemplates, /tabindex="-1"/);

  const dash = SOURCE.slice(loginEnd);
  assert.match(dash, /id="toast-container" role="status" aria-live="polite"/);
  assert.match(dash, /role="dialog" aria-modal="true" aria-labelledby="t-create"/);
  assert.match(dash, /role="dialog" aria-modal="true" aria-labelledby="t-import"/);
  assert.match(dash, /role="dialog" aria-modal="true" aria-labelledby="confirm-title"/);
  assert.match(dash, /document\.getElementById\('confirm-cancel'\)\.focus\(\)/);
  assert.match(dash, /_confirmOpener/);
  assert.match(dash, /button type="button" class="acct-card/);
  assert.match(dash, /aria-label="Open account /);
});

test('contrast tokens bumped above 4.5:1 on dark bg', () => {
  assert.match(SOURCE, /--text-faint: #94a3b8;/);
  assert.match(SOURCE, /--text-ghost: #76808f;/);
  assert.doesNotMatch(SOURCE, /--text-faint: #6b7280/);
  assert.doesNotMatch(SOURCE, /--text-ghost: #4b5563/);
});

test('mobile tap targets: coarse-pointer block present', () => {
  assert.match(SOURCE, /\(pointer: coarse\)/);
  assert.match(SOURCE, /\.icon-btn \{ width: 44px; height: 44px; \}/);
  assert.match(SOURCE, /\.nav-btn, \.nav-btn-sm, \.logout-btn \{ min-height: 44px; min-width: 44px; \}/);
  assert.match(SOURCE, /spotlightDisabled/);
});

test('preset edit-in-place + bulk textarea wired in settings view', () => {
  assert.match(SOURCE, /function editPreset\(id\)/);
  assert.ok(SOURCE.includes("await api('/api/presets/' + editingPresetId"), 'PUT by id on update');
  assert.match(SOURCE, /id="preset-bulk"/);
  assert.match(SOURCE, /function applyBulkEndpoints\(\)/);
  assert.match(SOURCE, /Rejected ' \+ res\.errors\.length/);
});
