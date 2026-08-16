/**
 * Panel shell tests. Guardrails:
 *
 *  1. Every inline <script> the shell emits must parse as JavaScript. This
 *     caught the template-literal escape-cooking bug (an ordinary template
 *     literal turns /\d/ into /d/ and '\n' into a real newline, breaking
 *     the settings and generator cards in the browser). The shell body is
 *     built with String.raw — the tests pin the emitted bytes.
 *  2. The Subscriptions card (ticket 02) is JS-driven: the shell ships the
 *     card container (new-subscription form + #subs-list + error box) and
 *     an inline script that fetches /api/subs + /api/accounts — no
 *     static subscription URLs are embedded in the HTML anymore.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loginPage, panelShell } from './panel.js';

function scriptBlocks(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

test('every inline script in the panel shell parses as JavaScript', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev' });
  const blocks = scriptBlocks(html);
  assert.ok(blocks.length >= 4, `expected >= 4 script blocks, got ${blocks.length}`);
  for (const [i, b] of blocks.entries()) {
    assert.doesNotThrow(() => new Function(b), `script block ${i} must parse`);
  }
});

test('emitted scripts keep their backslash escapes byte-exact (no template cooking)', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev' });
  assert.ok(html.includes('/^\\d{1,3}(\\.\\d{1,3}){3}$/'), 'IPv4 regex \\d/\\\\. escapes must survive');
  assert.ok(html.includes('/^\\[([^\\]]+)\\]:\\d+$/'), 'IPv6-bracket regex escapes must survive');
  assert.ok(html.includes("text.split('\\n')"), "split('\\n') must survive as an escape");
  assert.ok(html.includes('/^I[1-5]\\s*=\\s*<b 0x[0-9a-fA-F]+>(?:\\s*<[^<>]+>)*\\s*$/i'), 'I-field CPS regex escapes must survive');
});

test('panel shell renders the subscriptions card shell (form + list container, no static URLs)', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev' });
  assert.ok(html.includes('id="subscriptions-card"'));
  assert.ok(html.includes('id="subs-name-input"'), 'new-subscription name input');
  assert.ok(html.includes('id="subs-create-button"'), 'new-subscription create button');
  assert.ok(html.includes('id="subs-list"'), 'per-sub list container');
  assert.ok(html.includes('id="subs-error"'), 'error box');
  assert.ok(html.includes('id="subs-status"'), 'status badge');
  assert.ok(html.includes('id="subs-created"'), 'once-only created-links panel');
  assert.ok(html.includes('href="#subscriptions-card"'), 'nav must link the card');
  assert.ok(html.includes('id="accounts-card"'), 'account card still renders');
  assert.ok(!html.includes('/api/sekrit-token/sub'), 'no static subscription URLs are embedded');
  assert.ok(!html.includes('class="sub-copy"'), 'the legacy copy-button markup is gone');
});

test('panel shell keeps the account card and nav for the other cards', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev' });
  for (const id of ['accounts-card', 'endpoints-card', 'awg-card', 'subscriptions-card', 'generator-card']) {
    assert.ok(html.includes(`id="${id}"`), `missing card ${id}`);
  }
});

test('panel shell renders the generator account picker', () => {
  const html = panelShell({ origin: 'https://panel.example.workers.dev' });
  assert.ok(html.includes('id="gen-account"'), 'generator account picker select');
  assert.ok(html.includes('First account (default)'), 'default-account option label');
});

test('login page keeps parsing (no scripts)', () => {
  const html = loginPage();
  assert.ok(html.includes('WARP Panel — sign in'));
  assert.equal(scriptBlocks(html).length, 0);
});
