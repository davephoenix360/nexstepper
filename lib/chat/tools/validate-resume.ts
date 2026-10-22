import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * `validateResume` — check whether a resume (or a proposed change to it)
 * will actually save, without writing anything.
 *
 * ## The problem this solves
 *
 * `saveResumeRevision` validates with `resumeDataSchema.parse()`, which
 * THROWS on invalid data. `executeEditResume` catches that throw and
 * returns a generic "Failed to save resume changes" — the Zod field
 * errors go to `console.error` and never reach the model. So the agent
 * knows it failed but not WHY, and the user is left staring at a wall of
 * errors in the editor with no idea what to do.
 *
 * This tool gives the model the actual field paths and messages, so it
 * can either repair the problem itself or tell the user precisely which
 * field is blocking them.
 *
 * ## Two modes
 *
 * 1. No arguments — validate the resume as it is stored. This catches a
 *    corrupted or legacy revision blob, which is the case where the user
 *    genuinely cannot save and does not know why.
 *
 * 2. With `proposedEdit` — merge the edit in memory (the same pure merge
 *    `editResume` uses), validate the RESULT, and report problems. This
 *    lets the agent check its own change before committing it, instead of
 *    discovering the problem by making the user's resume unsaveable.
 *
 * Writes nothing in either mode.
 */

export async function executeValidateResume(
  resumeId: string,
  proposedEdit?: unknown
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: 'Not authenticated' };

  const { getResume } = await import('@/lib/db/queries');
  const { resumeDataSchema } = await import('@/lib/resume-schema');
  const { buildMergedData } = await import('./merge-resume');

  const existing = await getResume(resumeId, session.user.id);
  if (!existing) return { ok: false, error: 'Resume not found or not owned' };

  const current = resumeDataSchema.safeParse(existing.data);
  if (!current.success) {
    return {
      ok: true,
      result:
        'This resume is CURRENTLY UNSAVEABLE. Field problems:\n' +
        formatIssues(current.error) +
        '\n\nTell the user exactly which fields are blocking the save, and offer to fix them.'
    };
  }

  if (proposedEdit === undefined) {
    return {
      ok: true,
      result:
        'This resume is valid and will save. There are no problems with the stored data.'
    };
  }

  // Merge the proposed edit in memory. `buildMergedData` is pure — no
  // DB, no writes — so this is a true dry run.
  const { data: merged, applied, warnings } = buildMergedData(
    existing.data,
    proposedEdit as never
  );

  const result = resumeDataSchema.safeParse(merged);
  if (!result.success) {
    return {
      ok: true,
      result:
        'This change would NOT save. Field problems it would introduce:\n' +
        formatIssues(result.error) +
        '\n\nDo not apply it as-is. Either adjust the change so it saves, or tell the user which field is the problem.' +
        (warnings.length ? `\n\nMerge warnings: ${warnings.join(' ')}` : '')
    };
  }

  const parts = ['This change would save cleanly.'];
  if (applied.length) parts.push(`It changes: ${applied.join(', ')}.`);
  if (warnings.length) {
    parts.push(
      `NOT applied: ${warnings.join(' ')} Those parts of the change did not match anything on the resume.`
    );
  }
  return { ok: true, result: parts.join(' ') };
}

/**
 * Flatten a Zod error into `path: message` lines.
 *
 * Deliberately flat and human-readable: this text goes straight into
 * the model's context, and "sections.work.0.highlights.1: Required"
 * is something it can act on, where a nested Zod tree is not.
 */
function formatIssues(error: import('zod').ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `  ${path}: ${issue.message}`;
    })
    .join('\n');
}
