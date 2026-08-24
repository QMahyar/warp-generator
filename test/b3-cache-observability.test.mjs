import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPurgeUrls, classifyRoute, testHooks } from '../_worker.js';
const { FORMATS, VERSION } = testHooks();

test('buildPurgeUrls: cartesian product of tokens × formats', () => {
  const urls = buildPurgeUrls(['tok-a', 'tok-b'], ['throne', 'singbox'], 'https://x.example');
  assert.deepEqual(urls, [
    'https://x.example/sub/tok-a/throne',
    'https://x.example/sub/tok-a/singbox',
    'https://x.example/sub/tok-b/throne',
    'https://x.example/sub/tok-b/singbox'
  ]);
});

test('buildPurgeUrls: default origin empty and trailing slash stripped', () => {
  const urls = buildPurgeUrls(['t'], ['f'], 'https://y.example///');
  assert.deepEqual(urls, ['https://y.example/sub/t/f']);

  const noOrigin = buildPurgeUrls(['t'], ['f']);
  assert.deepEqual(noOrigin, ['/sub/t/f']);
});

test('buildPurgeUrls: dedupes repeated token/format pairs', () => {
  const urls = buildPurgeUrls(['t', 't'], ['a', 'a'], 'https://z.example');
  assert.deepEqual(urls, ['https://z.example/sub/t/a']);
});

test('buildPurgeUrls: skips falsy/non-string tokens and handles empty inputs', () => {
  assert.deepEqual(buildPurgeUrls(['', null, undefined, 5], ['a'], ''), []);
  assert.deepEqual(buildPurgeUrls([], Object.keys(FORMATS), 'https://o'), []);
  assert.deepEqual(buildPurgeUrls(['t'], [], 'https://o'), []);
  assert.deepEqual(buildPurgeUrls(undefined, undefined), []);
});

test('buildPurgeUrls: all formats yields Object.keys(FORMATS) count per token', () => {
  const urls = buildPurgeUrls(['t'], Object.keys(FORMATS), 'https://o');
  assert.equal(urls.length, Object.keys(FORMATS).length);
});

test('classifyRoute: maps every route class', () => {
  assert.equal(classifyRoute('/healthz'), 'health');
  assert.equal(classifyRoute('/sub/abc-123/singbox'), 'sub');
  assert.equal(classifyRoute('/api/account'), 'api');
  assert.equal(classifyRoute('/admin/setup'), 'setup');
  assert.equal(classifyRoute('/admin/login'), 'login');
  assert.equal(classifyRoute('/admin/logout'), 'admin');
  assert.equal(classifyRoute('/admin'), 'admin');
  assert.equal(classifyRoute('/'), 'other');
  assert.equal(classifyRoute('/nope'), 'other');
});

test('VERSION: exported non-empty semver-ish string', () => {
  assert.equal(typeof VERSION, 'string');
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
});
