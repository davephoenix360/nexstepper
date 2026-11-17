/**
 * The chat agent must give the SAME advice the scorecard gives.
 *
 * ## The gap this closes
 *
 * The chat agent used to see only the dimension NUMBERS in its ATS
 * context block. When a candidate asked "how do I improve my Impact
 * score?", it improvised — while the scorecard beside it was naming
 * the exact bullets to change ("10 of 29 work bullets describe a task
 * rather than an outcome (…named bullets…)").
 *
 * Two surfaces, one question, two answers. The chat's answer was the
 * invented one, and the founder is the one who reported the scorecard
 * advice as the good version.
 *
 * So the advice is now rendered from the scorecard's own tips and
 * handed to the agent as plain text.
 */
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { buildDynamicTips } from '@/lib/scoring/tips';
import { tipsToPlainText, tipToPlainText } from '@/lib/scoring/tips-text';
import { scoreResumeFromEnvelope } from '@/lib/scoring/score';
import { jobPostingSchema, resumeDataSchema } from '@/lib/resume-schema';

const NOW = new Date('2026-01-15T00:00:00Z');

function makeResume() {
  return resumeDataSchema.parse({
    name: 'Test Resume',
    note: '',
    status: 'draft',
    template: 'classic',
    jobContext: null,
    sections: {
      basics: {
        name: 'Jane Doe',
        label: 'Frontend Engineer',
        email: 'jane@example.com',
        phone: '',
        url: '',
        summary: 'Frontend engineer building React applications.',
        location: {
          address: '',
          postalCode: '',
          city: '',
          countryCode: '',
          region: ''
        },
        profiles: []
      },
      skills: [{ name: 'Frontend', keywords: ['React'], level: '' }],
      work: [
        {
          company: 'Acme',
          location: '',
          url: '',
          description: '',
          positions: [
            {
              title: 'Engineer',
              startDate: '2020-01',
              endDate: '',
              // A duty, not an outcome — this is what the Impact
              // criterion looks for.
              highlights: [
                'Responsible for maintaining the internal dashboard used by the support team'
              ]
            }
          ]
        }
      ],
      projects: [],
      education: [],
      awards: [],
      certificates: [],
      publications: [],
      languages: [],
      interests: [],
      references: [],
      volunteer: []
    }
  });
}

function makeJob() {
  return jobPostingSchema.parse({
    id: 'job-1',
    url: 'https://example.com/job',
    title: 'Senior Backend Engineer',
    company: 'Cartwheel',
    location: 'Remote',
    description: 'Build a streaming data platform.',
    requirements: ['Strong TypeScript experience', 'Experience with Kafka'],
    niceToHaves: [],
    benefits: [],
    keywords: [],
    seniority: 'senior',
    employmentType: 'Full-time',
    source: 'paste',
    mustHaveSkills: ['TypeScript'],
    niceToHaveSkills: [],
    implicitSkills: [],
    seniorityLevel: 'senior',
    yearsRequiredMin: 5,
    yearsRequiredMax: null,
    roleFamily: 'Backend Engineer',
    domainSignals: []
  });
}

describe('tipsToPlainText', () => {
  it('renders a rich tip down to plain text', () => {
    const tips = buildDynamicTips(
      scoreResumeFromEnvelope(makeResume(), makeJob(), NOW),
      makeResume(),
      makeJob()
    );
    const text = tipsToPlainText(tips);
    const values = Object.values(text);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).not.toContain('<');
      expect(value).not.toContain('>');
      expect(value.trim()).toBe(value);
    }
  });

  it('drops a tip with no text', () => {
    expect(tipsToPlainText({})).toEqual({});
  });

  it('handles a plain string tip', () => {
    expect(tipToPlainText('just text')).toBe('just text');
  });
});

describe('the chat prompt carries the scorecard advice', () => {
  it('includes the same advice the scorecard shows', () => {
    const resume = makeResume();
    const job = makeJob();
    const score = scoreResumeFromEnvelope(resume, job, NOW);

    // What the scorecard shows.
    const tips = buildDynamicTips(score, resume, job);
    const tipTexts = tipsToPlainText(tips);

    // What the chat sees.
    const prompt = buildSystemPrompt(
      { ...resume, jobContext: job },
      job,
      score,
      'variant'
    );

    // At least one real tip made it across.
    const adviceKeys = Object.keys(tipTexts);
    expect(adviceKeys.length).toBeGreaterThan(0);
    expect(prompt).toContain('What to fix');
    for (const key of adviceKeys) {
      expect(prompt).toContain(tipTexts[key]!);
    }
  });

  it('tells the agent to quote the advice rather than improvise', () => {
    const resume = makeResume();
    const job = makeJob();
    const score = scoreResumeFromEnvelope(resume, job, NOW);
    const prompt = buildSystemPrompt(
      { ...resume, jobContext: job },
      job,
      score,
      'variant'
    );
    expect(prompt).toMatch(/do not improvise/i);
  });

  it('names the dimension to fix first', () => {
    const resume = makeResume();
    const job = makeJob();
    const score = scoreResumeFromEnvelope(resume, job, NOW);
    const prompt = buildSystemPrompt(
      { ...resume, jobContext: job },
      job,
      score,
      'variant'
    );
    expect(prompt).toContain('Start here:');
  });
});
