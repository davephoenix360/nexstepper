/**
 * Regenerate `tests/fixtures/jev-corpus-measurements.json`.
 *
 * The measurement itself lives in
 * `tests/unit/scoring/jev-corpus.measure.test.ts` so it calls the REAL
 * `evaluateJevRequirements` — the same function the app calls. It used
 * to be a script with its own copy of the Jev calls, which was a drift
 * trap: the script's copy of the questions and the production module's
 * copy would silently diverge, and the committed fixture would keep
 * describing a system we no longer run.
 *
 * The test is skipped unless `MEASURE_JEV` is set, so CI never spends
 * money on it.
 *
 * Usage:
 *   node scripts/measure-jev-corpus.cjs
 */
require('dotenv').config({ path: '.env.local' });

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const result = spawnSync(
  'pnpm',
  [
    'vitest',
    'run',
    'tests/unit/scoring/jev-corpus.measure.test.ts',
    '--reporter=basic'
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, MEASURE_JEV: '1' },
    shell: true
  }
);

process.exit(result.status ?? 1);
