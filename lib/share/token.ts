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
