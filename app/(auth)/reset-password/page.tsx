'use client';

import { Suspense, useState, useTransition } from 'react';
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

/**
 * "Reset your password" — the second half of the reset flow.
 *
 * The user lands here after clicking the link in the password-reset
 * email. The token comes in via `?token=…` query param.
 *
 * On submit, we call `authClient.resetPassword({ token, newPassword })`,
 * which (server-side, in Better Auth):
 *   1. Validates the token (expiry + single-use)
 *   2. Hashes the new password (scrypt)
 *   3. Writes it to the `account` row for the matching user
 *   4. Returns success
 *
 * We then redirect to `/sign-in` so the user can sign in with the
 * new password. We do NOT auto-sign-in — that's the safer default;
 * an attacker who somehow got the token would have to also know
 * the new password to get in.
 */
function ResetPasswordFormInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(
        'This reset link is missing its token. Please request a new one.'
      );
      return;
    }

    const formData = new FormData(e.currentTarget);
    const newPassword = String(formData.get('newPassword') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    startTransition(async () => {
      const result = await authClient.resetPassword({
        newPassword,
        token
      });

      if (result.error) {
        setError(
          result.error.message ??
            'Could not reset the password. The link may have expired — please request a new one.'
        );
        return;
      }

      // Redirect to sign-in so the user can authenticate with the
      // new password. The sign-in page can show a "password reset"
      // banner if we add one later.
      router.push('/sign-in?reset=1');
      router.refresh();
    });
  }

  // No token in the URL → don't even show the form. Two cases:
  //   1. User opened the page directly (no flow initiated)
  //   2. Token got dropped by a mail client link-tracker
  // Either way, the right move is to send them to the request flow.
  if (!token) {
    return (
      <Card className="border-0 shadow-lg ring-1 ring-foreground/5">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Invalid reset link</CardTitle>
          <CardDescription>
            This page needs the token from your reset email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new reset link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg ring-1 ring-foreground/5">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>At least 8 characters.</CardDescription>
      </CardHeader>

      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              placeholder="Type it again"
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
                Resetting...
              </>
            ) : (
              'Reset password'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * `useSearchParams()` requires a Suspense boundary in Next 16
 * (otherwise the whole page is forced into client-side rendering
 * just to read the query). We wrap in Suspense with a tiny
 * placeholder that matches the card dimensions so there's no jump.
 */
export function ResetPasswordForm() {
  return (
    <Suspense
      fallback={
        <Card className="border-0 shadow-lg ring-1 ring-foreground/5">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      }
    >
      <ResetPasswordFormInner />
    </Suspense>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary/5 to-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-md flex-col justify-center">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
