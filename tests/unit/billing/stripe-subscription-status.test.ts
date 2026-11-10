/**
 * A failed payment must cost the user their Pro plan.
 *
 * ## The bug this pins
 *
 * `lib/billing/types.ts` documents the policy in one place:
 *
 *   - **Past-due / unpaid:** Stripe sets these statuses when payment
 *     fails. We demote to Free immediately so the user is nudged
 *     back to billing.
 *
 *   - **`incomplete` / `incomplete_expired` / `paused`:** treated as
 *     Free.
 *
 * The webhook handler did not implement it. It had two branches —
 * `active | trialing` → keep Pro, `canceled | unpaid` → demote — and
 * `past_due` fell through BOTH of them, untouched. The local row kept
 * `plan = 'pro', status = 'active'`, so `isProEffective` stayed true
 * and the user kept Pro access after their card failed. Indefinitely,
 * because nothing else ever rewrote the row.
 *
 * The policy and the code disagreed, and the code was what ran.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const mocks = vi.hoisted(() => {
  // `PRICE_IDS` is read from the environment at module load, and the
  // plan is derived from the PRICE, not the status. Set the price ids
  // before the module is imported so `price_pro` maps to the pro plan.
  process.env.STRIPE_PRICE_ID_PRO = 'price_pro';
  process.env.STRIPE_PRICE_ID_FREE = 'price_free';

  return {
    getSubscriptionByStripeCustomerId: vi.fn(),
    upsertSubscription: vi.fn(),
    trackServer: vi.fn(),
    getUser: vi.fn(),
    getSubscription: vi.fn()
  };
});

vi.mock('@/lib/db/queries', () => ({
  getSubscriptionByStripeCustomerId: mocks.getSubscriptionByStripeCustomerId,
  upsertSubscription: mocks.upsertSubscription,
  getUser: mocks.getUser,
  getSubscription: mocks.getSubscription
}));

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
    update: () => ({ set: () => ({ where: () => undefined }) })
  }
}));

vi.mock('@/lib/posthog/server', () => ({
  trackServer: mocks.trackServer
}));

import { handleSubscriptionChange } from '@/lib/payments/stripe';

function subscription(status: string, priceId = 'price_pro'): Stripe.Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status,
    items: {
      data: [
        {
          price: { id: priceId },
          current_period_end: 1_800_000_000
        }
      ]
    }
  } as unknown as Stripe.Subscription;
}

describe('handleSubscriptionChange', () => {
  beforeEach(() => {
    mocks.getSubscriptionByStripeCustomerId.mockReset();
    mocks.upsertSubscription.mockReset();
    mocks.trackServer.mockReset();

    mocks.getSubscriptionByStripeCustomerId.mockResolvedValue({
      id: 'sub-row-1',
      userId: 'user-1',
      plan: 'pro',
      status: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      stripePriceId: 'price_pro',
      currentPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  it('keeps Pro for an active subscription', async () => {
    await handleSubscriptionChange(subscription('active'));

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ plan: 'pro', status: 'active' })
    );
  });

  it('keeps Pro during a trial', async () => {
    await handleSubscriptionChange(subscription('trialing'));

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ plan: 'pro', status: 'trialing' })
    );
  });

  it('demotes to Free when a payment fails', async () => {
    // The whole point of this file.
    await handleSubscriptionChange(subscription('past_due'));

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        plan: 'free',
        status: 'past_due'
      })
    );
  });

  it('demotes to Free when the initial payment never completed', async () => {
    await handleSubscriptionChange(subscription('incomplete'));

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ plan: 'free', status: 'incomplete' })
    );
  });

  it('demotes to Free when an incomplete subscription expires', async () => {
    await handleSubscriptionChange(subscription('incomplete_expired'));

    expect(mocks.upsertSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ plan: 'free', status: 'incomplete_expired' })
    );
  });

  it('keeps the Stripe customer id, so a later recovery can find the row again', async () => {
    // The lookup key is `stripeCustomerId`, which is a different column
    // and must survive the demotion — otherwise the next
    // `customer.subscription.updated` (the payment succeeding) would
    // find no local row and the user would stay on Free forever.
    await handleSubscriptionChange(subscription('past_due'));

    const [, data] = mocks.upsertSubscription.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(data.stripeSubscriptionId).toBeNull();
    expect(data.stripePriceId).toBeNull();
    // `stripeCustomerId` is not written by this call at all — it is
    // untouched, which is what we want.
    expect(data).not.toHaveProperty('stripeCustomerId');
  });

  it('records a payment failure as a downgrade, not a cancellation', async () => {
    // The subscription still exists on Stripe's side — it is a payment
    // problem, not a cancellation, and the two mean different things
    // in the product analytics.
    await handleSubscriptionChange(subscription('past_due'));

    expect(mocks.trackServer).toHaveBeenCalledWith(
      'user-1',
      'subscription_downgraded',
      expect.objectContaining({ fromPlan: 'pro', toPlan: 'free' })
    );
  });

  it('records a real cancellation as a cancellation', async () => {
    await handleSubscriptionChange(subscription('canceled'));

    expect(mocks.trackServer).toHaveBeenCalledWith(
      'user-1',
      'subscription_canceled',
      expect.objectContaining({ plan: 'pro' })
    );
  });

  it('leaves a paused subscription alone — the customer keeps their entitlement', async () => {
    // Stripe's `paused` status is used for promotional pauses, where the
    // customer is still entitled to the product. Demoting them would
    // take access away from someone who did nothing wrong.
    await handleSubscriptionChange(subscription('paused'));

    expect(mocks.upsertSubscription).not.toHaveBeenCalled();
  });

  it('does not fire a transition event when the plan did not move', async () => {
    mocks.getSubscriptionByStripeCustomerId.mockResolvedValueOnce({
      id: 'sub-row-1',
      userId: 'user-1',
      plan: 'free',
      status: 'active',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await handleSubscriptionChange(subscription('past_due'));

    expect(mocks.trackServer).not.toHaveBeenCalled();
  });
});
