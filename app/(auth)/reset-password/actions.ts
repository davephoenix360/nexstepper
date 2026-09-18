'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * Server Action for the "reset password" form.
 *
 * Why a Server Action (not a client-side `onSubmit`):
 *  - Progressive enhancement — works even before React hydrates.
 *  - Aligns with the rest of the app's Server Action conventions.
 *
 * The action redirects to `/sign-in?reset=1` on success, which
 * Next.js implements as a `NEXT_REDIRECT` thrown error. We let
 * that propagate (don't catch it).
 *
 * On error, we return a discriminated union so the client can
 * show a specific message (expired token, weak password, etc.).
 */
export type ResetPasswordState = {
  status: 'idle' | 'error';
  message?: string;
};

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const token = String(formData.get('token') ?? '').trim();
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!token) {
    return {
      status: 'error',
      message:
        'This reset link is missing its token. Please request a new one.'
    };
  }

  if (newPassword.length < 8) {
    return {
      status: 'error',
      message: 'Password must be at least 8 characters.'
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      status: 'error',
      message: 'Passwords do not match.'
    };
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword, token },
      headers: await headers()
    });

    // Success → redirect. Better Auth does NOT auto-sign-in for
    // password reset, so the user lands on /sign-in with a banner
    // to use their new password.
    redirect('/sign-in?reset=1');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      message:
        message ||
        'Could not reset the password. The link may have expired — please request a new one.'
    };
  }
}
