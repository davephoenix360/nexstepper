/**
 * Tests for the Stripe webhook idempotency helpers —
 * `wasStripeEventProcessed` and `markStripeEventProcessed` in
 * `lib/db/queries.ts`.
 *
 * The route-level dedupe is covered in `webhook-route.test.ts`. This
 * file locks down the query-level invariants:
 *   - `wasStripeEventProcessed` returns boolean from a single PK lookup.
 *   - `markStripeEventProcessed` is safe to call concurrently
 *     (onConflictDoNothing → no throw on duplicate).
 *
 * The Drizzle layer is mocked so we can verify the exact SQL shape
 * without hitting a real Postgres.
 */

import { describe, expect, it, vi } from 'vitest';

// vi.hoisted runs BEFORE the imports below, so the chain object
// exists when vi.mock('@/lib/db/drizzle', ...) is hoisted.
const mocks = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockInsert = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflictDoNothing = vi.fn();

  const terminalSelect = vi.fn();
  const terminalInsert = vi.fn();

  const chain: Record<string, unknown> = {};
  chain.select = mockSelect;
  chain.from = mockFrom;
  chain.where = mockWhere;
  chain.limit = mockLimit;
  chain.insert = mockInsert;
  chain.values = mockValues;
  chain.onConflictDoNothing = mockOnConflictDoNothing;

  mockSelect.mockImplementation(() => chain);
  mockFrom.mockImplementation(() => chain);
  mockWhere.mockImplementation(() => chain);
  mockLimit.mockImplementation(() => terminalSelect());
  mockInsert.mockImplementation(() => chain);
  mockValues.mockImplementation(() => chain);
  mockOnConflictDoNothing.mockImplementation(() => terminalInsert());

  return {
    mockSelect,
    mockFrom,
    mockWhere,
    mockLimit,
    mockInsert,
    mockValues,
    mockOnConflictDoNothing,
    terminalSelect,
    terminalInsert,
    chain
  };
});

vi.mock('@/lib/db/drizzle', () => ({
  db: mocks.chain
}));

// Schema is not mocked — let the real module load (it's pure data,
// no DB connections). We only need to intercept `db` to avoid hitting
// Postgres.

// --- Imports -------------------------------------------------------------

import { markStripeEventProcessed, wasStripeEventProcessed } from '@/lib/db/queries';

describe('wasStripeEventProcessed', () => {
  it('returns true when the event ID row exists', async () => {
    mocks.terminalSelect.mockResolvedValue([{ id: 'evt_1' }]);
    expect(await wasStripeEventProcessed('evt_1')).toBe(true);
    expect(mocks.mockSelect).toHaveBeenCalled();
    expect(mocks.mockFrom).toHaveBeenCalled();
    // WHERE was called once with a SQL predicate (Drizzle eq() creates
    // a SQL object — we don't compare by value here since SQL nodes
    // are not referentially equal across calls).
    expect(mocks.mockWhere).toHaveBeenCalledTimes(1);
    expect(mocks.mockLimit).toHaveBeenCalledWith(1);
  });

  it('returns false when the event ID row is missing', async () => {
    mocks.terminalSelect.mockResolvedValue([]);
    expect(await wasStripeEventProcessed('evt_missing')).toBe(false);
    expect(mocks.mockSelect).toHaveBeenCalled();
  });
});

describe('markStripeEventProcessed', () => {
  it('inserts {eventId, eventType} via onConflictDoNothing', async () => {
    mocks.terminalInsert.mockResolvedValue(undefined);

    await markStripeEventProcessed('evt_1', 'customer.subscription.updated');

    expect(mocks.mockInsert).toHaveBeenCalled();
    expect(mocks.mockValues).toHaveBeenCalledWith({
      eventId: 'evt_1',
      eventType: 'customer.subscription.updated'
    });
    expect(mocks.mockOnConflictDoNothing).toHaveBeenCalled();
  });

  it('does not throw when the event ID already exists (idempotent re-mark)', async () => {
    // Simulate the on-conflict path: a no-op result.
    mocks.terminalInsert.mockResolvedValue(undefined);

    await expect(
      markStripeEventProcessed('evt_dup', 'invoice.finalized')
    ).resolves.toBeUndefined();
  });
});
