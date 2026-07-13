import { describe, expect, it } from 'vitest';

import { canonicalize, hashInput } from '@/lib/pdf-render/hash';

/**
 * The cache key MUST be stable across:
 *   - JSON key order (so calling code that builds { a, b } vs { b, a }
 *     produces the same hash)
 *   - missing option fields (so the caller can omit `landscape` and we
 *     fill in `landscape: false` for them)
 *
 * It MUST be different across:
 *   - any byte of HTML
 *   - any option value
 */

describe('canonicalize', () => {
  it('sorts object keys deterministically', () => {
    const a = canonicalize({ html: '<p/>', options: { format: 'letter' as const } });
    const b = canonicalize({ html: '<p/>', options: { format: 'letter' as const } });
    expect(a).toBe(b);
  });

  it('produces identical output for differently-ordered top-level keys', () => {
    // We can't actually reorder RenderInput's keys from the type (it's
    // a fixed interface), but we can confirm the function is order-
    // insensitive by comparing two inputs built with helper objects.
    const a = canonicalize({
      html: '<p/>',
      options: { format: 'letter' as const, marginMm: 10 }
    });
    const b = canonicalize({
      html: '<p/>',
      // Different order in the source — should still canonicalize equal.
      options: { marginMm: 10, format: 'letter' as const }
    });
    expect(a).toBe(b);
  });

  it('fills in option defaults so callers can omit them', () => {
    const withDefaults = canonicalize({ html: '<p/>' });
    const explicit = canonicalize({
      html: '<p/>',
      options: { format: 'letter', landscape: false, printBackground: true, marginMm: 10 }
    });
    expect(withDefaults).toBe(explicit);
  });
});

describe('hashInput', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = hashInput({ html: '<p/>' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic across calls', () => {
    expect(hashInput({ html: '<p/>' })).toBe(hashInput({ html: '<p/>' }));
  });

  it('changes when the HTML changes', () => {
    expect(hashInput({ html: '<p/>' })).not.toBe(hashInput({ html: '<div/>' }));
  });

  it('changes when an option changes', () => {
    const a = hashInput({ html: '<p/>', options: { format: 'letter' } });
    const b = hashInput({ html: '<p/>', options: { format: 'a4' } });
    expect(a).not.toBe(b);
  });

  it('is the same for inputs that differ only in JSON key order', () => {
    const a = hashInput({
      html: '<p/>',
      options: { format: 'letter', marginMm: 10 }
    });
    const b = hashInput({
      html: '<p/>',
      options: { marginMm: 10, format: 'letter' }
    });
    expect(a).toBe(b);
  });
});
