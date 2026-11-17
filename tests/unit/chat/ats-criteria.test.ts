import { describe, expect, it } from 'vitest';

import { criteriaTextForModel } from '@/lib/chat/ats-criteria-text';
import { formatScoreForModel } from '@/lib/chat/ats-score-format';
import { buildAtsContext } from '@/lib/chat/system-prompt';
import type { ScoreBreakdown } from '@/lib/scoring/score';

/**
 * The sub-criterion scores, as the chat agent sees them.
 *
 * ## The gap this pins
 *
 * The agent used to receive the seven DIMENSION numbers and nothing
 * below them. "Impact 77" says which bar is weak; it does not say
 * which part of the bar is weak, and the scorecard's advice is keyed
 * by CRITERION. So the agent could not name the thing to fix — it
 * improvised, and the chat's advice was vaguer than the scorecard
 * beside it.
 *
 * These tests assert the block that closes that gap, on BOTH surfaces
 * that show the score to the model: the system prompt (every turn) and
 * the `getAtsScore` tool (after the agent's own edits).
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
    roleFit: { similarity: 0.82, fallback: false },
    seniorityFit: { resumeYears: 6, jdYearsMin: 5, gap: 1, fallback: false },
    ...overrides
  };
}

describe('the criteria block', () => {
  it('lists every sub-criterion with its dimension', () => {
    const text = criteriaTextForModel(makeScore());
    expect(text).toContain('ATS Keyword Match 40 (Keywords)');
    expect(text).toContain('Accomplishment Focus 55 (Impact)');
    expect(text).toContain('Seniority Fit 85 (Seniority fit)');
  });

  it('lists the weakest first', () => {
    const text = criteriaTextForModel(makeScore());
    const lines = text
      .split('\n')
      .filter((l) => l.trim().startsWith('ATS Keyword Match'));
    expect(lines).toHaveLength(1);
    // The weakest measured criterion is the first criterion line.
    const firstCriterionLine = text
      .split('\n')
      .find((l) => /^\s{2}\S/.test(l) && !l.includes('Weakest'));
    expect(firstCriterionLine).toContain('ATS Keyword Match');
  });

  it('names the weakest sub-criterion and the dimension it belongs to', () => {
    const text = criteriaTextForModel(makeScore());
    expect(text).toContain(
      'Weakest sub-criterion: ATS Keyword Match (40/100), part of the Keywords dimension.'
    );
  });

  it('separates criteria that could not be measured and marks them as not a weakness', () => {
    const score = makeScore();
    score.roleFit = { similarity: null, fallback: true };
    score.criteriaScores['Role Fit'] = 50;

    const text = criteriaTextForModel(score);
    expect(text).toContain('Could NOT be measured');
    expect(text).toContain('Role Fit 50 (Role fit) — no title signal to compare against');
    // And it is NOT named as the weakest thing to fix.
    expect(text).toContain('Weakest sub-criterion: ATS Keyword Match');
  });

  it('returns nothing when the breakdown carries no criteria', () => {
    const score = makeScore();
    score.criteriaScores = {} as ScoreBreakdown['criteriaScores'];
    expect(criteriaTextForModel(score)).toBe('');
  });
});

describe('the system prompt carries the sub-criterion scores', () => {
  it('includes the criteria block', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toContain('Sub-criterion scores');
    expect(out).toContain('ATS Keyword Match 40 (Keywords)');
    expect(out).toContain('Accomplishment Focus 55 (Impact)');
  });

  it('names the weakest sub-criterion', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toContain('Weakest sub-criterion: ATS Keyword Match (40/100)');
  });

  it('tells the model to name the weakest sub-criterion when asked', () => {
    const out = buildAtsContext(makeScore());
    expect(out).toMatch(/asks which part of their score is weakest/i);
    expect(out).toMatch(/never present a criterion listed under "could NOT be measured"/i);
  });
});

describe('the getAtsScore tool carries the sub-criterion scores', () => {
  it('includes the criteria block and the weakest sub-criterion', () => {
    const out = formatScoreForModel(makeScore(), true, {
      'ATS Keyword Match': 'Add the missing must-have skills.'
    });
    expect(out).toContain('Sub-criterion scores');
    expect(out).toContain('ATS Keyword Match 40 (Keywords)');
    expect(out).toContain('Weakest sub-criterion: ATS Keyword Match (40/100)');
  });

  it('renders the same criteria block the prompt renders', () => {
    // One helper, both surfaces — the prompt and the tool must not
    // describe the score differently.
    const score = makeScore();
    const prompt = buildAtsContext(score);
    const tool = formatScoreForModel(score, true);
    expect(tool).toContain(
      criteriaTextForModel(score).split('\n')[0]!
    );
    expect(prompt).toContain(criteriaTextForModel(score).split('\n')[0]!);
  });
});
