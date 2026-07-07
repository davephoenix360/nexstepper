'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { checkoutAction } from '@/lib/payments/actions';

export function CheckoutButton({
  priceId,
  label
}: {
  priceId: string;
  label: string;
}) {
  const { pending } = useFormStatus();

  return (
    <form action={checkoutAction}>
      <input type="hidden" name="priceId" value={priceId} />
      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-full"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin mr-2 h-4 w-4" />
            Redirecting...
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}