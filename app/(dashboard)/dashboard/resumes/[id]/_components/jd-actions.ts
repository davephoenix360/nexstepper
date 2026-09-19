'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';

import { auth } from '@/lib/auth';
import {
  getResume,
  saveResumeRevision
} from '@/lib/db/queries';
import {
  jobPostingSchema,
  resumeDataSchema,
  type JobPosting,
  type ResumeData
} from '@/lib/resume-schema';

/**
 * Set the job context on a variant resume.
 *
 * Slice 2 of the variant-first UX (plan: docs/plans/variant-first-ux.md).
 *
 * This action intentionally stores the raw JD text under
 * `resumeRevisions.data.jobContext` without invoking the AI parser.
 * The Markdown formatting (Plan B) and structured-parse / scorecard
 * (Plan C) ship as separate follow-ups. Today we just persist the
 * raw text so the right-rail panel has something to display.
 *
 * Auth: Better Auth session lookup. Server Actions are public
 * endpoints regardless of where they appear in the UI, so we
 * re-check at the top.
 *
 * Validation: Zod `safeParse` — never trust the client shape.
 * We accept either:
 *   - the raw text only (parsed client-side later), or
 *   - a structured JobPosting (when a future slice uploads one
 *     from a parser round-trip).
 */
export async function setVariantJobContextAction(
  input: unknown
): Promise<
  | { ok: true; data: { jobContext: JobPosting } }
  | { ok: false; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = setVariantJobContextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' };
  }

  const existing = await getResume(parsed.data.resumeId, session.user.id);
  if (!existing) {
    return { ok: false, error: 'Resume not found' };
  }
  if (existing.resume.isMaster) {
    return {
      ok: false,
      error: 'Job context only attaches to variants, not master resumes.'
    };
  }

  // Build a JobPosting from the raw text. Title/company/location are
  // empty — the future parser will fill them. We keep a stable id so
  // the client can render without flicker on re-save.
  const jobContext: JobPosting = jobPostingSchema.parse({
    id: existing.data.jobContext?.id ?? randomUUID(),
    title: existing.data.jobContext?.title ?? '',
    company: existing.data.jobContext?.company ?? '',
    location: existing.data.jobContext?.location ?? '',
    description: parsed.data.jdText,
    requirements: existing.data.jobContext?.requirements ?? [],
    niceToHaves: existing.data.jobContext?.niceToHaves ?? [],
    benefits: existing.data.jobContext?.benefits ?? [],
    keywords: existing.data.jobContext?.keywords ?? [],
    seniority: existing.data.jobContext?.seniority ?? '',
    employmentType: existing.data.jobContext?.employmentType ?? '',
    source: existing.data.jobContext?.source ?? 'paste',
    capturedAt:
      existing.data.jobContext?.capturedAt ?? new Date().toISOString()
  });

  const nextData: ResumeData = resumeDataSchema.parse({
    ...existing.data,
    jobContext
  });

  const saved = await saveResumeRevision(
    parsed.data.resumeId,
    session.user.id,
    nextData,
    { message: 'Attached a job description' }
  );
  if (!saved) {
    return { ok: false, error: 'Could not save the job context' };
  }

  revalidatePath(`/dashboard/resumes/${parsed.data.resumeId}`);
  return { ok: true, data: { jobContext } };
}

const setVariantJobContextSchema = z.object({
  resumeId: z.string().min(1, 'Resume id is required'),
  jdText: z
    .string()
    .min(50, 'JD is too short (need at least 50 characters)')
    .max(20_000, 'JD is too long (20,000 characters max)')
});