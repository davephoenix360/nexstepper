import { describe, expect, it } from 'vitest';

import {
  buildSkillIndex,
  findMissingSkills,
  isSkillCovered
} from '@/lib/scoring/skill-match';
import { scoreIntentCoverageParams } from '@/lib/scoring/dimensions/intent-coverage';

/**
 * Per-skill regression tests.
 *
 * ## Why this file exists separately from the validation corpus
 *
 * The corpus measures Pearson correlation between the engine's `overallScore`
 * and a hand label, across 50 resume+JD pairs. It correctly returned
 * **r = 0.9238** while `intent-coverage` was scoring `Python/Django` as a
 * MISS and crediting `Go` inside `MongoDB`.
 *
 * The reason is arithmetic, not a gap in the corpus: a single missed must-have
 * costs 8 points inside a dimension weighted **0.10**, i.e. 0.8 points of the
 * final 100. A 50-entry correlation cannot resolve that — and the corpus
 * *already contains* `Kubernetes / Helm`, `ArgoCD / Gitts` and `GCP / Azure`
 * as must-haves, so the bug was present in the data the gate could see.
 *
 * The gate needed a unit of measurement it didn't have: **an individual skill
 * claim**, assertable independently. That is what this file provides.
 *
 * Docs: `docs/drift/2026-10-01-ats-scoring-review.md` §1 and §5.
 */

const RESUME = 'senior backend engineer with python, django and flask experience';
const index = buildSkillIndex(RESUME);

describe('isSkillCovered — compound / slash-joined stacks', () => {
  it('credits a stack when every constituent is present', () => {
    // The original bug: `includes('python/django')` is false, so a resume
    // listing BOTH technologies was recorded as missing the skill, penalised
    // 8 points, and the UI told the user to add a skill they already had.
    expect(isSkillCovered('Python/Django', index)).toBe(true);
    expect(isSkillCovered('Python / Django', index)).toBe(true);
    expect(isSkillCovered('python/django', index)).toBe(true);
  });

  it('does NOT credit a stack when only one constituent is present', () => {
    // "Python/Flask" with only Python on the resume is genuinely half a
    // match. An OR-based rule would wrongly award it.
    const flaskOnly = buildSkillIndex(
      'senior backend engineer with python experience building apis'
    );
    expect(isSkillCovered('Python/Flask', flaskOnly)).toBe(false);
  });

  it('handles the multi-alternative phrasings found in the real corpus', () => {
    const platform = buildSkillIndex(
      'platform engineer running kubernetes with helm, argocd gitops and istio service mesh'
    );
    expect(isSkillCovered('Kubernetes / Helm', platform)).toBe(true);
    expect(isSkillCovered('ArgoCD / GitOps', platform)).toBe(true);
    expect(isSkillCovered('Service mesh (Istio / Linkerd)', platform)).toBe(false); // no Linkerd
  });

  it('requires the real constituents for GCP / Azure', () => {
    const gcp = buildSkillIndex('cloud engineer with gcp and kubernetes');
    expect(isSkillCovered('GCP / Azure', gcp)).toBe(false);
  });
});

describe('isSkillCovered — no false positives inside longer words', () => {
  it('does not credit "Go" from a MongoDB-only resume', () => {
    // The original bug: `includes('go')` matches the `go` in `mongodb`, so
    // `Go`, `R` and `C` were ALL credited for free on a resume that had none
    // of them — a perfect intent-coverage score.
    const mongo = buildSkillIndex('engineer with mongodb and redis experience');
    expect(isSkillCovered('Go', mongo)).toBe(false);
    expect(isSkillCovered('Golang', mongo)).toBe(false);
    expect(isSkillCovered('R', mongo)).toBe(false);
    expect(isSkillCovered('C', mongo)).toBe(false);
  });

  it('does credit "Go" when the resume really lists it', () => {
    const goResume = buildSkillIndex('engineer with go, postgres and redis');
    expect(isSkillCovered('Go', goResume)).toBe(true);
  });

  it('does not credit "Java" from "JavaScript" alone', () => {
    const js = buildSkillIndex('frontend engineer with javascript and react');
    expect(isSkillCovered('Java', js)).toBe(false);
  });
});

describe('isSkillCovered — spelling and punctuation variants', () => {
  it('matches Node.js against NodeJS, node-js and node js', () => {
    for (const written of ['NodeJS', 'node-js', 'node js', 'Node.js', 'nodejs']) {
      expect(isSkillCovered('Node.js', buildSkillIndex(written)), written).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isSkillCovered('kubernetes', buildSkillIndex('Kubernetes'))).toBe(true);
    expect(isSkillCovered('KUBERNETES', buildSkillIndex('kubernetes'))).toBe(true);
  });

  it('rejects empty and malformed input without throwing', () => {
    for (const bad of ['', '   ', '\t\n']) {
      expect(isSkillCovered(bad, index)).toBe(false);
    }
    // A regex metacharacter must not blow up the word-boundary fallback.
    expect(isSkillCovered('C++', buildSkillIndex('C++ developer'))).toBe(true);
    expect(isSkillCovered('(', buildSkillIndex('engineer'))).toBe(false);
  });
});

describe('scoreIntentCoverageParams — end-to-end effect of the fix', () => {
  const base = { niceToHaveSkills: [], implicitSkills: [] };

  it('no longer penalises a satisfied compound must-have', () => {
    const result = scoreIntentCoverageParams({
      ...base,
      mustHaveSkills: ['Python/Django'],
      resumeTextLower: RESUME
    });
    expect(result.missed.mustHave).toEqual([]);
    expect(result.value).toBe(100);
    expect(result.penalty).toBe(0);
  });

  it('no longer grants phantom credit on a MongoDB-only resume', () => {
    // Was value 100 with zero misses. Must now report every one as missing.
    const result = scoreIntentCoverageParams({
      ...base,
      mustHaveSkills: ['Go', 'R', 'C'],
      resumeTextLower: 'engineer with mongodb and redis experience'
    });
    expect(result.missed.mustHave).toEqual(['Go', 'R', 'C']);
    expect(result.value).toBeLessThan(80);
  });

  it('still penalises a genuinely absent must-have', () => {
    const result = scoreIntentCoverageParams({
      ...base,
      mustHaveSkills: ['Kubernetes'],
      resumeTextLower: RESUME
    });
    expect(result.missed.mustHave).toEqual(['Kubernetes']);
    expect(result.value).toBe(92); // 100 - MUST_HAVE_PENALTY(8)
  });

  it('preserves the JD\'s own wording in the missed list (UI terminology)', () => {
    const result = scoreIntentCoverageParams({
      ...base,
      mustHaveSkills: ['GraphQL', 'Python/Django'],
      resumeTextLower: RESUME
    });
    // Original casing and the slash must survive for display.
    expect(result.missed.mustHave).toEqual(['GraphQL']);
  });

  it('still falls back to neutral when there is no v2 intent data', () => {
    const result = scoreIntentCoverageParams({
      mustHaveSkills: [],
      niceToHaveSkills: [],
      implicitSkills: [],
      resumeTextLower: RESUME
    });
    expect(result.fallback).toBe(true);
    expect(result.value).toBe(50);
  });

  it('accepts a prebuilt index so the engine indexes once per resume', () => {
    const shared = buildSkillIndex(RESUME);
    const viaIndex = scoreIntentCoverageParams({
      ...base,
      mustHaveSkills: ['Python/Django', 'Kubernetes'],
      resumeTextLower: shared
    });
    const viaText = scoreIntentCoverageParams({
      ...base,
      mustHaveSkills: ['Python/Django', 'Kubernetes'],
      resumeTextLower: RESUME
    });
    expect(viaIndex).toEqual(viaText);
  });
});

describe('findMissingSkills', () => {
  it('preserves input order', () => {
    const idx = buildSkillIndex('python and django');
    expect(findMissingSkills(['Python', 'Kubernetes', 'Django'], idx)).toEqual([
      'Kubernetes'
    ]);
  });

  it('skips empty entries rather than reporting them as misses', () => {
    const idx = buildSkillIndex('python');
    expect(findMissingSkills(['', 'Kubernetes'], idx)).toEqual(['Kubernetes']);
  });
});
