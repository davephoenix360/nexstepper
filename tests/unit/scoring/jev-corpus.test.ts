/**
 * The Jev evaluation, pinned as an offline test.
 *
 * The expensive half — calling Jev over the 50-JD validation corpus —
 * lives in `scripts/measure-jev-corpus.cjs`, because it needs the network
 * and a gateway key. Its OUTPUT is committed as
 * `tests/fixtures/jev-corpus-measurements.json`, and THIS test asserts the
 * claims that matter against that committed record.
 *
 * So a regression in the engine, in the corpus, or in the way the Jev
 * numbers are composed fails the build — without CI needing a network
 * call or spending a cent.
 *
 * ## Two input shapes, measured separately
 *
 * The fixture records both, because they answer different questions:
 *
 *   - **The classification measurement** feeds Jev the JD's requirement
 *     LINES and validates the resulting probabilities against the
 *     corpus's hand-authored skill lists. That is not circular: the
 *     lines and the ground truth are different things. This is where the
 *     AUC comes from.
 *
 *   - **The score measurement** feeds Jev the intent extractor's skill
 *     lists, because THAT is what production stores — the variant editor
 *     saves the pasted JD as raw text and leaves `jobContext.requirements`
 *     empty forever. This is where the score improvement comes from.
 *
 * Plan: docs/plans/ats-scoring-v3-jev.md
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scoreResumeFromEnvelope } from '@/lib/scoring';
import { WEIGHTS, WEIGHTS_V2 } from '@/lib/scoring/score';
import { scoreJevRequirementFit } from '@/lib/scoring/jev-requirements';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';

const corpus = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/ats-corpus.json'), 'utf8')
) as Array<{
  id: string;
  idealScore: number;
  precomputedRoleFitSimilarity: number;
  jd: unknown;
  resume: unknown;
}>;

const jevFixture = JSON.parse(
  readFileSync(
    join(process.cwd(), 'tests/fixtures/jev-corpus-measurements.json'),
    'utf8'
  )
) as {
  summary: {
    model: string;
    linesClassified: number;
    skillLineRate: number;
    classificationInput: string;
    scoreInput: string;
    meanPSkillForRealSkills: number;
    meanPSkillForNonSkills: number;
    auc: number;
    control: {
      n: number;
      meanPDemonstratedForPresent: number;
      meanPDemonstratedForAbsent: number;
      agreement: number;
    };
    usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  };
  measurements: Array<{
    id: string;
    jevAtsMatching: number;
    jevCoverage: number;
    jevDepth: number;
    classified: Array<{ line: string; pSkill: number }>;
    evidence: Array<{ line: string; evidence: number }>;
  }>;
};

const jevById = new Map(jevFixture.measurements.map((m) => [m.id, m]));

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return cov / Math.sqrt(vx * vy);
}

describe('Jev can tell which JD lines are genuine skills', () => {
  it('separates real skills from non-skills with a high AUC', () => {
    expect(jevFixture.summary.auc).toBeGreaterThan(0.9);
    expect(jevFixture.summary.meanPSkillForRealSkills).toBeGreaterThan(
      jevFixture.summary.meanPSkillForNonSkills + 0.4
    );
  });

  it('measured the classification against a non-circular input', () => {
    expect(jevFixture.summary.classificationInput).toContain(
      'requirement lines'
    );
    expect(jevFixture.summary.linesClassified).toBe(428);
  });

  it('scores against the input production actually stores', () => {
    expect(jevFixture.summary.scoreInput).toContain('skill lists');
  });
});

describe('Jev discriminates rather than guessing', () => {
  it('gives high probability to skills the resume HAS and low to skills it lacks', () => {
    const { control } = jevFixture.summary;
    expect(control.meanPDemonstratedForPresent).toBeGreaterThan(
      control.meanPDemonstratedForAbsent + 0.4
    );
    expect(control.meanPDemonstratedForAbsent).toBeLessThan(0.3);
  });

  it('agrees with the token matcher most of the time', () => {
    // The token matcher is NOT broken — it is accurate about which skills
    // are present. This assertion exists so a future change that breaks
    // that accuracy is noticed.
    expect(jevFixture.summary.control.agreement).toBeGreaterThan(0.7);
  });
});

describe('a Jev-derived keyword score correlates better with human judgement', () => {
  const ideals: number[] = [];
  const baseline: number[] = [];
  const withJev: number[] = [];

  for (const entry of corpus) {
    const breakdown = scoreResumeFromEnvelope(
      resumeDataSchema.parse(entry.resume),
      jobPostingSchema.parse(entry.jd),
      new Date('2026-09-20'),
      { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
    );
    const j = jevById.get(entry.id)!;

    // Rebuild the evaluation the async pass produces, from the recorded
    // classification + evidence, so the test exercises the same pure
    // arithmetic the production path uses.
    const evaluation = {
      lines: [],
      requirements: j.evidence.map((e) => ({ text: e.line, evidence: e.evidence })),
      gates: [],
      ok: true
    };
    const fit = scoreJevRequirementFit(evaluation)!;

    const useV2 = !breakdown.intentCoverageBreakdown.fallback;
    const weights = useV2 ? WEIGHTS_V2 : WEIGHTS;

    // Shape C: the keyword sub-criterion becomes Jev's coverage + depth;
    // similarity and coverage are untouched.
    const keywordScore = fit.keywordScore;
    const similarity = breakdown.criteriaScores['ATS Similarity'];
    const coverage = breakdown.criteriaScores['ATS Coverage'];
    const hasReq =
      (jobPostingSchema.parse(entry.jd).requirements?.length ?? 0) > 0;
    const w = hasReq
      ? { keyword: 0.6, similarity: 0.2, coverage: 0.2 }
      : { keyword: 0.75, similarity: 0.25, coverage: 0 };

    const compose = (atsMatching: number) => {
      const d = { ...breakdown.dimensionScores, atsMatching } as Record<
        string,
        number
      >;
      let total = 0;
      for (const [key, weight] of Object.entries(weights)) {
        total += (d[key] ?? 0) * weight;
      }
      return Math.round(total);
    };

    ideals.push(entry.idealScore);
    baseline.push(breakdown.overallScore);
    withJev.push(
      compose(
        w.keyword * keywordScore +
          w.similarity * similarity +
          w.coverage * coverage
      )
    );
  }

  it('improves Pearson r against the hand-labelled ideal score', () => {
    const rBase = pearson(baseline, ideals);
    const rJev = pearson(withJev, ideals);
    // The committed acceptance gate for the current engine is r > 0.7.
    expect(rBase).toBeGreaterThan(0.7);
    expect(rJev).toBeGreaterThan(rBase);
  });

  it('reduces the mean absolute error against the ideal score', () => {
    // The engine is systematically generous (the corpus's ideal mean is
    // 58.7 and the baseline scores 66.0) and the Jev variant does not
    // fix that — it is a small move UP, not down. What it does fix is
    // the distance from the ideal score.
    const mae = (a: number[]) =>
      a.reduce((s, v, i) => s + Math.abs(v - ideals[i]!), 0) / a.length;
    expect(mae(withJev)).toBeLessThan(mae(baseline));
  });
});

describe('the cost of the Jev path is not a real cost', () => {
  it('measured a full 50-JD sweep for under a cent', () => {
    expect(jevFixture.summary.usage.estimatedCostUsd).toBeLessThan(0.01);
  });

  it('used a versioned model id, not a moving alias', () => {
    // `jev-latest` moves when TypeSafe ships, which would silently change
    // the numbers. The measurement pins the version.
    expect(jevFixture.summary.model).toMatch(/^jev-\d+\.\d+\.\d+$/);
  });
});
