import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { saveResumeRevision } from '@/lib/db/queries';
import { buildMergedData } from './merge-resume';
import type { EditResumeArgs } from './types';

/**
 * Execute an `editResume` tool call.
 *
 * Merges `args` (surgical operations, see `./types.ts`) into the existing
 * resume via `saveResumeRevision` — the same persistence path as every other
 * save in the app. Ownership is verified via the session before any write
 * happens.
 *
 * The merge itself lives in `./merge-resume.ts` (pure, no `server-only`, no
 * DB) so it can be unit tested directly — the merge is where the resume-data
 * bugs actually live.
 *
 * Returns a plain object that gets serialised as the tool result. The result
 * text is written for the *model* to read, not for the user: it names exactly
 * what changed and calls out anything that could not be applied, so a failed
 * match can be retried in the same turn instead of the agent confidently
 * telling the user it worked.
 */
export async function executeEditResume(
  resumeId: string,
  args: EditResumeArgs
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const userId = session.user.id;

  // Lazy-import to avoid a circular dep and keep queries.ts tree-shakeable.
  const { getResume } = await import('@/lib/db/queries');
  const existing = await getResume(resumeId, userId);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const { data, applied, warnings } = buildMergedData(existing.data, args);

  if (applied.length === 0) {
    // Nothing matched and nothing changed. Persisting here would burn a
    // revision on a no-op, so bail out and let the model correct itself.
    return {
      ok: false,
      error: `No changes were applied. ${warnings.join(' ') || 'The call contained no operations.'}`
    };
  }

  try {
    const rev = await saveResumeRevision(resumeId, userId, data, {
      message: 'Edited via AI chat'
    });
    if (!rev) return { ok: false, error: 'Failed to save revision' };

    const parts = [`Saved as revision ${rev.id.slice(0, 8)}.`, `Changed: ${applied.join(', ')}.`];
    if (warnings.length > 0) {
      parts.push(
        `NOT applied: ${warnings.join(' ')} Retry those with a closer match to the resume, or tell the user which part you could not do.`
      );
    }
    return { ok: true, result: parts.join(' ') };
  } catch (err) {
    console.error('[executeEditResume]', err);
    // Surface WHY the save failed, not just that it did.
    //
    // `saveResumeRevision` validates with `resumeDataSchema.parse()`,
    // which THROWS a ZodError on invalid data. Swallowing that into a
    // generic "Failed to save resume changes" left the model with no
    // idea what to fix, so it could only report the failure — and the
    // user was left with the same wall of errors they already had.
    //
    // Now the exact field paths and messages go back to the model, which
    // can either repair them itself or tell the user precisely which
    // field is blocking them. This is the difference between a tool
    // failure and a repair loop.
    const issues = extractZodIssues(err);
    if (issues) {
      return {
        ok: false,
        error: `This change would not save. Field problems:\n${issues}\n\nFix these before applying, or tell the user exactly which field is blocking the save.`
      };
    }
    return { ok: false, error: 'Failed to save resume changes' };
  }
}

/**
 * Pull a readable `path: message` list out of a Zod error.
 *
 * Returns null for anything that isn't a Zod validation failure, so the
 * caller can fall back to a generic message without lying about the
 * cause.
 */
function extractZodIssues(err: unknown): string | null {
  if (
    !err ||
    typeof err !== 'object' ||
    !('issues' in err) ||
    !Array.isArray((err as { issues?: unknown }).issues)
  ) {
    return null;
  }
  const issues = (err as { issues: Array<{ path?: unknown[]; message?: string }> })
    .issues;
  if (!issues.length) return null;
  return issues
    .map((issue) => {
      const path = Array.isArray(issue.path) && issue.path.length
        ? issue.path.join('.')
        : '(root)';
      return `  ${path}: ${issue.message ?? 'Invalid value'}`;
    })
    .join('\n');
}
