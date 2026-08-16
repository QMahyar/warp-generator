/**
 * State snapshot module (ticket 01) — the single seam for everything the
 * panel mutates: WARP accounts and subscriptions, stored as ONE KV record
 * (key "state") so a sub request resolves account + sub in a single read.
 *
 * Snapshot shape:
 *   { schema: 1, revision: N, accounts: [AccountEntry], subs: [SubEntry] }
 *
 *   AccountEntry = the account record (account.js shape, source
 *   'register'|'import', verified/verifiedAt) PLUS id (short opaque) and
 *   label (operator-editable, ≤ 60 chars).
 *   SubEntry = { id, name, tokenHash, accountId|null, createdAt }.
 *
 * Token discipline (ADR 0006): the subscription token is a 43-char base64url
 * random string, stored ONLY as its SHA-256 hash (tokenHash). The raw token
 * exists in exactly two places: the create response and the operator's
 * clipboard. Sub requests hash the submitted path token and constant-time
 * compare the digests.
 *
 * KV semantics: reads are eventually consistent (~60 s); writes are
 * last-writer-wins with no CAS, so `writeState` bumps `revision` and
 * `mutateState` serializes read-modify-write for the single-writer panel.
 * No Durable Object — panel actions are rare and single-operator.
 *
 * All functions are pure over an injected KV binding (get/put/delete), so
 * they run identically in the Worker and under `node --test`.
 */

import { Buffer } from 'buffer';
import { isValidAccountRecord, publicAccount } from './account.js';
import { timingSafeEqualBytes } from './auth.js';

export const STATE_KV_KEY = 'state';

export const LABEL_MAX = 60;

/** Errors thrown by this module carry an operator-readable message. */
export class StateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateError';
  }
}

// ---- ids / tokens ----

/** 4 random bytes → short base64url id fragment (no padding). */
function randomIdFragment() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Buffer.from(bytes).toString('base64url');
}

function nextId(prefix, existing) {
  for (let i = 0; i < 10; i++) {
    const id = `${prefix}${randomIdFragment()}`;
    if (!existing.includes(id)) return id;
  }
  throw new StateError('Could not allocate a unique id — try again.');
}

/** A subscription path token: 32 random bytes → 43-char base64url. */
export function makeSubToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

/** SHA-256 → base64url (the only form of a token ever stored). */
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('base64url');
}

/** Short fingerprint for the panel rows — never enough to reconstruct. */
export function tokenHashPrefix(hash) {
  return hash.slice(0, 8);
}

// ---- snapshot shape ----

export function emptyState() {
  return { schema: 1, revision: 0, accounts: [], subs: [] };
}

/** Shape check for snapshots read back from KV (corrupt/foreign → null). */
export function isValidState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (state.schema !== 1) return false;
  if (!Number.isInteger(state.revision) || state.revision < 0) return false;
  if (!Array.isArray(state.accounts) || !Array.isArray(state.subs)) return false;
  for (const account of state.accounts) {
    if (!account || typeof account !== 'object') return false;
    if (typeof account.id !== 'string' || !account.id) return false;
    if (typeof account.label !== 'string' || account.label.length > LABEL_MAX) return false;
    if (!isValidAccountRecord(account)) return false;
  }
  for (const sub of state.subs) {
    if (!sub || typeof sub !== 'object') return false;
    if (typeof sub.id !== 'string' || !sub.id) return false;
    if (typeof sub.name !== 'string' || sub.name.length > LABEL_MAX) return false;
    if (typeof sub.tokenHash !== 'string' || !sub.tokenHash) return false;
    if (sub.accountId !== null && typeof sub.accountId !== 'string') return false;
    if (Number.isNaN(new Date(sub.createdAt).getTime())) return false;
  }
  return true;
}

// ---- KV helpers (binding injected; fake-friendly for tests) ----

/** Read the snapshot; null when absent, corrupt or the binding is missing. */
export async function readState(binding) {
  if (!binding) return null;
  const raw = await binding.get(STATE_KV_KEY);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    return isValidState(state) ? state : null;
  } catch {
    return null;
  }
}

/** Fail fast when the state binding is not configured (before any write). */
export function assertStateBinding(binding) {
  if (!binding) {
    throw new StateError('KV binding is missing — add a kv_namespaces entry (see wrangler.jsonc).');
  }
}

/** Persist the snapshot with a bumped revision. */
export async function writeState(binding, state) {
  assertStateBinding(binding);
  const next = { ...state, revision: state.revision + 1 };
  await binding.put(STATE_KV_KEY, JSON.stringify(next));
  return next;
}

/**
 * Read-modify-write for panel mutations: read (empty when absent) → fn →
 * write. `fn` mutates the snapshot in place and may throw (nothing is
 * written then). Returns the persisted snapshot.
 */
export async function mutateState(binding, fn) {
  assertStateBinding(binding);
  const state = (await readState(binding)) || emptyState();
  await fn(state);
  return writeState(binding, state);
}

// ---- account mutations (pure, in-place on the snapshot) ----

/** Append a fresh account entry; label defaults to "Account N". */
export function appendAccount(state, record, { label = null } = {}) {
  const id = nextId('a', state.accounts.map((a) => a.id));
  const finalLabel = label !== null && label !== undefined && String(label).trim() !== ''
    ? validateLabel(label)
    : `Account ${state.accounts.length + 1}`;
  state.accounts.push({ id, label: finalLabel, ...record });
  return state.accounts[state.accounts.length - 1];
}

/** Replace an account's record body, keeping id + label (rotation). */
export function replaceAccount(state, accountId, record) {
  const index = state.accounts.findIndex((a) => a.id === accountId);
  if (index === -1) throw new StateError('Account not found.');
  const { id, label } = state.accounts[index];
  state.accounts[index] = { id, label, ...record };
  return state.accounts[index];
}

/** Rename an account (label trimmed, 1–60 chars). */
export function renameAccount(state, accountId, label) {
  const account = accountById(state, accountId);
  if (!account) throw new StateError('Account not found.');
  account.label = validateLabel(label);
  return account;
}

/** Remove an account; subscriptions pinned to it are left dangling (503). */
export function removeAccount(state, accountId) {
  const index = state.accounts.findIndex((a) => a.id === accountId);
  if (index === -1) throw new StateError('Account not found.');
  state.accounts.splice(index, 1);
}

export function accountById(state, accountId) {
  return state.accounts.find((a) => a.id === accountId) || null;
}

export function subById(state, subId) {
  return state.subs.find((s) => s.id === subId) || null;
}

// ---- subscription mutations (ticket 02) ----

/**
 * Create a sub entry. The token NEVER exists in the snapshot — callers
 * generate it (makeSubToken) and pass ONLY its SHA-256 hash; the raw token
 * is returned in the create response exactly once. Pin starts null
 * (unpinned → the sub route 503s until the operator pins an account).
 */
export function appendSub(state, { name = null, tokenHash }) {
  if (typeof tokenHash !== 'string' || !tokenHash) {
    throw new StateError('A subscription needs a token hash.');
  }
  const sub = {
    id: `s${state.subs.length + 1}`,
    name: validateLabel(name ?? `Subscription ${state.subs.length + 1}`),
    tokenHash,
    accountId: null,
    createdAt: new Date().toISOString(),
  };
  state.subs.push(sub);
  return sub;
}

export function renameSub(state, subId, name) {
  const sub = subById(state, subId);
  if (!sub) throw new StateError('Subscription not found.');
  sub.name = validateLabel(name);
  return sub;
}

/** Re-pin anytime; accountId null unpins (sub then 503s until re-pinned). */
export function pinSub(state, subId, accountId) {
  const sub = subById(state, subId);
  if (!sub) throw new StateError('Subscription not found.');
  if (accountId !== null && !accountById(state, accountId)) {
    throw new StateError('Account not found — pick a stored account.');
  }
  sub.accountId = accountId;
  return sub;
}

/** Replace the stored hash; old links 404 after the cache window. */
export function resetSubToken(state, subId, newTokenHash) {
  const sub = subById(state, subId);
  if (!sub) throw new StateError('Subscription not found.');
  if (typeof newTokenHash !== 'string' || !newTokenHash) {
    throw new StateError('A subscription needs a token hash.');
  }
  sub.tokenHash = newTokenHash;
  return sub;
}

export function removeSub(state, subId) {
  const index = state.subs.findIndex((s) => s.id === subId);
  if (index === -1) throw new StateError('Subscription not found.');
  state.subs.splice(index, 1);
}

// ---- subscription lookups ----

/** Hash the submitted path token and find the matching sub (constant-time). */
export async function lookupSubByToken(state, submitted) {
  if (typeof submitted !== 'string' || !submitted) return null;
  const digest = await hashToken(submitted);
  for (const sub of state.subs) {
    if (sub.tokenHash.length === digest.length && timingSafeEqualBytes(digest, sub.tokenHash)) return sub;
  }
  return null;
}

// ---- validation ----

/** Trim; must be 1–60 chars. Returns the trimmed label. */
export function validateLabel(label) {
  const trimmed = String(label ?? '').trim();
  if (trimmed === '') throw new StateError('Label must not be empty.');
  if (trimmed.length > LABEL_MAX) throw new StateError(`Label must be at most ${LABEL_MAX} characters.`);
  return trimmed;
}

// ---- public views (never keys / token material) ----

/** The accounts card payload: id, label + the safe account fields only. */
export function publicAccounts(state) {
  return state.accounts.map((record) => ({
    id: record.id,
    label: record.label,
    ...publicAccount(record),
  }));
}

/** The subs card payload: never the token or its hash, only the prefix. */
export function publicSubs(state) {
  return state.subs.map((sub) => ({
    id: sub.id,
    name: sub.name,
    tokenHashPrefix: tokenHashPrefix(sub.tokenHash),
    accountId: sub.accountId,
    accountLabel: sub.accountId ? (accountById(state, sub.accountId)?.label ?? null) : null,
    createdAt: sub.createdAt,
  }));
}