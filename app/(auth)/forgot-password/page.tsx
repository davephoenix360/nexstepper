'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';

/**
 * "Forgot password?" — the first half of the reset flow.
 *
 * User enters their email; we call `authClient.requestPasswordReset`,
 * which:
 *   1. Generates a single-use token (1h expiry, configured in
 *      `lib/auth.ts`)
 *   2. Stores it in the `verification` table
 *   3. Invokes our `sendResetPassword` callback, which emails the
 *      user a link to `/reset-password?token=…`
 *
 * We intentionally return the SAME success state whether or not
 * the email is registered. This avoids leaking which addresses
 * have accounts — a standard practice for auth flows. If the
 * email isn't in the DB, Better Auth short-circuits the callback
 * (no email is sent) but the API still returns success.
 *
 * Dev-mode behavior when `RESEND_API_KEY` is unset: the URL is
 * logged to the server console (see `lib/email/reset-password.ts`).
 * The UI here still shows the generic success message — the
 * developer copies the URL from the dev terminal.
 */
export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '').trim();

    if (!email) {
      setError('Please enter your email.');
      return;
    }

    startTransition(async () => {
      const result = await authClient.requestPasswordReset({
        email,
        // Where Better Auth should point the email's reset link.
        // Must match `resetPasswordURL` in `lib/auth.ts`.
        redirectTo: '/reset-password'
      });

      if (result.error) {
        // Better Auth returns errors only for genuinely malformed
        // requests (e.g. invalid email format). Unknown emails
        // succeed silently. We still surface the error here for
        // the malformed case.
        setError(result.error.message ?? 'Could not send the reset email.');
        return;
      }

      setSubmitted(true);
    });
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary/5 to-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-md flex-col justify-center">
        <Card className="border-0 shadow-lg ring-1 ring-foreground/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Forgot your password?</CardTitle>
            <CardDescription>
              Enter your email and we'll send you a link to reset it.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {submitted ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  If an account exists for that email, we just sent a reset link.
                  Check your inbox (and spam folder, just in case).
                </p>
                <p className="text-xs text-muted-foreground">
                  The link expires in 1 hour and can only be used once.
                </p>
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/sign-in">Back to sign in</Link>
                </Button>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={255}
                    placeholder="you@example.com"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={pending} className="mt-2">
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Remembered it?{' '}
              <Link
                href="/sign-in"
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
