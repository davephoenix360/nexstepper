import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildShareUrl } from '@/lib/share/token';

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
