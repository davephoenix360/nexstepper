import { describe, expect, it } from 'vitest';

import {
  parsedJdSchema,
  createApplicationInputSchema,
  updateApplicationInputSchema,
  sourceBoardSchema,
  applicationStatusSchema
} from '@/lib/jd-parser/schema';

/**
 * Pure Zod schema tests for the JD parser's output shape + the
 * Application input shapes. The AI call itself is tested separately
 * with a mocked `generateObject` (see parse-jd.test.ts); these tests
 * pin the contract the AI has to honor.
 */

const validParsedJd = {
  jobTitle: 'Senior Software Engineer',
  company: 'Anthropic',
  seniority: 'senior',
  location: 'San Francisco, CA',
  remote: 'hybrid',
  salaryMin: 180_000,
  salaryMax: 250_000,
  salaryCurrency: 'USD',
  requiredSkills: ['TypeScript', 'PostgreSQL', 'React'],
  niceToHaveSkills: ['Rust', 'Kubernetes'],
  keywords: [
    'TypeScript',
    'PostgreSQL',
    'React',
    'Rust',
    'Kubernetes',
    'distributed systems'
  ],
  responsibilities: [
    'Build and ship user-facing features',
    'Mentor junior engineers'
  ],
  qualifications: [
    '5+ years of experience',
    'BS in Computer Science or equivalent'
  ],
  yearsExperienceMin: 5,
  employmentType: 'full_time',
  summary:
    'Senior IC role on the platform team, building React + TypeScript features against a PostgreSQL backend.'
};

describe('parsedJdSchema', () => {
  it('accepts a well-formed parsed JD', () => {
    const result = parsedJdSchema.safeParse(validParsedJd);
    expect(result.success).toBe(true);
  });

  it('rejects an empty job title', () => {
    const result = parsedJdSchema.safeParse({
      ...validParsedJd,
      jobTitle: '   '
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown seniority value', () => {
    const result = parsedJdSchema.safeParse({
      ...validParsedJd,
      seniority: 'guru'
    });
    expect(result.success).toBe(false);
  });

  it('defaults requiredSkills / niceToHaveSkills / keywords to [] when omitted', () => {
    const { requiredSkills, niceToHaveSkills, keywords, ...rest } =
      validParsedJd;
    const result = parsedJdSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiredSkills).toEqual([]);
      expect(result.data.niceToHaveSkills).toEqual([]);
      expect(result.data.keywords).toEqual([]);
    }
  });

  it('rejects a salaryCurrency that is not a 3-letter code', () => {
    const result = parsedJdSchema.safeParse({
      ...validParsedJd,
      salaryCurrency: 'dollars'
    });
    expect(result.success).toBe(false);
  });

  it('accepts null company / location / salary when the JD does not disclose them', () => {
    const result = parsedJdSchema.safeParse({
      ...validParsedJd,
      company: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      yearsExperienceMin: null
    });
    expect(result.success).toBe(true);
  });

  it('trims whitespace on string fields', () => {
    const result = parsedJdSchema.safeParse({
      ...validParsedJd,
      jobTitle: '  Senior Engineer  ',
      company: '  Anthropic  '
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobTitle).toBe('Senior Engineer');
      expect(result.data.company).toBe('Anthropic');
    }
  });

  it('uppercases the salary currency code', () => {
    const result = parsedJdSchema.safeParse({
      ...validParsedJd,
      salaryCurrency: 'eur'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salaryCurrency).toBe('EUR');
    }
  });

  it('rejects more than 50 required skills (defense in depth)', () => {
    const result = parsedJdSchema.safeParse({
      ...validParsedJd,
      requiredSkills: Array.from(
        { length: 51 },
        (_, i) => `skill-${i}`
      )
    });
    expect(result.success).toBe(false);
  });
});

describe('createApplicationInputSchema', () => {
  it('accepts a minimal valid input', () => {
    const result = createApplicationInputSchema.safeParse({
      jobTitle: 'Senior Engineer',
      jdText: 'A'.repeat(100)
    });
    expect(result.success).toBe(true);
  });

  it('rejects a JD shorter than 50 characters', () => {
    const result = createApplicationInputSchema.safeParse({
      jobTitle: 'Senior Engineer',
      jdText: 'too short'
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid sourceUrl', () => {
    const result = createApplicationInputSchema.safeParse({
      jobTitle: 'Senior Engineer',
      jdText: 'A'.repeat(100),
      sourceUrl: 'https://www.linkedin.com/jobs/view/12345'
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid sourceUrl', () => {
    const result = createApplicationInputSchema.safeParse({
      jobTitle: 'Senior Engineer',
      jdText: 'A'.repeat(100),
      sourceUrl: 'not-a-url'
    });
    expect(result.success).toBe(false);
  });

  it('treats an empty sourceUrl as undefined (browser extension sometimes sends "")', () => {
    const result = createApplicationInputSchema.safeParse({
      jobTitle: 'Senior Engineer',
      jdText: 'A'.repeat(100),
      sourceUrl: ''
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceUrl).toBeUndefined();
    }
  });

  it('rejects an unknown sourceBoard', () => {
    const result = createApplicationInputSchema.safeParse({
      jobTitle: 'Senior Engineer',
      jdText: 'A'.repeat(100),
      sourceBoard: 'monsterboard'
    });
    expect(result.success).toBe(false);
  });
});

describe('updateApplicationInputSchema', () => {
  it('accepts an empty object (no-op update)', () => {
    const result = updateApplicationInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a status-only update', () => {
    const result = updateApplicationInputSchema.safeParse({
      status: 'applied'
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = updateApplicationInputSchema.safeParse({
      status: 'on_hold_forever'
    });
    expect(result.success).toBe(false);
  });
});

describe('sourceBoardSchema', () => {
  it('accepts every documented source board', () => {
    for (const board of [
      'linkedin',
      'greenhouse',
      'lever',
      'workday',
      'ashby',
      'extension',
      'manual'
    ] as const) {
      expect(sourceBoardSchema.safeParse(board).success).toBe(true);
    }
  });
});

describe('applicationStatusSchema', () => {
  it('accepts the canonical lifecycle values', () => {
    for (const status of [
      'draft',
      'applied',
      'screening',
      'interviewing',
      'offer',
      'rejected',
      'withdrawn',
      'accepted'
    ] as const) {
      expect(applicationStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});
