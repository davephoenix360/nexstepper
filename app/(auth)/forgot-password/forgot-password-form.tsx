'use client';

import { useActionState, useEffect, useState } from 'react';
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
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile-actions';

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
 * ## The bot check
 *
 * A password-reset endpoint is an email cannon: a bot can post any
 * address and make the app send a reset mail. That burns Resend quota
 * and — worse for a product that sends transactional email to real
 * users — it damages the sending reputation of the domain, which then
 * affects the delivery of the reset mails themselves.
 *
 * The Turnstile token travels in a hidden field, because this form is
 * submitted by the BROWSER as a normal form post (that is the point of
 * using a Server Action) and a browser form post cannot carry custom
 * headers. The action reads the field and forwards it as the
 * `x-captcha-response` header Better Auth's captcha plugin reads.
 *
 * Privacy: the same generic success state is shown whether the
 * email is registered or not. Better Auth short-circuits silently
 * for unknown emails (no email is sent), and our UI doesn't
 * distinguish between "sent" and "skipped."
 *
 * Dev-mode behavior when `RESEND_API_KEY` is unset: the URL is
 * logged to the server console (see `lib/email/reset-password.ts`).
 */
export function ForgotPasswordForm({
  turnstileSiteKey = null
}: {
  /**
   * The Turnstile site key, or null when the bot check is not
   * configured. Resolved on the server and passed down — see
   * `lib/turnstile.ts`.
   */
  turnstileSiteKey?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    INITIAL_STATE
  );
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  // A Turnstile token is single-use, so a failed attempt has to reset
  // the widget and get a fresh one before the user can retry.
  useEffect(() => {
    if (state.status === 'error') setTurnstileReset((n) => n + 1);
  }, [state]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary/5 to-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-md flex-col justify-center">
        <Card className="border-0 shadow-lg ring-1 ring-foreground/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Forgot your password?</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a link to reset it.
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

                {turnstileSiteKey && (
                  <>
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      action={TURNSTILE_ACTIONS.passwordReset}
                      onToken={setTurnstileToken}
                      resetSignal={turnstileReset}
                    />
                    {/* A browser form post cannot carry custom headers, so
                        the token rides in a field and the server action
                        forwards it as the `x-captcha-response` header. */}
                    <input
                      type="hidden"
                      name="cf-turnstile-response"
                      value={turnstileToken ?? ''}
                    />
                  </>
                )}

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
