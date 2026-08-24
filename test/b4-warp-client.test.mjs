import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warpRetryDecision } from '../_worker.js';

const BASE = 500;
const CAP = 5000;
const MAX_RETRIES = 2;
const SAMPLES = 200;

function sampleDelay(status, attempt, retryAfter) {
  const d = warpRetryDecision(status, attempt, retryAfter);
  return d.retry ? d.delayMs : null;
}

test('5xx: retried with exponential backoff', () => {
  for (const status of [500, 502, 503, 504, 599]) {
    const d = warpRetryDecision(status, 0, null);
    assert.equal(d.retry, true, `status ${status} should retry`);
    assert.ok(d.delayMs >= BASE / 2 && d.delayMs <= BASE, `${status} delay ${d.delayMs} out of first-attempt bounds`);
  }
});

test('4xx: never retried', () => {
  for (const status of [400, 401, 403, 404, 422, 451]) {
    const d = warpRetryDecision(status, 0, null);
    assert.deepEqual(d, { retry: false, delayMs: 0 }, `status ${status} must not retry`);
  }
});

test('429: honors Retry-After seconds header', () => {
  const d = warpRetryDecision(429, 0, '2');
  assert.equal(d.retry, true);
  assert.equal(d.delayMs, 2000);
});

test('503: honors Retry-After seconds header', () => {
  const d = warpRetryDecision(503, 0, '3');
  assert.equal(d.retry, true);
  assert.equal(d.delayMs, 3000);
});

test('Retry-After capped at WARP_RETRY_CAP_MS', () => {
  for (const ra of ['120', '99999']) {
    const d = warpRetryDecision(429, 0, ra);
    assert.equal(d.retry, true);
    assert.equal(d.delayMs, CAP);
  }
});

test('429 without valid Retry-After falls back to backoff bounds', () => {
  for (const ra of [null, undefined, '', 'garbage', '0', '-5']) {
    const d = warpRetryDecision(429, 1, ra);
    assert.equal(d.retry, true);
    assert.ok(d.delayMs >= BASE && d.delayMs <= BASE * 2, `ra=${JSON.stringify(ra)} delay ${d.delayMs}`);
  }
});

test('backoff growth: attempt windows do not overlap downward', () => {
  let prevCeiling = -Infinity;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const delays = [];
    for (let i = 0; i < SAMPLES; i++) delays.push(sampleDelay(500, attempt, null));
    const lo = Math.min(...delays);
    const hi = Math.max(...delays);
    const exp = Math.min(BASE * 2 ** attempt, CAP);
    assert.ok(lo >= exp / 2, `attempt ${attempt} min ${lo} below jitter floor ${exp / 2}`);
    assert.ok(hi <= exp, `attempt ${attempt} max ${hi} exceeds expected ceiling ${exp}`);
    assert.ok(exp / 2 >= prevCeiling, `attempt ${attempt} window overlaps previous`);
    prevCeiling = exp;
  }
});

test('jitter bounds: equal-jitter within [exp/2, exp] per attempt', () => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const exp = Math.min(BASE * 2 ** attempt, CAP);
    for (let i = 0; i < SAMPLES; i++) {
      const delay = sampleDelay(null, attempt, null);
      assert.ok(delay >= exp / 2 && delay <= exp, `attempt ${attempt} delay ${delay} outside [${exp / 2}, ${exp}]`);
    }
  }
});

test('null status (network error): retried on backoff path', () => {
  for (let i = 0; i < SAMPLES; i++) {
    const d = warpRetryDecision(null, 0, null);
    assert.equal(d.retry, true);
    assert.ok(d.delayMs >= BASE / 2 && d.delayMs <= BASE);
  }
  const d1 = warpRetryDecision(null, 1, null);
  assert.equal(d1.retry, true);
  assert.ok(d1.delayMs >= BASE && d1.delayMs <= BASE * 2);
});

test('retries exhausted: no retry once attempt reaches WARP_MAX_RETRIES', () => {
  for (const status of [null, 429, 500, 503]) {
    const d = warpRetryDecision(status, MAX_RETRIES, '10');
    assert.deepEqual(d, { retry: false, delayMs: 0 }, `status ${status} exhausted must not retry`);
  }
  const beyond = warpRetryDecision(500, MAX_RETRIES + 5, null);
  assert.deepEqual(beyond, { retry: false, delayMs: 0 });
});
