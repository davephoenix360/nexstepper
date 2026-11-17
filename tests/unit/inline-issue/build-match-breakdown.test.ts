import { describe, expect, it } from 'vitest';

import {
  buildMatchBreakdown,
  maybeAppendSkillGapEntry
} from '@/lib/inline-issue/build-match-breakdown';
import type { ScoreBreakdown } from '@/lib/scoring';

/**
 * Tests for the server-side MatchBreakdown builder.
 *
 * The builder turns a `ScoreBreakdown` (7 dim scores) into a
 * `MatchBreakdown` JSONB row (7+1 rows sorted by weight DESC).
 * The scorecard's controller reads these rows to anchor the
 * inline-issue popovers, so the rows' shape is a contract that
 * the UI depends on.
 *
 * Plan: docs/plans/inline-issue-surface.md §"What you'll build" #9
 * + drift memo "MatchBreakdown writer is not wired" action item.
 */

const SAMPLE_BREAKDOWN: ScoreBreakdown = {
  overallScore: 72,
  computedInMs: 5,
  dimensionScores: {
    atsMatching: 60,
    structure: 80,
    contentQuality: 50,
    alignment: 70,
    intentCoverage: 75,
    roleFit: 85,
    seniorityFit: 90
  },
  // The other fields aren't read by the builder but TS still
  // requires them. Cast through unknown so the test fixture
  // doesn't have to enumerate every shape detail.
  criteriaScores: {} as never,
  intentCoverageBreakdown: {
    fallback: false,
    matched: { mustHave: [], niceToHave: [], implicit: [] },
    missed: { mustHave: [], niceToHave: [], implicit: [] }
  }
} as unknown as ScoreBreakdown;

describe('buildMatchBreakdown', () => {
  it('returns an empty array when the breakdown is null', () => {
    expect(buildMatchBreakdown(null)).toEqual([]);
  });

  it('returns an empty array when the breakdown is undefined', () => {
    expect(buildMatchBreakdown(undefined)).toEqual([]);
  });

  it('produces one row per dim bar (7 today)', () => {
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    expect(rows.length).toBe(7);
  });

  it('rows are sorted by weight DESC', () => {
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].weight).toBeGreaterThanOrEqual(rows[i].weight);
    }
  });

  it('weights are 0..1 with stronger emphasis on the gap', () => {
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    for (const row of rows) {
      expect(row.weight).toBeGreaterThanOrEqual(0);
      expect(row.weight).toBeLessThanOrEqual(1);
    }
    // The lowest-scoring dimension (Impact, 50) should have the
    // highest weight in the array. With the squared gap
    // formula, a 50% score → ~0.62 weight.
    const topRow = rows[0];
    expect(topRow.criterion).toBe('Accomplishment Focus');
    expect(topRow.weight).toBeGreaterThan(0.5);
  });

  it('every row carries a path + criterion + tipKind', () => {
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    for (const row of rows) {
      expect(row.path).toMatch(/^sections\./);
      expect(row.criterion).toBeTruthy();
      expect(['gap', 'rewrite']).toContain(row.tipKind);
    }
  });

  it('Intent Coverage and ATS Coverage rows are tipKind=gap', () => {
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    const gapRows = rows.filter((r) => r.tipKind === 'gap');
    expect(gapRows.some((r) => r.criterion === 'Intent Coverage')).toBe(true);
    expect(gapRows.some((r) => r.criterion === 'ATS Coverage')).toBe(true);
  });

  it('Seniority Fit row points at the summary path', () => {
    // Seniority Fit's fix is to call out adjacent experience, which is
    // a summary's job — not a job title's.
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    const seniority = rows.find((r) => r.criterion === 'Seniority Fit');
    expect(seniority).toBeDefined();
    expect(seniority?.path).toBe('sections.basics.summary');
  });

  it('Section Completeness row also points at the position title', () => {
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    const sc = rows.find((r) => r.criterion === 'Section Completeness');
    expect(sc?.path).toBe('sections.work.0.positions.0.title');
  });

  it('bullet-row criteria point at the first work bullet (with positions[0])', () => {
    const rows = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    const ats = rows.find((r) => r.criterion === 'ATS Coverage');
    expect(ats?.path).toBe('sections.work.0.positions.0.highlights.0');
  });

  it('is deterministic — same input produces same output', () => {
    const a = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    const b = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    expect(a).toEqual(b);
  });
});

describe('maybeAppendSkillGapEntry', () => {
  it('adds a Skills keyword row when intent-coverage is not fallback', () => {
    const base = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    const withGap = maybeAppendSkillGapEntry(base, SAMPLE_BREAKDOWN);
    expect(withGap.length).toBe(base.length + 1);
    const gap = withGap.find(
      (r) => r.path === 'sections.skills.0.keywords.0'
    );
    expect(gap).toBeDefined();
    expect(gap?.criterion).toBe('Intent Coverage');
    expect(gap?.tipKind).toBe('gap');
  });

  it('skips the skill-gap row when intent-coverage is fallback', () => {
    const base = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    const fallback = {
      ...SAMPLE_BREAKDOWN,
      intentCoverageBreakdown: {
        ...SAMPLE_BREAKDOWN.intentCoverageBreakdown,
        fallback: true
      }
    } as ScoreBreakdown;
    const withGap = maybeAppendSkillGapEntry(base, fallback);
    expect(withGap.length).toBe(base.length);
  });

  it('returns the input unchanged when the breakdown is null', () => {
    const base = buildMatchBreakdown(SAMPLE_BREAKDOWN);
    expect(maybeAppendSkillGapEntry(base, null)).toEqual(base);
  });
});
/**
 * The popover must open on a bullet the ADVICE names.
 *
 * ## The bug this pins
 *
 * Every bullet-shaped criterion anchored to bullet #1 — the first work
 * bullet in the resume — while the advice beside it named three SPECIFIC
 * bullets ("10 of 29 work bullets describe a task rather than an
 * outcome (Building Launchpad…; Conducted a personal audit…)").
 *
 * So the AI rewrite could rewrite a line the advice never mentioned. In
 * the founder's own resume the first bullet is a good one; the advice
 * named three others.
 *
 * The breakdown's `jevBullets` are aligned positionally to the flattened
 * work-bullet list, and `collectHighlightEntries` keeps that list's
 * coordinates — so an index maps back to the bullet it came from.
 */
describe('buildMatchBreakdown — the Impact row targets a bullet the advice names', () => {
  const RESUME = {
    sections: {
      work: [
        {
          company: 'Acme',
          positions: [
            {
              title: 'Engineer',
              highlights: [
                'Shipped the billing service, cutting p99 latency 40%',
                'Maintained the internal dashboard used by the support team',
                'Wrote the migration runbook the team still uses'
              ]
            }
          ]
        }
      ]
    }
  } as never;

  it('points at the weak bullet, not the first one', () => {
    const breakdown = {
      ...SAMPLE_BREAKDOWN,
      // The breakdown's jevBullets are aligned to the flattened
      // work-bullet list. Bullet 1 (index 1) is the weak one.
      jevBullets: [
        { impact: 2, opening: 2 },
        { impact: 1, opening: 1 },
        { impact: 2, opening: 2 }
      ]
    } as unknown as ScoreBreakdown;

    const rows = buildMatchBreakdown(breakdown, RESUME);
    const impact = rows.find((r) => r.criterion === 'Accomplishment Focus');
    expect(impact?.path).toBe('sections.work.0.positions.0.highlights.1');
    // NOT the first bullet.
    expect(impact?.path).not.toBe('sections.work.0.positions.0.highlights.0');
  });

  it('falls back to the default path when there is no weak bullet', () => {
    const breakdown = {
      ...SAMPLE_BREAKDOWN,
      jevBullets: [
        { impact: 2, opening: 2 },
        { impact: 2, opening: 2 }
      ]
    } as unknown as ScoreBreakdown;

    const rows = buildMatchBreakdown(breakdown, RESUME);
    const impact = rows.find((r) => r.criterion === 'Accomplishment Focus');
    expect(impact?.path).toBe('sections.work.0.positions.0.highlights.0');
  });

  it('falls back to the default path when the resume was not passed', () => {
    const breakdown = {
      ...SAMPLE_BREAKDOWN,
      jevBullets: [{ impact: 1, opening: 1 }]
    } as unknown as ScoreBreakdown;

    const rows = buildMatchBreakdown(breakdown);
    const impact = rows.find((r) => r.criterion === 'Accomplishment Focus');
    expect(impact?.path).toBe('sections.work.0.positions.0.highlights.0');
  });

  it('never points at a bullet that does not exist', () => {
    const breakdown = {
      ...SAMPLE_BREAKDOWN,
      // More Jev bullets than the resume has — the index is out of
      // range, so the default path is used rather than a dead path.
      jevBullets: [
        { impact: 2, opening: 2 },
        { impact: 2, opening: 2 },
        { impact: 2, opening: 2 },
        { impact: 1, opening: 1 }
      ]
    } as unknown as ScoreBreakdown;

    const rows = buildMatchBreakdown(breakdown, RESUME);
    const impact = rows.find((r) => r.criterion === 'Accomplishment Focus');
    expect(impact?.path).toBe('sections.work.0.positions.0.highlights.0');
  });
});