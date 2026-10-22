/**
 * Tests for the Intent Coverage dimension's Jev integration.
 *
 * ## The two bugs this fixes
 *
 * **False negative.** A JD asking for `Postgres` against a resume
 * saying `PostgreSQL` — the candidate HAS the skill, and was penalised
 * 8 points and told to add a skill they already have.
 *
 * **False positive.** The token matcher asks "do the JD's words appear
 * in the resume?". A candidate whose summary says *"No ML / Python /
 * PyTorch exposure"* contains the words, so they were credited with
 * Python and PyTorch.
 *
 * Both come from the same cause: a literal test standing in for a
 * semantic question. Jev answers the semantic question.
 *
 * ## And the gates
 *
 * A JD requirement the candidate cannot satisfy by adding content — a
 * degree, a certification, work authorisation, a years-of-experience
 * threshold — is not a skill gap. Telling someone to add "5+ years of
 * experience" to their resume is not advice.
 */
import { describe, expect, it } from 'vitest';

import { scoreIntentCoverageParams } from '@/lib/scoring/dimensions/intent-coverage';
import { EVIDENCE_COVERED_THRESHOLD } from '@/lib/scoring/jev-requirements';

const RESUME_TEXT = `
Jane Doe — Software Engineer
Languages: TypeScript, Python, SQL
Data: PostgreSQL, Docker, AWS
Built a TypeScript API for a clinic network.
`;

describe('Intent Coverage with Jev', () => {
  it('credits a skill the resume shows under a different name', () => {
    const withoutJev = scoreIntentCoverageParams({
      mustHaveSkills: ['Postgres'],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: RESUME_TEXT.toLowerCase()
    });
    // The token test cannot see that PostgreSQL is Postgres.
    expect(withoutJev.missed.mustHave).toEqual(['Postgres']);

    const withJev = scoreIntentCoverageParams({
      mustHaveSkills: ['Postgres'],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: RESUME_TEXT.toLowerCase(),
      jevSkills: {
        scorable: { must: ['Postgres'], nice: [], implicit: [] },
        evidence: { Postgres: 2.1 }
      }
    });
    expect(withJev.missed.mustHave).toEqual([]);
    expect(withJev.value).toBe(100);
  });

  it('reports a skill the resume only disclaims as missing', () => {
    const withJev = scoreIntentCoverageParams({
      mustHaveSkills: ['Python'],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower:
        'Mid QA analyst. No ML / Python / PyTorch exposure. Wrote 30+ Selenium scripts.',
      jevSkills: {
        scorable: { must: ['Python'], nice: [], implicit: [] },
        evidence: { Python: 0.3 }
      }
    });
    expect(withJev.missed.mustHave).toEqual(['Python']);
  });

  it('excludes an eligibility gate from the penalty', () => {
    // "5+ years of experience" is a gate — the candidate cannot add it
    // to their resume.
    const withJev = scoreIntentCoverageParams({
      mustHaveSkills: ['5+ years of engineering experience', 'TypeScript'],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: RESUME_TEXT.toLowerCase(),
      jevSkills: {
        scorable: { must: ['TypeScript'], nice: [], implicit: [] },
        evidence: { '5+ years of engineering experience': 0, TypeScript: 2.5 }
      }
    });
    expect(withJev.missed.mustHave).toEqual([]);
    expect(withJev.value).toBe(100);
  });

  it('still scores a duty or soft skill, because a candidate CAN show it', () => {
    // "Cross-functional leadership" is not a gate — the candidate can
    // demonstrate it. So it stays scored, and "covered" is decided by
    // the evidence rather than by dropping the entry.
    const withJev = scoreIntentCoverageParams({
      mustHaveSkills: ['Cross-functional leadership'],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: RESUME_TEXT.toLowerCase(),
      jevSkills: {
        scorable: { must: ['Cross-functional leadership'], nice: [], implicit: [] },
        evidence: { 'Cross-functional leadership': 0.1 }
      }
    });
    expect(withJev.missed.mustHave).toEqual(['Cross-functional leadership']);
    expect(withJev.value).toBeLessThan(100);
  });

  it('falls back to the token test for an entry with no evidence score', () => {
    const withJev = scoreIntentCoverageParams({
      mustHaveSkills: ['TypeScript', 'Kubernetes'],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: RESUME_TEXT.toLowerCase(),
      jevSkills: {
        scorable: { must: ['TypeScript', 'Kubernetes'], nice: [], implicit: [] },
        evidence: { TypeScript: 2.5 }
      }
    });
    // Kubernetes has no evidence entry, so the token test decides — and
    // it is not in the resume.
    expect(withJev.missed.mustHave).toEqual(['Kubernetes']);
  });

  it('is unchanged when Jev did not run', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: ['TypeScript', 'Kubernetes'],
      niceToHaveSkills: ['GraphQL'],
      implicitSkills: [],
      resumeTextLower: RESUME_TEXT.toLowerCase()
    });
    expect(result.missed.mustHave).toEqual(['Kubernetes']);
    expect(result.missed.niceToHave).toEqual(['GraphQL']);
  });
});

describe('the covered threshold', () => {
  it('treats a skill the resume merely LISTS as covered', () => {
    // The evidence score is a probability-weighted position on the 0–3
    // rubric, so a resume that lists a skill lands on about 0.99, not
    // 1.0. A threshold of 1.0 reported skills the candidate plainly has
    // as missing.
    expect(EVIDENCE_COVERED_THRESHOLD).toBe(0.5);
  });
});
