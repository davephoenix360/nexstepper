/**
 * Google sign-in wiring (added 2026-10-08).
 *
 * Google is an **optional** provider. Nexstepper must keep working
 * with email + password alone, because:
 *   - local dev and CI run without Google credentials
 *   - self-hosters (`docs/SELF_HOSTING.md`) set their own or none
 *   - a half-configured provider (ID but no secret) must degrade to
 *     "not available", never to a runtime crash on first request
 *
 * So the provider is registered **only when both env vars are
 * present**, and the sign-in UI renders the Google button only when
 * `isGoogleAuthEnabled()` agrees. Both read the same helper, so the
 * server config and the client UI can never disagree.
 *
 * ## Account linking — deliberately left at the secure default
 *
 * Better Auth implicitly links a Google sign-in to an existing local
 * account when the emails match. Since v1.6.11 that link is refused
 * unless the **local** user's `emailVerified` is true (fix for
 * GHSA-g38m-r43w-p2q7, pre-account hijacking). Nexstepper does not
 * run an email-verification flow, so local users have
 * `emailVerified: false` and a same-email Google sign-in is rejected
 * with `account_not_linked`.
 *
 * That rejection is **correct and intentional** — loosening it with
 * `requireLocalEmailVerified: false` would restore the vulnerability
 * the advisory fixed. Instead we surface a message that points the
 * user at the real fix: sign in with their password first, then link
 * Google from settings while authenticated.
 */

/** The two credentials Better Auth needs for the Google provider. */
export type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * Reads Google credentials from an env bag. Returns `null` when the
 * provider should NOT be registered (missing, empty, or half-set).
 *
 * Takes `env` as a parameter so it can be tested without mutating
 * `process.env`.
 */
export function readGoogleCredentials(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >
): GoogleCredentials | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

/**
 * Whether Google sign-in is available. The single source of truth
 * shared by `lib/auth.ts` (registers the provider) and the sign-in
 * pages (decide whether to render the button).
 */
export function isGoogleAuthEnabled(): boolean {
  return readGoogleCredentials() !== null;
}

/**
 * Shown when someone tries Google sign-in with an email that already
 * has a password account. Phrased as a route forward, not a dead end.
 */
export const ACCOUNT_NOT_LINKED_MESSAGE =
  'An account with this email already exists. Sign in with your password instead — once you are in, you can link Google from your settings.';

/** Shown when Google sign-in fails for any other reason. */
export const GENERIC_SOCIAL_SIGN_IN_ERROR =
  'Could not sign in with Google. Please try again.';

/**
 * Maps a Better Auth social sign-in error to something a user can act
 * on. `account_not_linked` gets the linking hint above; anything else
 * falls back to Better Auth's own message, then to a generic string.
 */
export function describeSocialSignInError(error: unknown): string {
  const candidate = error as { code?: string; message?: string } | null | undefined;

  if (candidate?.code === 'account_not_linked') {
    return ACCOUNT_NOT_LINKED_MESSAGE;
  }

  const message = candidate?.message?.trim();
  if (message) return message;

  return GENERIC_SOCIAL_SIGN_IN_ERROR;
}