/**
 * Tests for the Jev-derived requirement fit.
 *
 * The arithmetic is pure: given an evaluation, produce the ATS Keyword
 * Match sub-score. These tests pin the behaviour that matters —
 * a missing or unusable evaluation must NOT produce a number, because a
 * fabricated score is worse than the token-based one it would replace.
 */
import { describe, expect, it } from 'vitest';

import {
  COVERAGE_WEIGHT,
  DEPTH_WEIGHT,
  EVIDENCE_RUBRIC,
  scoreJevRequirementFit,
  type JevRequirementEvaluation
} from '@/lib/scoring/jev-requirements';

function evaluation(
  requirements: Array<{ text: string; evidence: number }>,
  overrides: Partial<JevRequirementEvaluation> = {}
): JevRequirementEvaluation {
  return {
    lines: [],
    requirements,
    gates: [],
    scorable: { must: [], nice: [], implicit: [] },
    ok: true,
    ...overrides
  };
}

describe('scoreJevRequirementFit', () => {
  it('returns null when there is no evaluation', () => {
    expect(scoreJevRequirementFit(null)).toBeNull();
    expect(scoreJevRequirementFit(undefined)).toBeNull();
  });

  it('returns null when the evaluation did not succeed', () => {
    expect(
      scoreJevRequirementFit(evaluation([], { ok: false }))
    ).toBeNull();
  });

  it('returns null when there are no genuine requirements to measure', () => {
    expect(scoreJevRequirementFit(evaluation([]))).toBeNull();
  });

  it('scores a fully evidenced resume at 100', () => {
    const fit = scoreJevRequirementFit(
      evaluation([
        { text: 'TypeScript', evidence: 3 },
        { text: 'PostgreSQL', evidence: 3 }
      ])
    )!;
    expect(fit.coverage).toBe(1);
    expect(fit.depth).toBe(1);
    expect(fit.keywordScore).toBe(100);
    expect(fit.missing).toEqual([]);
  });

  it('scores a resume with no evidence at 0', () => {
    const fit = scoreJevRequirementFit(
      evaluation([
        { text: 'TypeScript', evidence: 0 },
        { text: 'PostgreSQL', evidence: 0 }
      ])
    )!;
    expect(fit.coverage).toBe(0);
    expect(fit.depth).toBe(0);
    expect(fit.keywordScore).toBe(0);
    expect(fit.missing).toEqual(['TypeScript', 'PostgreSQL']);
  });

  it('separates coverage from depth', () => {
    // Two requirements: one listed as a skill (evidence 1), one not
    // mentioned at all (evidence 0).
    const fit = scoreJevRequirementFit(
      evaluation([
        { text: 'TypeScript', evidence: 1 },
        { text: 'Kubernetes', evidence: 0 }
      ])
    )!;
    expect(fit.coverage).toBe(0.5);
    expect(fit.depth).toBeCloseTo(1 / 6, 5);
    expect(fit.keywordScore).toBeCloseTo(
      100 * (COVERAGE_WEIGHT * 0.5 + DEPTH_WEIGHT * (1 / 6)),
      5
    );
    expect(fit.missing).toEqual(['Kubernetes']);
  });

  it('weights coverage and depth equally', () => {
    expect(COVERAGE_WEIGHT).toBe(0.5);
    expect(DEPTH_WEIGHT).toBe(0.5);
  });

  it('uses a fractional evidence depth — a score is a probability-weighted position', () => {
    const fit = scoreJevRequirementFit(
      evaluation([{ text: 'TypeScript', evidence: 2.5 }])
    )!;
    expect(fit.depth).toBeCloseTo(2.5 / 3, 5);
    expect(fit.coverage).toBe(1);
  });
});

describe('the evidence rubric', () => {
  it('runs from "no mention" to "a concrete outcome"', () => {
    expect(EVIDENCE_RUBRIC).toHaveLength(4);
    expect(EVIDENCE_RUBRIC[0]).toMatch(/no mention/i);
    expect(EVIDENCE_RUBRIC[3]).toMatch(/concrete outcome/i);
  });
});
