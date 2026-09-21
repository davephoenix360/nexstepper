import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { subscriptions } from '@/lib/db/schema';
import {
  getSubscription,
  getSubscriptionByStripeCustomerId,
  getUser,
  upsertSubscription
} from '@/lib/db/queries';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // SDK 22.x requires the dahlia API version — basil was dropped.
  // Brief: docs/setup/stripe.md §"Managed Payments gotcha" still applies
  // (do NOT pass `payment_method_types`; Stripe auto-selects).
  apiVersion: '2026-08-26.dahlia'
});

/**
 * Process-local retry counter for `LocalSubscriptionNotFoundError`.
 *
 * When a Stripe webhook fires for a customer we never linked to a
 * Nextep user (e.g. the customer was created in the Stripe Dashboard
 * by hand, or the checkout flow died before `attachStripeCustomer`
 * ran), `handleSubscriptionChange` can't sync anything. The webhook
 * route returns 500, Stripe retries with exponential backoff, and the
 * server keeps getting hit for ~3 days before Stripe gives up. To
 * avoid that waste, we cap retries per customer ID here. After N
 * throws we demote to a silent log + return, the route returns 200,
 * and Stripe stops retrying.
 *
 * Caveats (acceptable for v1):
 *   - Process-local: in a multi-instance Vercel deploy, each instance
 *     has its own count. The cap is per-instance, not global. Long
 *     term: persist the counter in the DB.
 *   - The map grows unbounded over time. Keys are Stripe customer IDs
 *     (bounded by your customer count), so the leak is small. Long
 *     term: add periodic cleanup or a max-size LRU.
 */
const notFoundRetries = new Map<string, number>();
const NOT_FOUND_RETRY_CAP = 5;

/**
 * Nextep plan → Stripe Price ID mapping.
 *
 * Phase 0: read from env so prod / staging can use different price IDs.
 * The seeding script (added separately) creates matching products in
 * Stripe with these IDs.
 */
export const PRICE_IDS = {
  free: process.env.STRIPE_PRICE_ID_FREE ?? null,
  pro: process.env.STRIPE_PRICE_ID_PRO ?? null
} as const;

export type PlanKey = keyof typeof PRICE_IDS;

export async function createCheckoutSession({
  userId,
  email,
  priceId
}: {
  userId: string;
  email: string;
  priceId: string;
}) {
  const sub = await getSubscription();

  // Stripe-side idempotency: dedupe rapid double-clicks (the user
  // hits the CTA twice, two checkout sessions get created in quick
  // succession). The key is userId + priceId + minute bucket, so
  // the same user can intentionally buy again ~1 minute later (e.g.
  // switched plans) but rapid duplicates collapse into one session.
  // The minute window matches Stripe's recommended idempotency window
  // for one-shot actions.
  const idempotencyKey = `${userId}:${priceId}:${Math.floor(Date.now() / 60000)}`;

  const session = await stripe.checkout.sessions.create(
    {
      // NOTE: do NOT pass `payment_method_types` here. Stripe's
      // "Managed Payments" feature (enabled by default on API version
      // 2026-08-26.dahlia) auto-selects payment methods
      // based on the customer's locale + your Dashboard settings.
      // Passing `payment_method_types: ['card']` triggers a 400
      // `Unsupported parameter: payment_method_types` error.
      // See `docs/setup/stripe.md` §"Managed Payments gotcha".
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/pricing`,
      customer: sub.stripeCustomerId ?? undefined,
      customer_email: sub.stripeCustomerId ? undefined : email,
      client_reference_id: userId,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7
      }
    },
    { idempotencyKey }
  );

  redirect(session.url!);
}

export async function createCustomerPortalSession() {
  const u = await getUser();
  if (!u) redirect('/sign-in');

  const sub = await getSubscription();
  if (!sub.stripeCustomerId) redirect('/pricing');

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.BASE_URL}/dashboard`
  });
  redirect(portalSession.url);
}

/**
 * Thrown by `handleSubscriptionChange` when the local `subscriptions`
 * row for a Stripe customer does not exist yet — typically the
 * checkout-success redirect lost the race to the webhook. The webhook
 * route catches this and returns 500 so Stripe retries with exponential
 * backoff; the retry succeeds once a subsequent event creates the row.
 */
export class LocalSubscriptionNotFoundError extends Error {
  readonly code = 'local_subscription_not_found' as const;
  readonly customerId: string;

  constructor(customerId: string) {
    super(`No local subscription row for Stripe customer ${customerId}`);
    this.name = 'LocalSubscriptionNotFoundError';
    this.customerId = customerId;
  }
}

export async function handleSubscriptionChange(
  subscription: Stripe.Subscription
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  const existing = await getSubscriptionByStripeCustomerId(customerId);
  if (!existing) {
    // We don't have a local row for this Stripe customer. Most likely
    // the checkout success route lost the race to attach the customer
    // ID, and a subsequent event will create the row. To avoid a
    // 3-day Stripe retry storm on customers we'll never track (Stripe
    // Dashboard hand-created customers, etc.), bump a per-customer
    // counter; once it exceeds the cap, drop the event by returning
    // normally (the route returns 200 → Stripe stops retrying).
    const count = (notFoundRetries.get(customerId) ?? 0) + 1;
    notFoundRetries.set(customerId, count);
    if (count > NOT_FOUND_RETRY_CAP) {
      console.warn(
        `[stripe] LocalSubscriptionNotFoundError for customer ${customerId} ` +
        `exceeded ${NOT_FOUND_RETRY_CAP} retries; dropping event. ` +
        `This usually means the Stripe customer was never linked to a Nextep user.`
      );
      return;
    }
    throw new LocalSubscriptionNotFoundError(customerId);
  }

  // Defensive checks for unusual subscription shapes. Stripe normally
  // delivers subscriptions with exactly one item, but the API permits
  // multiple (bundles, add-ons). The first item is the headline price
  // we sync — anything else is out of scope for our single-plan model.
  const items = subscription.items.data;
  if (items.length === 0) {
    // Shouldn't happen — a Stripe subscription with no items is malformed.
    // Log and return; throwing would trigger Stripe's 3-day retry loop
    // for a data-shape issue we can't fix from our end.
    console.error(
      `[stripe] handleSubscriptionChange: subscription ${subscriptionId} ` +
      `has 0 items; nothing to sync. Dropping event.`
    );
    return;
  }
  if (items.length > 1) {
    console.warn(
      `[stripe] handleSubscriptionChange: subscription ${subscriptionId} ` +
      `has ${items.length} items; syncing only the first one (${items[0].price.id}). ` +
      `Nextep's pricing model is single-plan; extra items are ignored.`
    );
  }
  const item = items[0];
  const priceId = item.price.id;
  const plan: PlanKey =
    priceId === PRICE_IDS.pro ? 'pro' : priceId === PRICE_IDS.free ? 'free' : 'free';

  if (status === 'active' || status === 'trialing') {
    await upsertSubscription(existing.userId, {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      plan,
      status,
      currentPeriodEnd: item.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null
    });
  } else if (status === 'canceled' || status === 'unpaid') {
    await upsertSubscription(existing.userId, {
      stripeSubscriptionId: null,
      stripePriceId: null,
      plan: 'free',
      status,
      currentPeriodEnd: null
    });
  }
}

/**
 * Best-effort attach of a Stripe customer ID to our local subscriptions row.
 * Called from the checkout success route.
 */
export async function attachStripeCustomer(userId: string, customerId: string) {
  await db
    .update(subscriptions)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(subscriptions.userId, userId));
}

export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    type: 'recurring'
  });

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id
  }));
}