import { describe, expect, it } from 'vitest';

import { flexibleUrl, optionalFlexibleUrl } from '@/lib/resume-schema';

/**
 * Direct tests for the `flexibleUrl` schema. The end-to-end
 * (section-shape) coverage lives in schema.test.ts; this file
 * locks down the helper's own contract — accept-set, reject-set,
 * and the normalization transform — so a future tightening shows
 * up here first.
 */

describe('flexibleUrl — empty string', () => {
  it('accepts an empty string', () => {
    expect(flexibleUrl.safeParse('').success).toBe(true);
  });

  it('passes empty string through the transform unchanged', () => {
    const r = flexibleUrl.safeParse('');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('');
  });
});

describe('flexibleUrl — full URLs', () => {
  it('accepts https://example.com', () => {
    const r = flexibleUrl.safeParse('https://example.com');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://example.com');
  });

  it('accepts http://example.com', () => {
    const r = flexibleUrl.safeParse('http://example.com');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('http://example.com');
  });

  it('accepts a URL with a path, query, and fragment', () => {
    const r = flexibleUrl.safeParse(
      'https://example.com/blog/post?id=1#section'
    );
    expect(r.success).toBe(true);
  });

  it('accepts a URL with a non-default port', () => {
    const r = flexibleUrl.safeParse('http://localhost:3000');
    expect(r.success).toBe(true);
  });

  it('does not double-prefix an existing https:// scheme', () => {
    const r = flexibleUrl.safeParse('https://diepreyecd.dev');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://diepreyecd.dev');
  });

  it('rejects https:// with no host', () => {
    expect(flexibleUrl.safeParse('https://').success).toBe(false);
  });
});

describe('flexibleUrl — bare domains', () => {
  it('accepts a bare domain and prepends https://', () => {
    const r = flexibleUrl.safeParse('diepreyecd.dev');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://diepreyecd.dev');
  });

  it('accepts a www-prefixed bare domain', () => {
    const r = flexibleUrl.safeParse('www.diepreyecd.dev');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://www.diepreyecd.dev');
  });

  it('accepts a multi-level subdomain', () => {
    const r = flexibleUrl.safeParse('blog.example.co.uk');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://blog.example.co.uk');
  });

  it('accepts a bare domain with a path', () => {
    const r = flexibleUrl.safeParse('example.com/about');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://example.com/about');
  });

  it('accepts a bare domain with a query string', () => {
    const r = flexibleUrl.safeParse('example.com/?q=hi');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('https://example.com/?q=hi');
  });

  it('accepts IDN/punycode hostnames (xn--...)', () => {
    const r = flexibleUrl.safeParse('xn--bcher-kva.example');
    expect(r.success).toBe(true);
  });
});

describe('flexibleUrl — rejection cases', () => {
  it.each([
    ['plain word, no dot', 'not-a-url'],
    ['word with hyphen, no dot', 'not-a-url-either'],
    ['localhost (no TLD)', 'localhost'],
    ['IPv4 address (no alphabetic TLD)', '192.168.1.1'],
    ['bare path with no domain', '/about'],
    ['leading hyphen (invalid hostname)', '-example.com'],
    ['single label, looks like a TLD only', 'com'],
    ['whitespace', ' '],
    ['control characters', 'example.com\x00'],
    ['javascript: scheme (XSS vector)', 'javascript:alert(1)']
  ])('rejects %s', (_label, input) => {
    expect(flexibleUrl.safeParse(input).success).toBe(false);
  });

  it('rejects javascript: even with a domain-like suffix', () => {
    // Make sure the scheme-validation in the full-URL branch catches
    // dangerous schemes; the bare-domain regex would otherwise accept
    // any string with a dot.
    expect(flexibleUrl.safeParse('javascript://example.com').success).toBe(
      false
    );
  });
});

describe('optionalFlexibleUrl', () => {
  it('is a drop-in replacement for z.url().or(z.literal("")).default("")', () => {
    expect(optionalFlexibleUrl.safeParse('').success).toBe(true);
    expect(optionalFlexibleUrl.safeParse(undefined).success).toBe(true);
    expect(optionalFlexibleUrl.safeParse('https://example.com').success).toBe(
      true
    );
    expect(optionalFlexibleUrl.safeParse('example.com').success).toBe(true);
  });

  it('default value is the empty string', () => {
    const r = optionalFlexibleUrl.safeParse(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('');
  });
});