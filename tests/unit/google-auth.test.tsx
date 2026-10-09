/**
 * Tests for Google sign-in (added 2026-10-08).
 *
 * Pins three things that are easy to break silently:
 *
 *   1. **Conditional registration.** The provider must be registered
 *      ONLY when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
 *      are present. A half-set pair must disable Google rather than
 *      register a broken provider or throw at import time — local dev,
 *      CI and self-hosters all depend on this.
 *   2. **Server/UI agreement.** The button renders off the same
 *      predicate that registers the provider, so "button visible but
 *      provider missing" (a guaranteed 500 on click) cannot ship.
 *   3. **Account-linking posture.** Since Better Auth 1.6.11 (fix for
 *      GHSA-g38m-r43w-p2q7), a same-email Google sign-in is REJECTED
 *      for a local user whose `emailVerified` is false. Nexstepper has
 *      no email-verification flow, so that rejection is the expected
 *      path — and we assert we did not "fix" it by re-enabling the
 *      vulnerable behaviour.
 *
 * The project runs vitest with `environment: 'node'` (no jsdom), so
 * rendering uses the standard `renderToStaticMarkup` pattern and
 * click behaviour is pinned at the source level.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// `Login` is a client component reading `useRouter()` and
// `useSearchParams()`. Both throw outside the App Router context
// ("invariant expected app router to be mounted"), so the SSR render
// needs stubs. `vi.mock` is hoisted above the component import.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

import {
  ACCOUNT_NOT_LINKED_MESSAGE,
  GENERIC_SOCIAL_SIGN_IN_ERROR,
  describeSocialSignInError,
  isGoogleAuthEnabled,
  readGoogleCredentials
} from '@/lib/auth-google';
import { Login } from '@/app/(auth)/login';

const AUTH_SOURCE = readFileSync(
  resolve(process.cwd(), 'lib/auth.ts'),
  'utf8'
);
const LOGIN_SOURCE = readFileSync(
  resolve(process.cwd(), 'app/(auth)/login.tsx'),
  'utf8'
);
const SIGN_IN_PAGE_SOURCE = readFileSync(
  resolve(process.cwd(), 'app/(auth)/sign-in/page.tsx'),
  'utf8'
);
const SIGN_UP_PAGE_SOURCE = readFileSync(
  resolve(process.cwd(), 'app/(auth)/sign-up/page.tsx'),
  'utf8'
);

const BOTH_SET = {
  GOOGLE_CLIENT_ID: 'id-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret-abc'
};

describe('readGoogleCredentials — conditional provider registration', () => {
  it('returns the credentials when both vars are set', () => {
    expect(readGoogleCredentials(BOTH_SET)).toEqual({
      clientId: 'id-123.apps.googleusercontent.com',
      clientSecret: 'secret-abc'
    });
  });

  it('returns null when NEITHER var is set (email + password only)', () => {
    expect(readGoogleCredentials({})).toBeNull();
  });

  it('returns null when only the client id is set (half-configured)', () => {
    expect(
      readGoogleCredentials({ GOOGLE_CLIENT_ID: 'id-123' })
    ).toBeNull();
  });

  it('returns null when only the client secret is set (half-configured)', () => {
    expect(
      readGoogleCredentials({ GOOGLE_CLIENT_SECRET: 'secret-abc' })
    ).toBeNull();
  });

  it('treats whitespace-only values as unset', () => {
    expect(
      readGoogleCredentials({
        GOOGLE_CLIENT_ID: '   ',
        GOOGLE_CLIENT_SECRET: 'secret-abc'
      })
    ).toBeNull();
  });

  it('isGoogleAuthEnabled agrees with readGoogleCredentials by default', () => {
    // The real env bag has no Google credentials in CI, so the button
    // must stay hidden — this is the state self-hosters land in.
    expect(isGoogleAuthEnabled()).toBe(readGoogleCredentials() !== null);
  });
});

describe('lib/auth.ts — provider wiring', () => {
  it('registers the Google provider through readGoogleCredentials', () => {
    expect(AUTH_SOURCE).toContain('socialProviders');
    expect(AUTH_SOURCE).toContain('readGoogleCredentials');
    expect(AUTH_SOURCE).toMatch(/google:\s*\{/);
  });

  it('passes the conditional provider map into betterAuth', () => {
    // `socialProviders,` as a shorthand property — proving the map is
    // actually wired in, not merely declared in the file.
    expect(AUTH_SOURCE).toMatch(/\n\s{2}socialProviders,/);
  });
});

describe('Login — Google button rendering', () => {
  it('renders "Continue with Google" when googleEnabled is true', () => {
    const html = renderToStaticMarkup(
      <Login mode="signin" googleEnabled={true} />
    );
    expect(html).toContain('Continue with Google');
    expect(html).toContain('data-testid="google-sign-in"');
  });

  it('hides the button entirely when googleEnabled is false', () => {
    const html = renderToStaticMarkup(
      <Login mode="signin" googleEnabled={false} />
    );
    expect(html).not.toContain('Continue with Google');
    expect(html).not.toContain('data-testid="google-sign-in"');
  });

  it('defaults to hidden, so an un-wired caller can never show a dead button', () => {
    // `mode` only — no googleEnabled prop. This is the guard for any
    // future page that renders <Login /> without wiring the flag.
    const html = renderToStaticMarkup(<Login mode="signup" />);
    expect(html).not.toContain('Continue with Google');
  });

  it('renders the button on sign-up as well as sign-in', () => {
    const html = renderToStaticMarkup(
      <Login mode="signup" googleEnabled={true} />
    );
    expect(html).toContain('Continue with Google');
  });

  it('always keeps the email + password form available', () => {
    const html = renderToStaticMarkup(
      <Login mode="signin" googleEnabled={true} />
    );
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
  });
});

describe('Login — social sign-in wiring (source-level)', () => {
  it('calls signIn.social with the google provider', () => {
    expect(LOGIN_SOURCE).toContain('authClient.signIn.social');
    expect(LOGIN_SOURCE).toMatch(/provider:\s*'google'/);
  });

  it('routes errors through describeSocialSignInError', () => {
    expect(LOGIN_SOURCE).toContain('describeSocialSignInError');
  });

  it('reads the same hidden redirect input the email form uses', () => {
    // Both paths must land on the same post-login destination.
    expect(LOGIN_SOURCE).toContain("getElementById('redirect-input')");
  });
});

describe('sign-in / sign-up pages — flag wiring', () => {
  it('sign-in passes the shared predicate', () => {
    expect(SIGN_IN_PAGE_SOURCE).toContain('isGoogleAuthEnabled()');
    expect(SIGN_IN_PAGE_SOURCE).toContain('googleEnabled={isGoogleAuthEnabled()}');
  });

  it('sign-up passes the shared predicate', () => {
    expect(SIGN_UP_PAGE_SOURCE).toContain('isGoogleAuthEnabled()');
    expect(SIGN_UP_PAGE_SOURCE).toContain('googleEnabled={isGoogleAuthEnabled()}');
  });
});

describe('describeSocialSignInError — account-linking guidance', () => {
  it('explains the account_not_linked case with a route forward', () => {
    const message = describeSocialSignInError({
      code: 'account_not_linked',
      message: 'raw upstream text'
    });
    expect(message).toBe(ACCOUNT_NOT_LINKED_MESSAGE);
  });

  it('points at password sign-in then linking, not a dead end', () => {
    expect(ACCOUNT_NOT_LINKED_MESSAGE).toMatch(/password/i);
    expect(ACCOUNT_NOT_LINKED_MESSAGE).toMatch(/link/i);
  });

  it('falls back to the upstream message for other errors', () => {
    expect(describeSocialSignInError({ message: 'Network error' })).toBe(
      'Network error'
    );
  });

  it('falls back to a generic message when there is nothing usable', () => {
    expect(describeSocialSignInError(null)).toBe(GENERIC_SOCIAL_SIGN_IN_ERROR);
    expect(describeSocialSignInError(undefined)).toBe(
      GENERIC_SOCIAL_SIGN_IN_ERROR
    );
    expect(describeSocialSignInError({ message: '   ' })).toBe(
      GENERIC_SOCIAL_SIGN_IN_ERROR
    );
  });
});

describe('account linking — vulnerable escape hatches stay closed', () => {
  it('does NOT re-enable pre-1.6.11 implicit linking behaviour', () => {
    // requireLocalEmailVerified: false restores the GHSA-g38m-r43w-p2q7
    // pre-account-hijacking behaviour. It must never appear here.
    expect(AUTH_SOURCE).not.toContain('requireLocalEmailVerified');
  });

  it('does NOT disable implicit linking wholesale', () => {
    // disableImplicitLinking: true would be safe but would also break
    // the legitimate same-email link. We keep the secure default and
    // guide the user instead.
    expect(AUTH_SOURCE).not.toContain('disableImplicitLinking');
  });

  it('documents the advisory so the rationale survives future edits', () => {
    const googleHelper = readFileSync(
      resolve(process.cwd(), 'lib/auth-google.ts'),
      'utf8'
    );
    expect(googleHelper).toContain('GHSA-g38m-r43w-p2q7');
  });
});