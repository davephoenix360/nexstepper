/**
 * The Jev evaluation, pinned as an offline test.
 *
 * The expensive half — calling Jev over the 50-JD validation corpus —
 * lives in `tests/unit/scoring/jev-corpus.measure.test.ts` (run it with
 * `node scripts/measure-jev-corpus.cjs`). It calls the REAL
 * `evaluateJevRequirements`, so the fixture can only ever describe what
 * the app does. Its OUTPUT is committed as
 * `tests/fixtures/jev-corpus-measurements.json`, and THIS test asserts
 * the claims against that committed record — so CI needs no network and
 * spends no money.
 *
 * ## What it pins
 *
 *   - Jev separates genuine skills from non-skills (AUC).
 *   - Jev's evidence score discriminates: high for what the resume
 *     demonstrates, low for what it does not.
 *   - The Jev-scored resume correlates better with the hand-labelled
 *     ideal score than the token-based engine does.
 *
 * Plan: docs/plans/ats-scoring-v3-jev.md
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const jevFixture = JSON.parse(
  readFileSync(
    join(process.cwd(), 'tests/fixtures/jev-corpus-measurements.json'),
    'utf8'
  )
) as {
  summary: {
    model: string;
    corpusSize: number;
    linesClassified: number;
    classificationInput: string;
    scoreInput: string;
    meanPSkillForRealSkills: number;
    meanPSkillForNonSkills: number;
    auc: number;
    control: {
      n: number;
      meanEvidenceForTokenPresent: number;
      meanEvidenceForTokenAbsent: number;
      agreement: number;
    };
    correlation: { sync: number; jev: number };
    meanAbsoluteError: { sync: number; jev: number };
    wallClockSeconds: number;
  };
  measurements: Array<{
    id: string;
    tier: string;
    idealScore: number;
    syncOverall: number;
    jevOverall: number;
    syncIntentCoverage: number;
    jevIntentCoverage: number;
    syncContentQuality: number;
    jevContentQuality: number;
    syncMissedMust: string[];
    jevMissedMust: string[];
    control: Array<{
      text: string;
      tokenSaysCovered: boolean;
      evidence: number | null;
    }>;
    lines: Array<{
      text: string;
      bucket: string;
      pSkill: number;
      pGate: number;
      evidence: number | null;
    }>;
  }>;
};

describe('Jev can tell which JD entries are genuine skills', () => {
  it('separates real skills from non-skills with a high AUC', () => {
    expect(jevFixture.summary.auc).toBeGreaterThan(0.9);
    expect(jevFixture.summary.meanPSkillForRealSkills).toBeGreaterThan(
      jevFixture.summary.meanPSkillForNonSkills + 0.4
    );
  });

  it('measured the classification against a non-circular input', () => {
    // The requirement LINES and the hand-authored skill lists are
    // different things, so agreeing with them is a real result.
    expect(jevFixture.summary.classificationInput).toContain(
      'requirement lines'
    );
    expect(jevFixture.summary.linesClassified).toBe(428);
  });

  it('scores against the input production actually stores', () => {
    expect(jevFixture.summary.scoreInput).toContain('skill lists');
  });
});

describe('the evidence score discriminates rather than guessing', () => {
  it('scores what the resume demonstrates high and the rest low', () => {
    const { control } = jevFixture.summary;
    expect(control.meanEvidenceForTokenPresent).toBeGreaterThan(
      control.meanEvidenceForTokenAbsent + 1
    );
    // The token matcher says "covered" when the JD's words appear in
    // the resume — including when the resume says "No Python exposure".
    // Jev disagrees on those, which is the point.
    expect(control.meanEvidenceForTokenAbsent).toBeLessThan(0.6);
  });

  it('agrees with the token matcher most of the time', () => {
    expect(jevFixture.summary.control.agreement).toBeGreaterThan(0.85);
  });
});

describe('a Jev-scored resume correlates better with human judgement', () => {
  it('improves Pearson r against the hand-labelled ideal score', () => {
    const { sync, jev } = jevFixture.summary.correlation;
    // The committed acceptance gate for the current engine is r > 0.7.
    expect(sync).toBeGreaterThan(0.7);
    expect(jev).toBeGreaterThan(sync);
  });

  it('reduces the mean absolute error against the ideal score', () => {
    const { sync, jev } = jevFixture.summary.meanAbsoluteError;
    expect(jev).toBeLessThan(sync);
  });

  it('separates the tiers on content quality, which the lexical version barely did', () => {
    // The lexical accomplishment test ("does the bullet contain a
    // digit?") scored strong and needs-work resumes almost the same.
    // The semantic rubric does not.
    const byTier = (tier: string) => {
      const sel = jevFixture.measurements.filter((m) => m.tier === tier);
      return (
        sel.reduce((s, m) => s + m.jevContentQuality, 0) / Math.max(1, sel.length)
      );
    };
    const strong = byTier('strong');
    const needsWork = byTier('needs-work');
    expect(strong - needsWork).toBeGreaterThan(15);
  });
});

describe('the measurement itself is honest', () => {
  it('used a versioned model id, not a moving alias', () => {
    // `jev-latest` moves when TypeSafe ships, which would silently change
    // the numbers.
    expect(jevFixture.summary.model).toMatch(/^jev-\d+\.\d+\.\d+$/);
  });

  it('measured the whole corpus', () => {
    expect(jevFixture.summary.corpusSize).toBe(50);
    expect(jevFixture.measurements).toHaveLength(50);
  });
});
