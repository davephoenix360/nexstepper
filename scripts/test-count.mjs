/**
 * Print the real test count — files and cases.
 *
 * ## Why this exists
 *
 * This repo used to carry the test count in three places that all
 * disagreed: the README said "970/970 across 78 files", AGENTS.md said
 * "2,205 tests", and the tree actually had ~1,970 cases across 172
 * files. Every one of those numbers was typed by hand, so every one of
 * them was wrong the moment a test was added or removed.
 *
 * The fix is to stop typing the number. Run this and paste what it
 * says, with today's date.
 *
 * ```bash
 * pnpm test:count
 * ```
 *
 * ## Why it is a full run
 *
 * `vitest list` would be cheaper, but it imports every test file in a
 * worker-less context, and a couple of them call `postMessage` at
 * import time — which throws under `list` and works fine under `run`.
 * So this runs the suite for real, with the JSON reporter, and reads the
 * totals off the result file.
 *
 * The count is also printed by the default reporter on every CI run, so
 * the number is never invisible — this script just makes it copyable.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nexstepper-testcount-'));
const outputFile = join(dir, 'vitest.json');

// Run the local vitest CLI with node directly. Going through `npx` with
// `shell: true` works but makes node emit a deprecation warning about
// unescaped args, and a script whose whole job is to be copy-pasted into
// the docs should not print a warning.
const vitestCli = resolve(process.cwd(), 'node_modules/vitest/vitest.mjs');

const child = spawn(
  process.execPath,
  [vitestCli, 'run', '--reporter=json', `--outputFile=${outputFile}`],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

child.on('close', (code) => {
  let report;
  try {
    report = JSON.parse(readFileSync(outputFile, 'utf-8'));
  } catch {
    process.stderr.write(stderr);
    rmSync(dir, { recursive: true, force: true });
    process.exit(code ?? 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // `numTotalTestSuites` counts describe blocks, not files. The JSON
  // reporter's `testResults` array is one entry per FILE, which is the
  // number the docs actually quote.
  const files = (report.testResults ?? []).length;
  const cases = report.numTotalTests ?? 0;
  const passed = report.numPassedTests ?? 0;
  const pending = report.numPendingTests ?? 0;
  const failed = report.numFailedTests ?? 0;

  console.log('');
  console.log(`  files : ${files}`);
  console.log(`  cases : ${cases}  (${passed} passed, ${pending} skipped, ${failed} failed)`);
  console.log('');
  console.log('  Paste this into README.md / AGENTS.md, WITH today\'s date:');
  console.log(`  ${passed} tests across ${files} files`);
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
});
