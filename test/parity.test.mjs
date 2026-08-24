import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testHooks } from '../_worker.js';
const { FORMATS } = testHooks();

const SOURCE = readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');

test('UI SUB_FORMATS keys match server FORMATS keys exactly (order included)', () => {
  const block = SOURCE.match(/var SUB_FORMATS = \[([\s\S]*?)\];/);
  assert.ok(block, 'SUB_FORMATS array not found in DASHBOARD_HTML source');

  const uiKeys = [...block[1].matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(uiKeys.length > 0, 'no format keys extracted from SUB_FORMATS');

  const serverKeys = Object.keys(FORMATS);
  assert.deepEqual(
    uiKeys,
    serverKeys,
    `UI/server format mismatch — UI: [${uiKeys.join(', ')}] server: [${serverKeys.join(', ')}]`
  );
});
