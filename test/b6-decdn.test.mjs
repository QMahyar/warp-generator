import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');

function templateBody(name) {
  const start = SOURCE.indexOf(`const ${name} = String.raw\``);
  assert.ok(start >= 0, `${name} must be declared as String.raw template`);
  const openTick = SOURCE.indexOf('`', start);
  const end = SOURCE.indexOf('`;', openTick);
  assert.ok(end > openTick, `${name} template not terminated`);
  return SOURCE.slice(start, end);
}

test('B6: all three templates use String.raw discipline', () => {
  for (const name of ['SETUP_HTML', 'LOGIN_HTML', 'DASHBOARD_HTML']) {
    templateBody(name);
  }
});

test('B6: zero external URLs in any template', () => {
  for (const name of ['SETUP_HTML', 'LOGIN_HTML', 'DASHBOARD_HTML']) {
    const body = templateBody(name);
    const urls = [...body.matchAll(/https?:\/\/[^\s'"`<>)]+/g)].map(m => m[0]);
    assert.deepEqual(urls, [], `${name} must contain no http(s) URLs, found: ${urls.join(', ')}`);
    for (const banned of ['cdn.tailwindcss.com', 'fonts.googleapis', 'fonts.gstatic']) {
      assert.ok(!body.includes(banned), `${name} references banned host ${banned}`);
    }
    assert.ok(!/<script[^>]+src=/i.test(body), `${name} must have no external script src`);
    assert.ok(!/<link[^>]+href="http/i.test(body), `${name} must have no external link href`);
  }
});

test('B6: shared deduplication consts exist', () => {
  assert.ok(/const HEAD_META = `/.test(SOURCE), 'HEAD_META const missing');
  assert.ok(/const SHARED_CSS = String\.raw`/.test(SOURCE), 'SHARED_CSS const missing');
  assert.ok(/const ICONS = \{/.test(SOURCE), 'ICONS const missing');
  assert.ok(/const EYE_TOGGLE_JS = String\.raw`/.test(SOURCE), 'EYE_TOGGLE_JS const missing');
  assert.ok((SOURCE.match(/\$\{SHARED_CSS\}/g) || []).length === 3, 'SHARED_CSS must be interpolated into exactly 3 templates');
});

test('B6: single VERSION const feeds version chips in all three templates', () => {
  assert.ok(/const VERSION = '[^']+'/.test(SOURCE), 'VERSION const missing');
  for (const name of ['SETUP_HTML', 'LOGIN_HTML', 'DASHBOARD_HTML']) {
    const body = templateBody(name);
    assert.ok(body.includes('${VERSION}'), `${name} missing \${VERSION} chip interpolation`);
    assert.ok(!/v1\.3</.test(body), `${name} still carries hardcoded v1.3 chip`);
  }
});

test('B6: CSP allows self + inline only, no CDN/font sources', () => {
  const cspMatch = SOURCE.match(/'Content-Security-Policy': "([^"]+)"/);
  assert.ok(cspMatch, 'CSP header string not found');
  const csp = cspMatch[1];
  assert.ok(!csp.includes('tailwindcss'), 'CSP still allows tailwind CDN');
  assert.ok(!csp.includes('fonts.g'), 'CSP still allows Google Fonts');
  assert.ok(csp.includes("default-src 'self'"), 'CSP missing default-src self');
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"), 'CSP script-src must be self + unsafe-inline');
  assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"), 'CSP style-src must be self + unsafe-inline');
  assert.ok(csp.includes("img-src 'self' data:"), 'CSP img-src must keep data: URIs');
});

test('B6: authed HTML responses send Cache-Control no-store', () => {
  const fnStart = SOURCE.indexOf('function htmlResponse');
  assert.ok(fnStart >= 0, 'htmlResponse not found');
  const fnBody = SOURCE.slice(fnStart, SOURCE.indexOf('\n}', fnStart));
  assert.ok(/'Cache-Control': 'no-store'/.test(fnBody), 'htmlResponse missing Cache-Control no-store');
});
