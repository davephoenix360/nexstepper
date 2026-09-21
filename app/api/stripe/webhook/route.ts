import Stripe from 'stripe';
import {
  LocalSubscriptionNotFoundError,
  handleSubscriptionChange,
  stripe
} from '@/lib/payments/stripe';
import {
  markStripeEventProcessed,
  wasStripeEventProcessed
} from '@/lib/db/queries';
import { NextRequest, NextResponse } from 'next/server';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed.' },
      { status: 400 }
    );
  }

  // At-least-once dedupe: if we've already processed this event ID,
  // skip the handler entirely and ack with 200. Stripe's exponential
  // backoff can replay an event multiple times; without this, we'd
  // double-update the local row + double-bump the retry counter.
  if (await wasStripeEventProcessed(event.id)) {
    console.log(`Stripe event ${event.id} already processed; skipping`);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription);
        break;
      }
      // No-op handlers for noisy events Stripe emits during a normal
      // checkout flow. Listed explicitly so the `default` case stays
      // useful for catching genuinely-unknown event types (added to
      // the Stripe API after our handler was written).
      case 'invoice.finalized':
      case 'invoice.created':
      case 'invoice.upcoming':
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'payment_method.attached':
      case 'customer.updated':
      case 'setup_intent.created':
      case 'setup_intent.succeeded':
      case 'checkout.session.completed':
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (err) {
    // LocalSubscriptionNotFoundError: the checkout-success redirect
    // didn't beat us to creating the local row. Return 500 so Stripe
    // retries with exponential backoff; the retry succeeds once a
    // subsequent event (or the next user action) creates the row.
    //
    // Any other thrown error also returns 500 (default Stripe
    // retry behavior) — we don't silently swallow.
    if (err instanceof LocalSubscriptionNotFoundError) {
      console.warn(
        `Webhook ${event.type} for customer ${err.customerId} found no local row; returning 500 to trigger Stripe retry.`
      );
    } else {
      console.error(`Webhook ${event.type} handler threw:`, err);
    }
    return NextResponse.json(
      { error: 'Webhook handler failed; Stripe should retry.' },
      { status: 500 }
    );
  }

  // Mark as processed AFTER the handler returns successfully. If we
  // marked before and the handler threw, a retry would be silently
  // dropped (the dedupe check would skip it before we could retry).
  // Marking after means: we only record an event as "done" when we
  // actually finished the work — retries for transient failures
  // (LocalSubscriptionNotFoundError, DB hiccup, …) still happen.
  await markStripeEventProcessed(event.id, event.type);

  return NextResponse.json({ received: true });
}