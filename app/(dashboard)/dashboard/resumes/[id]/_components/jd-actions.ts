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
import { formatJdAsMarkdown } from '@/lib/jd-parser';
import { extractJdIntent } from '@/lib/jd-parser/extract-jd-intent';

/**
 * Set the job context on a variant resume.
 *
 * Plan: docs/plans/variant-first-ux.md (slice 2, the storage slot)
 * + docs/plans/jd-markdown-format.md (Plan B, the formatter call).
 *
 * Stores the raw JD text under `resumeRevisions.data.jobContext` AND
 * invokes `formatJdAsMarkdown` to populate `jobContext.markdown` +
 * `markdownGeneratedAt`. The Markdown body is what the right-rail
 * `<JdPanel>` renders. When the formatter fails (no API key, AI
 * timeout, rate limit), the action still succeeds — `markdown`
 * stays null and the panel falls back to raw text in a `<pre>`.
 *
 * Auth: Better Auth session lookup. Server Actions are public
 * endpoints regardless of where they appear in the UI, so we
 * re-check at the top.
 *
 * Validation: Zod `safeParse` — never trust the client shape.
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

  // Fire the Markdown formatter alongside the save. The formatter is
  // a small AI round-trip (~0.4-1 s) so we let it run in the same
  // microtask pass as the read. If it fails (no API key, timeout,
  // rate limit), `markdown` stays null and `<JdPanel>` falls back to
  // raw text — never an error to the user.
  const formatResult = await formatJdAsMarkdown(parsed.data.jdText);

  // Phase 1 v2: also run the structured intent extractor. Same
  // best-effort / never-block pattern as the Markdown formatter.
  // When the extractor succeeds, populate the priority-weighted skill
  // lists + seniority + years + role family. When it fails (no API
  // key, AI failure, empty result), preserve the previously extracted
  // values so we don't regress on re-save. The Intent Coverage
  // dimension will fall back to v1 token-based scoring for fields
  // that remain empty.
  //
  // Plan: docs/plans/ats-scoring-v2.md
  const extractResult = await extractJdIntent(parsed.data.jdText);

  const existingJobContext = existing.data.jobContext;
  const useExistingIntent = !extractResult.ok;

  const jobContext: JobPosting = jobPostingSchema.parse({
    id: existingJobContext?.id ?? randomUUID(),
    title: existingJobContext?.title ?? '',
    company: existingJobContext?.company ?? '',
    location: existingJobContext?.location ?? '',
    description: parsed.data.jdText,
    requirements: existingJobContext?.requirements ?? [],
    niceToHaves: existingJobContext?.niceToHaves ?? [],
    benefits: existingJobContext?.benefits ?? [],
    keywords: existingJobContext?.keywords ?? [],
    seniority: existingJobContext?.seniority ?? '',
    employmentType: existingJobContext?.employmentType ?? '',
    source: existingJobContext?.source ?? 'paste',
    capturedAt:
      existingJobContext?.capturedAt ?? new Date().toISOString(),
    markdown: formatResult.ok ? formatResult.data.markdown : null,
    markdownGeneratedAt: formatResult.ok
      ? formatResult.data.markdownGeneratedAt
      : null,
    // v2 intent-extraction fields. Successful extraction → fresh
    // values. Failed extraction → preserve the previously extracted
    // values (graceful re-save, no field regression).
    mustHaveSkills: useExistingIntent
      ? existingJobContext?.mustHaveSkills ?? []
      : extractResult.data.intent.mustHaveSkills,
    niceToHaveSkills: useExistingIntent
      ? existingJobContext?.niceToHaveSkills ?? []
      : extractResult.data.intent.niceToHaveSkills,
    implicitSkills: useExistingIntent
      ? existingJobContext?.implicitSkills ?? []
      : extractResult.data.intent.implicitSkills,
    seniorityLevel: useExistingIntent
      ? existingJobContext?.seniorityLevel ?? null
      : extractResult.data.intent.seniorityLevel,
    yearsRequiredMin: useExistingIntent
      ? existingJobContext?.yearsRequiredMin ?? null
      : extractResult.data.intent.yearsRequiredMin,
    yearsRequiredMax: useExistingIntent
      ? existingJobContext?.yearsRequiredMax ?? null
      : extractResult.data.intent.yearsRequiredMax,
    roleFamily: useExistingIntent
      ? existingJobContext?.roleFamily ?? null
      : extractResult.data.intent.roleFamily,
    domainSignals: useExistingIntent
      ? existingJobContext?.domainSignals ?? []
      : extractResult.data.intent.domainSignals,
    intentExtractedAt: useExistingIntent
      ? existingJobContext?.intentExtractedAt ?? null
      : extractResult.data.extractedAt,
    intentExtractorModel: useExistingIntent
      ? existingJobContext?.intentExtractorModel ?? null
      : extractResult.data.model
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