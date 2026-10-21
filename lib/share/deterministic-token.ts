import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

/**
 * Deterministic share-token derivation.
 *
 * ## The shape
 *
 * `deriveShareToken(resumeId)`
 *   = base64url( HMAC-SHA256( SHARE_LINK_SECRET, resumeId )[:16] )
 *
 * Roughly 22 chars of URL-safe text. Same resume id on the same
 * server always produces the same token; the same resume id on a
 * different server (because it has a different `SHARE_LINK_SECRET`)
 * produces a different one. That's the whole point.
 *
 * ## What the database stores
 *
 * `resumes.share_token` — verbatim. There is no second SHA-256
 * digest on top of it, because the column has nothing to defend
 * against an attacker who can read it: the only secret in the
 * system is `SHARE_LINK_SECRET`, which lives in the environment,
 * never the database. A leaked DB dump yields a column of opaque
 * 22-char strings and no key to reproduce them. That's the same
 * property the prior hash-only design gave us.
 *
 * This is the resolution to the long-standing "false dilemma"
 * where the owner couldn't re-read their own link: there is no
 * trade-off between "show the owner the URL" and "don't store
 * the URL," because what we store is reproducible, not secret.
 *
 * ## Why HMAC, not "hash of id"
 *
 * A plain SHA-256 of the resume id would let a database-leaker
 * recompute every shareable URL with one byte of an env file
 * they don't have. Prepending a server-side HMAC key means a
 * leaked dump yields no URLs without the env var. Same threat
 * model as the previous design; simpler code.
 *
 * ## Truncation
 *
 * 16 bytes = 128 bits, still far beyond brute-forceable in the
 * URL-rotation sense (an attacker who guesses one token needs a
 * fresh round trip to the DB per guess; the partial unique
 * index caps that at one success per share). Truncating below 16
 * is risky against future advances in birthday attacks against
 * the truncated prefix.
 *
 * ## Failure policy
 *
 * - In production: missing or malformed `SHARE_LINK_SECRET`
 *   throws at first call. A reproducible token that varies
 *   because the secret rotated mid-process would still be more
 *   confusing than failing loudly.
 * - In development: a single in-memory ephemeral fallback is
 *   generated and reused for the life of the process, with a
 *   `console.warn`. That means dev URLs DO NOT survive a server
 *   restart. Set the env var in `.env.local` for stable dev URLs.
 */

const TOKEN_BYTES = 16; // → 22 chars once base64url-encoded.
const MIN_SECRET_BYTES = 32; // 256-bit HMAC key.

/**
 * Whether `SHARE_LINK_SECRET` is set to a usable value. Surfaced so
 * callers (and tests) can decide whether to fall back or throw.
 */
export function shareLinkSecretConfigured(): boolean {
  return resolveShareLinkSecret({ allowEphemeral: true }) !== null;
}

/**
 * Generate the deterministic share token for a resume. Same
 * `resumeId` + same `SHARE_LINK_SECRET` → same token, every time.
 *
 * Throws in production when `SHARE_LINK_SECRET` is missing or
 * malformed. See module docstring for the env-fallback policy.
 */
export function deriveShareToken(resumeId: string): string {
  if (!resumeId) {
    throw new Error('deriveShareToken: resumeId must be a non-empty string');
  }

  const secret = resolveShareLinkSecret({ allowEphemeral: false });
  if (!secret) {
    throw new Error(
      '[share] SHARE_LINK_SECRET is missing or malformed. Generate one with `openssl rand -hex 32` and set it in the environment. In development an ephemeral fallback is used when the secret is absent — see lib/share/deterministic-token.ts.'
    );
  }

  return createHmac('sha256', secret)
    .update(resumeId, 'utf8')
    .digest()
    .subarray(0, TOKEN_BYTES)
    .toString('base64url');
}

/**
 * Resolve `SHARE_LINK_SECRET`, returning a Buffer of exactly
 * `MIN_SECRET_BYTES` or null when the configured value is
 * missing/malformed.
 *
 * Accepts the two forms the `.env.example` documents:
 *   - 64-char lowercase hex (`openssl rand -hex 32`)
 *   - base64 of 32 raw bytes (`openssl rand -base64 32`)
 *
 * Optionally falls back to an in-memory ephemeral secret in dev so
 * a fresh clone without a configured env still boots. Production
 * callers must pass `allowEphemeral: false`.
 */
function resolveShareLinkSecret(opts: {
  allowEphemeral: boolean;
}): Buffer | null {
  const raw = process.env.SHARE_LINK_SECRET?.trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === MIN_SECRET_BYTES) return decoded;
    } catch {
      // Fall through.
    }
    return null;
  }

  if (!opts.allowEphemeral) return null;

  // Dev fallback. Warn once (per process) so a noisy log line is the
  // worst surprise. Production code paths always pass
  // `allowEphemeral: false` so they can never reach this branch.
  if (!_ephemeralSecret) {
    _ephemeralSecret = randomBytes(MIN_SECRET_BYTES);
    // eslint-disable-next-line no-console
    console.warn(
      '[share] SHARE_LINK_SECRET is not set. Generating an ephemeral dev fallback. URLs will NOT survive a server restart — set it in .env.local for stable dev URLs. Generate one with `openssl rand -hex 32`.'
    );
  }
  return _ephemeralSecret;
}

let _ephemeralSecret: Buffer | null = null;
