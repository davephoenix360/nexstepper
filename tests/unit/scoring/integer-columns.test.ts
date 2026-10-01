import { describe, expect, it } from 'vitest';

import { scoreResume } from '@/lib/scoring/score';
import type { ScoreableResume, ScoreableJob } from '@/lib/scoring/score';

/**
 * Tests for the integer-column contract on `score_snapshots`.
 *
 * ## What went wrong
 *
 * `computedInMs` was `Math.max(0, nowMs() - t0)` with
 * `nowMs = () => performance.now()`. That is a high-resolution clock, so the
 * delta is a float like `15.795039999997243`. It is written into
 * `computed_in_ms`, an `integer` column, and Postgres rejects the entire
 * INSERT with:
 *
 *     invalid input syntax for type integer: "15.795039999997243"
 *
 * which the recompute UI surfaced to the user as "Scoring failed".
 *
 * ## Why this needs a test
 *
 * The TS type is `number`, and `number` covers both integers and floats, so
 * the compiler can never catch this. It is a runtime-only failure against a
 * database that unit tests don't have. Asserting the invariant directly is
 * the only practical guard.
 */

// Minimal inputs are fine — this test asserts types, not score quality.
// See `score.test.ts` / `latency.bench.test.ts` for realistic fixtures.
const RESUME: ScoreableResume = {
  basics: {
    summary: 'Senior engineer with 8 years building production web apps.',
    label: 'Senior Software Engineer'
  },
  skills: [
    { name: 'Backend', keywords: ['typescript', 'node.js', 'postgres'] }
  ],
  work: [
    {
      summary: 'Platform lead at a fintech',
      positions: [
        {
          title: 'Staff Engineer',
          highlights: [
            'Built a payments platform serving 12M users and $2.4B annually'
          ]
        }
      ]
    }
  ]
};

// Minimal inputs are fine — this test asserts types, not score quality.
// Field set must match `ScoreableJob` exactly (`JobTextSource` + the v2
// intent-extraction optionals), so tsc catches a drift here.
const JOB: ScoreableJob = {
  title: 'Staff Backend Engineer',
  description:
    'We are hiring a Staff Engineer to own our TypeScript platform. Requirements: 5+ years experience, Node.js, PostgreSQL, distributed systems.',
  mustHaveSkills: ['TypeScript', 'Node.js', 'PostgreSQL'],
  niceToHaveSkills: ['Kubernetes'],
  yearsRequiredMin: 5
};

describe('score_snapshots integer-column contract', () => {
  it('returns an integer computedInMs, not a float', () => {
    const breakdown = scoreResume(RESUME, JOB);
    expect(Number.isInteger(breakdown.computedInMs)).toBe(true);
    expect(breakdown.computedInMs).toBeGreaterThanOrEqual(0);
  });

  it('returns an integer overallScore for the integer match_score column', () => {
    const breakdown = scoreResume(RESUME, JOB);
    expect(Number.isInteger(breakdown.overallScore)).toBe(true);
  });

  it('stays integral across repeated runs', () => {
    // `performance.now()` has sub-microsecond resolution and the scorer does
    // real work between the two reads, so an unrounded delta is fractional
    // essentially every time — this failure was deterministic, not flaky.
    // The loop makes that explicit and guards against a future change that
    // would only fail on some runs.
    for (let i = 0; i < 50; i++) {
      const breakdown = scoreResume(RESUME, JOB);
      expect(
        Number.isInteger(breakdown.computedInMs),
        `run ${i} produced ${breakdown.computedInMs}`
      ).toBe(true);
    }
  });

  it('would have caught the original bug', () => {
    // Direct demonstration of the failure mode, so the reason this file
    // exists stays obvious: a high-resolution clock delta is a float, and
    // that is exactly what Postgres rejects for an `integer` column.
    const raw = 15.795039999997243;
    expect(Number.isInteger(raw)).toBe(false);
    expect(Number.isInteger(Math.round(raw))).toBe(true);
  });
});
