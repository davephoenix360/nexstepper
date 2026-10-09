'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { describeSocialSignInError } from '@/lib/auth-google';

/** Google's 4-colour "G". Decorative — the button carries the label. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3a7.2 7.2 0 0 1-10.72-3.78h-4v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.33 14.31a7.2 7.2 0 0 1 0-4.62V6.6h-4a12 12 0 0 0 0 10.8l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.4-3.4C17.95 1.2 15.24 0 12 0A12 12 0 0 0 1.34 6.6l4 3.09A7.2 7.2 0 0 1 12 4.75z"
      />
    </svg>
  );
}

export function Login({
  mode = 'signin',
  googleEnabled = false
}: {
  mode?: 'signin' | 'signup';
  /**
   * Rendered by the server pages from `isGoogleAuthEnabled()`, so the
   * button can never appear when the provider isn't registered (and
   * can never go missing when it is).
   */
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // When redirected from the reset-password flow, show a small
  // success banner. We strip the query so it doesn't persist if
  // the user navigates within the page.
  const justReset = searchParams.get('reset') === '1';

  const [pending, startTransition] = useTransition();
  const [googlePending, startGoogleTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const redirect = String(formData.get('redirect') ?? '');

    startTransition(async () => {
      const result =
        mode === 'signin'
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({
              email,
              password,
              name: email.split('@')[0]
            });

      if (result.error) {
        setError(result.error.message ?? 'Something went wrong. Please try again.');
        return;
      }
      router.push(redirect || '/dashboard');
      router.refresh();
    });
  };

  /**
   * Better Auth redirects to Google on success, so this returns only
   * on failure. The hidden `redirect` input is the same one the email
   * form reads, keeping both paths on the same post-login destination.
   */
  const handleGoogleSignIn = () => {
    setError(null);
    const redirect =
      (document.getElementById('redirect-input') as HTMLInputElement | null)
        ?.value ?? '';

    startGoogleTransition(async () => {
      const { error: socialError } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: redirect || '/dashboard'
      });

      if (socialError) setError(describeSocialSignInError(socialError));
    });
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary/5 to-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-md flex-col justify-center">
        <Card className="border-0 shadow-lg ring-1 ring-foreground/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </CardTitle>
            <CardDescription>
              {mode === 'signin'
                ? 'Sign in to keep tailoring your resumes.'
                : 'Free forever. No credit card required.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {justReset && (
              <p
                className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                role="status"
              >
                Password reset — sign in with your new password.
              </p>
            )}

            {googleEnabled && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={googlePending || pending}
                  data-testid="google-sign-in"
                  className="w-full bg-white text-slate-900 hover:bg-slate-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  {googlePending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Redirecting to Google...
                    </>
                  ) : (
                    <>
                      <GoogleMark className="mr-2 size-4" />
                      Continue with Google
                    </>
                  )}
                </Button>

                <div className="relative my-1 text-center">
                  <span className="relative z-10 bg-card px-2 text-xs text-muted-foreground">
                    or
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-1/2 h-px bg-border"
                  />
                </div>
              </>
            )}

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <input type="hidden" name="redirect" id="redirect-input" />

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

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === 'signin' && (
                    <Link
                      href="/forgot-password"
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                  required
                  minLength={8}
                  maxLength={100}
                  placeholder="At least 8 characters"
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
                    Loading...
                  </>
                ) : mode === 'signin' ? (
                  'Sign in'
                ) : (
                  'Create account'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === 'signin' ? (
                <>
                  New to Nexstepper?{' '}
                  <Link
                    href="/sign-up"
                    className="font-medium text-primary hover:underline"
                  >
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Link
                    href="/sign-in"
                    className="font-medium text-primary hover:underline"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}