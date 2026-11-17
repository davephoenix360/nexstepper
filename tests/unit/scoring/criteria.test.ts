import { describe, expect, it } from 'vitest';

import {
  CRITERION_DIMENSIONS,
  criterionRows,
  weakestCriterionOf,
  weakestMeasuredCriterion
} from '@/lib/scoring/criteria';
import type { ScoreBreakdown } from '@/lib/scoring/score';
import type { SubCriterionKey } from '@/lib/inline-issue/types';

/**
 * The criteria layer — the fine-grained sub-scores behind each
 * dimension bar.
 *
 * ## Why this module needs its own tests
 *
 * Two failure modes it exists to prevent:
 *
 *  1. **A criterion that could not be measured is reported as the
 *     weakest thing to fix.** Intent Coverage, Role Fit and Seniority
 *     Fit all return 50 — the engine's neutral default — when there
 *     is no signal to measure. 50 looks like a mediocre score. It is
 *     a non-measurement. Pointing a candidate at one sends them to
 *     fix something that is not broken.
 *
 *  2. **Two lists of criteria drift.** The scorecard's drill-down
 *     (`lib/inline-issue/dimension-criteria.ts`) and the chat agent
 *     both need the criterion → dimension map. There is now ONE map,
 *     and the test below asserts it still agrees with the union the
 *     inline-issue surface declares.
 */

function makeScore(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    overallScore: 47,
    computedInMs: 12,
    dimensionScores: {
      atsMatching: 42,
      structure: 78,
      contentQuality: 55,
      alignment: 51,
      intentCoverage: 45,
      roleFit: 82,
      seniorityFit: 85
    },
    criteriaScores: {
      'ATS Keyword Match': 40,
      'ATS Similarity': 50,
      'Intent Coverage': 45,
      'Section Completeness': 80,
      'Optimal Length': 75,
      'Accomplishment Focus': 55,
      'Action Verb Usage': 60,
      Tailoring: 50,
      'Unique Value': 55,
      'Soft Skills': 50,
      'Role Fit': 82,
      'Seniority Fit': 85
    },
    intentCoverageBreakdown: {
      value: 45,
      missed: { mustHave: [], niceToHave: [], implicit: [] },
      penalty: 50,
      fallback: false,
      eligibility: []
    },
    ...overrides
  };
}

/** A score where every criterion was measured. */
function measuredScore(): ScoreBreakdown {
  return makeScore({
    roleFit: { similarity: 0.82, fallback: false },
    seniorityFit: { resumeYears: 6, jdYearsMin: 5, gap: 1, fallback: false }
  });
}

describe('the canonical criterion map', () => {
  it('covers exactly the criteria the inline-issue surface declares', () => {
    // Compile-time half: this line fails to type-check if the two
    // lists ever disagree.
    const everyInlineCriterion: Record<SubCriterionKey, true> = {
      'ATS Keyword Match': true,
      'ATS Similarity': true,
      'Intent Coverage': true,
      'Section Completeness': true,
      'Optimal Length': true,
      'Accomplishment Focus': true,
      'Action Verb Usage': true,
      Tailoring: true,
      'Unique Value': true,
      'Soft Skills': true,
      'Role Fit': true,
      'Seniority Fit': true
    };
    const declared = Object.keys(everyInlineCriterion);

    // Runtime half: the map and the union are the same set.
    expect(Object.keys(CRITERION_DIMENSIONS).sort()).toEqual(
      declared.sort()
    );
  });

  it('covers exactly the criteria the engine produces', () => {
    const produced = Object.keys(makeScore().criteriaScores).sort();
    expect(Object.keys(CRITERION_DIMENSIONS).sort()).toEqual(produced);
  });

  it('maps every criterion to one of the seven scorecard dimensions', () => {
    const dimensions = new Set(Object.values(CRITERION_DIMENSIONS));
    expect([...dimensions].sort()).toEqual(
      [
        'Experience match',
        'Format',
        'Impact',
        'Intent coverage',
        'Keywords',
        'Role fit',
        'Seniority fit'
      ].sort()
    );
  });
});

describe('criterionRows', () => {
  it('returns one row per criterion, with its dimension', () => {
    const rows = criterionRows(measuredScore());
    expect(rows).toHaveLength(12);
    const focus = rows.find((r) => r.criterion === 'Accomplishment Focus');
    expect(focus?.dimension).toBe('Impact');
    expect(focus?.score).toBe(55);
    expect(focus?.measurement).toBe('measured');
  });

  it('skips criteria missing from an old snapshot instead of reporting zero', () => {
    const score = makeScore();
    // A snapshot written before `Soft Skills` existed.
    delete (score.criteriaScores as Record<string, number>)['Soft Skills'];
    const rows = criterionRows(score);
    expect(rows.some((r) => r.criterion === 'Soft Skills')).toBe(false);
    expect(rows).toHaveLength(11);
  });
});

describe('the measurement status', () => {
  it('treats Intent Coverage as not measured when v2 intent extraction fell back', () => {
    const score = makeScore();
    score.intentCoverageBreakdown.fallback = true;
    const row = criterionRows(score).find((r) => r.criterion === 'Intent Coverage');
    expect(row?.measurement).toBe('not-measured');
    expect(row?.note).toMatch(/intent extraction/i);
  });

  it('treats Role Fit as not measured when there was no title signal', () => {
    const score = makeScore({
      roleFit: { similarity: null, fallback: true }
    });
    const row = criterionRows(score).find((r) => r.criterion === 'Role Fit');
    expect(row?.measurement).toBe('not-measured');
  });

  it('treats a Role Fit reading of exactly the engine default, with no recorded signal, as not measured', () => {
    // An old persisted snapshot: no `roleFit` block at all.
    const score = makeScore();
    score.criteriaScores['Role Fit'] = 50;
    const row = criterionRows(score).find((r) => r.criterion === 'Role Fit');
    expect(row?.measurement).toBe('not-measured');
  });

  it('treats a Role Fit reading with no recorded signal but a non-default value as measured', () => {
    // The engine only produces a non-neutral value when it had a
    // signal, so a non-default reading IS a measurement.
    const score = makeScore();
    delete score.roleFit;
    score.criteriaScores['Role Fit'] = 71;
    const row = criterionRows(score).find((r) => r.criterion === 'Role Fit');
    expect(row?.measurement).toBe('measured');
  });

  it('treats Seniority Fit as not measured when there was no years signal', () => {
    const score = makeScore({
      seniorityFit: { resumeYears: 0, jdYearsMin: null, gap: null, fallback: true }
    });
    const row = criterionRows(score).find((r) => r.criterion === 'Seniority Fit');
    expect(row?.measurement).toBe('not-measured');
  });
});

describe('the weakest sub-criterion', () => {
  it('is the lowest-scoring criterion that was actually measured', () => {
    const weakest = weakestCriterionOf(measuredScore());
    expect(weakest?.criterion).toBe('ATS Keyword Match');
    expect(weakest?.score).toBe(40);
    expect(weakest?.dimension).toBe('Keywords');
  });

  it('never names a criterion that could not be measured', () => {
    // With the intent extraction in fallback, Intent Coverage mirrors
    // the keyword match instead of measuring requirement coverage, so
    // it is not a weakness of its own. Role Fit and Seniority Fit read
    // far lower but had no signal at all.
    const score = makeScore();
    score.intentCoverageBreakdown.fallback = true;
    score.roleFit = { similarity: null, fallback: true };
    score.criteriaScores['Role Fit'] = 12; // lowest of all, but unmeasured
    score.seniorityFit = { resumeYears: 0, jdYearsMin: null, gap: null, fallback: true };
    score.criteriaScores['Seniority Fit'] = 9; // lowest of all, but unmeasured

    const weakest = weakestCriterionOf(score);
    expect(weakest?.criterion).toBe('ATS Keyword Match');
  });

  it('is null when nothing was measured', () => {
    const score = makeScore();
    const rows = criterionRows(score).map((r) => ({
      ...r,
      measurement: 'not-measured' as const
    }));
    expect(weakestMeasuredCriterion(rows)).toBeNull();
  });
});
