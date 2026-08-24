import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  generateWireGuardConf,
  generateThroneUri,
  generateWireguardUri,
  generateSingboxJson,
  generateSingboxLegacyJson,
  generateXrayJson,
  generateClashYaml,
  generateV2raynBase64,
  generateSurgeConf,
  generateLoonConf,
  generateSurfboardConf,
  generateEgernYaml,
  testHooks
} from '../_worker.js';
const { FORMATS } = testHooks();
import {
  ACCOUNT_FIXTURE,
  GLOBAL_AMNEZIA,
  fixtureConfigs,
  normalizeFormatOutput,
  resolveAmneziaForAccount
} from './helpers.mjs';

const GOLDEN_DIR = fileURLToPath(new URL('./golden/', import.meta.url));
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const amneziaParams = resolveAmneziaForAccount(ACCOUNT_FIXTURE);

const GENERATORS = {
  'wireguard-conf': (configs) => generateWireGuardConf(configs),
  'wireguard-conf-amnezia': (configs) => generateWireGuardConf(configs, amneziaParams),
  'throne': (configs) => generateThroneUri(configs),
  'throne-amnezia': (configs) => generateThroneUri(configs, amneziaParams),
  'wireguard-uri': (configs) => generateWireguardUri(configs),
  'singbox': (configs) => generateSingboxJson(configs),
  'singbox-amnezia': (configs) => generateSingboxJson(configs, amneziaParams),
  'singbox-legacy': (configs) => generateSingboxLegacyJson(configs),
  'singbox-legacy-amnezia': (configs) => generateSingboxLegacyJson(configs, amneziaParams),
  'xray': (configs) => generateXrayJson(configs),
  'clash': (configs) => generateClashYaml(configs),
  'clash-amnezia': (configs) => generateClashYaml(configs, amneziaParams),
  'v2rayn': (configs) => generateV2raynBase64(configs),
  'surge': (configs) => generateSurgeConf(configs),
  'loon': (configs) => generateLoonConf(configs),
  'surfboard': (configs) => generateSurfboardConf(configs),
  'egern': (configs) => generateEgernYaml(configs)
};

const configs = await fixtureConfigs();

for (const [format, formatInfo] of Object.entries(FORMATS)) {
  test(`golden: ${format}`, async () => {
    const body = GENERATORS[format](configs);
    assert.ok(body, `generator for ${format} returned empty output`);

    const normalized = normalizeFormatOutput(format, body, formatInfo);
    const expectedBytes = Buffer.from(normalized, 'utf8');
    const goldenPath = `${GOLDEN_DIR}${format}.txt`;

    if (UPDATE || !fileExists(goldenPath)) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(goldenPath, normalized, 'utf8');
      console.log(`golden written: ${goldenPath}`);
      return;
    }

    const goldenBytes = readFileSync(goldenPath);
    const matches = Buffer.compare(expectedBytes, goldenBytes) === 0;
    assert.ok(
      matches,
      `output differs from golden ${format}.txt — inspect the diff or run "npm run goldens:update"`
    );
  });
}

function fileExists(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
