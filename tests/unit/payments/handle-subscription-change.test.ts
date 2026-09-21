/**
 * Tests for `handleSubscriptionChange` — `lib/payments/stripe.ts`.
 *
 * Verifies the multi-item subscription handling hardening (batch 2
 * fix #4):
 *   - Zero items → silent log + return (no throw, no DB write).
 *   - Multiple items → warn + proceed with the first item.
 *
 * The happy paths (single active/trialing subscription, canceled
 * demote-to-Free) are exercised end-to-end by the webhook route test
 * — we don't re-cover them here.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---------------------------------------------------------------

const mockGetSubscriptionByStripeCustomerId = vi.fn();
const mockUpsertSubscription = vi.fn();

vi.mock('@/lib/db/queries', () => ({
  getSubscriptionByStripeCustomerId: (...args: unknown[]) =>
    mockGetSubscriptionByStripeCustomerId(...args),
  upsertSubscription: (...args: unknown[]) => mockUpsertSubscription(...args)
}));

// --- Imports -------------------------------------------------------------

import { handleSubscriptionChange, LocalSubscriptionNotFoundError } from '@/lib/payments/stripe';
import type Stripe from 'stripe';

function makeExistingRow() {
  return {
    userId: 'user_1',
    stripeCustomerId: 'cus_1'
  } as unknown as Awaited<
    ReturnType<typeof import('@/lib/db/queries').getSubscriptionByStripeCustomerId>
  >;
}

function makeSubscription(
  itemCount: number,
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `si_${i + 1}`,
    price: { id: 'price_pro' } as Stripe.Price,
    current_period_end: 1_700_000_000
  })) as unknown as Stripe.SubscriptionItem[];

  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    items: { data: items },
    ...overrides
  } as unknown as Stripe.Subscription;
}

describe('handleSubscriptionChange', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockGetSubscriptionByStripeCustomerId.mockReset();
    mockUpsertSubscription.mockReset();
    mockGetSubscriptionByStripeCustomerId.mockResolvedValue(makeExistingRow());
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // ---- Multi-item hardening (fix #4) -----------------------------------

  it('logs an error and returns silently when the subscription has zero items', async () => {
    await handleSubscriptionChange(makeSubscription(0));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain(
      'subscription sub_1 has 0 items'
    );
    // No DB write — we can't sync nothing.
    expect(mockUpsertSubscription).not.toHaveBeenCalled();
  });

  it('warns and proceeds with the first item when the subscription has multiple items', async () => {
    await handleSubscriptionChange(makeSubscription(3));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      'subscription sub_1 has 3 items'
    );
    expect(warnSpy.mock.calls[0]?.[0]).toContain('syncing only the first one');

    // We did write — the first item's price + period end, status 'active'.
    expect(mockUpsertSubscription).toHaveBeenCalledTimes(1);
    const [userId, data] = mockUpsertSubscription.mock.calls[0]!;
    expect(userId).toBe('user_1');
    expect(data).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_pro',
      plan: 'free', // PRICE_IDS.pro is undefined in the test env
      status: 'active'
    });
  });

  // ---- Retry-cap hardening (fix #5) -------------------------------------

  it('throws LocalSubscriptionNotFoundError for the first N attempts then drops silently', async () => {
    // Use a unique customer ID so this test is order-independent
    // (the retry counter is process-local module state).
    const customerId = 'cus_retry_test_unique';
    mockGetSubscriptionByStripeCustomerId.mockResolvedValue(null);

    const sub = { id: 'sub_retry', customer: customerId, status: 'active', items: { data: [] } } as unknown as Stripe.Subscription;

    // The map is module-scoped and starts empty in a fresh vitest worker,
    // so attempts 1-5 should throw and attempt 6 should silently return.
    for (let i = 1; i <= 5; i++) {
      await expect(handleSubscriptionChange(sub)).rejects.toBeInstanceOf(
        LocalSubscriptionNotFoundError
      );
    }

    // 6th call: counter exceeds cap → silent log + return.
    await expect(handleSubscriptionChange(sub)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      `customer ${customerId} exceeded 5 retries`
    );
    expect(warnSpy.mock.calls[0]?.[0]).toContain('dropping event');
  });
});
