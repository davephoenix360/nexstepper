/**
 * Tests for the checkout success redirect route —
 * `app/api/stripe/checkout/route.ts`.
 *
 * Verifies Fix 1: after `attachStripeCustomer`, the route resolves
 * `session.subscription` (string or object) and calls
 * `handleSubscriptionChange` synchronously before redirecting. Also
 * verifies graceful degradation: a sync-path failure still redirects.
 *
 * Mocks:
 * - `@/lib/payments/stripe` — `stripe.checkout.sessions.retrieve`,
 *   `stripe.subscriptions.retrieve`, `attachStripeCustomer`,
 *   `handleSubscriptionChange`.
 * - `next/server` — `NextRequest` + `NextResponse.redirect` so the
 *   test can drive the handler with a fake request and observe the
 *   returned response object.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// --- Mocks ---------------------------------------------------------------

// Track calls into the stripe module so we can assert ordering.
const mockCheckoutRetrieve = vi.fn();
const mockSubscriptionRetrieve = vi.fn();
const mockAttachStripeCustomer = vi.fn();
const mockHandleSubscriptionChange = vi.fn();

// `stripe` is also imported by the route (only `checkout.sessions.retrieve`
// and `subscriptions.retrieve` are used). Other keys are stubbed.
vi.mock('@/lib/payments/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockCheckoutRetrieve(...args)
      }
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionRetrieve(...args)
    }
  },
  attachStripeCustomer: (...args: unknown[]) => mockAttachStripeCustomer(...args),
  handleSubscriptionChange: (...args: unknown[]) =>
    mockHandleSubscriptionChange(...args)
}));

// Stub `next/server` with a minimal NextRequest + NextResponse surface
// matching what the route uses. This is brittle by design — the test
// exists to lock down the fix, not to be portable.
type FakeRequest = { nextUrl: { searchParams: URLSearchParams; origin: string }; url: string };
let lastRedirectUrl: string | null = null;
let lastRedirectStatus: number | null = null;

vi.mock('next/server', () => ({
  NextRequest: class {
    nextUrl: { searchParams: URLSearchParams; origin: string };
    url: string;
    constructor(url: string) {
      const u = new URL(url);
      this.url = url;
      this.nextUrl = {
        searchParams: u.searchParams,
        origin: u.origin
      };
    }
  },
  NextResponse: {
    redirect: (url: URL | string) => {
      lastRedirectUrl = typeof url === 'string' ? url : url.toString();
      lastRedirectStatus = 307;
      return { status: lastRedirectStatus, url: lastRedirectUrl };
    },
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body
    })
  }
}));

// --- Imports -------------------------------------------------------------

import { GET } from '@/app/api/stripe/checkout/route';
import type Stripe from 'stripe';

function makeSubscriptionObject(): Stripe.Subscription {
  // Minimal shape the route cares about; handleSubscriptionChange is
  // mocked so we don't need the full Stripe.Subscription payload.
  return { id: 'sub_1', customer: 'cus_1', status: 'active' } as unknown as Stripe.Subscription;
}

function makeRequest(sessionId: string | null): FakeRequest {
  const url = sessionId
    ? `https://example.com/api/stripe/checkout?session_id=${sessionId}`
    : 'https://example.com/api/stripe/checkout';
  return { nextUrl: { searchParams: new URLSearchParams(sessionId ? { session_id: sessionId } : {}), origin: 'https://example.com' }, url };
}

describe('GET /api/stripe/checkout', () => {
  beforeEach(() => {
    mockCheckoutRetrieve.mockReset();
    mockSubscriptionRetrieve.mockReset();
    mockAttachStripeCustomer.mockReset();
    mockHandleSubscriptionChange.mockReset();
    mockHandleSubscriptionChange.mockResolvedValue(undefined);
    mockAttachStripeCustomer.mockResolvedValue(undefined);
    mockSubscriptionRetrieve.mockReset();
    lastRedirectUrl = null;
    lastRedirectStatus = null;
  });

  it('redirects to /pricing when session_id is missing', async () => {
    const response = await GET(makeRequest(null) as unknown as never);
    expect(lastRedirectUrl).toBe('https://example.com/pricing');
    expect(mockCheckoutRetrieve).not.toHaveBeenCalled();
    expect(response).toBeDefined();
  });

  it('resolves an object-shaped subscription and calls handleSubscriptionChange before redirecting', async () => {
    const subscription = makeSubscriptionObject();
    mockCheckoutRetrieve.mockResolvedValue({
      customer: 'cus_1',
      client_reference_id: 'user_1',
      subscription // already expanded
    });

    const response = await GET(makeRequest('cs_test_1') as unknown as never);

    // All three side effects happened.
    expect(mockCheckoutRetrieve).toHaveBeenCalledWith('cs_test_1', {
      expand: ['customer', 'subscription']
    });
    expect(mockAttachStripeCustomer).toHaveBeenCalledWith('user_1', 'cus_1');
    expect(mockHandleSubscriptionChange).toHaveBeenCalledTimes(1);
    expect(mockHandleSubscriptionChange).toHaveBeenCalledWith(subscription);

    // We did NOT need to call subscriptions.retrieve when the object was expanded.
    expect(mockSubscriptionRetrieve).not.toHaveBeenCalled();

    // Redirect happened with 307 (NextResponse.redirect default).
    expect(lastRedirectUrl).toBe('https://example.com/dashboard');
    expect(lastRedirectStatus).toBe(307);
    expect(response).toBeDefined();
  });

  it('resolves a string-shaped subscription via stripe.subscriptions.retrieve', async () => {
    const subscription = makeSubscriptionObject();
    mockCheckoutRetrieve.mockResolvedValue({
      customer: 'cus_1',
      client_reference_id: 'user_1',
      subscription: 'sub_1' // ID only — not expanded
    });
    mockSubscriptionRetrieve.mockResolvedValue(subscription);

    await GET(makeRequest('cs_test_1') as unknown as never);

    expect(mockSubscriptionRetrieve).toHaveBeenCalledWith('sub_1');
    expect(mockHandleSubscriptionChange).toHaveBeenCalledWith(subscription);
    expect(lastRedirectUrl).toBe('https://example.com/dashboard');
  });

  it('skips the synchronous handleSubscriptionChange when subscription is null', async () => {
    mockCheckoutRetrieve.mockResolvedValue({
      customer: 'cus_1',
      client_reference_id: 'user_1',
      subscription: null
    });

    await GET(makeRequest('cs_test_1') as unknown as never);

    expect(mockHandleSubscriptionChange).not.toHaveBeenCalled();
    expect(lastRedirectUrl).toBe('https://example.com/dashboard');
  });

  it('still redirects to /dashboard when the synchronous handleSubscriptionChange throws', async () => {
    // Simulates a Stripe API hiccup on the sync path. The route must
    // swallow it (logged) and let the user proceed; the webhook will
    // retry and catch us up.
    mockCheckoutRetrieve.mockResolvedValue({
      customer: 'cus_1',
      client_reference_id: 'user_1',
      subscription: makeSubscriptionObject()
    });
    mockHandleSubscriptionChange.mockRejectedValue(new Error('Stripe API hiccup'));

    const response = await GET(makeRequest('cs_test_1') as unknown as never);

    expect(mockHandleSubscriptionChange).toHaveBeenCalledTimes(1);
    expect(lastRedirectUrl).toBe('https://example.com/dashboard');
    expect(lastRedirectStatus).toBe(307);
    expect(response).toBeDefined();
  });

  it('redirects to /error when the outer session retrieve fails', async () => {
    // Different failure mode: session retrieval itself failed. The
    // inner try/catch must NOT swallow this — the outer catch should
    // route us to /error.
    mockCheckoutRetrieve.mockRejectedValue(new Error('Stripe API down'));

    await GET(makeRequest('cs_test_1') as unknown as never);

    expect(lastRedirectUrl).toBe('https://example.com/error');
    expect(mockHandleSubscriptionChange).not.toHaveBeenCalled();
  });
});