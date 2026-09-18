'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { getResume, saveResumeRevision } from '@/lib/db/queries';
import {
  applyOptimizedSummary,
  extractSummaryFromResumeData,
  optimizeSummarySection,
  type OptimizeErrorCode
} from '@/lib/optimize/optimize-resume';

/**
 * Server actions for the Optimize tool (Phase 2.5).
 *
 * Two actions:
 *   1. `runOptimizeSummaryAction` - runs the AI rewrite. Returns
 *      the original + the rewrite. Does NOT save anything.
 *   2. `applyOptimizeSummaryAction` - saves the accepted rewrite
 *      as a new revision. Called from the "Accept" button on
 *      the Optimize page.
 *
 * V0 does not gate by tier (anyone can use it). The gate is a
 * small follow-up that adds an entitlement check at the top of
 * `runOptimizeSummaryAction` once Stripe is wired up.
 */

const runOptimizeSchema = z.object({
  resumeId: z.string().min(1),
  jdText: z
    .string()
    .min(200, 'Job description is too short - paste the full JD.')
    .max(20_000, 'Job description is too long (max 20K chars).')
});

const applyOptimizeSchema = z.object({
  resumeId: z.string().min(1),
  optimizedSummary: z
    .string()
    .min(1)
    .max(2_000, 'Optimized summary is too long.')
});

type RunOptimizeResult =
  | {
      ok: true;
      original: string;
      optimized: string;
      modelUsed: string;
    }
  | {
      ok: false;
      code: OptimizeErrorCode | 'not_authorized' | 'not_found';
      error: string;
    };

/**
 * Run the AI rewrite against the candidate's current summary.
 * Returns both the original and the AI's rewrite so the UI can
 * show them side-by-side. Does NOT mutate the resume.
 */
export async function runOptimizeSummaryAction(
  input: unknown
): Promise<RunOptimizeResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, code: 'not_authorized', error: 'Not signed in' };
  }

  const parsed = runOptimizeSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid input';
    return { ok: false, code: 'ai_failure', error: message };
  }

  // Ownership check + load current revision data (single round-trip).
  const loaded = await getResume(parsed.data.resumeId, session.user.id);
  if (!loaded) {
    return {
      ok: false,
      code: 'not_found',
      error: 'Resume not found or you do not have access.'
    };
  }

  const { value: original } = extractSummaryFromResumeData(loaded.data);

  const result = await optimizeSummarySection({
    currentSummary: original,
    jdText: parsed.data.jdText
  });

  if (!result.ok) return result;

  return {
    ok: true,
    original,
    optimized: result.optimized,
    modelUsed: result.modelUsed
  };
}

type ApplyOptimizeErrorCode =
  | 'not_authorized'
  | 'not_found'
  | 'bad_input'
  | 'db_failure';

/**
 * Apply an accepted rewrite to the resume. Creates a new revision
 * (same pattern as `saveResumeAction`) so the change is auditable
 * and reversible.
 *
 * Callers should `revalidatePath` for the editor page so the
 * UI picks up the new summary.
 */
export async function applyOptimizeSummaryAction(
  input: unknown
): Promise<
  | { ok: true; revisionId: string }
  | { ok: false; code: ApplyOptimizeErrorCode; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, code: 'not_authorized', error: 'Not signed in' };
  }

  const parsed = applyOptimizeSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid input';
    return { ok: false, code: 'bad_input', error: message };
  }

  const loaded = await getResume(parsed.data.resumeId, session.user.id);
  if (!loaded) {
    return {
      ok: false,
      code: 'not_found',
      error: 'Resume not found or you do not have access.'
    };
  }

  const newData = applyOptimizedSummary(
    loaded.data,
    parsed.data.optimizedSummary
  );

  const revision = await saveResumeRevision(
    parsed.data.resumeId,
    session.user.id,
    newData
  );

  // Bust the editor cache so the next read shows the new summary.
  revalidatePath(`/dashboard/resumes/${parsed.data.resumeId}`);

  return { ok: true, revisionId: revision.id };
}