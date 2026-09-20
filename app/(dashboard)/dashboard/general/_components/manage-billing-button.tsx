'use client';

/**
 * Client component that invokes `customerPortalAction` — opens the
 * Stripe Billing Portal in the current tab via a server redirect.
 *
 * The action lives in `lib/payments/actions.ts` and is unchanged.
 * This is purely the in-product entry point.
 */

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { customerPortalAction } from '@/lib/payments/actions';

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      await customerPortalAction();
    });
  };

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
      data-testid="manage-billing-button"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Opening billing portal…
        </>
      ) : (
        'Manage billing'
      )}
    </Button>
  );
}
