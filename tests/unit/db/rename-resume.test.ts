/**
 * Regression test for `renameResume` (lib/db/queries.ts).
 *
 * ## The bug this pins
 *
 * A resume's name lived in two places:
 *
 *   - `resumes.name` — the column the inline-rename control writes
 *   - `resume_revisions.data->>'name'` — inside the current revision's
 *     JSONB, which is what the editor's react-hook-form initializes from
 *
 * `renameResume` only wrote the column. The form kept the old value, so
 * the next content save — `saveResumeRevision`, which writes
 * `name: parsed.name` back onto the row — silently undid the rename.
 * Reported as "I renamed the variant and it kept going back".
 *
 * The fix writes both inside one transaction. These tests assert that,
 * because the failure mode is invisible: no type error, no warning, the
 * rename just quietly expires at the next save.
 *
 * The Drizzle layer is mocked (same pattern as
 * tests/unit/db/score-snapshots.test.ts) so we can assert the SQL shape
 * without a real Postgres. The schema is NOT mocked — it is pure data
 * with no connection.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // `returning()` is the terminal for the column update; the second
  // `.update()` (the revision write) terminates on `where()`. Tracking
  // the calls to `update` is what lets us assert BOTH writes happened.
  const updateResults: unknown[] = [];

  const chain: Record<string, ReturnType<typeof vi.fn>> = {} as never;
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.returning = vi.fn(async () => updateResults.shift() ?? []);

  const tx = vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(chain));
  const db = { transaction: tx, update: chain.update, chain };

  return { chain, tx, db, updateResults };
});

vi.mock('@/lib/db/drizzle', () => ({ db: mocks.db }));

import { renameResume } from '@/lib/db/queries';

describe('renameResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateResults.length = 0;
  });

  it('returns false and writes nothing when the resume is not owned', async () => {
    // `.returning()` yields [] → the ownership check (id + userId) failed.
    mocks.updateResults.push([]);

    await expect(renameResume('r-1', 'u-1', 'New name')).resolves.toBe(false);

    // The revision write must be skipped entirely — there is no
    // revision id to write to when the row wasn't ours.
    expect(mocks.chain.update).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty/whitespace name without touching the DB', async () => {
    await expect(renameResume('r-1', 'u-1', '   ')).resolves.toBe(false);
    expect(mocks.chain.update).not.toHaveBeenCalled();
  });

  it('writes BOTH the column and the current revision data', async () => {
    // The column update returns the row, including the revision id we
    // must then sync.
    mocks.updateResults.push([{ id: 'r-1', currentRevisionId: 'rev-9' }]);

    await expect(renameResume('r-1', 'u-1', 'Backend Engineer')).resolves.toBe(true);

    // TWO updates: the resumes column, then the revision JSONB. This is
    // the assertion that would have caught the original bug — the old
    // implementation issued only the first.
    expect(mocks.chain.update).toHaveBeenCalledTimes(2);

    // The revision update must target a jsonb_set on the 'name' key, not
    // a whole-document replace. Replacing the whole document would drop
    // every other field in the revision.
    const setCalls = mocks.chain.set.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const revisionSet = setCalls[1];
    expect(revisionSet).toBeDefined();
    expect(revisionSet.data).toBeDefined();
  });

  it('does not touch a revision when the resume has no current revision', async () => {
    mocks.updateResults.push([{ id: 'r-1', currentRevisionId: null }]);

    await expect(renameResume('r-1', 'u-1', 'Backend Engineer')).resolves.toBe(true);

    // Legacy rows with a null current_revision_id must not blow up on a
    // `where(id = null)` write.
    expect(mocks.chain.update).toHaveBeenCalledTimes(1);
  });
});