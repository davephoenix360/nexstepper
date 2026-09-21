import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import {
  stripe,
  attachStripeCustomer,
  handleSubscriptionChange
} from '@/lib/payments/stripe';

/**
 * Stripe Checkout redirects here on success. We pull the subscription
 * metadata, attach the customer ID to our local subscription row, then
 * SYNCHRONOUSLY run `handleSubscriptionChange` so the local row is in
 * sync before the user lands on `/dashboard` — closing the webhook →
 * page-load race documented in `docs/decisions/0007-tier-gating.md`
 * §5. The webhook handler remains the source of truth for subsequent
 * events (renewals, payment failures, cancellations).
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription']
    });

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
    const userId = session.client_reference_id ?? null;

    if (!customerId || !userId) {
      throw new Error('Missing customer or client_reference_id.');
    }

    await attachStripeCustomer(userId, customerId);

    // Resolve `session.subscription` (string | Stripe.Subscription | null)
    // to a full Stripe.Subscription and call handleSubscriptionChange
    // synchronously. Wrapped in its own try/catch so a Stripe API hiccup
    // on the sync path doesn't break the redirect — the webhook will
    // retry and catch us up either way.
    try {
      const subscriptionOrId = session.subscription;
      const subscription: Stripe.Subscription | null =
        typeof subscriptionOrId === 'string'
          ? await stripe.subscriptions.retrieve(subscriptionOrId)
          : (subscriptionOrId ?? null);

      if (subscription) {
        await handleSubscriptionChange(subscription);
      }
    } catch (syncError) {
      console.error(
        'Synchronous handleSubscriptionChange failed on checkout success; relying on webhook retry:',
        syncError
      );
    }

    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Error handling successful checkout:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}