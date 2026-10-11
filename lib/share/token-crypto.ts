import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

/**
 * Reversible encryption for the share token, so the owner can always
 * recover their own link.
 *
 * ## Why this exists alongside the hash
 *
 * `resumes.share_token_hash` is a one-way SHA-256 digest and stays that
 * way — it is the O(1) lookup key for the public `/r/[token]` route and
 * the thing that makes a DB leak useless. What it cannot do is let the
 * owner re-read a link they generated last week.
 *
 * Historically the answer was "rotate", which silently invalidates the
 * link you already emailed to a recruiter. That is fail-closed (safe)
 * but surprising, and it means the state "sharing is on" hands the owner
 * nothing to act on.
 *
 * So we store the token a SECOND time, encrypted, with the key held in
 * the environment rather than the database:
 *
 *   - A leaked DB dump alone yields ciphertext. The attacker has no key.
 *     This is the same guarantee the hash-only design gave us.
 *   - The app can decrypt on demand and show the owner their link.
 *
 * The hash is never removed and the public route is untouched — no
 * decryption happens on the hot path, only when the owner opens the
 * share dialog.
 *
 * ## Failure policy: degrade, never throw
 *
 * If `SHARE_TOKEN_ENCRYPTION_KEY` is absent or malformed, every function
 * here returns `null` and the caller falls back to hash-only behaviour.
 * Losing the key must not take sharing offline.
 *
 * ## Envelope
 *
 * `v1.<iv>.<tag>.<ciphertext>`, each part base64url. Version-prefixed so
 * the key can be rotated later without ambiguity: an envelope we cannot
 * read is detected and ignored rather than producing garbage plaintext.
 */

/** 32 bytes = AES-256. */
const KEY_BYTES = 32;
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM's recommended nonce size
const VERSION = 'v1';

function decodeKey(): Buffer | null {
  const raw = process.env.SHARE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;

  // Preferred: `openssl rand -base64 32` — exactly what .env.example says.
  if (raw.length === KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === KEY_BYTES) return decoded;
  } catch {
    // fall through to unavailable
  }

  return null;
}

/**
 * Is reversible retrieval configured? Callers can use this to choose
 * between showing a recoverable link and the "we can't show your link"
 * notice. False when no usable key is present.
 */
export function shareTokenEncryptionAvailable(): boolean {
  return decodeKey() !== null;
}

/**
 * Encrypt a raw share token into a storable envelope.
 * Returns `null` when encryption is unavailable or fails — the caller
 * stores hash-only in that case.
 */
export function encryptShareToken(token: string): string | null {
  const key = decodeKey();
  if (!key) return null;

  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url')
    ].join('.');
  } catch {
    // Never let a crypto fault break the share flow.
    return null;
  }
}

/**
 * Decrypt an envelope back to the raw token.
 * Returns `null` for a missing envelope, an unknown version, a
 * tampered envelope (GCM tag mismatch), a wrong key, or any other
 * failure. Callers treat `null` as "this link predates encryption".
 */
export function decryptShareToken(envelope: string | null): string | null {
  if (!envelope) return null;

  const key = decodeKey();
  if (!key) return null;

  const parts = envelope.split('.');
  if (parts.length !== 4) return null;
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) return null;

  try {
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(ctB64, 'base64url');
    if (iv.length !== IV_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString('utf8');

    return plaintext || null;
  } catch {
    // Wrong key or tampered ciphertext — GCM rejects both.
    return null;
  }
}

/**
 * Confirm a decrypted token really is the one whose hash is stored.
 *
 * Decryption succeeding proves the envelope was written by us with a
 * key we hold; it does not by itself prove the row still *points* at
 * that token. This guards against a row where `share_token_hash` was
 * rotated but the ciphertext was left stale.
 */
export function tokenMatchesHash(
  token: string,
  hash: string,
  hashFn: (t: string) => string
): boolean {
  const computed = Buffer.from(hashFn(token), 'utf8');
  const stored = Buffer.from(hash, 'utf8');
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}