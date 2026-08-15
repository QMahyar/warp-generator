/**
 * Panel shell tests. Two guardrails:
 *
 *  1. Every inline <script> the shell emits must parse as JavaScript. This
 *     caught the template-literal escape-cooking bug (an ordinary template
 *     literal turns /\d/ into /d/ and '\n' into a real newline, breaking
 *     the settings and generator cards in the browser). The shell body is
 *     built with String.raw — the tests pin the emitted bytes.
 *  2. The Subscriptions card (tickets 04–08 UI) renders all six URLs when
 *     SUB_PATH is set and an explainer when it is not.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loginPage, panelShell } from './panel.js';

function scriptBlocks(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

test('every inline script in the panel shell parses as JavaScript', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev', subPath: 'tok' });
  const blocks = scriptBlocks(html);
  assert.ok(blocks.length >= 4, `expected >= 4 script blocks, got ${blocks.length}`);
  for (const [i, b] of blocks.entries()) {
    assert.doesNotThrow(() => new Function(b), `script block ${i} must parse`);
  }
});

test('emitted scripts keep their backslash escapes byte-exact (no template cooking)', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev', subPath: 'tok' });
  assert.ok(html.includes('/^\\d{1,3}(\\.\\d{1,3}){3}$/'), 'IPv4 regex \\d/\\\\. escapes must survive');
  assert.ok(html.includes('/^\\[([^\\]]+)\\]:\\d+$/'), 'IPv6-bracket regex escapes must survive');
  assert.ok(html.includes("text.split('\\n')"), "split('\\n') must survive as an escape");
  assert.ok(html.includes('/^I[1-5]\\s*=\\s*<b 0x[0-9a-fA-F]+>(?:\\s*<[^<>]+>)*\\s*$/i'), 'I-field CPS regex escapes must survive');
});

test('panel shell renders the subscriptions card with all six URLs', () => {
  const origin = 'https://panel.example.workers.dev';
  const html = panelShell({ origin, subPath: 'sekrit-token' });
  assert.ok(html.includes('id="subscriptions-card"'));
  for (const suffix of ['/api/sekrit-token/sub', '/api/sekrit-token/sub?scheme=wg', '/api/sekrit-token/sub/clash', '/api/sekrit-token/sub/singbox', '/api/sekrit-token/sub/neko', '/api/sekrit-token/sub/wg', '/api/sekrit-token/sub/awg']) {
    assert.ok(html.includes(suffix), `missing subscription URL ${suffix}`);
  }
  assert.ok(html.includes('class="sub-copy"'), 'copy buttons must exist');
  assert.ok(html.includes('href="#subscriptions-card"'), 'nav must link the card');
});

test('panel shell explains a missing SUB_PATH instead of rendering links', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev' });
  assert.ok(html.includes('SUB_PATH secret is not set'));
  assert.ok(html.includes('Not configured'));
  assert.ok(!html.includes('data-copy='));
});

test('URLs in the subscriptions card are HTML-escaped', () => {
  const html = panelShell({ origin: 'https://p.example.workers.dev', subPath: 'a<b>&"c' });
  assert.ok(html.includes('/api/a&lt;b&gt;&amp;&quot;c/sub'));
  assert.ok(!html.includes('/api/a<b>&"c/sub'));
});

test('login page keeps parsing (no scripts)', () => {
  const html = loginPage();
  assert.ok(html.includes('WARP Panel — sign in'));
  assert.equal(scriptBlocks(html).length, 0);
});