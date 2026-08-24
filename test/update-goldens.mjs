import { spawnSync } from 'node:child_process';

process.env.UPDATE_GOLDEN = '1';

const result = spawnSync(process.execPath, ['--test', 'test/**/*.test.mjs'], {
  stdio: 'inherit',
  env: process.env
});

process.exit(result.status ?? 1);
