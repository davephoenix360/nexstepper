import { describe, expect, it } from 'vitest';

import { scoreAlignment } from '@/lib/scoring/dimensions/alignment';

/**
 * Regression tests for the `tailoring` sub-criterion.
 *
 * ## What was wrong
 *
 * `tailoring` was `jaccard(tokenize(summary), tokenize(title)) * 100` — i.e.
 * `|A ∩ B| / |A ∪ B|` with A = the whole summary and B = the JD title.
 *
 * The numerator can never exceed the title's token count (2–4 in practice)
 * while the denominator is the entire summary, so the sub-criterion was
 * mathematically capped near 10% for a realistic summary length — and the cap
 * *tightened* as the summary got longer, so a more detailed summary lowered
 * its own tailoring score.
 *
 * Measured across the 50-entry validation corpus, `alignment` averaged 12.7
 * with a max of 41.5. The corpus harness had already noted it as "known
 * compression" without fixing it.
 *
 * It is now **recall** of the title's vocabulary: `|summary ∩ title| / |title|`.
 */
const extras = { hasProjects: true, hasAwards: false, hasPublications: false };

function tailoringOf(summary: string, title: string): number {
  return scoreAlignment(
    { basics: { summary, label: '' }, skills: [], work: [] },
    { title },
    extras
  ).breakdown.tailoring;
}

describe('alignment.tailoring — recall, not Jaccard', () => {
  it('reaches 100 when the summary names every word of the title', () => {
    expect(tailoringOf('Staff backend engineer', 'Staff Backend Engineer')).toBe(100);
  });

  it('is 0 when the summary shares nothing with the title', () => {
    expect(tailoringOf('B pastry chef', 'Staff Backend Engineer')).toBe(0);
  });

  it('is proportional for partial overlap', () => {
    // Title "Staff Backend Engineer" tokenises to {staff, backend, engineer}
    // — 3 tokens. The summary names 2 of them → 2/3 ≈ 66.67.
    expect(
      tailoringOf(
        'backend engineer focused on distributed systems',
        'Staff Backend Engineer'
      )
    ).toBeCloseTo(66.67, 1);
  });

  it('does NOT shrink as the summary gets longer', () => {
    // The defining property of the fix. Under the old Jaccard, adding
    // relevant sentences *lowered* the score, because it grew the
    // denominator while the numerator was capped by the title.
    const short = tailoringOf('Backend engineer', 'Backend Engineer');
    const long = tailoringOf(
      'Backend engineer with nine years of experience across payments, ' +
        'identity, billing, ledger, reconciliation, reporting and ' +
        'platform infrastructure, plus mentoring and incident response.',
      'Backend Engineer'
    );
    expect(short).toBe(100);
    expect(long).toBe(100);
  });

  it('cannot be dragged down by a verbose summary on a short title', () => {
    // A 3-token title against a very long summary: Jaccard would have been
    // ~3/40 ≈ 8. Recall is bounded by the title instead.
    const verbose =
      'backend engineer with deep experience across many technologies and ' +
      'teams, known for delivery, mentorship, incident response, cost ' +
      'reduction, and platform modernisation, previously at several ' +
      'organisations';
    expect(tailoringOf(verbose, 'Backend Engineer')).toBe(100);
  });

  it('returns 0 rather than NaN when the title is empty', () => {
    expect(tailoringOf('Backend engineer', '')).toBe(0);
  });

  it('returns 0 rather than NaN when the summary is empty', () => {
    expect(tailoringOf('', 'Backend Engineer')).toBe(0);
  });

  it('is not fooled by a title of stopword-only tokens', () => {
    // tokenize() drops 1-char tokens; if a title produced an empty set we
    // must return 0, not divide by zero.
    expect(Number.isFinite(tailoringOf('Backend engineer', 'a b c d'))).toBe(true);
  });
});

describe('alignment — value stays on a 0-100 scale', () => {
  it('can now exceed the ~43 ceiling the old tailoring cap imposed', () => {
    // Best case for every sub-criterion: full title coverage, extras, and a
    // soft-skill mention. Under Jaccard this could not exceed ~43.
    const best = scoreAlignment(
      {
        basics: {
          summary: 'Backend engineer who leads cross-functional teams',
          label: 'Backend Engineer'
        },
        skills: [{ name: 'Communication', keywords: ['stakeholder management'] }],
        work: []
      },
      { title: 'Backend Engineer' },
      extras
    );
    expect(best.breakdown.tailoring).toBe(100);
    expect(best.breakdown.hasExtras).toBe(100);
    expect(best.breakdown.softSkills).toBeGreaterThan(0);
    expect(best.value).toBeGreaterThan(43);
  });

  it('returns 0 for an empty resume rather than throwing', () => {
    const r = scoreAlignment(
      { basics: { summary: '', label: '' }, skills: [], work: [] },
      { title: 'Backend Engineer' },
      { hasProjects: false, hasAwards: false, hasPublications: false }
    );
    expect(r.value).toBe(0);
  });
});
