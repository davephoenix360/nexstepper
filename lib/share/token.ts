import 'server-only';

import { absoluteUrl } from '@/lib/site';

/**
 * Deterministic share-link builder.
 *
 * The token itself is derived in `deterministic-token.ts`:
 *
 *   deriveShareToken(resumeId)
 *     = base64url( HMAC-SHA256( SHARE_LINK_SECRET, resumeId )[:16] )
 *
 * This module is a thin layer that owns the URL shape and the
 * constant pieces of the public-link identity. Nothing else lives
 * here on purpose — there are no random or one-way-hash stages
 * anymore.
 *
 * ## URL shape
 *
 * `/r/{token}` — short, magic-link style, deliberately not
 * `/share/{token}` (longer and signals to crawlers that the page
 * is meant to be shared, while `/r/` is listed in
 * `app/robots.ts`'s disallow set so these links cannot end up in a
 * search index even if the token leaks).
 */

const SHARE_PATH_PREFIX = '/r/';

/**
 * Build the full public URL for a deterministic share token. Reads
 * `NEXT_PUBLIC_APP_URL` (falls back to `BASE_URL`, then to
 * `http://localhost:3000` for dev — see `lib/site.ts`).
 *
 * The caller is responsible for producing `token` from
 * `deriveShareToken(resumeId)`. `buildShareUrl` is deliberately
 * pure: passing it any string and getting a URL back lets the
 * test suite exercise it without booting env-driven derivations.
 */
export function buildShareUrl(token: string): string {
  return absoluteUrl(`${SHARE_PATH_PREFIX}${token}`);
}

/**
 * `true` when the token string is exactly the shape we generate
 * (`deriveShareToken`). Used to recognize pre-migration values
 * in `resumes.share_token` (which used to hold 64-char SHA-256
 * hex digests) so we can hand the owner an honest "this row
 * hasn't been refreshed yet" copy during the transition window.
 *
 * Length 22 derives from `16 bytes base64url-encoded`. Strict
 * length keeps the check from accidentally passing URL fragments
 * or accidentally-formatted old ciphertext.
 */
export function looksLikeDeterministicShareToken(token: string | null): boolean {
  return (
    typeof token === 'string' &&
    token.length === 22 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

/**
 * The shape of a token that lives in `resumes.share_token`.
 *
 * - `deterministic` — what `deriveShareToken` produces today: 22
 *   chars of base64url (16 bytes). The column value IS the URL.
 * - `legacy` — what the pre-Phase-2.5b design left behind: a
 *   64-char SHA-256 hex digest. The column value is ALSO the URL
 *   (the route looks it up by direct equality), it just doesn't
 *   look like anything the current derivation produces.
 * - `invalid` — anything else. Never stored, never a URL.
 */
export type ShareTokenShape = 'deterministic' | 'legacy' | 'invalid';

/**
 * Length of a pre-Phase-2.5b `resumes.share_token` value.
 *
 * The old design stored `SHA-256(randomToken)` as 64 lowercase hex
 * characters, and the route hashed the URL token before looking it
 * up. Phase 2.5b replaced that with a deterministic derivation
 * stored verbatim, and the route now matches by direct equality —
 * which means a legacy column value is itself a working URL, it
 * just isn't a 22-char one.
 */
export const LEGACY_SHARE_TOKEN_LENGTH = 64;

/**
 * Classify a stored (or presented) share token.
 *
 * Both shapes are legitimate; the difference is which derivation
 * produced them, not whether they are valid.
 */
export function classifyShareToken(token: string | null | undefined): ShareTokenShape {
  if (looksLikeDeterministicShareToken(token ?? null)) return 'deterministic';
  if (
    typeof token === 'string' &&
    token.length === LEGACY_SHARE_TOKEN_LENGTH &&
    /^[0-9a-f]{64}$/i.test(token)
  ) {
    return 'legacy';
  }
  return 'invalid';
}

/**
 * `true` when the token is one the public route is willing to look
 * up.
 *
 * This is the route's input guard, so it MUST cover every shape that
 * can legitimately sit in `resumes.share_token`. The previous guard
 * accepted only the 22-char deterministic shape — which meant every
 * row still holding a 64-char legacy digest 404'd, including the
 * link the owner was handed in the share dialog.
 *
 * The guard is still cheap: both accepted shapes are fixed-length and
 * fixed-alphabet, so a junk token is rejected before it reaches the
 * database.
 */
export function isAcceptedShareToken(token: string | null | undefined): boolean {
  return classifyShareToken(token) !== 'invalid';
}

/**
 * Pick the token to put in the owner's share URL.
 *
 * The rule is "the URL must resolve to the row it came from", and
 * the lookup key is `resumes.share_token` — so the stored value wins
 * whenever there is one. The derived value is the fallback for a row
 * that has sharing on but no token stored (which the enable path
 * fills in).
 *
 * Re-deriving unconditionally is what broke the legacy rows: a
 * derived token is ALWAYS 22 chars, so it can never equal a 64-char
 * legacy column value, and the owner was handed a URL that 404'd for
 * everyone — including themselves.
 */
export function selectShareToken(
  storedToken: string | null | undefined,
  derivedToken: string
): string {
  return isAcceptedShareToken(storedToken) ? (storedToken as string) : derivedToken;
}
