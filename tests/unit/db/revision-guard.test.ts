import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import { buildRevisionGuard, RevisionConflictError } from '@/lib/db/revision-guard';

const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as never).sql;

describe('buildRevisionGuard', () => {
  it('adds an equality check on the revision the AI read', () => {
    const rendered = render(
      buildRevisionGuard({
        resumeId: 'resume-1',
        userId: 'user-1',
        expectedRevisionId: 'rev-1'
      })
    );

    expect(rendered).toContain('"resumes"."id" = $1');
    expect(rendered).toContain('"resumes"."user_id" = $2');
    expect(rendered).toContain('"resumes"."current_revision_id" = $3');
  });

  it('uses IS NULL for a legacy resume with no current revision', () => {
    const rendered = render(
      buildRevisionGuard({
        resumeId: 'resume-1',
        userId: 'user-1',
        expectedRevisionId: null
      })
    );

    expect(rendered).toMatch(/"resumes"\."current_revision_id" is null/i);
    expect(rendered).not.toMatch(/current_revision_id" = /i);
  });

  it('keeps the historical no-check behaviour when no revision was supplied', () => {
    const rendered = render(
      buildRevisionGuard({ resumeId: 'resume-1', userId: 'user-1' })
    );

    expect(rendered).toContain('"resumes"."id" = $1');
    expect(rendered).toContain('"resumes"."user_id" = $2');
    expect(rendered).not.toContain('current_revision_id');
  });
});

describe('RevisionConflictError', () => {
  it('carries a stable code and retryable copy', () => {
    const error = new RevisionConflictError();
    expect(error.code).toBe('revision_conflict');
    expect(error.message).toMatch(/changed since it was read/i);
  });
});
