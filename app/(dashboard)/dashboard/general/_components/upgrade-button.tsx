'use client';

/**
 * Upgrade CTA for Free users. Plain link to `/pricing` — the pricing
 * page handles the checkout flow. No client-side state needed.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function UpgradeButton() {
  return (
    <Button
      asChild
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      <Link href="/pricing" data-testid="upgrade-button">
        Upgrade to Pro
      </Link>
    </Button>
  );
}
