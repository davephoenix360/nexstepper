import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildShareUrl,
  classifyShareToken,
  isAcceptedShareToken,
  looksLikeDeterministicShareToken,
  selectShareToken,
  LEGACY_SHARE_TOKEN_LENGTH
} from '@/lib/share/token';

/**
 * Lightweight sanity checks on `lib/share/token.ts` post-Phase-2.5b.
 *
 * The token-generation + SHA-256 hashing surface that used to live
 * here was removed when share tokens became deterministic
 * derivations (see `tests/unit/share-deterministic-token.test.ts`).
 * What remains is just `buildShareUrl` — the URL-shape helper that
 * any URL-side consumer depends on.
 *
 * Keeping these tests even when there's a single-function module
 * underneath means the URL contract (prefix, base URL selection,
 * trailing-slash normalisation) is pinned, not merely remembered.
 */

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalBaseUrl = process.env.BASE_URL;

beforeEach(() => {
  // Make the env-driven behavior deterministic per test by
  // clearing both vars; individual tests set them as needed.
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.BASE_URL;
});

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  if (originalBaseUrl === undefined) delete process.env.BASE_URL;
  else process.env.BASE_URL = originalBaseUrl;
});

describe('buildShareUrl', () => {
  it('uses NEXT_PUBLIC_APP_URL when set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://nexstepper.example.com';
    process.env.BASE_URL = 'https://should-not-be-used.example.com';
    expect(buildShareUrl('abc123')).toBe(
      'https://nexstepper.example.com/r/abc123'
    );
  });

  it('falls back to BASE_URL when NEXT_PUBLIC_APP_URL is missing', () => {
    process.env.BASE_URL = 'https://base.example.com';
    expect(buildShareUrl('abc123')).toBe(
      'https://base.example.com/r/abc123'
    );
  });

  it('falls back to localhost:3000 when neither is set', () => {
    expect(buildShareUrl('abc123')).toBe('http://localhost:3000/r/abc123');
  });

  it('strips a trailing slash from the base URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://nexstepper.example.com/';
    expect(buildShareUrl('abc123')).toBe(
      'https://nexstepper.example.com/r/abc123'
    );
  });

  it('uses the /r/ prefix (not /share/)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://nexstepper.example.com';
    const url = buildShareUrl('abc123');
    expect(url).toContain('/r/');
    expect(url).not.toContain('/share/');
  });

  it('passes any 22-char base64url-shaped token through unchanged', () => {
    // `buildShareUrl` deliberately does not validate the token
    // shape — that's the caller's job (and `/r/[token]`'s job).
    // Pinning the passthrough here means a future
    // shape-validation shortcut in the helper doesn't silently
    // strip characters we depend on (`-`, `_`).
    process.env.NEXT_PUBLIC_APP_URL = 'https://nexstepper.example.com';
    const token = 'aBcDeFgHiJkLmNoPqRsT_';
    expect(buildShareUrl(token)).toBe(
      `https://nexstepper.example.com/r/${token}`
    );
  });
});

/**
 * The two token shapes.
 *
 * `resumes.share_token` has held two different things over the
 * product's life:
 *
 *   - the deterministic HMAC token (22 chars of base64url) — current
 *   - a SHA-256 hex digest of a random token (64 chars) — pre-2.5b
 *
 * The route looks the column up by DIRECT EQUALITY, so both shapes
 * are working URLs. The route's input guard used to accept only the
 * 22-char one, which 404'd every legacy row — including the link the
 * owner was handed in the share dialog.
 */
const DETERMINISTIC = 'Abcdefghijklmnopqrstuv'; // 22 chars, base64url
const LEGACY = 'a'.repeat(64); // 64 chars, hex

describe('classifyShareToken', () => {
  it('calls a 22-char base64url token deterministic', () => {
    expect(classifyShareToken(DETERMINISTIC)).toBe('deterministic');
  });

  it('calls a 64-char hex token legacy', () => {
    expect(classifyShareToken(LEGACY)).toBe('legacy');
  });

  it('calls anything else invalid', () => {
    expect(classifyShareToken(null)).toBe('invalid');
    expect(classifyShareToken(undefined)).toBe('invalid');
    expect(classifyShareToken('')).toBe('invalid');
    expect(classifyShareToken('too-short')).toBe('invalid');
    expect(classifyShareToken('z'.repeat(64))).toBe('invalid'); // not hex
    expect(classifyShareToken('a'.repeat(63))).toBe('invalid');
    expect(classifyShareToken('a'.repeat(65))).toBe('invalid');
  });

  it('still agrees with looksLikeDeterministicShareToken', () => {
    expect(looksLikeDeterministicShareToken(DETERMINISTIC)).toBe(true);
    expect(looksLikeDeterministicShareToken(LEGACY)).toBe(false);
  });
});

describe('isAcceptedShareToken', () => {
  it('accepts BOTH shapes the column can hold', () => {
    // This is the route's input guard. It must cover every shape
    // that can legitimately sit in `resumes.share_token` — a guard
    // that accepts one shape silently 404s the other.
    expect(isAcceptedShareToken(DETERMINISTIC)).toBe(true);
    expect(isAcceptedShareToken(LEGACY)).toBe(true);
  });

  it('rejects junk before it reaches the database', () => {
    expect(isAcceptedShareToken(null)).toBe(false);
    expect(isAcceptedShareToken(undefined)).toBe(false);
    expect(isAcceptedShareToken('')).toBe(false);
    expect(isAcceptedShareToken('x'.repeat(1000))).toBe(false);
    expect(isAcceptedShareToken('has space in it 1234567890ab')).toBe(false);
    expect(isAcceptedShareToken('slash/in/token/aaaaaaaaaaaaaaaa')).toBe(false);
  });

  it('pins the legacy length constant', () => {
    expect(LEGACY_SHARE_TOKEN_LENGTH).toBe(64);
  });
});

describe('selectShareToken', () => {
  it('prefers the STORED token over a fresh derivation', () => {
    // The lookup key is `resumes.share_token`. A derived token is
    // always 22 chars, so it can never equal a 64-char legacy
    // column value — re-deriving unconditionally handed the owner a
    // URL that 404'd for everyone.
    expect(selectShareToken(LEGACY, DETERMINISTIC)).toBe(LEGACY);
    expect(selectShareToken(DETERMINISTIC, DETERMINISTIC)).toBe(
      DETERMINISTIC
    );
  });

  it('falls back to the derivation when the column is empty or unusable', () => {
    expect(selectShareToken(null, DETERMINISTIC)).toBe(DETERMINISTIC);
    expect(selectShareToken(undefined, DETERMINISTIC)).toBe(DETERMINISTIC);
    expect(selectShareToken('', DETERMINISTIC)).toBe(DETERMINISTIC);
    expect(selectShareToken('garbage', DETERMINISTIC)).toBe(DETERMINISTIC);
  });
});

describe('the public route uses the shared guard', () => {
  // Two copies of a shape check is how the last version of this
  // bug shipped: the route had its own inline 22-char check while
  // the helper that knew about legacy tokens sat unused. Pin the
  // route to the shared helper.
  const route = readFileSync(
    resolve(process.cwd(), 'app/r/[token]/page.tsx'),
    'utf-8'
  );

  it('guards with isAcceptedShareToken, not an inline length check', () => {
    expect(route).toContain('isAcceptedShareToken(token)');
    expect(route).not.toMatch(/token\.length\s*!==\s*22/);
  });
});

describe('the owner-facing action uses the shared selection', () => {
  const actions = readFileSync(
    resolve(process.cwd(), 'app/(dashboard)/dashboard/resumes/actions.ts'),
    'utf-8'
  );

  it('picks the token with selectShareToken, not a bare derivation', () => {
    // A bare `buildShareUrl(deriveShareToken(id))` is the exact
    // expression that made the legacy rows dead: it ignores the
    // column that the lookup actually reads.
    expect(actions).toContain('selectShareToken(');
    expect(actions).not.toMatch(/buildShareUrl\(\s*deriveShareToken\(/);
  });
});
