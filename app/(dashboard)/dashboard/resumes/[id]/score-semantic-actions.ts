'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { getResume } from '@/lib/db/queries';
import { scoreResumeHybridFromEnvelope } from '@/lib/scoring-async/score-hybrid';
import type { ScoreBreakdown } from '@/lib/scoring';

/**
 * Server Action: re-run the ATS scoring engine with the HYBRID
 * (BM25 + semantic embeddings) path for the ATS-similarity
 * sub-criterion.
 *
 * Phase 3 of the post-ship engine review
 * (`docs/drift/2026-09-19-ats-engine-review.md`). Sits next to
 * the existing `recomputeScoreAction` and is **opt-in**:
 *   - The default scorecard render (Server Component first
 *     paint) and the existing "Recompute" button use
 *     `recomputeScoreAction` (sync BM25 only).
 *   - The "Recompute with semantic" button uses this action
 *     (hybrid BM25 + semantic). Cold start is ~2-5s on first
 *     call (model download + ONNX init), subsequent calls are
 *     ~100-200ms per pair.
 *
 * Why a separate action, not a flag on the existing one:
 *   - Action signatures are part of the public Server Action
 *     contract. Adding a `mode: 'sync' | 'hybrid'` flag would
 *     bloat the existing one and force every caller to handle
 *     the mode.
 *   - Splitting keeps the cold-start cost contained to callers
 *     that explicitly opt in. The default path stays cheap.
 *
 * Auth model: identical to `recomputeScoreAction` - re-check the
 * session + ownership at the top. Server Actions are public
 * endpoints regardless of where they appear in the UI.
 *
 * Drift from plan: this action loads `@huggingface/transformers`
 * which is a ~25 MB dep with a native onnxruntime binary. The
 * dep is in `package.json` (added by the previous session). The
 * score-side purity invariant is preserved by keeping this code
 * OUTSIDE `lib/scoring/`.
 */
export async function recomputeScoreSemanticAction(
  input: unknown
): Promise<
  | { ok: true; data: ScoreBreakdown }
  | { ok: false; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not signed in' };
  }

  const parsed = recomputeScoreSemanticInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' };
  }

  const result = await getResume(parsed.data.resumeId, session.user.id);
  if (!result) {
    return { ok: false, error: 'Resume not found' };
  }
  const { resume, data } = result;
  if (resume.isMaster) {
    return {
      ok: false,
      error: 'Scoring only applies to variants, not master resumes.'
    };
  }
  if (!data.jobContext) {
    return {
      ok: false,
      error:
        'No job description attached. Attach a JD before scoring.'
    };
  }

  try {
    // 30s soft timeout on the whole semantic path: model load +
    // both embeddings + hybrid combine. On Vercel this is well
    // under the function's hard limit; locally it's a generous
    // bound that lets the first-call model download complete.
    const breakdown = await withTimeout(
      scoreResumeHybridFromEnvelope(data, data.jobContext),
      30_000,
      'Semantic scoring timed out after 30s'
    );
    revalidatePath(`/dashboard/resumes/${parsed.data.resumeId}`);
    return { ok: true, data: breakdown };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Semantic scoring failed: ${message}`
    };
  }
}

const recomputeScoreSemanticInputSchema = z.object({
  resumeId: z.string().min(1)
});

/**
 * Race a promise against a timeout. On timeout, reject with the
 * supplied error message so the Server Action can return a
 * discriminated-union failure rather than hanging the UI.
 *
 * The underlying `scoreResumeHybridFromEnvelope` will reject
 * when its timeout fires via the cleanup closure below; we
 * don't cancel the model load itself (the pipeline singleton
 * stays warm for the next caller).
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
