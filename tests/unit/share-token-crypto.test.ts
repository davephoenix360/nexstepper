import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptShareToken,
  encryptShareToken,
  shareTokenEncryptionAvailable,
  tokenMatchesHash
} from '@/lib/share/token-crypto';
import { hashShareToken } from '@/lib/share';

/**
 * Encryption of the share token at rest.
 *
 * The point of this module is that the owner can re-read their own link
 * WITHOUT giving up the property that made the original design good: a
 * leaked database must not yield working resume URLs. These tests hold
 * both halves of that claim at once.
 */

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');
const TOKEN = 'kR7mQ2xNp4wVz8YbT1sHd';
const ORIGINAL = process.env.SHARE_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SHARE_TOKEN_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SHARE_TOKEN_ENCRYPTION_KEY;
  else process.env.SHARE_TOKEN_ENCRYPTION_KEY = ORIGINAL;
});

describe('key handling', () => {
  it('is unavailable with no key set', () => {
    delete process.env.SHARE_TOKEN_ENCRYPTION_KEY;
    expect(shareTokenEncryptionAvailable()).toBe(false);
    expect(encryptShareToken(TOKEN)).toBeNull();
    expect(decryptShareToken('v1.a.b.c')).toBeNull();
  });

  it('is unavailable when the key is not 32 bytes', () => {
    process.env.SHARE_TOKEN_ENCRYPTION_KEY = 'too-short';
    expect(shareTokenEncryptionAvailable()).toBe(false);
    // Must degrade, never throw — losing the key can't break sharing.
    expect(() => encryptShareToken(TOKEN)).not.toThrow();
    expect(encryptShareToken(TOKEN)).toBeNull();
  });

  it('accepts a 64-char hex key as well as base64', () => {
    process.env.SHARE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    expect(shareTokenEncryptionAvailable()).toBe(true);
    const envelope = encryptShareToken(TOKEN);
    expect(decryptShareToken(envelope)).toBe(TOKEN);
  });

  it('treats whitespace-only as no key', () => {
    process.env.SHARE_TOKEN_ENCRYPTION_KEY = '   ';
    expect(shareTokenEncryptionAvailable()).toBe(false);
  });

  it('trims surrounding whitespace on a valid key', () => {
    process.env.SHARE_TOKEN_ENCRYPTION_KEY = `  ${KEY}  `;
    expect(shareTokenEncryptionAvailable()).toBe(true);
  });
});

describe('round trip', () => {
  it('decrypts back to the original token', () => {
    expect(decryptShareToken(encryptShareToken(TOKEN))).toBe(TOKEN);
  });

  it('survives tokens with every URL-safe character nanoid can emit', () => {
    const tricky = 'aZ0-_aZ0-_aZ0-_aZ0-';
    expect(decryptShareToken(encryptShareToken(tricky))).toBe(tricky);
  });

  it('does not contain the plaintext token anywhere in the envelope', () => {
    // The thing that must never leak into a database dump.
    expect(encryptShareToken(TOKEN)).not.toContain(TOKEN);
  });

  it('uses a fresh IV each time, so identical tokens differ', () => {
    const a = encryptShareToken(TOKEN);
    const b = encryptShareToken(TOKEN);
    expect(a).not.toBe(b);
    // ...and both still round trip.
    expect(decryptShareToken(a)).toBe(TOKEN);
    expect(decryptShareToken(b)).toBe(TOKEN);
  });

  it('produces a version-prefixed envelope', () => {
    expect(encryptShareToken(TOKEN)?.startsWith('v1.')).toBe(true);
  });

  it('produces four dot-separated parts', () => {
    expect(encryptShareToken(TOKEN)?.split('.')).toHaveLength(4);
  });
});

describe('rejects anything it did not write', () => {
  it('returns null for null / empty input', () => {
    expect(decryptShareToken(null)).toBeNull();
    expect(decryptShareToken('')).toBeNull();
  });

  it('returns null for a malformed envelope', () => {
    expect(decryptShareToken('nonsense')).toBeNull();
    expect(decryptShareToken('v1.only.three')).toBeNull();
  });

  it('refuses an unknown version instead of guessing', () => {
    // Guards a future key-rotation path: an old envelope must be
    // detected, not silently misinterpreted.
    const envelope = encryptShareToken(TOKEN)!;
    const forged = envelope.replace(/^v1\./, 'v9.');
    expect(decryptShareToken(forged)).toBeNull();
  });

  it('refuses a ciphertext that was tampered with', () => {
    const envelope = encryptShareToken(TOKEN)!;
    const parts = envelope.split('.');
    const ct = Buffer.from(parts[3], 'base64url');
    ct[0] ^= 0xff;
    parts[3] = ct.toString('base64url');
    expect(decryptShareToken(parts.join('.'))).toBeNull();
  });

  it('refuses a tag that was swapped', () => {
    const envelope = encryptShareToken(TOKEN)!;
    const parts = envelope.split('.');
    const tag = Buffer.from(parts[2], 'base64url');
    tag[0] ^= 0xff;
    parts[2] = tag.toString('base64url');
    expect(decryptShareToken(parts.join('.'))).toBeNull();
  });

  it('refuses a token encrypted under a different key', () => {
    const envelope = encryptShareToken(TOKEN)!;
    process.env.SHARE_TOKEN_ENCRYPTION_KEY = OTHER_KEY;
    expect(decryptShareToken(envelope)).toBeNull();
  });

  it('cannot be decrypted once the key is removed', () => {
    const envelope = encryptShareToken(TOKEN)!;
    delete process.env.SHARE_TOKEN_ENCRYPTION_KEY;
    expect(decryptShareToken(envelope)).toBeNull();
  });
});

describe('tokenMatchesHash', () => {
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');

  it('accepts a token whose hash matches the stored one', () => {
    expect(tokenMatchesHash(TOKEN, sha(TOKEN), sha)).toBe(true);
  });

  it('rejects a stale ciphertext left beside a rotated hash', () => {
    // The scenario the check exists for: the row points at a different
    // token than the envelope holds.
    expect(tokenMatchesHash(TOKEN, sha('some-other-token'), sha)).toBe(false);
  });

  it('rejects mismatched lengths without throwing', () => {
    expect(tokenMatchesHash(TOKEN, 'short', sha)).toBe(false);
  });

  it('agrees with the app hashShareToken implementation', () => {
    // Guards against the two ever drifting apart.
    expect(tokenMatchesHash(TOKEN, hashShareToken(TOKEN), hashShareToken)).toBe(
      true
    );
    expect(
      tokenMatchesHash(TOKEN, hashShareToken('other'), hashShareToken)
    ).toBe(false);
  });
});

describe('security property', () => {
  it('a database dump alone yields no usable token', () => {
    // The whole justification for encrypting rather than storing
    // plaintext. Simulates leaking the column without the env key.
    const leakedColumn = encryptShareToken(TOKEN)!;
    process.env.SHARE_TOKEN_ENCRYPTION_KEY = undefined as unknown as string;
    delete process.env.SHARE_TOKEN_ENCRYPTION_KEY;

    expect(decryptShareToken(leakedColumn)).toBeNull();
    expect(leakedColumn).not.toContain(TOKEN);
    // And it cannot be brute-forced back to the hash either — the
    // stored lookup key stays a one-way digest.
    expect(leakedColumn).not.toBe(hashShareToken(TOKEN));
  });
});