/**
 * Tests for the billing helpers — `isProEffective`, `statusLabel`,
 * `asPlanId`, `asPlanStatus`, and the `ProRequiredError` shape.
 *
 * These are the trust-boundary predicates. A regression here means
 * a Free user can call a Pro-only action or a Pro user gets
 * demoted mid-session. Test exhaustively across the status matrix.
 */

import { describe, expect, it } from 'vitest';

import {
  ProRequiredError,
  asPlanId,
  asPlanStatus,
  isProEffective,
  statusLabel
} from '@/lib/billing/types';

describe('isProEffective', () => {
  it('returns true for plan=pro + status=active', () => {
    expect(isProEffective({ plan: 'pro', status: 'active' })).toBe(true);
  });

  it('returns true for plan=pro + status=trialing', () => {
    expect(isProEffective({ plan: 'pro', status: 'trialing' })).toBe(true);
  });

  it('returns false for plan=pro + status=canceled (Stripe-side cancel)', () => {
    expect(isProEffective({ plan: 'pro', status: 'canceled' })).toBe(false);
  });

  it('returns false for plan=pro + status=past_due (payment failed)', () => {
    expect(isProEffective({ plan: 'pro', status: 'past_due' })).toBe(false);
  });

  it('returns false for plan=pro + status=unpaid', () => {
    expect(isProEffective({ plan: 'pro', status: 'unpaid' })).toBe(false);
  });

  it('returns false for plan=pro + status=paused', () => {
    expect(isProEffective({ plan: 'pro', status: 'paused' })).toBe(false);
  });

  it('returns false for plan=pro + status=incomplete', () => {
    expect(isProEffective({ plan: 'pro', status: 'incomplete' })).toBe(false);
  });

  it('returns false for plan=free + status=active', () => {
    expect(isProEffective({ plan: 'free', status: 'active' })).toBe(false);
  });

  it('returns false for plan=free + status=trialing', () => {
    expect(isProEffective({ plan: 'free', status: 'trialing' })).toBe(false);
  });

  it('returns false for plan=free + status=inactive (default row)', () => {
    expect(isProEffective({ plan: 'free', status: 'inactive' })).toBe(false);
  });
});

describe('statusLabel', () => {
  it('returns human-readable labels for every known status', () => {
    expect(statusLabel('active')).toBe('Active');
    expect(statusLabel('trialing')).toBe('Trialing');
    expect(statusLabel('canceled')).toBe('Canceled');
    expect(statusLabel('past_due')).toBe('Past due');
    expect(statusLabel('unpaid')).toBe('Unpaid');
    expect(statusLabel('paused')).toBe('Paused');
    expect(statusLabel('incomplete')).toBe('Incomplete');
    expect(statusLabel('incomplete_expired')).toBe('Expired');
    expect(statusLabel('inactive')).toBe('Inactive');
  });
});

describe('asPlanId', () => {
  it("returns 'pro' for the literal 'pro'", () => {
    expect(asPlanId('pro')).toBe('pro');
  });

  it("returns 'free' for any other string (safe narrowing)", () => {
    expect(asPlanId('free')).toBe('free');
    expect(asPlanId('')).toBe('free');
    expect(asPlanId('PRO')).toBe('free'); // case-sensitive
    expect(asPlanId('enterprise')).toBe('free'); // unknown tier
  });
});

describe('asPlanStatus', () => {
  it('passes through known statuses', () => {
    expect(asPlanStatus('active')).toBe('active');
    expect(asPlanStatus('trialing')).toBe('trialing');
    expect(asPlanStatus('canceled')).toBe('canceled');
    expect(asPlanStatus('past_due')).toBe('past_due');
  });

  it('falls back to inactive for unknown statuses', () => {
    expect(asPlanStatus('')).toBe('inactive');
    expect(asPlanStatus('weird_status')).toBe('inactive');
  });
});

describe('ProRequiredError', () => {
  it('has a stable code discriminator for switch statements', () => {
    const err = new ProRequiredError('free', 'inactive');
    expect(err.code).toBe('pro_required');
    expect(err.name).toBe('ProRequiredError');
  });

  it('captures plan and status for diagnostics', () => {
    const err = new ProRequiredError('free', 'inactive');
    expect(err.plan).toBe('free');
    expect(err.status).toBe('inactive');
    expect(err.message).toContain('Pro required');
    expect(err.message).toContain('free');
    expect(err.message).toContain('inactive');
  });

  it('is instanceof Error', () => {
    const err = new ProRequiredError('pro', 'canceled');
    expect(err).toBeInstanceOf(Error);
  });
});
