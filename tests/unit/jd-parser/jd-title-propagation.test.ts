/**
 * The JD's title has to survive the trip from the posting to the score.
 *
 * ## The bug this pins
 *
 * Role Fit compares the JD's title with the candidate's work titles.
 * It scored the neutral 50 for **every resume in production** — not
 * because the titles didn't match, but because **the JD had no title**.
 *
 * The chain:
 *
 *   1. `createVariantFromJdAction` builds the `JobPosting` envelope
 *      from the raw JD text plus the intent extractor's output. Its
 *      comment said "the future parser will overwrite title/company/
 *      keywords" — the future never arrived.
 *   2. The JD panel's save action (`setVariantJobContextAction`) set
 *      `title: existingJobContext?.title ?? ''` — also empty, because
 *      nothing ever wrote one.
 *   3. `roleFitSimilarity` returns the neutral 50 when the title is
 *      empty.
 *
 * Verified against production: every JD on the account had
 * `jobContext.title = ''`, while `jobContext.roleFamily` was populated
 * ("Full Stack Engineer", "Software Engineer").
 *
 * These tests pin the two halves of the fix:
 *
 *   - the extractor RETURNS the title (one AI call, one extra field),
 *   - both attach paths WRITE it into the envelope.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractJdIntentSchema } from '@/lib/jd-parser/extract-jd-intent';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('the intent extractor returns the job title', () => {
  it('keeps a title when the model supplies one', () => {
    const result = extractJdIntentSchema.parse({
      jobTitle: 'Senior Backend Engineer, Platform',
      mustHaveSkills: ['Go'],
      niceToHaveSkills: [],
      implicitSkills: [],
      seniorityLevel: 'senior',
      yearsRequiredMin: 5,
      yearsRequiredMax: null,
      roleFamily: 'Backend Engineer',
      domainSignals: ['marketplace']
    });

    expect(result.jobTitle).toBe('Senior Backend Engineer, Platform');
  });

  it('defaults to an empty title rather than failing', () => {
    // The posting might not name a title. That must not fail the whole
    // extraction — the skills are still the valuable part.
    const result = extractJdIntentSchema.parse({
      mustHaveSkills: ['Go'],
      roleFamily: 'Backend Engineer'
    });

    expect(result.jobTitle).toBe('');
    expect(result.mustHaveSkills).toEqual(['Go']);
  });

  it('names the field in the output contract the model is given', () => {
    const prompts = read('lib/jd-parser/prompts.ts');
    expect(prompts).toContain('jobTitle');
  });
});

describe('both attach paths write the title into the envelope', () => {
  it('the create-variant path', () => {
    const src = read(
      'app/(dashboard)/dashboard/resumes/actions.ts'
    );
    const block = src.slice(
      src.indexOf('const jobContext = jobPostingSchema.parse('),
      src.indexOf('const jobContext = jobPostingSchema.parse(') + 1200
    );

    expect(block).toContain('title:');
    expect(block).toContain('intent.jobTitle');
  });

  it('the JD panel save path', () => {
    const src = read(
      'app/(dashboard)/dashboard/resumes/[id]/_components/jd-actions.ts'
    );
    const block = src.slice(
      src.indexOf('const jobContext: JobPosting = jobPostingSchema.parse('),
      src.indexOf('const jobContext: JobPosting = jobPostingSchema.parse(') +
        1200
    );

    expect(block).toContain('title:');
    expect(block).toContain('intent.jobTitle');
  });

  it('neither path falls back to an empty title when the extraction worked', () => {
    // The original bug was `title: existingJobContext?.title ?? ''` —
    // which is always empty, because nothing ever wrote one. A future
    // regression that reintroduces that line would silently put every
    // user's Role Fit back to 50.
    for (const file of [
      'app/(dashboard)/dashboard/resumes/actions.ts',
      'app/(dashboard)/dashboard/resumes/[id]/_components/jd-actions.ts'
    ]) {
      expect(read(file)).not.toContain("title: existingJobContext?.title ?? ''");
    }
  });
});
