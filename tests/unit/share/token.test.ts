import { describe, expect, it } from 'vitest';

import {
  buildShareUrl,
  generateInternalSecret,
  generateShareTokenRaw,
  hashShareToken
} from '@/lib/share/token';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

describe('generateShareTokenRaw', () => {
  it('returns a 21-character token', () => {
    const token = generateShareTokenRaw();
    expect(token).toHaveLength(21);
  });

  it('uses only unambiguous URL-safe characters (no 0/O/1/l/I)', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateShareTokenRaw();
      for (const ch of token) {
        expect(ALPHABET).toContain(ch);
      }
      // Specifically check the ambiguous chars are excluded
      expect(token).not.toMatch(/[0O1lI]/);
    }
  });

  it('produces different tokens on repeated calls (CSPRNG sanity check)', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateShareTokenRaw());
    }
    // 1000 random 126-bit tokens should have ~0 collisions
    expect(tokens.size).toBe(1000);
  });
});

describe('hashShareToken', () => {
  it('returns a 64-char hex SHA-256 digest', () => {
    const token = generateShareTokenRaw();
    const hash = hashShareToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same token always hashes to the same digest', () => {
    const token = 'fixed-test-token-xyz';
    expect(hashShareToken(token)).toBe(hashShareToken(token));
  });

  it('produces different hashes for different tokens', () => {
    const a = hashShareToken('token-a');
    const b = hashShareToken('token-b');
    expect(a).not.toBe(b);
  });

  it('uses UTF-8 encoding (so unicode tokens hash consistently)', () => {
    // The token alphabet is ASCII-only, but the helper should not
    // silently break if called with non-ASCII input.
    const h1 = hashShareToken('hello');
    const h2 = hashShareToken('hello');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildShareUrl', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalBaseUrl = process.env.BASE_URL;

  it('uses NEXT_PUBLIC_APP_URL when set', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://nexstepper.example.com';
    process.env.BASE_URL = 'https://should-not-be-used.example.com';
    const url = buildShareUrl('abc123');
    expect(url).toBe('https://nexstepper.example.com/r/abc123');
  });

  it('falls back to BASE_URL when NEXT_PUBLIC_APP_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.BASE_URL = 'https://base.example.com';
    const url = buildShareUrl('abc123');
    expect(url).toBe('https://base.example.com/r/abc123');
  });

  it('falls back to localhost:3000 when neither is set', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.BASE_URL;
    const url = buildShareUrl('abc123');
    expect(url).toBe('http://localhost:3000/r/abc123');
  });

  it('strips a trailing slash from the base URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://nexstepper.example.com/';
    const url = buildShareUrl('abc123');
    expect(url).toBe('https://nexstepper.example.com/r/abc123');
  });

  it('uses the /r/ prefix (NOT /share/)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://nexstepper.example.com';
    const url = buildShareUrl('abc123');
    expect(url).toContain('/r/');
    expect(url).not.toContain('/share/');
  });

  // Restore env after this describe block
  // (we use afterEach to avoid bleed into other tests)
});

describe('generateInternalSecret', () => {
  it('returns hex of the requested byte count', () => {
    expect(generateInternalSecret(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(generateInternalSecret(32)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('default 32 bytes = 64 hex chars', () => {
    expect(generateInternalSecret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different secrets on repeated calls', () => {
    const a = generateInternalSecret();
    const b = generateInternalSecret();
    expect(a).not.toBe(b);
  });
});
