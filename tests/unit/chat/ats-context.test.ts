import { describe, expect, it } from 'vitest';

import { buildAtsContext } from '@/lib/chat/system-prompt';
import type { ScoreBreakdown } from '@/lib/scoring/score';

/**
 * `buildAtsContext` is the bridge between the scoring engine and the
 * chat model's prompt. Locking its output shape protects three things:
 *
 *   1. **Prompt stability** — the system prompt is re-read every chat
 *      turn; if the format churns, downstream model behaviour drifts.
 *   2. **Token budget** — verbose output bloats every turn. The
 *      truncation caps in `buildAtsContext` (12 must-have, 12 nice,
 *      8 implicit) are deliberate — test they survive refactors.
 *   3. **Correctness** — the model uses these numbers to prioritise
 *      edits. Wrong field names or wrong ordering breaks the advice.
 */

function makeScore(overrides: Partial<ScoreBreakdown['dimensionScores']> = {}): ScoreBreakdown {
  return {
    overallScore: 47,
    // Wall-clock for the engine footer — unused by buildAtsContext but
    // required since `wire scoreSeniorityFitFromEnvelope` (323ab7b).
    computedInMs: 12,
    dimensionScores: {
      atsMatching: 42,
      structure: 78,
      contentQuality: 55,
      alignment: 51,
      intentCoverage: 38,
      roleFit: 82,
      seniorityFit: 85,
      ...overrides
    },
    criteriaScores: {
      'ATS Keyword Match': 40,
      'ATS Similarity': 50,
      'ATS Coverage': 45,
      'Intent Coverage': 38,
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
      value: 38,
      missed: {
        mustHave: ['Kubernetes', 'Terraform', 'Postgres', 'CI/CD pipelines'],
        niceToHave: ['Docker'],
        implicit: ['observability', 'on-call']
      },
      penalty: 50,
      fallback: false
    }
  };
}

describe('buildAtsContext', () => {
  it('includes the overall score', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toContain('Overall match: 47 / 100');
  });

  it('includes all 7 dimension names', () => {
    const out = buildAtsContext(makeScore());
    for (const name of [
      'atsMatching',
      'structure',
      'contentQuality',
      'alignment',
      'intentCoverage',
      'roleFit',
      'seniorityFit'
    ]) {
      expect(out).toContain(name);
    }
  });

  it('sorts dimensions by strength descending', () => {
    const out = buildAtsContext(
      makeScore({
        // Force a known ordering: seniorityFit highest, intentCoverage lowest.
        seniorityFit: 99,
        intentCoverage: 5,
        atsMatching: 50,
        structure: 50,
        contentQuality: 50,
        alignment: 50,
        roleFit: 50
      })
    );
    // Take everything between the dimension header and the next blank line,
    // then drop the sub-header row (" (0–100, sorted by strength):").
    const dimBlock = out.split('Dimension scores')[1]!.split('\n\n')[0]!;
    const lines = dimBlock
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('('));
    expect(lines[0]).toContain('seniorityFit');
    expect(lines[0]).toContain('99');
    // The line containing intentCoverage should appear after the one with 99.
    const intCovIdx = lines.findIndex((l) => l.includes('intentCoverage'));
    expect(intCovIdx).toBeGreaterThan(0);
    expect(lines[intCovIdx]).toContain('5');
  });

  it('lists missed must-have skills with priority marker', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toContain('MUST-HAVE missing');
    expect(out).toContain('Kubernetes');
    expect(out).toContain('Terraform');
    expect(out).toContain('Postgres');
  });

  it('lists missed nice-to-have skills with the secondary marker', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toContain('nice-to-have missing');
    expect(out).toContain('Docker');
  });

  it('lists missed implicit skills with the tertiary marker', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toContain('implicit missing');
    expect(out).toContain('observability');
    expect(out).toContain('on-call');
  });

  it('caps the must-have list at 12 items', () => {
    const score = makeScore();
    score.intentCoverageBreakdown.missed.mustHave = Array.from(
      { length: 20 },
      (_, i) => `skill-${i}`
    );
    const out = buildAtsContext(score);
    expect(out).toContain('skill-0');
    expect(out).toContain('skill-11');
    expect(out).not.toContain('skill-12');
  });

  it('emits "full coverage" note when nothing is missed', () => {
    const score = makeScore();
    score.intentCoverageBreakdown.missed.mustHave = [];
    score.intentCoverageBreakdown.missed.niceToHave = [];
    score.intentCoverageBreakdown.missed.implicit = [];
    const out = buildAtsContext(score);
    expect(out).toContain('full coverage');
  });

  it('adds a fallback note when intent coverage was computed with no v2 data', () => {
    const score = makeScore();
    score.intentCoverageBreakdown.fallback = true;
    const out = buildAtsContext(score);
    expect(out).toContain('neutral default');
    expect(out).toContain('intent extraction was unavailable');
  });

  it('does not emit the fallback note when v2 data was available', () => {
    const out = buildAtsContext(makeScore());
    expect(out).not.toContain('neutral default');
  });

  it('includes a priority-by-leverage guidance line so the model knows how to use the numbers', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toMatch(/prioriti[sz]e edits/i);
  });
});
