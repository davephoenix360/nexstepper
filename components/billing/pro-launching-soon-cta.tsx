'use client';

/**
 * ProLaunchingSoonCTA — single source of truth for the "Pro is
 * launching soon, here's how to get notified" call-to-action.
 *
 * Two variants:
 *   - `badge`: card-sized CTA meant to replace `<UpgradeButton />`
 *     on the BillingCard for Free users. Same visual weight, but
 *     links to mailto instead of a non-existent checkout.
 *   - `banner`: thin top-of-page banner meant to render across the
 *     dashboard for Free users, so they see Pro is coming without
 *     having to navigate to /dashboard/general.
 *
 * Why this exists: during soft launch, Pro is wired but not sold
 * (Stripe activation blocked on having a deployed business website
 * per Stripe's account verification). Anywhere we used to show
 * "Upgrade to Pro", we now route through this component. When Pro
 * goes live, restore the original UpgradeButton + remove this
 * component's callers.
 *
 * The mailto subject is the same on both variants so user replies
 * land in a single thread in the inbox.
 */

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

const WAITLIST_MAILTO =
  'mailto:hi@nexstepper.com?subject=Pro%20waitlist&body=Hi%20—%20I%27d%20like%20to%20know%20when%20Pro%20launches.';

interface BaseProps {
  className?: string;
}

export function ProLaunchingSoonBadge({ className }: BaseProps) {
  return (
    <Link
      href={WAITLIST_MAILTO}
      className={
        'inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors ' +
        (className ?? '')
      }
      data-testid="pro-launching-soon-badge"
    >
      <Sparkles className="size-4" />
      Get notified when Pro launches
    </Link>
  );
}

export function ProLaunchingSoonBanner({ className }: BaseProps) {
  return (
    <div
      role="status"
      // `no-print` is defense-in-depth — the preview route's
      // `.printable-root` (Phase 1g, plan:
      // docs/plans/print-default-opt-in.md) hides this banner by
      // default. The explicit class also strips the banner from
      // Ctrl+P output on every OTHER dashboard page (where
      // printable-root isn't set), so a Free user printing the
      // resume list / settings page doesn't ship a "Pro is coming"
      // banner to a recruiter by accident.
      className={
        'no-print w-full px-4 py-2 text-center text-sm bg-muted text-muted-foreground border-b border-border ' +
        (className ?? '')
      }
      data-testid="pro-launching-soon-banner"
    >
      <Sparkles className="inline-block size-3.5 mr-1.5 align-text-bottom text-primary" />
      <span>
        <strong className="font-semibold text-foreground">
          Pro is launching soon
        </strong>{' '}
        —{' '}
        <Link
          href={WAITLIST_MAILTO}
          className="underline underline-offset-2 hover:text-foreground transition-colors"
          data-testid="pro-launching-soon-banner-cta"
        >
          get notified when it ships
        </Link>
        .
      </span>
    </div>
  );
}
