#!/usr/bin/env node
/**
 * Refresh the engine half of the Jev corpus record.
 *
 * ## Why
 *
 * The committed record (`tests/fixtures/jev-corpus-measurements.json`)
 * describes the engine as it was on 2026-10-23. When the engine changes,
 * the record silently becomes a description of an engine that no longer
 * exists — and the offline test reads it as a committed fact, because
 * it asserts the fixture's internal consistency rather than that the
 * fixture still describes the app.
 *
 * Measured on 2026-11-17: 17 of 50 entries had moved, and the recorded
 * correlation (0.9103) no longer matched the engine's (0.9156).
 *
 * ## What this does
 *
 * Re-scores every corpus entry with the CURRENT engine, using the
 * fixture's STORED Jev evaluation (the AI's classification is an INPUT
 * to the score, not an output of it), and rewrites the engine half:
 *
 *   - per entry: syncOverall, jevOverall, the content-quality and
 *     intent-coverage sub-scores, the missed must-have lists, and the
 *     control's token-side answers;
 *   - the summary: the correlations, the mean absolute error, and the
 *     control's agreement.
 *
 * The MODEL half — the AUC, the pSkill means, the control's evidence
 * means — is left alone. It describes the model and the JD's requirement
 * lines, not the engine, and re-deriving it would need the AI. Refresh
 * THAT with `MEASURE_JEV=1 pnpm vitest run
 * tests/unit/scoring/jev-corpus.measure.test.ts`.
 *
 * No AI call, no network, no cost.
 *
 * ## Usage
 *
 *   pnpm refresh:jev-fixture          # writes the file
 *   pnpm refresh:jev-fixture --check  # reports drift, writes nothing
 */
import './load-env';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  countDrift,
  readCorpus,
  readFixture,
  recomputeEngineHalf
} from './jev-fixture-recompute';

const FIXTURE_PATH = join(
  process.cwd(),
  'tests/fixtures/jev-corpus-measurements.json'
);

function main(): void {
  const check = process.argv.includes('--check');
  const corpus = readCorpus();
  const fixture = readFixture();
  const recomputed = recomputeEngineHalf(fixture, corpus);
  const drift = countDrift(fixture, recomputed);

  console.log('');
  console.log('Jev corpus record — engine half');
  console.log('-------------------------------------------------------');
  console.log(`  fixture recorded at   : ${fixture.summary.measuredAt}`);
  console.log(`  entries               : ${drift.total}`);
  console.log(`  entries the engine moved: ${drift.moved}`);
  console.log(`  largest move          : ${drift.maxDelta} points`);
  console.log('');
  console.log(
    `  correlation  sync ${fixture.summary.correlation.sync.toFixed(4)} → ` +
      `${recomputed.summary.correlation.sync.toFixed(4)}`
  );
  console.log(
    `  correlation  jev  ${fixture.summary.correlation.jev.toFixed(4)} → ` +
      `${recomputed.summary.correlation.jev.toFixed(4)}`
  );
  console.log(
    `  MAE          sync ${fixture.summary.meanAbsoluteError.sync.toFixed(2)} → ` +
      `${recomputed.summary.meanAbsoluteError.sync.toFixed(2)}`
  );
  console.log(
    `  MAE          jev  ${fixture.summary.meanAbsoluteError.jev.toFixed(2)} → ` +
      `${recomputed.summary.meanAbsoluteError.jev.toFixed(2)}`
  );
  console.log(
    `  control agreement    ${fixture.summary.control.agreement.toFixed(4)} → ` +
      `${recomputed.summary.control.agreement.toFixed(4)}`
  );
  console.log('');

  if (check) {
    console.log('  --check: nothing written.');
    console.log('');
    return;
  }

  const next = {
    ...recomputed,
    summary: {
      ...recomputed.summary,
      /**
       * When the ENGINE half was last re-scored.
       *
       * `measuredAt` stays as the MODEL measurement date — the AUC and
       * the pSkill means describe the model and the JD's requirement
       * lines, not the engine. Overwriting it would misattribute a
       * month-old model run to today.
       */
      engineRefreshedAt: new Date().toISOString()
    }
  };

  writeFileSync(FIXTURE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`  written: ${FIXTURE_PATH}`);
  console.log('');
}

main();
