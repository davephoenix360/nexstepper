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
  apiVersion: '2025-04-30.basil'
});

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

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
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
  });

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
    console.error('No subscription row for Stripe customer:', customerId);
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const plan: PlanKey =
    priceId === PRICE_IDS.pro ? 'pro' : priceId === PRICE_IDS.free ? 'free' : 'free';

  if (status === 'active' || status === 'trialing') {
    await upsertSubscription(existing.userId, {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      plan,
      status,
      currentPeriodEnd: item?.current_period_end
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