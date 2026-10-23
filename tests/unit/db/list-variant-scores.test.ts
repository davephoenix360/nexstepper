/**
 * The variant list's score badge.
 *
 * ## The bug this pins
 *
 * The badge on the resumes list and the scorecard on the variant's
 * own page are supposed to show the SAME number. They didn't:
 *
 *   - The PAGE reads the breakdown the last Recompute persisted
 *     (`resolveRenderedBreakdown`), so it shows the enhanced (Jev)
 *     score.
 *   - The LIST computed a fresh score for every row with the SYNC
 *     engine, so it showed the older token-based number.
 *
 * In production: the badge on "SWE CleerDental" said 47 while the
 * scorecard on the same resume said 57, and after a Recompute the
 * scorecard moved while the badge sat still.
 *
 * The user-visible symptom was "the score in the chip isn't
 * updating" — and the deeper symptom was two surfaces showing two
 * different numbers, which is worse than a stale number.
 *
 * These tests pin the three things that have to hold:
 *
 *   1. The list reads the PERSISTED breakdown, and falls back to
 *      computing only when there is none — the same rule as the page.
 *   2. The batch snapshot query returns one row per resume.
 *   3. A Recompute revalidates the LIST path, not just the editor.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => {
  const snapshotsChain: {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
  } = {} as never;

  snapshotsChain.from = vi.fn(() => snapshotsChain);
  snapshotsChain.where = vi.fn(() => snapshotsChain);
  // `orderBy` is the terminal for the DISTINCT ON query — the rows
  // come back when it is awaited.
  snapshotsChain.orderBy = vi.fn();

  const db = {
    selectDistinctOn: vi.fn(() => snapshotsChain),
    select: vi.fn(() => snapshotsChain),
    from: vi.fn(() => snapshotsChain),
    where: vi.fn(() => snapshotsChain),
    orderBy: vi.fn(() => snapshotsChain)
  };

  return { db, snapshotsChain };
});

vi.mock('@/lib/db/drizzle', () => ({ db: mocks.db }));

import { getLatestScoreSnapshots } from '@/lib/db/queries';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('getLatestScoreSnapshots', () => {
  beforeEach(() => {
    mocks.snapshotsChain.orderBy.mockReset();
    mocks.db.selectDistinctOn.mockClear();
  });

  it('returns nothing for an empty list, without touching the database', async () => {
    const out = await getLatestScoreSnapshots([]);
    expect(out.size).toBe(0);
    expect(mocks.db.selectDistinctOn).not.toHaveBeenCalled();
  });

  it('keys the rows by resume id', async () => {
    mocks.snapshotsChain.orderBy.mockResolvedValueOnce([
      { resumeId: 'v1', matchScore: 66, breakdown: { overallScore: 66 } },
      { resumeId: 'v2', matchScore: 39, breakdown: null }
    ]);

    const out = await getLatestScoreSnapshots(['v1', 'v2']);

    expect(out.size).toBe(2);
    expect(out.get('v1')?.matchScore).toBe(66);
    expect(out.get('v2')?.matchScore).toBe(39);
  });

  it('uses one query, not one per resume', async () => {
    mocks.snapshotsChain.orderBy.mockResolvedValueOnce([]);
    await getLatestScoreSnapshots(['v1', 'v2', 'v3']);
    expect(mocks.db.selectDistinctOn).toHaveBeenCalledTimes(1);
  });
});

describe('the list and the scorecard agree', () => {
  it('the list resolves the score through the same helper the page uses', () => {
    const queries = read('lib/db/queries.ts');
    const listFn = queries.slice(
      queries.indexOf('export async function listResumes'),
      queries.indexOf('export async function listResumes') + 6000
    );

    // The list must go through the shared resolver, not compute a
    // fresh score of its own.
    expect(listFn).toContain('resolveRenderedBreakdown');
    expect(listFn).toContain('getLatestScoreSnapshots');
    expect(listFn).not.toMatch(/scoreResumeFromEnvelope\([^)]*\)\.overallScore/);
  });

  it('the page resolves the score through that same helper', () => {
    const page = read('app/(dashboard)/dashboard/resumes/[id]/page.tsx');
    expect(page).toContain('resolveRenderedBreakdown');
  });

  it('a recompute revalidates the LIST path, not just the editor', () => {
    for (const file of [
      'app/(dashboard)/dashboard/resumes/[id]/score-actions.ts',
      'app/(dashboard)/dashboard/resumes/[id]/score-semantic-actions.ts'
    ]) {
      const src = read(file);
      expect(src, `${file} does not revalidate the list`).toContain(
        "revalidatePath('/dashboard/resumes')"
      );
    }
  });
});
