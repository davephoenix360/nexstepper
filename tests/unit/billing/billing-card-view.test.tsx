/**
 * Tests for `BillingCardView` — pure presentational Server Component.
 *
 * The data-fetching wrapper (`BillingCard`) calls `getSubscription()`;
 * we test the view directly to avoid a DB mock. The wrapper is a
 * one-liner; a separate integration test would cover the wiring.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the Stripe actions module BEFORE importing the component so
// the chain `BillingCardView` → `ManageBillingButton` → `actions.ts` →
// `new Stripe(process.env.STRIPE_SECRET_KEY!)` doesn't run during
// the test (no real key in the test environment).
vi.mock('@/lib/payments/actions', () => ({
  customerPortalAction: vi.fn(async () => undefined)
}));

import { renderToStaticMarkup } from 'react-dom/server';

import { BillingCardView } from '@/app/(dashboard)/dashboard/general/_components/billing-card';

describe('BillingCardView', () => {
  it('renders plan name + status for Free users and shows Upgrade button', () => {
    const html = renderToStaticMarkup(
      <BillingCardView
        plan="free"
        status="inactive"
        currentPeriodEnd={null}
        isProEffective={false}
      />
    );

    expect(html).toContain('Free');
    expect(html).toContain('Inactive');
    expect(html).toContain('data-testid="upgrade-button"');
    expect(html).not.toContain('data-testid="manage-billing-button"');
  });

  it('renders Pro plan + Active status + Manage billing button for Pro users', () => {
    const periodEnd = '2027-09-20T00:00:00.000Z';
    const html = renderToStaticMarkup(
      <BillingCardView
        plan="pro"
        status="active"
        currentPeriodEnd={periodEnd}
        isProEffective={true}
      />
    );

    expect(html).toContain('Pro');
    expect(html).toContain('Active');
    expect(html).toContain('Manage billing');
    expect(html).toContain('data-testid="manage-billing-button"');
    expect(html).not.toContain('data-testid="upgrade-button"');
  });

  it('formats the renewal date for Pro users', () => {
    const periodEnd = '2027-09-20T00:00:00.000Z';
    const html = renderToStaticMarkup(
      <BillingCardView
        plan="pro"
        status="active"
        currentPeriodEnd={periodEnd}
        isProEffective={true}
      />
    );

    // Don't pin the exact rendered date string (locale-dependent);
    // assert that a date-shaped token appears next to "Renews on".
    expect(html).toContain('Renews on');
    expect(html).toMatch(/Sep \d+, 2027|September \d+, 2027/);
  });

  it('does not show a renewal date for Free users', () => {
    const html = renderToStaticMarkup(
      <BillingCardView
        plan="free"
        status="inactive"
        currentPeriodEnd={null}
        isProEffective={false}
      />
    );

    expect(html).not.toContain('Renews on');
  });

  it('shows Upgrade for Pro users in canceled state (no longer Pro-effective)', () => {
    // Edge case: user upgraded to Pro, then canceled. Status moves to
    // 'canceled'. Even though plan is 'pro', isProEffective is false,
    // so we render the Upgrade CTA, not Manage billing.
    const html = renderToStaticMarkup(
      <BillingCardView
        plan="pro"
        status="canceled"
        currentPeriodEnd={null}
        isProEffective={false}
      />
    );

    expect(html).toContain('data-testid="upgrade-button"');
    expect(html).not.toContain('data-testid="manage-billing-button"');
    expect(html).toContain('Canceled');
  });
});
