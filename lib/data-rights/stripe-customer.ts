import 'server-only';

import { stripe } from '@/lib/payments/stripe';
import { getSubscriptionByUserId } from '@/lib/db/queries';

/**
 * Stripe-side helpers for the GDPR Art. 17 purge flow.
 *
 * Two operations, both idempotent + safe to retry:
 *
 *   1. `cancelStripeCustomer(userId)` — cancel any active subscription
 *      so no further charges happen. The Stripe `Customer` object is
 *      kept (we need it for step 2).
 *
 *   2. `deleteStripeCustomer(userId)` — call `customers.del` on the
 *      Stripe customer. After this, the customer + payment history
 *      are scrubed from Stripe's live system. (Stripe retains the
 *      `id` in their internal financial-audit logs per their TOS,
 *      same as how any payment processor handles tax records.)
 *
 * Why both are idempotent:
 *
 *   - Stripe's `subscriptions.update({ cancel_at_period_end: true })`
 *     is idempotent in the sense that calling it twice doesn't break
 *     anything, but it would set the cancellation date to "now" both
 *     times. So we first GET the subscription and only act if it's
 *     not already cancelled.
 *   - `customers.del` returns `deleted: true` on the first call and
 *     throws `resource_missing` (`No such customer: 'cus_...'`) on
 *     subsequent calls. We treat that specific error as success.
 *
 * Both helpers return a `{ ok, processorsNotified, reason? }` result
 * the purge orchestrator logs into `erasure_log.processors_notified`.
 */

export type StripePurgeResult = {
  ok: boolean;
  /** Whether Stripe was actually touched. `false` means nothing to do. */
  processorsNotified: boolean;
  /** When `ok: false`, a short reason for the erasure_log audit row. */
  reason?: string;
};

/**
 * Cancel any active subscription for this user, leaving the Stripe
 * customer record intact so `deleteStripeCustomer` can scrub it.
 *
 * Skips when:
 *   - User has no `subscriptions` row
 *   - The local row has no `stripeCustomerId` (never linked to Stripe)
 *   - The local `subscriptions.status` is already in a terminal state
 */
export async function cancelStripeCustomer(userId: string): Promise<StripePurgeResult> {
  const sub = await getSubscriptionByUserId(userId);

  if (!sub?.stripeSubscriptionId) {
    return { ok: true, processorsNotified: false };
  }

  try {
    const remote = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

    // Already terminal — no further work needed.
    if (remote.status === 'canceled' || remote.status === 'incomplete_expired') {
      return { ok: true, processorsNotified: false };
    }

    await stripe.subscriptions.cancel(sub.stripeSubscriptionId, {
      invoice_now: true,
      prorate: false
    });
    return { ok: true, processorsNotified: true };
  } catch (err) {
    return {
      ok: false,
      processorsNotified: false,
      reason: `cancelStripeCustomer: ${(err as Error).message}`
    };
  }
}

/**
 * Delete the Stripe customer record for this user.
 *
 * Skips when:
 *   - User has no `stripeCustomerId`
 *
 * Tolerates:
 *   - `resource_missing` (customer already deleted) — treated as success.
 *   - Network / 5xx errors — bubbled up as `{ ok: false }`.
 *
 * IMPORTANT: call `cancelStripeCustomer` FIRST if there's an active
 * subscription. Otherwise Stripe refuses to delete the customer (returns
 * `customer_has_active_subscriptions`). The orchestrator in `purge-user.ts`
 * enforces this ordering.
 */
export async function deleteStripeCustomer(userId: string): Promise<StripePurgeResult> {
  const sub = await getSubscriptionByUserId(userId);

  if (!sub?.stripeCustomerId) {
    return { ok: true, processorsNotified: false };
  }

  try {
    const deleted = await stripe.customers.del(sub.stripeCustomerId);
    return { ok: !!deleted.deleted, processorsNotified: !!deleted.deleted };
  } catch (err) {
    const msg = (err as Error).message;
    // Idempotency: if the customer was already deleted by an earlier
    // attempt (e.g. the user closed + reopened the dashboard mid-purge),
    // Stripe returns `resource_missing` with that message. Treat as success.
    if (msg.includes('No such customer') || msg.includes('resource_missing')) {
      return { ok: true, processorsNotified: false };
    }
    return { ok: false, processorsNotified: false, reason: msg };
  }
}