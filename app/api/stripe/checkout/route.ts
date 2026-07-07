import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { stripe, attachStripeCustomer } from '@/lib/payments/stripe';

/**
 * Stripe Checkout redirects here on success. We pull the subscription
 * metadata, attach the customer ID to our local subscription row, and
 * then bounce the user to /dashboard. The webhook handler will populate
 * the rest of the subscription fields asynchronously.
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
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Error handling successful checkout:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}