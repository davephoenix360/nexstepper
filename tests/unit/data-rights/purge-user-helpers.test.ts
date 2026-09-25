import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mock factories must be hoisted by vitest before any `import` runs.
 * That means variables referenced inside `vi.mock(...)` factories aren't
 * available at hoist time. The fix is `vi.hoisted()` — anything declared
 * inside it is hoisted alongside the mocks and the factory can close
 * over it. See https://vitest.dev/api/vi.html#vi-hoisted
 */

const mocks = vi.hoisted(() => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn()
    },
    customers: {
      del: vi.fn()
    }
  },
  posthog: {
    capture: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('@/lib/db/queries', () => ({
  getSubscriptionByUserId: vi.fn()
}));

vi.mock('@/lib/payments/stripe', () => ({
  stripe: mocks.stripe
}));

vi.mock('@/lib/posthog/server', () => ({
  posthogServer: mocks.posthog
}));

import {
  cancelStripeCustomer,
  deleteStripeCustomer
} from '@/lib/data-rights/stripe-customer';
import { scrubPosthogUser } from '@/lib/data-rights/posthog-user-delete';
import { getSubscriptionByUserId } from '@/lib/db/queries';

const mockGetSubscription = vi.mocked(getSubscriptionByUserId);

const USER_ID = 'usr_test_001';
const CUSTOMER_ID = 'cus_test_001';
const SUBSCRIPTION_ID = 'sub_test_001';

/**
 * A free-tier subscription row with no Stripe linkage. Returned by
 * `getSubscriptionByUserId` for users who have never upgraded.
 */
function freeSub() {
  return {
    id: 'anonymous',
    userId: USER_ID,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    plan: 'free' as const,
    status: 'inactive' as const,
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/** A Pro subscription row with full Stripe linkage. */
function proSub() {
  return {
    id: 'sub_001',
    userId: USER_ID,
    plan: 'pro' as const,
    status: 'active' as const,
    stripeCustomerId: CUSTOMER_ID,
    stripeSubscriptionId: SUBSCRIPTION_ID,
    stripePriceId: 'price_pro',
    currentPeriodEnd: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('cancelStripeCustomer', () => {
  it('returns ok with no Stripe call when the user has no Stripe linkage', async () => {
    mockGetSubscription.mockResolvedValue(freeSub());

    const result = await cancelStripeCustomer(USER_ID);

    expect(result).toEqual({ ok: true, processorsNotified: false });
    expect(mocks.stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(mocks.stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('skips the cancel call when the remote subscription is already terminal', async () => {
    mockGetSubscription.mockResolvedValue(proSub());
    mocks.stripe.subscriptions.retrieve.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      status: 'canceled'
    });

    const result = await cancelStripeCustomer(USER_ID);

    expect(result).toEqual({ ok: true, processorsNotified: false });
    expect(mocks.stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('cancels an active subscription and returns processorsNotified: true', async () => {
    mockGetSubscription.mockResolvedValue(proSub());
    mocks.stripe.subscriptions.retrieve.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      status: 'active'
    });
    mocks.stripe.subscriptions.cancel.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      status: 'canceled'
    });

    const result = await cancelStripeCustomer(USER_ID);

    expect(result).toEqual({ ok: true, processorsNotified: true });
    expect(mocks.stripe.subscriptions.cancel).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      expect.objectContaining({ invoice_now: true })
    );
  });

  it('returns ok: false when Stripe throws', async () => {
    mockGetSubscription.mockResolvedValue(proSub());
    mocks.stripe.subscriptions.retrieve.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      status: 'active'
    });
    mocks.stripe.subscriptions.cancel.mockRejectedValue(
      new Error('stripe down')
    );

    const result = await cancelStripeCustomer(USER_ID);

    expect(result.ok).toBe(false);
    expect(result.processorsNotified).toBe(false);
    expect(result.reason).toContain('stripe down');
  });
});

describe('deleteStripeCustomer', () => {
  it('returns ok with no Stripe call when no stripeCustomerId', async () => {
    mockGetSubscription.mockResolvedValue(freeSub());

    const result = await deleteStripeCustomer(USER_ID);

    expect(result).toEqual({ ok: true, processorsNotified: false });
    expect(mocks.stripe.customers.del).not.toHaveBeenCalled();
  });

  it('returns ok: true when Stripe confirms the customer was deleted', async () => {
    mockGetSubscription.mockResolvedValue(proSub());
    mocks.stripe.customers.del.mockResolvedValue({ id: CUSTOMER_ID, deleted: true });

    const result = await deleteStripeCustomer(USER_ID);

    expect(result).toEqual({ ok: true, processorsNotified: true });
    expect(mocks.stripe.customers.del).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it('treats resource_missing as success (idempotency)', async () => {
    mockGetSubscription.mockResolvedValue(proSub());
    mocks.stripe.customers.del.mockRejectedValue(
      new Error('No such customer: cus_test_001')
    );

    const result = await deleteStripeCustomer(USER_ID);

    // // If a previous attempt already deleted the customer, re-running
    // // the purge should succeed (audit log idempotent, not a retry loop).
    expect(result.ok).toBe(true);
    expect(result.processorsNotified).toBe(false);
  });

  it('returns ok: false on unexpected Stripe errors', async () => {
    mockGetSubscription.mockResolvedValue(proSub());
    mocks.stripe.customers.del.mockRejectedValue(new Error('network blip'));

    const result = await deleteStripeCustomer(USER_ID);

    expect(result.ok).toBe(false);
    expect(result.processorsNotified).toBe(false);
    expect(result.reason).toContain('network blip');
  });
});

describe('scrubPosthogUser', () => {
  it('calls $delete_user on PostHog with the user distinct_id', () => {
    const result = scrubPosthogUser(USER_ID);

    expect(mocks.posthog.capture).toHaveBeenCalledWith({
      distinctId: USER_ID,
      event: '$delete_user',
      properties: expect.any(Object)
    });
    expect(mocks.posthog.flush).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, processorsNotified: true });
  });
});