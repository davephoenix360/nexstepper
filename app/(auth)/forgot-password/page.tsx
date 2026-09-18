'use client';

import { useActionState } from 'react';
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

import {
  forgotPasswordAction,
  type ForgotPasswordState
} from './actions';

const INITIAL_STATE: ForgotPasswordState = { status: 'idle' };

/**
 * "Forgot password?" — the first half of the reset flow.
 *
 * Uses a Server Action (`forgotPasswordAction`) via `useActionState`
 * so the form works even before React hydrates. The browser submits
 * the form to the server, the server runs Better Auth's
 * `requestPasswordReset`, and the result comes back through React's
 * state-update mechanism.
 *
 * Privacy: the same generic success state is shown whether the
 * email is registered or not. Better Auth short-circuits silently
 * for unknown emails (no email is sent), and our UI doesn't
 * distinguish between "sent" and "skipped."
 *
 * Dev-mode behavior when `RESEND_API_KEY` is unset: the URL is
 * logged to the server console (see `lib/email/reset-password.ts`).
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    INITIAL_STATE
  );

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
            {state.status === 'success' ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-muted-foreground">
                  If an account exists for that email, we just sent a reset
                  link. Check your inbox (and spam folder, just in case).
                </p>
                <p className="text-xs text-muted-foreground">
                  The link expires in 1 hour and can only be used once.
                </p>
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/sign-in">Back to sign in</Link>
                </Button>
              </div>
            ) : (
              <form className="flex flex-col gap-4" action={formAction}>
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

                {state.status === 'error' && state.message && (
                  <p className="text-sm text-destructive" role="alert">
                    {state.message}
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
