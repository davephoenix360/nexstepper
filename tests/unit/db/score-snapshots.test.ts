/**
 * Tests for `recordScoreSnapshot` + `getLatestScoreSnapshot`
 * (lib/db/queries.ts).
 *
 * The inline-issue surface reads the latest snapshot on every
 * variant page load to hydrate its per-leaf popover anchors
 * (see docs/drift/2026-09-21-inline-issue-surface-shipped.md).
 * These tests pin:
 *   - `recordScoreSnapshot` returns `null` when the resume is
 *     not owned (defensive ownership re-check; never throws).
 *   - `recordScoreSnapshot` writes the expected row when the
 *     resume IS owned.
 *   - `getLatestScoreSnapshot` returns `null` when no snapshot
 *     exists (legacy + never-recomputed rows).
 *   - `getLatestScoreSnapshot` returns the latest row ordered by
 *     `createdAt` DESC (the index supports this without a sort).
 *
 * The Drizzle layer is mocked so we can verify the exact SQL
 * shape without hitting a real Postgres. Pattern lifted from
 * `tests/unit/payments/mark-event-processed.test.ts`.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// `vi.hoisted` runs BEFORE the imports below, so the `db` mock
// chain is in place when queries.ts is loaded.
const mocks = vi.hoisted(() => {
  // Build a single chain object that any query-builder call
  // returns. Each method just returns the chain so the
  // builder reads as fluent; `limit()` and `values()` are
  // terminals that return whatever the test queued up.
  const chain: {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    values: ReturnType<typeof vi.fn>;
    [key: string]: unknown;
  } = {} as never;

  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);

  // `limit` and `values` are the terminals — each test sets up
  // `mockReturnValueOnce` on these to script the awaited result.
  chain.limit = vi.fn();
  chain.values = vi.fn();

  return { chain };
});

vi.mock('@/lib/db/drizzle', () => ({ db: mocks.chain }));

// Schema is not mocked — let the real module load (pure data,
// no DB connections). We only intercept `db`.

import {
  recordScoreSnapshot,
  getLatestScoreSnapshot
} from '@/lib/db/queries';

describe('recordScoreSnapshot', () => {
  beforeEach(() => {
    mocks.chain.limit.mockReset();
    mocks.chain.values.mockReset();
    mocks.chain.select.mockClear();
    mocks.chain.from.mockClear();
    mocks.chain.where.mockClear();
    mocks.chain.insert.mockClear();
  });

  it('returns null when the resume is not owned by the user', async () => {
    // Ownership re-check selects from `resumes`. Empty result
    // → the function silently no-ops.
    mocks.chain.limit.mockResolvedValueOnce([]);

    const result = await recordScoreSnapshot(
      'r-other-user',
      'user-1',
      {
        matchScore: 72,
        matchBreakdown: [],
        dynamicTips: {},
        computedInMs: 4
      }
    );
    expect(result).toBeNull();
    // Crucially: no insert was attempted.
    expect(mocks.chain.insert).not.toHaveBeenCalled();
  });

  it('inserts a snapshot row when the resume IS owned', async () => {
    // First `limit` resolution = ownership check (returns the
    // resume row). Second = (none, because we don't reach it
    // in this branch — insert path doesn't call .limit()).
    mocks.chain.limit.mockResolvedValueOnce([{ id: 'r1' }]);
    // `values()` is the terminal for the insert branch.
    mocks.chain.values.mockResolvedValueOnce(undefined);

    const result = await recordScoreSnapshot('r1', 'user-1', {
      matchScore: 72,
      matchBreakdown: [
        {
          path: 'sections.work[0].positions[0].highlights[0]',
          weight: 0.75,
          criterion: 'ATS Coverage',
          tipKind: 'gap'
        }
      ],
      dynamicTips: { 'ATS Coverage': 'fine' },
      computedInMs: 4
    });
    expect(result).toMatchObject({ id: expect.any(String) });

    // Ownership check path: select().from().where().limit(1).
    expect(mocks.chain.select).toHaveBeenCalled();
    expect(mocks.chain.from).toHaveBeenCalled();
    expect(mocks.chain.limit).toHaveBeenCalledWith(1);

    // Insert path: insert(scoreSnapshots).values(...).
    expect(mocks.chain.insert).toHaveBeenCalled();
    expect(mocks.chain.values).toHaveBeenCalled();
    const valuesArg = mocks.chain.values.mock.calls[0]?.[0];
    expect(valuesArg).toMatchObject({
      resumeId: 'r1',
      matchScore: 72,
      computedInMs: 4
    });
    expect(Array.isArray(valuesArg.matchBreakdown)).toBe(true);
    expect(valuesArg.matchBreakdown.length).toBe(1);
    expect(valuesArg.dynamicTips).toEqual({ 'ATS Coverage': 'fine' });
  });
});

describe('getLatestScoreSnapshot', () => {
  beforeEach(() => {
    mocks.chain.limit.mockReset();
    mocks.chain.select.mockClear();
    mocks.chain.from.mockClear();
    mocks.chain.where.mockClear();
    mocks.chain.orderBy.mockClear();
  });

  it('returns null when no snapshot exists for the resume', async () => {
    mocks.chain.limit.mockResolvedValueOnce([]);
    const result = await getLatestScoreSnapshot('r-no-snapshot');
    expect(result).toBeNull();
    expect(mocks.chain.select).toHaveBeenCalled();
    expect(mocks.chain.where).toHaveBeenCalled();
    expect(mocks.chain.orderBy).toHaveBeenCalled();
    expect(mocks.chain.limit).toHaveBeenCalledWith(1);
  });

  it('returns the latest snapshot row when one exists', async () => {
    const row = {
      id: 'snap-1',
      resumeId: 'r1',
      matchScore: 78,
      matchBreakdown: [],
      dynamicTips: {},
      computedInMs: 3,
      createdAt: new Date('2026-09-21T16:00:00Z')
    };
    mocks.chain.limit.mockResolvedValueOnce([row]);

    const result = await getLatestScoreSnapshot('r1');
    expect(result).toEqual(row);
  });
});