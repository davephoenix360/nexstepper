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
 * Next.js implements as a `NEXT_REDIRECT` thrown error. We MUST
 * re-throw that error from our catch — it's the framework's
 * mechanism for triggering the redirect, and swallowing it would
 * surface "NEXT_REDIRECT" as a user-facing error message (which
 * is what happened before this fix).
 *
 * On a real error (network, expired token, weak password, etc.)
 * we return a discriminated union so the client can show a
 * specific message.
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
    // CRITICAL: re-throw Next.js's redirect signal. The redirect()
    // call above works by throwing a NEXT_REDIRECT error that the
    // framework catches. If we swallow it here, the user sees
    // "NEXT_REDIRECT" as a red error string instead of being
    // redirected.
    //
    // Next.js < 15.1 exported `isRedirectError` from
    // `next/navigation`; in newer versions we detect by message
    // (the digest field is set too, but the message is the public
    // contract and is stable).
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;

    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      message:
        message ||
        'Could not reset the password. The link may have expired — please request a new one.'
    };
  }
}
