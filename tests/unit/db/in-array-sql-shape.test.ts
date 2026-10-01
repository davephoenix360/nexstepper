import { describe, expect, it } from 'vitest';
import { sql, inArray, eq, and } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  resumeRevisions,
  scoreSnapshots,
  chatMessages,
  resumes
} from '@/lib/db/schema';

/**
 * Regression tests for the SQL shape behind the GDPR export
 * (`getUserExportBundle`) and any future `IN (...)` list built by hand.
 *
 * ## What went wrong
 *
 * The export built its list clauses like this:
 *
 * ```ts
 * sql`${resumeRevisions.resumeId} IN ${sql.join(
 *   resumeRows.map((r) => sql`${r.id}`),
 *   sql`, `
 * )}`
 * ```
 *
 * `sql.join` does **not** wrap the list in parentheses. Drizzle rendered:
 *
 * ```sql
 * "resume_revisions"."resume_id" IN $1, $2, $3
 * ```
 *
 * Postgres parses `IN $1` as a perfectly legal single-element IN, then fails
 * on the following comma — `42601: syntax error at or near "$1"`. Because a
 * one-element list renders as `IN $1` (valid), the bug only ever fired with
 * **2+ rows**, so an account with a single resume exported fine and hid it.
 *
 * The reported position pointed at `$1` even though `$1` itself is fine; the
 * parser had simply reached it as the last token of a malformed list.
 *
 * ## Why assert on the SQL string
 *
 * The failure is purely syntactic, and a real DB is not available in unit
 * tests. Rendering the statement with Drizzle's own dialect and asserting on
 * the exact text catches the regression without a connection.
 */
const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as never).sql;

describe('inArray produces a parenthesised IN list', () => {
  it('wraps multiple ids in parentheses', () => {
    const rendered = render(
      inArray(resumes.id, ['r-1', 'r-2', 'r-3'])
    );
    expect(rendered).toBe('"resumes"."id" in ($1, $2, $3)');
  });

  it('still parenthesises a single id', () => {
    expect(render(inArray(resumes.id, ['r-1']))).toBe(
      '"resumes"."id" in ($1)'
    );
  });

  it('composes correctly with other conditions', () => {
    const rendered = render(
      and(eq(resumes.userId, 'u1'), inArray(resumes.id, ['r-1', 'r-2']))
    );
    expect(rendered).toContain('in ($2, $3)');
  });

  it('rejects an empty list (Drizzle emits a never-true clause, not broken SQL)', () => {
    // An empty `IN ()` is itself a syntax error, so `inArray` must guard it.
    // This is why the export checks `rows.length > 0` before calling in.
    const rendered = render(inArray(resumes.id, []));
    expect(rendered).not.toMatch(/in \(\s*\)/i);
  });
});

describe('the hand-rolled sql.join pattern is genuinely broken (why we stopped using it)', () => {
  it('emits an unparenthesised list', () => {
    // This assertion documents the OLD behaviour on purpose: it is the shape
    // that Postgres rejected. If a future Drizzle release fixes `sql.join` to
    // parenthesise, this test will fail and the comment above can be retired.
    const rendered = render(
      sql`${resumeRevisions.resumeId} IN ${sql.join(
        ['r-1', 'r-2', 'r-3'].map((r) => sql`${r}`),
        sql`, `
      )}`
    );

    expect(rendered).toBe('"resume_revisions"."resume_id" IN $1, $2, $3');
    // The malformed shape has no `in (...)` group for Postgres to bind.
    expect(rendered).not.toMatch(/IN \(/);
  });
});

describe('the three export query call sites', () => {
  it('renders valid SQL for each list used by getUserExportBundle', () => {
    const ids = ['r-1', 'r-2'];
    const sessions = ['s-1', 's-2'];

    // Mirrors the three call sites: revisions, score snapshots, chat messages.
    for (const [column, values] of [
      [resumeRevisions.resumeId, ids],
      [scoreSnapshots.resumeId, ids],
      [chatMessages.sessionId, sessions]
    ] as const) {
      const rendered = render(inArray(column, [...values]));
      expect(rendered, `column ${column.name}`).toMatch(/in \(\$1, \$2\)$/);
    }
  });
});
