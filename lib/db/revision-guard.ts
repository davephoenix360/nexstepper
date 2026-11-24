import { and, eq, isNull, type SQL } from 'drizzle-orm';

import { resumes } from './schema';

/**
 * Raised when a resume changed between the moment the AI read it and the
 * moment it tried to save. It is deliberately a typed error so the tool can
 * tell the model "reload and retry" instead of the generic failure it gives
 * for malformed data — a stale tool read must never silently clobber a
 * candidate's own edit.
 */
export class RevisionConflictError extends Error {
  readonly code = 'revision_conflict' as const;

  constructor() {
    super('This resume changed since it was read. Reload it and retry the edit.');
    this.name = 'RevisionConflictError';
  }
}

/**
 * Ownership + optimistic-concurrency predicate shared by the guarded revision
 * save and its regression test.
 *
 * `expectedRevisionId === undefined` means "no concurrency check requested"
 * (the historical behaviour, kept for callers that have no prior read).
 * `null` is a real value: a legacy resume with no current revision, which must
 * match `IS NULL` rather than an equality against NULL.
 */
export function buildRevisionGuard(args: {
  resumeId: string;
  userId: string;
  expectedRevisionId?: string | null;
}): SQL | undefined {
  const owned = and(
    eq(resumes.id, args.resumeId),
    eq(resumes.userId, args.userId)
  );

  if (args.expectedRevisionId === undefined) return owned;

  return and(
    owned,
    args.expectedRevisionId === null
      ? isNull(resumes.currentRevisionId)
      : eq(resumes.currentRevisionId, args.expectedRevisionId)
  );
}
