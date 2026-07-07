'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { createCheckoutSession, createCustomerPortalSession } from './stripe';

export async function checkoutAction(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    const priceId = formData.get('priceId') as string;
    redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
  }

  const priceId = formData.get('priceId') as string;
  await createCheckoutSession({
    userId: session.user.id,
    email: session.user.email,
    priceId
  });
}

export async function customerPortalAction() {
  await createCustomerPortalSession();
}