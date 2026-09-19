import { describe, expect, it } from 'vitest';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 3 purity-regression lock.
 *
 * Phase 3 of the post-ship engine review
 * (`docs/drift/2026-09-19-ats-engine-review.md`) introduces an
 * async / dynamic-import module path in `lib/scoring-async/`.
 * This test asserts that:
 *
 *   1. The async modules DO contain `async` / `await` (they're
 *      allowed to — they're outside the sync engine's purity
 *      invariant).
 *   2. `lib/scoring/` STILL contains no `async` / `await` or
 *      dynamic-import-from-heavy-deps — the sync engine's purity
 *      invariant is preserved.
 *
 * The companion `tests/unit/scoring/purity.test.ts` already
 * asserts #2 by scanning `lib/scoring/` for forbidden patterns.
 * This test complements it by:
 *   - Explicitly naming the `async` invariant (the original
 *     purity test bundles async/await with the rest of the
 *     forbidden symbols; here we test it as a property on its
 *     own for clarity).
 *   - Asserting that `lib/scoring-async/` exists and contains
 *     `async` functions (otherwise we'd silently lose Phase 3
 *     in a future refactor).
 *
 * If this test fails, either:
 *   - `lib/scoring/` regressed on the purity invariant (fix the
 *     regression), OR
 *   - `lib/scoring-async/` was removed without a follow-up ADR
 *     (re-add it or write an ADR deprecating Phase 3).
 */

const SYNC_DIR = join(process.cwd(), 'lib/scoring');
const ASYNC_DIR = join(process.cwd(), 'lib/scoring-async');

describe('Phase 3 purity regression', () => {
  it('lib/scoring-async/ exists (Phase 3 has a home)', () => {
    // If this fails, Phase 3 was deleted without a follow-up
    // ADR. Either re-add it or write an ADR deprecating the
    // hybrid path and removing the dependency.
    expect(() => readdirSync(ASYNC_DIR)).not.toThrow();
  });

  it('lib/scoring/ contains no async/await (sync engine purity preserved)', () => {
    const files = readSourceFiles(SYNC_DIR);
    const offenders: Array<{ file: string; match: string }> = [];
    for (const { path, content } of files) {
      const code = stripComments(content);
      const match = code.match(/\b(async|await)\b/);
      if (match) {
        offenders.push({ file: path, match: match[0] });
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `Phase 3 regression: async/await found in lib/scoring/. ` +
          `The sync engine must stay sync. Offenders:\n` +
          offenders.map((o) => `  - ${o.file}: ${o.match}`).join('\n')
      );
    }
    expect(offenders).toHaveLength(0);
  });

  it('lib/scoring/ does not reference @huggingface/transformers (heavy dep is outside)', () => {
    const files = readSourceFiles(SYNC_DIR);
    const offenders: Array<{ file: string; line: string }> = [];
    for (const { path, content } of files) {
      const code = stripComments(content);
      if (/@huggingface\/transformers/.test(code)) {
        const lineMatch = code.split('\n').find((l) => /@huggingface\/transformers/.test(l));
        offenders.push({ file: path, line: lineMatch ?? '' });
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `Phase 3 regression: @huggingface/transformers referenced in lib/scoring/. ` +
          `The heavy dep must stay in lib/scoring-async/. Offenders:\n` +
          offenders.map((o) => `  - ${o.file}: ${o.line.trim()}`).join('\n')
      );
    }
    expect(offenders).toHaveLength(0);
  });

  it('lib/scoring-async/ contains async (Phase 3 is the async path)', () => {
    // Sanity check that the async path actually IS async. If a
    // future refactor accidentally made it sync (which would be
    // great if the dynamic import wasn't needed), this test
    // catches the mismatch with the file's docstring.
    const files = readSourceFiles(ASYNC_DIR);
    const asyncFiles = files.filter(({ content }) =>
      /\b(async|await)\b/.test(stripComments(content))
    );
    expect(asyncFiles.length).toBeGreaterThan(0);
  });
});

function readSourceFiles(dir: string): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...readSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push({ path: full, content: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
