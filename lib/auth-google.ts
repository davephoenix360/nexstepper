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
 * ## Account linking — trusted provider, scoped to Google
 *
 * Better Auth implicitly links a Google sign-in to an existing local
 * account when the emails match. Since v1.6.11 that link is refused
 * unless the **local** user's `emailVerified` is true (fix for
 * GHSA-g38m-r43w-p2q7, pre-account hijacking).
 *
 * As of 2026-10-08 that is enabled deliberately, scoped to Google —
 * see the long comment on `account.accountLinking` in `lib/auth.ts`
 * for the full reasoning. In short: producing a Google session for an
 * address proves control of that inbox, and inbox control already
 * grants password reset here, so linking adds no new exposure. Google
 * is listed in `trustedProviders` because it verifies every email it
 * issues; that list must not be widened casually.
 *
 * The `account_not_linked` message below is therefore a rare
 * fallback, not the expected path — it still fires if the Google
 * account's email differs from the local one, or if linking is ever
 * disabled. It points at the manual route rather than dead-ending.
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
 * Shown when Google sign-in cannot be linked to an existing account.
 * Rare: with `accountLinking` enabled for Google, matching emails link
 * automatically. Still reachable when the Google account's address
 * differs from the local one, or if linking is turned off.
 */
export const ACCOUNT_NOT_LINKED_MESSAGE =
  'We could not match this Google account to an existing Nexstepper account. Sign in with your email and password instead — if the addresses differ, use the email address you signed up with.';

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