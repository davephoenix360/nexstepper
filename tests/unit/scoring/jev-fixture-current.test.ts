/**
 * The accuracy record must describe the engine that is shipping.
 *
 * ## The gap this closes
 *
 * `tests/fixtures/jev-corpus-measurements.json` is the repo's record of
 * how accurate the scoring engine is. The offline test read it as a
 * committed fact — but it asserted the FIXTURE's internal consistency,
 * not that the fixture still described the app.
 *
 * So when the engine changed, the record silently became a description
 * of an engine that no longer existed. Measured on 2026-11-17: **17 of
 * 50 entries had moved**, and the recorded correlation (0.9103) no
 * longer matched the engine's (0.9156).
 *
 * The same shape as every other drift this repo has found: two lists
 * that must agree, and nothing asserting that they do.
 *
 * ## What this asserts
 *
 * Re-scores the corpus with the CURRENT engine, using the fixture's
 * stored Jev evaluation (the AI's classification is an INPUT to the
 * score, not an output of it — so this needs no AI call and no
 * network), and checks the record still matches.
 *
 * When the engine changes and the record is not refreshed, this fails
 * and says how to refresh it: `pnpm refresh:jev-fixture`.
 */
import { describe, expect, it } from 'vitest';

import {
  countDrift,
  readCorpus,
  readFixture,
  recomputeEngineHalf
} from '../../../scripts/jev-fixture-recompute';
import { JEV_MODEL } from '@/lib/ai/jev';

describe('the Jev corpus record describes the CURRENT engine', () => {
  const corpus = readCorpus();
  const fixture = readFixture();
  const recomputed = recomputeEngineHalf(fixture, corpus);

  it('scores every entry the way the record says it does', () => {
    const drift = countDrift(fixture, recomputed);
    expect(
      drift.moved,
      `${drift.moved} of ${drift.total} corpus entries are scored differently by the ` +
        `current engine than the committed record says (largest move: ` +
        `${drift.maxDelta} points). The accuracy record is stale — refresh it with ` +
        `\`pnpm refresh:jev-fixture\` and commit the result.`
    ).toBe(0);
  });

  it('records the correlation the engine actually produces', () => {
    expect(recomputed.summary.correlation.sync).toBeCloseTo(
      fixture.summary.correlation.sync,
      6
    );
    expect(recomputed.summary.correlation.jev).toBeCloseTo(
      fixture.summary.correlation.jev,
      6
    );
  });

  it('records the mean absolute error the engine actually produces', () => {
    expect(recomputed.summary.meanAbsoluteError.sync).toBeCloseTo(
      fixture.summary.meanAbsoluteError.sync,
      6
    );
    expect(recomputed.summary.meanAbsoluteError.jev).toBeCloseTo(
      fixture.summary.meanAbsoluteError.jev,
      6
    );
  });

  it('still beats the acceptance gate', () => {
    // ADR 0005's gate is r > 0.7 for the engine, and the Jev path
    // must beat the token-based one.
    expect(recomputed.summary.correlation.sync).toBeGreaterThan(0.7);
    expect(recomputed.summary.correlation.jev).toBeGreaterThan(
      recomputed.summary.correlation.sync
    );
  });

  it('was measured with the model the app is still using', () => {
    // The MODEL half of the record — the AUC, the pSkill means, the
    // evidence means — describes the model and the JD's requirement
    // lines. It does not go stale when the engine changes; it goes
    // stale when the MODEL does.
    //
    // So this is the guard for it: if `JEV_MODEL` is bumped, the
    // record's model half is describing a model that no longer runs,
    // and it has to be re-measured with `MEASURE_JEV=1`.
    //
    // (As of 2026-11-17 both are `jev-1.14.0`, so the model half was
    // still valid — only the engine half had drifted.)
    expect(fixture.summary.model).toBe(JEV_MODEL);
  });

  it('still separates the tiers on content quality', () => {
    const byTier = (tier: string) => {
      const sel = recomputed.measurements.filter((m) => m.tier === tier);
      return (
        sel.reduce((s, m) => s + m.jevContentQuality, 0) / Math.max(1, sel.length)
      );
    };
    expect(byTier('strong') - byTier('needs-work')).toBeGreaterThan(15);
  });
});
