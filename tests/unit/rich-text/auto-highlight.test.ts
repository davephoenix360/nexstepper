/**
 * "Highlight this job's skills" — the decision engine.
 *
 * ## What is under test
 *
 * The hard part is not applying the marks; it is DECIDING which words
 * deserve them. Three refusals matter more than the marking:
 *
 *  - an eligibility gate is never marked (a degree is satisfied with
 *    a certificate, not with wording);
 *  - a line that does not name a genuine skill is not marked;
 *  - a skill the resume does not evidence is not marked.
 *
 * A resume full of emphasis that means nothing is worse than a resume
 * with no emphasis.
 */
import { describe, expect, it } from 'vitest';

import {
  lineMentionsKeyword,
  planJobSkillHighlights
} from '@/lib/rich-text/auto-highlight';
import type { JevRequirementLine } from '@/lib/scoring/jev-requirements';

function line(overrides: Partial<JevRequirementLine>): JevRequirementLine {
  return {
    text: '',
    bucket: 'must',
    pSkill: 0.9,
    pGate: 0.05,
    evidence: 2,
    ...overrides
  };
}

const SKILLS = [
  { name: 'Languages', keywords: ['Postgres', 'Python'] },
  { name: 'Tools', keywords: ['AutoCAD', 'C'] }
];

describe('lineMentionsKeyword', () => {
  it('matches a word', () => {
    expect(lineMentionsKeyword('Strong Postgres knowledge', 'Postgres')).toBe(true);
    expect(lineMentionsKeyword('strong postgres knowledge', 'postgres')).toBe(true);
  });

  it('does NOT match inside a longer word', () => {
    // "Engineering" must not match "engineers".
    expect(lineMentionsKeyword('Strong engineers', 'engineering')).toBe(false);
    expect(lineMentionsKeyword('Communication skills', 'munication')).toBe(false);
  });

  it('never matches a one-character keyword', () => {
    // "C" would match "communication" and "client" — and the language
    // skills are the one place a false match does real damage.
    expect(lineMentionsKeyword('Communication with clients', 'C')).toBe(false);
  });

  it('matches a keyword that is not a word as a substring', () => {
    expect(lineMentionsKeyword('Node.js and Express', 'Node.js')).toBe(true);
    expect(lineMentionsKeyword('C++ development', 'C++')).toBe(true);
  });
});

describe('planJobSkillHighlights', () => {
  it('bolds a skill the posting asks for', () => {
    const plan = planJobSkillHighlights({
      lines: [line({ text: 'Strong Postgres knowledge', bucket: 'nice' })],
      skills: SKILLS
    });
    expect(plan.bolded).toEqual(['Postgres']);
    expect(plan.marks['sections.skills.0.keywords.0']).toEqual([
      { text: 'Postgres', start: 0, marks: ['bold'] }
    ]);
  });

  it('underlines a must-have on top of the bold', () => {
    const plan = planJobSkillHighlights({
      lines: [line({ text: 'Strong Postgres knowledge', bucket: 'must' })],
      skills: SKILLS
    });
    expect(plan.marks['sections.skills.0.keywords.0'][0].marks).toEqual([
      'bold',
      'underline'
    ]);
    expect(plan.underlined).toEqual(['Postgres']);
  });

  it('bolds a nice-to-have WITHOUT underlining it', () => {
    const plan = planJobSkillHighlights({
      lines: [line({ text: 'Familiarity with Postgres', bucket: 'nice' })],
      skills: SKILLS
    });
    expect(plan.marks['sections.skills.0.keywords.0'][0].marks).toEqual(['bold']);
    expect(plan.underlined).toEqual([]);
  });

  it('never marks an eligibility gate', () => {
    // "Bachelor's degree in engineering" is a gate. Bolding "Engineer"
    // because a degree mentions engineering would be a lie.
    const plan = planJobSkillHighlights({
      lines: [
        line({ text: "Bachelor's degree in engineering", pGate: 0.95 })
      ],
      skills: [{ name: 'Study', keywords: ['Engineering'] }]
    });
    expect(plan.bolded).toEqual([]);
    expect(plan.skipped).toEqual([
      { keyword: 'Engineering', reason: 'gate' }
    ]);
  });

  it('never marks a line that does not name a genuine skill', () => {
    const plan = planJobSkillHighlights({
      lines: [line({ text: 'Passion for hands-on work', pSkill: 0.1 })],
      skills: [{ name: 'Interests', keywords: ['Hands-on'] }]
    });
    expect(plan.bolded).toEqual([]);
    expect(plan.skipped).toEqual([
      { keyword: 'Hands-on', reason: 'not-a-skill' }
    ]);
  });

  it('never marks a skill the resume does not evidence', () => {
    const plan = planJobSkillHighlights({
      lines: [line({ text: 'Strong Postgres knowledge', evidence: 0 })],
      skills: SKILLS
    });
    expect(plan.bolded).toEqual([]);
    expect(plan.skipped).toEqual([
      { keyword: 'Postgres', reason: 'not-evidenced' }
    ]);
  });

  it('leaves a skill the posting never mentions alone', () => {
    const plan = planJobSkillHighlights({
      lines: [line({ text: 'Strong Postgres knowledge' })],
      skills: SKILLS
    });
    expect(plan.bolded).toEqual(['Postgres']);
    expect(plan.marks['sections.skills.0.keywords.1']).toBeUndefined();
    expect(plan.marks['sections.skills.1.keywords.0']).toBeUndefined();
  });

  it('keys the marks by the field path, so the editor can apply them', () => {
    const plan = planJobSkillHighlights({
      lines: [line({ text: 'AutoCAD and Python experience' })],
      skills: SKILLS
    });
    expect(Object.keys(plan.marks).sort()).toEqual([
      'sections.skills.0.keywords.1',
      'sections.skills.1.keywords.0'
    ]);
  });

  it('marks nothing when the posting asks for skills the resume lacks', () => {
    // The real case: a posting whose requirements are all gates and
    // soft skills. The honest answer is "nothing to highlight", not
    // "bold whatever happens to match".
    const plan = planJobSkillHighlights({
      lines: [
        line({ text: "Bachelor's degree in engineering", pGate: 0.95 }),
        line({
          text: 'Strong communication and interpersonal skills',
          pSkill: 0.2
        }),
        line({ text: 'Passion for hands-on work', pSkill: 0.1 })
      ],
      skills: [{ name: 'Coursework', keywords: ['Control Systems'] }]
    });
    expect(plan.bolded).toEqual([]);
    expect(Object.keys(plan.marks)).toEqual([]);
  });

  it('reports what it skipped, so the summary can be honest', () => {
    const plan = planJobSkillHighlights({
      lines: [
        line({ text: "Bachelor's degree in engineering", pGate: 0.95 }),
        line({ text: 'AutoCAD familiarity' })
      ],
      skills: [{ name: 'Study', keywords: ['Engineering', 'AutoCAD'] }]
    });
    expect(plan.bolded).toEqual(['AutoCAD']);
    expect(plan.skipped).toEqual([
      { keyword: 'Engineering', reason: 'gate' }
    ]);
  });
});
