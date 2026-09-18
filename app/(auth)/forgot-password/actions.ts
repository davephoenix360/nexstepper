'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

/**
 * Server Action for the "forgot password" form.
 *
 * Why a Server Action (not a client-side `onSubmit`):
 *  - Progressive enhancement — the form works even if React
 *    hasn't hydrated yet. The browser submits the form, the server
 *    runs this action, and the client gets the result via
 *    `useActionState`.
 *  - Type-safe + matches the rest of the app's Server Action
 *    conventions (see `app/(dashboard)/dashboard/resumes/actions.ts`).
 *
 * Returns a discriminated union so the client can render the
 * generic "if an account exists, we sent the link" success state
 * OR a specific error message. We DO NOT reveal whether the email
 * is registered — Better Auth short-circuits silently for unknown
 * addresses, and our success path is the same either way.
 */
export type ForgotPasswordState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
};

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    return {
      status: 'error',
      message: 'Please enter your email.'
    };
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: '/reset-password'
      },
      headers: await headers()
    });

    // Same success state regardless of whether the email is
    // registered (Better Auth returns success for unknown emails
    // without sending anything).
    return {
      status: 'success'
    };
  } catch (err) {
    // Only surface errors for genuinely malformed requests
    // (invalid email format, server error). Better Auth treats
    // unknown emails as a no-op success, so we shouldn't see
    // those here.
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      message: message || 'Could not send the reset email.'
    };
  }
}
