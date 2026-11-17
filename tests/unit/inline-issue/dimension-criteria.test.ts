/**
 * The criteria that share a dimension.
 *
 * ## Why this exists
 *
 * The scorecard renders SEVEN dimension bars, and each bar showed ONE
 * criterion's advice. The other six criteria had nowhere to live:
 *
 *   Keywords          → ATS Keyword Match            (ATS Similarity: orphan)
 *   Format            → Section Completeness          (Optimal Length: orphan)
 *   Impact            → Accomplishment Focus         (Action Verb Usage: orphan)
 *   Experience match  → Tailoring                     (Unique Value, Soft Skills)
 *   Intent coverage   → Intent Coverage
 *   Role fit          → Role Fit
 *   Seniority fit     → Seniority Fit
 *
 * Those orphans were not orphan DATA — each one is advice about the
 * same dimension the bar represents. The Impact bar talked about
 * bullets that "describe a task rather than an outcome" but never about
 * the bullets that "open weakly or passively" — both are about the same
 * bullets.
 *
 * So the popover shows every criterion tip for the dimension you
 * clicked.
 */
import { describe, expect, it } from 'vitest';

import {
  CRITERION_TO_DIMENSION,
  siblingCriteria
} from '@/lib/inline-issue/dimension-criteria';
import type { SubCriterionKey } from '@/lib/inline-issue/types';

const ALL: SubCriterionKey[] = [
  'ATS Keyword Match',
  'ATS Similarity',
  'Section Completeness',
  'Optimal Length',
  'Accomplishment Focus',
  'Action Verb Usage',
  'Tailoring',
  'Unique Value',
  'Soft Skills',
  'Intent Coverage',
  'Role Fit',
  'Seniority Fit'
];

describe('CRITERION_TO_DIMENSION', () => {
  it('covers every criterion', () => {
    expect(Object.keys(CRITERION_TO_DIMENSION).sort()).toEqual([...ALL].sort());
  });

  it('groups the criteria that measure the same thing', () => {
    expect(CRITERION_TO_DIMENSION['Accomplishment Focus']).toBe(
      CRITERION_TO_DIMENSION['Action Verb Usage']
    );
    expect(CRITERION_TO_DIMENSION.Tailoring).toBe(
      CRITERION_TO_DIMENSION['Unique Value']
    );
    expect(CRITERION_TO_DIMENSION.Tailoring).toBe(
      CRITERION_TO_DIMENSION['Soft Skills']
    );
  });

  it('keeps the dimensions that are genuinely different apart', () => {
    expect(CRITERION_TO_DIMENSION['Role Fit']).not.toBe(
      CRITERION_TO_DIMENSION['Seniority Fit']
    );
    expect(CRITERION_TO_DIMENSION['Section Completeness']).not.toBe(
      CRITERION_TO_DIMENSION['Accomplishment Focus']
    );
    expect(CRITERION_TO_DIMENSION['ATS Keyword Match']).toBe(
      CRITERION_TO_DIMENSION['ATS Similarity']
    );
  });
});

describe('siblingCriteria', () => {
  it('returns the clicked criterion FIRST', () => {
    expect(siblingCriteria('Accomplishment Focus')[0]).toBe('Accomplishment Focus');
    expect(siblingCriteria('Tailoring')[0]).toBe('Tailoring');
  });

  it('returns the whole dimension', () => {
    expect(siblingCriteria('Accomplishment Focus').sort()).toEqual(
      ['Accomplishment Focus', 'Action Verb Usage'].sort()
    );
    expect(siblingCriteria('Tailoring').sort()).toEqual(
      ['Soft Skills', 'Tailoring', 'Unique Value'].sort()
    );
    expect(siblingCriteria('ATS Keyword Match').sort()).toEqual(
      ['ATS Keyword Match', 'ATS Similarity'].sort()
    );
  });

  it('returns just the criterion for a single-criterion dimension', () => {
    expect(siblingCriteria('Intent Coverage')).toEqual(['Intent Coverage']);
    expect(siblingCriteria('Role Fit')).toEqual(['Role Fit']);
    expect(siblingCriteria('Seniority Fit')).toEqual(['Seniority Fit']);
  });

  it('never returns a criterion twice', () => {
    for (const criterion of ALL) {
      const siblings = siblingCriteria(criterion);
      expect(new Set(siblings).size).toBe(siblings.length);
      expect(siblings).toContain(criterion);
    }
  });
});
