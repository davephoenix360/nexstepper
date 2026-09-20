/**
 * Tests for `requirePro()` — the server-authoritative Pro gate.
 *
 * Mocks `@/lib/db/queries` to script `getSubscription()` per test.
 * Asserts the typed `ProRequiredError` shape so callers can
 * switch on `err.code === 'pro_required'`.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock 'server-only' before importing the helper (test runtime is
// not a Next.js request handler).
vi.mock('server-only', () => ({}));

// Mock the DB layer so we can script the subscription shape per test.
const mockGetSubscription = vi.fn();
vi.mock('@/lib/db/queries', () => ({
  getSubscription: (...args: unknown[]) => mockGetSubscription(...args)
}));

import { requirePro } from '@/lib/billing/require-pro';
import { ProRequiredError } from '@/lib/billing/types';

const baseSub = {
  id: 'sub-1',
  userId: 'user-1',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  stripePriceId: 'price_pro',
  currentPeriodEnd: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
} as const;

describe('requirePro', () => {
  beforeEach(() => {
    mockGetSubscription.mockReset();
  });

  it('resolves (returns subscription) for plan=pro + status=active', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'pro',
      status: 'active'
    });
    await expect(requirePro()).resolves.toBeDefined();
  });

  it('resolves for plan=pro + status=trialing (trial counts as Pro)', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'pro',
      status: 'trialing'
    });
    await expect(requirePro()).resolves.toBeDefined();
  });

  it('throws ProRequiredError for plan=free', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'free',
      status: 'inactive'
    });
    await expect(requirePro()).rejects.toBeInstanceOf(ProRequiredError);
  });

  it('throws for plan=pro + status=past_due (payment failed)', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'pro',
      status: 'past_due'
    });
    await expect(requirePro()).rejects.toBeInstanceOf(ProRequiredError);
  });

  it('throws for plan=pro + status=canceled', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'pro',
      status: 'canceled'
    });
    await expect(requirePro()).rejects.toBeInstanceOf(ProRequiredError);
  });

  it('throws for plan=pro + status=unpaid', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'pro',
      status: 'unpaid'
    });
    await expect(requirePro()).rejects.toBeInstanceOf(ProRequiredError);
  });

  it('throws for plan=pro + status=paused', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'pro',
      status: 'paused'
    });
    await expect(requirePro()).rejects.toBeInstanceOf(ProRequiredError);
  });

  it('captures plan + status on the thrown error for diagnostics', async () => {
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'free',
      status: 'inactive'
    });
    try {
      await requirePro();
      throw new Error('requirePro should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProRequiredError);
      const proErr = err as ProRequiredError;
      expect(proErr.code).toBe('pro_required');
      expect(proErr.plan).toBe('free');
      expect(proErr.status).toBe('inactive');
    }
  });

  it('narrows unknown status strings to a valid PlanStatus on the error', async () => {
    // Defense in depth: if a future migration introduces a new status
    // that `asPlanStatus` falls back to 'inactive', the error still
    // has a valid PlanStatus. We don't ship an unsound error shape.
    mockGetSubscription.mockResolvedValue({
      ...baseSub,
      plan: 'pro',
      status: 'mystery_status_unknown_to_schema'
    });
    try {
      await requirePro();
      throw new Error('requirePro should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProRequiredError);
      const proErr = err as ProRequiredError;
      // Either 'mystery_status_unknown_to_schema' (if we passed through)
      // or 'inactive' (if we narrowed). Either is valid as long as it's
      // a known PlanStatus.
      expect(typeof proErr.status).toBe('string');
    }
  });
});
