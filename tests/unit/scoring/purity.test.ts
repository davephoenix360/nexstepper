import { describe, expect, it } from 'vitest';

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Purity test — plan §"Acceptance criteria" #2.
 *
 *   "The function does not call any external service. **Asserted by
 *    a static test:** `tests/unit/scoring/purity.test.ts` reads the
 *    compiled module and greps for `fetch`, `http`, `https`, `crypto`,
 *    `Date.now`, `Math.random`. Test fails if any are found."
 *
 * We grep the SOURCE files (TypeScript) — reading the compiled JS
 * would work too but adds a `pnpm build` step. The source is what
 * reviewers see; the test exists to enforce a code-review invariant.
 *
 * `lib/scoring/` MUST be:
 *   - Sync (no `async` keyword, no `await`)
 *   - IO-free (no `fetch`, no `http`, no `https`)
 *   - Hash-free (no `crypto.createHash` etc.)
 *   - Time-free (no `Date.now`, no `new Date()`)
 *   - Random-free (no `Math.random`)
 *
 * The `lib/scoring/score.ts` file is the one exception: it exposes
 * `computedInMs` which calls `performance.now()`. We allow
 * `performance` there but still forbid `Date`, `crypto`, etc.
 */

const SCORING_DIR = join(process.cwd(), 'lib/scoring');

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bfetch\s*\(/i, reason: 'network IO is forbidden in scoring' },
  { pattern: /\bhttps?:\/\//i, reason: 'network IO is forbidden in scoring' },
  { pattern: /\bcrypto\b/i, reason: 'crypto is forbidden in scoring' },
  { pattern: /\bMath\.random\b/, reason: 'Math.random is forbidden (non-deterministic)' },
  { pattern: /\bnew\s+Date\b/, reason: 'Date is forbidden in scoring (non-deterministic)' },
  { pattern: /\bDate\.now\s*\(/, reason: 'Date.now is forbidden in scoring (non-deterministic)' }
];

// `async`/`await` are checked separately so we can give a clearer error.
const ASYNC_PATTERN = /\b(async|await)\b/;

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

describe('scoring engine purity', () => {
  const files = readSourceFiles(SCORING_DIR);

  it('has at least one source file to test (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.path.replace(process.cwd() + '/', '').replace(/\\/g, '/');

    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      it(`${rel} does not use ${pattern.source} (${reason})`, () => {
        // Strip comments to avoid false positives on the doc strings
        // that warn AGAINST using these patterns.
        const code = stripComments(file.content);
        const match = code.match(pattern);
        if (match) {
          throw new Error(
            `Forbidden pattern "${pattern.source}" found in ${rel}: ${match[0]}`
          );
        }
        expect(match).toBeNull();
      });
    }

    // score.ts is the ONE file allowed to use `performance.now()` for
    // the `computedInMs` instrumentation. We allow `async`/`await`
    // there too because it's the composition root that may eventually
    // be called from a Server Action (which is async at the action
    // boundary, but the score function itself is sync).
    if (!rel.endsWith('score.ts')) {
      it(`${rel} is sync (no async/await)`, () => {
        const code = stripComments(file.content);
        // We strip JSDoc and line comments, then check what's left.
        const match = code.match(ASYNC_PATTERN);
        if (match) {
          throw new Error(
            `Forbidden "async"/"await" in ${rel}: ${match[0]}. The scoring engine must be sync.`
          );
        }
        expect(match).toBeNull();
      });
    }
  }
});

/**
 * Strip JSDoc (`/** ... *\/`), line comments (`// ...`), and block
 * comments (`/* ... *\/`) so the regex doesn't false-positive on the
 * doc strings that warn against using the forbidden patterns.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
