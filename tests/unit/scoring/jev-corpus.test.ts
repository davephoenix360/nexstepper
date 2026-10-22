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
 * Plan: docs/plans/ats-scoring-v3-jev.md
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scoreResumeFromEnvelope } from '@/lib/scoring';
import { WEIGHTS_V2 } from '@/lib/scoring/score';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';

const corpus = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/ats-corpus.json'), 'utf8')
) as Array<{
  id: string;
  tier: string;
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
    idealScore: number;
    jevAtsMatching: number;
    skillLineCount: number;
  }>;
};

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

function compose(dims: Record<string, number>): number {
  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS_V2)) {
    total += (dims[key] ?? 0) * weight;
  }
  return Math.round(total);
}

const jevById = new Map(
  jevFixture.measurements.map((m) => [m.id, m])
);

describe('Jev can tell which JD terms are genuine skills', () => {
  it('separates real skills from non-skills with a high AUC', () => {
    expect(jevFixture.summary.auc).toBeGreaterThan(0.9);
    expect(jevFixture.summary.meanPSkillForRealSkills).toBeGreaterThan(
      jevFixture.summary.meanPSkillForNonSkills + 0.4
    );
  });

  it('classified 428 requirement lines across the corpus', () => {
    expect(jevFixture.summary.linesClassified).toBe(428);
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

describe('a Jev-derived ATS Matching dimension scores better', () => {
  const ideals: number[] = [];
  const baseline: number[] = [];
  const jevVariant: number[] = [];

  for (const entry of corpus) {
    const breakdown = scoreResumeFromEnvelope(
      resumeDataSchema.parse(entry.resume),
      jobPostingSchema.parse(entry.jd),
      new Date('2026-09-20'),
      { roleFitSimilarity: entry.precomputedRoleFitSimilarity }
    );
    const jev = jevById.get(entry.id)!;
    ideals.push(entry.idealScore);
    baseline.push(breakdown.overallScore);
    jevVariant.push(
      compose({
        ...breakdown.dimensionScores,
        atsMatching: jev.jevAtsMatching
      })
    );
  }

  const mae = (scores: number[]) =>
    scores.reduce((s, v, i) => s + Math.abs(v - ideals[i]!), 0) / scores.length;

  it('improves Pearson r against the hand-labelled ideal score', () => {
    const rBase = pearson(baseline, ideals);
    const rJev = pearson(jevVariant, ideals);
    // The committed acceptance gate for the current engine is r > 0.7.
    expect(rBase).toBeGreaterThan(0.7);
    // And Jev's dimension moves it the right way.
    expect(rJev).toBeGreaterThan(rBase);
  });

  it('cuts the mean absolute error against the ideal score', () => {
    expect(mae(jevVariant)).toBeLessThan(mae(baseline));
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
