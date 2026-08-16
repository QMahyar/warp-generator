/**
 * Ticket 01 tests — the state snapshot module (worker/state.js): KV
 * round-trips, mutations, ids, labels, token hashing + lookup, and public
 * views. Pure functions over an injected fake KV binding — no network.
 * Runs under `node --test` with zero npm dependencies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_KV_KEY,
  StateError,
  appendAccount,
  appendSub,
  emptyState,
  hashToken,
  isValidState,
  lookupSubByToken,
  makeSubToken,
  pinSub,
  publicAccounts,
  publicSubs,
  readState,
  removeAccount,
  removeSub,
  renameAccount,
  renameSub,
  replaceAccount,
  resetSubToken,
  subById,
  tokenHashPrefix,
  validateLabel,
  writeState,
} from './state.js';
import { extractAccountRecord } from './account.js';

// ---- fixtures ----

const FAKE_KEYPAIR = { privateKey: 'aGVsbG8=', publicKey: 'd29ybGQ=' };

const WARP_RESPONSE = {
  result: {
    id: 'client-id-123',
    token: 'token-abc',
    config: {
      client_id: 'QGV1zKUsRS4=',
      peers: [{ public_key: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=' }],
      interface: { addresses: { v4: '172.16.0.2', v6: 'fd01::2' } },
    },
  },
};

const FIXED_NOW = Date.UTC(2026, 7, 15, 12, 0, 0);

function makeRecord() {
  return extractAccountRecord(WARP_RESPONSE, FAKE_KEYPAIR, {
    clientId: 'client-id-123', token: 'token-abc', now: () => FIXED_NOW,
  });
}

function makeKv(initial) {
  const map = new Map();
  if (initial !== undefined && initial !== null) map.set(STATE_KV_KEY, typeof initial === 'string' ? initial : JSON.stringify(initial));
  return {
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => void map.set(k, v),
    delete: async (k) => void map.delete(k),
  };
}

/** A valid two-account snapshot. */
function sampleState() {
  const s = emptyState();
  appendAccount(s, makeRecord());
  appendAccount(s, makeRecord());
  return s;
}

// ---- snapshot shape + KV round-trips ----

test('emptyState is schema 1, revision 0, empty lists', () => {
  const s = emptyState();
  assert.deepEqual(s, { schema: 1, revision: 0, accounts: [], subs: [] });
  assert.equal(isValidState(s), true);
});

test('isValidState rejects non-objects, wrong schema, non-array lists, bad revision', () => {
  assert.equal(isValidState(null), false);
  assert.equal(isValidState({}), false);
  assert.equal(isValidState({ schema: 2, revision: 0, accounts: [], subs: [] }), false);
  assert.equal(isValidState({ schema: 1, revision: 'x', accounts: [], subs: [] }), false);
  assert.equal(isValidState({ schema: 1, revision: 0, accounts: {}, subs: [] }), false);
});

test('writeState → readState round-trips the snapshot under the state key', async () => {
  const kv = makeKv();
  const state = sampleState();
  await writeState(kv, state);
  assert.equal(kv.get(STATE_KV_KEY) !== null, true);
  const read = await readState(kv);
  assert.deepEqual(read, { ...state, revision: 1 }); // writeState bumps the revision
});

test('writeState bumps the revision on every write', async () => {
  const kv = makeKv();
  const state = sampleState();
  await writeState(kv, state);
  const first = await readState(kv);
  await writeState(kv, first);
  const second = await readState(kv);
  assert.equal(second.revision, first.revision + 1);
});

test('readState returns null for missing binding, empty, corrupt and wrong-shape values', async () => {
  assert.equal(await readState(null), null);
  assert.equal(await readState(makeKv(null)), null);
  assert.equal(await readState(makeKv('{not json')), null);
  assert.equal(await readState(makeKv({ schema: 9, revision: 0, accounts: [], subs: [] })), null);
});

test('writeState fails fast without a binding', async () => {
  await assert.rejects(() => writeState(null, emptyState()), StateError);
});

// ---- account mutations ----

test('appendAccount assigns a unique id and a default label', () => {
  const s = emptyState();
  appendAccount(s, makeRecord());
  appendAccount(s, makeRecord());
  assert.equal(s.accounts.length, 2);
  assert.notEqual(s.accounts[0].id, s.accounts[1].id);
  assert.equal(s.accounts[0].label, 'Account 1');
  assert.equal(s.accounts[1].label, 'Account 2');
  assert.equal(s.accounts[0].registeredAt, new Date(FIXED_NOW).toISOString());
});

test('appendAccount accepts an explicit label and keeps the record body intact', () => {
  const s = emptyState();
  const record = makeRecord();
  appendAccount(s, record, { label: 'Home' });
  assert.equal(s.accounts[0].label, 'Home');
  assert.equal(s.accounts[0].privateKey, record.privateKey);
});

test('replaceAccount keeps id + label and swaps the record body', () => {
  const s = sampleState();
  const original = s.accounts[0];
  const fresh = makeRecord();
  fresh.registeredAt = new Date(FIXED_NOW + 60000).toISOString();
  replaceAccount(s, original.id, fresh);
  assert.equal(s.accounts.length, 2);
  assert.equal(s.accounts[0].id, original.id);
  assert.equal(s.accounts[0].label, original.label);
  assert.equal(s.accounts[0].registeredAt, fresh.registeredAt);
  assert.notEqual(s.accounts[1].id, original.id, 'second account keeps its own id');
});

test('renameAccount trims and validates the label', () => {
  const s = sampleState();
  renameAccount(s, s.accounts[0].id, '  Spare  ');
  assert.equal(s.accounts[0].label, 'Spare');
  assert.throws(() => renameAccount(s, s.accounts[0].id, ''), StateError);
  assert.throws(() => renameAccount(s, s.accounts[0].id, 'x'.repeat(61)), StateError);
  assert.throws(() => renameAccount(s, 'missing-id', 'ok'), StateError);
});

test('removeAccount drops exactly the target entry', () => {
  const s = sampleState();
  const id = s.accounts[0].id;
  removeAccount(s, id);
  assert.equal(s.accounts.length, 1);
  assert.notEqual(s.accounts[0].id, id);
  assert.throws(() => removeAccount(s, 'missing-id'), StateError);
});

test('validateLabel: trimmed, 1–60 chars', () => {
  assert.equal(validateLabel('  a  '), 'a');
  assert.equal(validateLabel('x'.repeat(60)), 'x'.repeat(60));
  assert.throws(() => validateLabel(''), StateError);
  assert.throws(() => validateLabel('x'.repeat(61)), StateError);
});

// ---- tokens ----

test('makeSubToken is 43 base64url chars and unique across calls', () => {
  const t1 = makeSubToken();
  const t2 = makeSubToken();
  assert.equal(t1.length, 43);
  assert.match(t1, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t1, t2);
});

test('hashToken is deterministic and base64url', async () => {
  const h1 = await hashToken('token-abc');
  const h2 = await hashToken('token-abc');
  assert.equal(h1, h2);
  assert.match(h1, /^[A-Za-z0-9_-]+$/);
  assert.equal(h1.length, 43); // 32 bytes → 43 base64url chars
});

test('tokenHashPrefix returns the first 8 characters', async () => {
  const h = await hashToken('token-abc');
  assert.equal(tokenHashPrefix(h), h.slice(0, 8));
});

test('lookupSubByToken finds by hash and never matches a wrong token', async () => {
  const s = emptyState();
  const token = makeSubToken();
  s.subs.push({ id: 's1', name: 'Family', tokenHash: await hashToken(token), accountId: s.accounts[0]?.id ?? null, createdAt: new Date(FIXED_NOW).toISOString() });
  const hit = await lookupSubByToken(s, token);
  assert.equal(hit.id, 's1');
  assert.equal(await lookupSubByToken(s, token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), null);
  assert.equal(await lookupSubByToken(s, ''), null);
  assert.equal(await lookupSubByToken(s, 'x'.repeat(43)), null);
});

// ---- subscription mutations (ticket 02) ----

test('appendSub creates an entry with a default name, null pin, token hash only', () => {
  const s = emptyState();
  const sub = appendSub(s, { tokenHash: 'deadbeef' });
  assert.equal(sub.id, 's1');
  assert.equal(sub.name, 'Subscription 1');
  assert.equal(sub.accountId, null);
  assert.equal(sub.tokenHash, 'deadbeef');
  assert.ok(!Number.isNaN(new Date(sub.createdAt).getTime()));
  assert.throws(() => appendSub(s, { tokenHash: '' }), StateError);
  assert.throws(() => appendSub(s, {}), StateError);
  const named = appendSub(s, { name: 'Family', tokenHash: 'abc' });
  assert.equal(named.name, 'Family');
  assert.equal(named.id, 's2');
});

test('renameSub trims + validates; unknown id throws', () => {
  const s = emptyState();
  const sub = appendSub(s, { tokenHash: 'deadbeef' });
  renameSub(s, sub.id, '  Home  ');
  assert.equal(sub.name, 'Home');
  assert.throws(() => renameSub(s, 'nope', 'X'), StateError);
  assert.throws(() => renameSub(s, sub.id, ''), StateError);
});

test('pinSub re-pins anytime; unknown account rejected; null unpins', () => {
  const s = sampleState();
  const sub = appendSub(s, { tokenHash: 'deadbeef' });
  pinSub(s, sub.id, s.accounts[1].id);
  assert.equal(sub.accountId, s.accounts[1].id);
  assert.throws(() => pinSub(s, sub.id, 'missing-account'), StateError);
  pinSub(s, sub.id, null);
  assert.equal(sub.accountId, null);
  assert.throws(() => pinSub(s, 'nope', null), StateError);
});

test('resetSubToken swaps the hash; old token stops matching', async () => {
  const s = emptyState();
  const oldToken = makeSubToken();
  const newToken = makeSubToken();
  const sub = appendSub(s, { tokenHash: await hashToken(oldToken) });
  assert.equal((await lookupSubByToken(s, oldToken)).id, sub.id);
  resetSubToken(s, sub.id, await hashToken(newToken));
  assert.equal(await lookupSubByToken(s, oldToken), null);
  assert.equal((await lookupSubByToken(s, newToken)).id, sub.id);
  assert.throws(() => resetSubToken(s, sub.id, ''), StateError);
  assert.throws(() => resetSubToken(s, 'nope', 'x'), StateError);
});

test('removeSub drops exactly the target entry', () => {
  const s = emptyState();
  appendSub(s, { tokenHash: 'h1' });
  const target = appendSub(s, { tokenHash: 'h2' });
  removeSub(s, target.id);
  assert.equal(s.subs.length, 1);
  assert.equal(s.subs[0].tokenHash, 'h1');
  assert.throws(() => removeSub(s, target.id), StateError);
});

test('subById finds subs; dangling pins are visible but not resolvable', () => {
  const s = sampleState();
  const sub = appendSub(s, { tokenHash: 'h1' });
  pinSub(s, sub.id, s.accounts[0].id);
  assert.equal(subById(s, sub.id), sub);
  assert.equal(subById(s, 'nope'), null);
});

// ---- public views ----

test('publicAccounts never exposes privateKey/clientId/token', () => {
  const s = sampleState();
  const list = publicAccounts(s);
  assert.equal(list.length, 2);
  for (const a of list) {
    assert.deepEqual(Object.keys(a).sort(), ['id', 'label', 'registeredAt', 'source', 'v4', 'verified', 'verifiedAt'].sort());
    assert.equal('privateKey' in a, false);
    assert.equal('clientId' in a, false);
    assert.equal('token' in a, false);
    assert.equal(a.label.length > 0, true);
  }
});

test('publicSubs shows the fingerprint and the pinned account label, never the token', async () => {
  const s = sampleState();
  const token = makeSubToken();
  s.subs.push({ id: 's1', name: 'Family', tokenHash: await hashToken(token), accountId: s.accounts[0].id, createdAt: new Date(FIXED_NOW).toISOString() });
  s.subs.push({ id: 's2', name: 'Orphan', tokenHash: await hashToken(makeSubToken()), accountId: null, createdAt: new Date(FIXED_NOW).toISOString() });
  const list = publicSubs(s);
  assert.equal(list.length, 2);
  assert.equal(list[0].tokenHashPrefix, (await hashToken(token)).slice(0, 8));
  assert.equal(list[0].accountLabel, s.accounts[0].label);
  assert.equal(list[1].accountLabel, null);
  for (const sub of list) {
    assert.equal('tokenHash' in sub, false);
    assert.equal('token' in sub, false);
  }
});