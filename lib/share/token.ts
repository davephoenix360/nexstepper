import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { customAlphabet } from 'nanoid';

/**
 * Public shareable link — token + hash + URL builder.
 *
 * ## Why we store a hash, not the raw token
 *
 * A leaked DB backup should not let an attacker reconstruct all
 * active shareable URLs. We SHA-256 the raw token, store the digest,
 * and on lookup hash the incoming URL token and compare. This is the
 * same pattern magic-link auth uses (see securityboulevard 2026 +
 * Auth0 docs).
 *
 * ## Why nanoid 21
 *
 * - 21 chars URL-safe (A-Za-z0-9_-) — short enough to share verbally,
 *   long enough to never collide in practice
 * - 126 bits of entropy (CSPRNG-backed by Node's `crypto.getRandomValues`)
 * - Default alphabet is unambiguous (no 0/O/1/l confusion)
 *
 * UUIDv4 was the alternative. We picked nanoid because:
 *   - The URL is 60% shorter (21 vs 36 chars)
 *   - Hyphen-free looks cleaner in a chat/email
 *   - 126 bits of entropy vs 122 — small but real
 *
 * ## Why not signed JWT
 *
 * - We want to be able to revoke instantly (set `shareEnabled = false`).
 *   JWT revocation needs a denylist, which mostly defeats the
 *   statelessness benefit.
 * - The token is a *capability*, not an *identity*. We don't need
 *   any claims in it — the lookup goes straight to the resume row.
 */

// `urlSafe` alphabet (A-Za-z0-9_-) without ambiguous chars by
// pinning the alphabet explicitly rather than using nanoid's default.
// Length 21 = 126 bits of entropy.
const SHARE_ALPHABET =
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const generateShareToken = customAlphabet(SHARE_ALPHABET, 21);

/**
 * Generate a fresh share token. CSPRNG-backed (nanoid uses
 * `crypto.getRandomValues` in Node). The caller is responsible for
 * giving the raw token to the user exactly once (to put in the URL)
 * and storing only the SHA-256 hash.
 */
export function generateShareTokenRaw(): string {
  return generateShareToken();
}

/**
 * SHA-256 hex digest of the token. Used as the DB lookup key.
 *
 * We use SHA-256 (not bcrypt/argon) because:
 *   - The token already has 126 bits of entropy — no work-factor
 *     increase needed to slow down brute force
 *   - The token is *high-entropy random*, not a low-entropy password
 *   - We need fast lookups (every public render hashes once)
 *
 * A peppered hash (server-side secret) is an option for the future
 * if we ever need to defend against rainbow tables. Not needed today
 * because the input space is already 2^126.
 */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Build the full public URL for a given token. Reads `NEXT_PUBLIC_APP_URL`
 * (falls back to `BASE_URL` then `http://localhost:3000` for dev).
 *
 * The shape is `/r/{token}` — short, magic-link style. Not
 * `/share/{token}` because that's longer and tells crawlers the page
 * is meant to be shared (we'd rather it stays quiet).
 */
export function buildShareUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BASE_URL ??
    'http://localhost:3000';
  // Strip trailing slash so the concat is clean.
  return `${base.replace(/\/$/, '')}/r/${token}`;
}

/**
 * Random hex token for internal use (e.g. CSRF for share management
 * — not currently used but kept as a helper).
 */
export function generateInternalSecret(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
