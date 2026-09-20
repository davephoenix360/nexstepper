/**
 * Billing card Server Component — surfaces the user's current plan,
 * status, and next renewal date on `/dashboard/general`.
 *
 * Renders one of two CTAs based on plan:
 *
 *   - Free → `<UpgradeButton />` → `/pricing`
 *   - Pro  → `<ManageBillingButton />` → Stripe Billing Portal
 *     via the existing `customerPortalAction` in
 *     `lib/payments/actions.ts`.
 *
 * No new top-level nav route — billing lives next to the existing
 * Profile card on the Account settings page.
 *
 * ADR: `docs/decisions/0007-tier-gating.md`.
 */

import 'server-only';

import { getSubscription } from '@/lib/db/queries';
import {
  asPlanId,
  asPlanStatus,
  isProEffective
} from '@/lib/billing';
import type { BillingCardProps } from '@/lib/billing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ManageBillingButton } from './manage-billing-button';
import { UpgradeButton } from './upgrade-button';

export async function BillingCard() {
  const sub = await getSubscription();
  const props: BillingCardProps = {
    plan: asPlanId(sub.plan),
    status: asPlanStatus(sub.status),
    currentPeriodEnd:
      sub.currentPeriodEnd instanceof Date
        ? sub.currentPeriodEnd.toISOString()
        : null
  };

  return <BillingCardView {...props} isProEffective={isProEffective(sub)} />;
}

/**
 * Pure presentational view — separated from the data fetch so it
 * can be unit-tested without a DB.
 */
export function BillingCardView(
  props: BillingCardProps & { isProEffective: boolean }
) {
  const { plan, status, currentPeriodEnd, isProEffective: pro } = props;
  const planName = plan === 'pro' ? 'Pro' : 'Free';

  return (
    <Card data-testid="billing-card">
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="text-gray-900 font-medium mt-1" data-testid="billing-plan">
              {planName}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd
              className="text-gray-900 font-medium mt-1"
              data-testid="billing-status"
            >
              {statusLabel(status)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {plan === 'pro' && pro ? 'Renews on' : '—'}
            </dt>
            <dd
              className="text-gray-900 font-medium mt-1"
              data-testid="billing-period-end"
            >
              {currentPeriodEnd && plan === 'pro' && pro
                ? new Date(currentPeriodEnd).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })
                : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          {pro ? (
            <ManageBillingButton />
          ) : (
            <UpgradeButton />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Local re-import to avoid a circular dep with `lib/billing/index.ts`
// (statusLabel is also re-exported there). Trivial cost.
import { statusLabel } from '@/lib/billing';
