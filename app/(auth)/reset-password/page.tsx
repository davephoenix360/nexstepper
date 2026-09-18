'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  resetPasswordAction,
  type ResetPasswordState
} from './actions';

const INITIAL_STATE: ResetPasswordState = { status: 'idle' };

/**
 * "Reset your password" — the second half of the reset flow.
 *
 * Uses a Server Action (`resetPasswordAction`) via `useActionState`
 * so the form works even before React hydrates. On success the
 * Server Action redirects to `/sign-in?reset=1` (which we don't
 * return from — Next.js implements redirect as a thrown
 * NEXT_REDIRECT error).
 *
 * We do NOT auto-sign-in — that's the safer default. An attacker
 * with the token would still need to know the new password to get
 * in.
 */
function ResetPasswordFormInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    INITIAL_STATE
  );

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
        <form className="flex flex-col gap-4" action={formAction}>
          {/* Hidden token field — comes from the URL, sent in the
              form body so the Server Action can read it. */}
          <input type="hidden" name="token" value={token} />

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

          {state.status === 'error' && state.message && (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
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
