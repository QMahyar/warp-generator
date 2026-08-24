#!/usr/bin/env node
// check-version.mjs — verifies package.json + _worker.js VERSION match git tag (when present).
// Usage: node scripts/check-version.mjs [--tag v1.0.0]
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const worker = readFileSync('_worker.js', 'utf8');
const m = worker.match(/const VERSION = '([^']+)'/);
if (!m) {
  console.error('VERSION const not found in _worker.js');
  process.exit(1);
}
const workerVersion = m[1];
const tagArg = process.argv.find(a => a.startsWith('--tag='));
let expected = tagArg ? tagArg.slice(6).replace(/^v/, '') : null;
if (!expected) {
  // Try exact tag first, then nearest tag — Windows-safe, no shell pipes.
  for (const cmd of ['git describe --tags --exact-match HEAD', 'git describe --tags']) {
    try {
      const tag = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (tag) { expected = tag.replace(/^v/, ''); break; }
    } catch {}
  }
}
console.log(`package.json: ${pkg.version}`);
console.log(`_worker.js:   ${workerVersion}`);
if (expected) console.log(`git tag:      v${expected}`);

let ok = true;
if (pkg.version !== workerVersion) {
  console.error(`✗ mismatch: package.json (${pkg.version}) != _worker.js (${workerVersion})`);
  ok = false;
}
if (expected && pkg.version !== expected) {
  console.error(`✗ mismatch: package.json (${pkg.version}) != tag (${expected})`);
  ok = false;
}
if (expected && workerVersion !== expected) {
  console.error(`✗ mismatch: _worker.js (${workerVersion}) != tag (${expected})`);
  ok = false;
}
if (!ok) process.exit(1);
console.log('✓ versions consistent');
