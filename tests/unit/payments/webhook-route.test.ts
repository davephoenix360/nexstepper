/**
 * Tests for the Stripe webhook route —
 * `app/api/stripe/webhook/route.ts`.
 *
 * Verifies:
 * - Fix 2: when `handleSubscriptionChange` throws
 *   `LocalSubscriptionNotFoundError`, the route returns 500 so Stripe
 *   retries; other thrown errors also return 500; happy path returns
 *   200.
 * - Fix 3: the 10 noisy event types are silently accepted (200) without
 *   the `Unhandled event type` console.log noise. Unknown events still
 *   log.
 * - The existing `customer.subscription.deleted` case still calls
 *   `handleSubscriptionChange`.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---------------------------------------------------------------

const mockConstructEvent = vi.fn();
const mockHandleSubscriptionChange = vi.fn();
const mockWasStripeEventProcessed = vi.fn();
const mockMarkStripeEventProcessed = vi.fn();

vi.mock('@/lib/payments/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args)
    }
  },
  handleSubscriptionChange: (...args: unknown[]) =>
    mockHandleSubscriptionChange(...args),
  // Re-exported so the test can construct one for the "not found" case.
  LocalSubscriptionNotFoundError: class LocalSubscriptionNotFoundError extends Error {
    readonly code = 'local_subscription_not_found' as const;
    readonly customerId: string;
    constructor(customerId: string) {
      super(`No local subscription row for Stripe customer ${customerId}`);
      this.name = 'LocalSubscriptionNotFoundError';
      this.customerId = customerId;
    }
  }
}));

vi.mock('@/lib/db/queries', () => ({
  wasStripeEventProcessed: (...args: unknown[]) =>
    mockWasStripeEventProcessed(...args),
  markStripeEventProcessed: (...args: unknown[]) =>
    mockMarkStripeEventProcessed(...args)
}));

type FakeRequest = { text: () => Promise<string>; headers: { get: (k: string) => string | null } };

let lastJsonBody: unknown = null;
let lastJsonStatus: number | null = null;

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => {
      lastJsonBody = body;
      lastJsonStatus = init?.status ?? 200;
      return { status: lastJsonStatus, body };
    }
  }
}));

// --- Imports -------------------------------------------------------------

import { POST } from '@/app/api/stripe/webhook/route';
import { LocalSubscriptionNotFoundError } from '@/lib/payments/stripe';
import type Stripe from 'stripe';

function makeFakeEvent(type: string): Stripe.Event {
  return {
    id: 'evt_1',
    type,
    data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } as unknown as Stripe.Subscription }
  } as unknown as Stripe.Event;
}

function makeRequest(): FakeRequest {
  return {
    text: async () => '{"ok":true}',
    headers: { get: (k) => (k === 'stripe-signature' ? 'sig_test' : null) }
  };
}

describe('POST /api/stripe/webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConstructEvent.mockReset();
    mockHandleSubscriptionChange.mockReset();
    mockHandleSubscriptionChange.mockResolvedValue(undefined);
    mockWasStripeEventProcessed.mockReset();
    mockWasStripeEventProcessed.mockResolvedValue(false);
    mockMarkStripeEventProcessed.mockReset();
    mockMarkStripeEventProcessed.mockResolvedValue(undefined);
    lastJsonBody = null;
    lastJsonStatus = null;
    // STRIPE_WEBHOOK_SECRET is read at module load; the mock value
    // above is fine for constructEvent being mocked.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // ---- Fix 2: LocalSubscriptionNotFoundError → 500 --------------------

  it('returns 500 when handleSubscriptionChange throws LocalSubscriptionNotFoundError', async () => {
    mockConstructEvent.mockReturnValue(makeFakeEvent('customer.subscription.updated'));
    mockHandleSubscriptionChange.mockRejectedValue(
      new LocalSubscriptionNotFoundError('cus_1')
    );

    await POST(makeRequest() as unknown as never);

    expect(mockHandleSubscriptionChange).toHaveBeenCalledTimes(1);
    expect(lastJsonStatus).toBe(500);
  });

  it('returns 500 on any thrown error inside handleSubscriptionChange (not just the typed one)', async () => {
    mockConstructEvent.mockReturnValue(makeFakeEvent('customer.subscription.created'));
    mockHandleSubscriptionChange.mockRejectedValue(new Error('DB connection lost'));

    await POST(makeRequest() as unknown as never);

    expect(lastJsonStatus).toBe(500);
  });

  // ---- Happy path / substantive cases ----------------------------------

  it('returns 200 on a successful customer.subscription.updated event', async () => {
    mockConstructEvent.mockReturnValue(makeFakeEvent('customer.subscription.updated'));

    await POST(makeRequest() as unknown as never);

    expect(mockHandleSubscriptionChange).toHaveBeenCalledTimes(1);
    expect(lastJsonStatus).toBe(200);
    expect(lastJsonBody).toEqual({ received: true });
  });

  it('still calls handleSubscriptionChange for customer.subscription.deleted', async () => {
    mockConstructEvent.mockReturnValue(makeFakeEvent('customer.subscription.deleted'));

    await POST(makeRequest() as unknown as never);

    expect(mockHandleSubscriptionChange).toHaveBeenCalledTimes(1);
    expect(lastJsonStatus).toBe(200);
  });

  // ---- Fix 3: 10 noise events silenced --------------------------------

  const NOISE_EVENTS = [
    'invoice.finalized',
    'invoice.created',
    'invoice.upcoming',
    'invoice.paid',
    'invoice.payment_succeeded',
    'payment_method.attached',
    'customer.updated',
    'setup_intent.created',
    'setup_intent.succeeded',
    'checkout.session.completed'
  ] as const;

  it.each(NOISE_EVENTS)(
    'returns 200 silently for the noisy %s event (no Unhandled event type log)',
    async (eventType) => {
      mockConstructEvent.mockReturnValue(makeFakeEvent(eventType));

      await POST(makeRequest() as unknown as never);

      expect(mockHandleSubscriptionChange).not.toHaveBeenCalled();
      expect(lastJsonStatus).toBe(200);
      expect(lastJsonBody).toEqual({ received: true });
      expect(logSpy).not.toHaveBeenCalled();
    }
  );

  // ---- Default branch still useful for unknown events ------------------

  it('logs and returns 200 for genuinely-unknown event types', async () => {
    // We pick a future event name we don't list explicitly. The route
    // should still call console.log so the dev terminal surfaces the
    // omission.
    mockConstructEvent.mockReturnValue(makeFakeEvent('charge.dispute.created'));

    await POST(makeRequest() as unknown as never);

    expect(mockHandleSubscriptionChange).not.toHaveBeenCalled();
    expect(lastJsonStatus).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event type charge.dispute.created');
  });

  // ---- Signature verification (pre-switch) -----------------------------

  it('returns 400 when constructEvent throws (signature verification failed)', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    await POST(makeRequest() as unknown as never);

    expect(lastJsonStatus).toBe(400);
    expect(mockHandleSubscriptionChange).not.toHaveBeenCalled();
  });

  // ---- Idempotency (fix #7) ---------------------------------------------

  it('skips processing when the event ID was already processed (returns 200, no handler call)', async () => {
    mockConstructEvent.mockReturnValue(makeFakeEvent('customer.subscription.updated'));
    mockWasStripeEventProcessed.mockResolvedValue(true);

    await POST(makeRequest() as unknown as never);

    expect(mockWasStripeEventProcessed).toHaveBeenCalledWith('evt_1');
    expect(mockHandleSubscriptionChange).not.toHaveBeenCalled();
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
    expect(lastJsonStatus).toBe(200);
    expect(lastJsonBody).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith('Stripe event evt_1 already processed; skipping');
  });

  it('marks the event as processed after a successful customer.subscription.updated handler', async () => {
    mockConstructEvent.mockReturnValue(makeFakeEvent('customer.subscription.updated'));

    await POST(makeRequest() as unknown as never);

    expect(mockHandleSubscriptionChange).toHaveBeenCalledTimes(1);
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith(
      'evt_1',
      'customer.subscription.updated'
    );
    expect(lastJsonStatus).toBe(200);
  });

  it('marks the event as processed even for noisy / unhandled events (no double-retry storm)', async () => {
    // Critical: we must mark AFTER the switch, not inside it. A noisy
    // event (e.g. invoice.*) should still be recorded as processed so
    // Stripe's retries don't keep hitting the same no-op case.
    mockConstructEvent.mockReturnValue(makeFakeEvent('invoice.finalized'));

    await POST(makeRequest() as unknown as never);

    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith('evt_1', 'invoice.finalized');
    expect(lastJsonStatus).toBe(200);
  });

  it('does NOT mark the event as processed when handleSubscriptionChange throws (lets Stripe retry)', async () => {
    mockConstructEvent.mockReturnValue(makeFakeEvent('customer.subscription.updated'));
    mockHandleSubscriptionChange.mockRejectedValue(
      new LocalSubscriptionNotFoundError('cus_1')
    );

    await POST(makeRequest() as unknown as never);

    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
    expect(lastJsonStatus).toBe(500);
  });
});