import { describe, expect, it } from 'vitest';

import {
  buildResetPasswordHtml,
  buildResetPasswordText,
  EXPIRY_MINUTES_DEFAULT
} from '@/lib/email/reset-password';

/**
 * The reset-password email has two parts that matter:
 *   1. The HTML / text template — must include the reset link,
 *      the user's name (or a fallback greeting), and an explicit
 *      "ignore this if you didn't request it" footer.
 *   2. The expiry — must be 60 minutes (configured in `lib/auth.ts`
 *      via `resetPasswordTokenExpiresIn`).
 *
 * We test the template builders directly rather than mocking
 * Resend. The actual sendEmail call is trivial and the Resend
 * client itself is well-tested upstream.
 */

const FAKE_URL = 'https://nextep.example.com/reset-password?token=abc123';

describe('buildResetPasswordHtml', () => {
  it('contains the reset URL as a clickable button', () => {
    const html = buildResetPasswordHtml({ name: 'Jane', url: FAKE_URL });
    expect(html).toContain(`href="${FAKE_URL}"`);
    // The visible button label is "Reset password".
    expect(html).toMatch(/Reset password/);
  });

  it('contains the reset URL as plain text (so it works in clients that strip HTML)', () => {
    const html = buildResetPasswordHtml({ name: 'Jane', url: FAKE_URL });
    // The URL appears twice: once in the href, once as the
    // "paste this link" fallback. Both need to be there.
    const urlCount = (html.match(/https:\/\/nextep\.example\.com/g) ?? []).length;
    expect(urlCount).toBeGreaterThanOrEqual(2);
  });

  it('greets the user by name when provided', () => {
    const html = buildResetPasswordHtml({ name: 'Jane Doe', url: FAKE_URL });
    expect(html).toMatch(/Hi Jane Doe/);
  });

  it('falls back to a neutral greeting when name is null', () => {
    const html = buildResetPasswordHtml({ name: null, url: FAKE_URL });
    expect(html).toMatch(/Hi there/);
  });

  it('falls back to a neutral greeting when name is undefined', () => {
    const html = buildResetPasswordHtml({ name: undefined, url: FAKE_URL });
    expect(html).toMatch(/Hi there/);
  });

  it('falls back to a neutral greeting when name is whitespace-only', () => {
    const html = buildResetPasswordHtml({ name: '   ', url: FAKE_URL });
    expect(html).toMatch(/Hi there/);
  });

  it('HTML-escapes special characters in the name (defense in depth)', () => {
    // Names shouldn't contain HTML, but be defensive.
    const html = buildResetPasswordHtml({
      name: '<script>alert(1)</script>',
      url: FAKE_URL
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('HTML-escapes special characters in the URL (defense in depth)', () => {
    // URL is from Better Auth (trusted), but escaping is cheap.
    const url = 'https://example.com/r?x="&y=<';
    const html = buildResetPasswordHtml({ name: 'Jane', url });
    expect(html).not.toContain('href="https://example.com/r?x="&y=<"');
    expect(html).toContain('&quot;');
  });

  it('mentions the expiry duration so users know the time limit', () => {
    const html = buildResetPasswordHtml({ name: 'Jane', url: FAKE_URL });
    expect(html).toMatch(/60 minutes/);
  });

  it('honors a custom expiryMinutes override', () => {
    const html = buildResetPasswordHtml({
      name: 'Jane',
      url: FAKE_URL,
      expiryMinutes: 15
    });
    expect(html).toMatch(/15 minutes/);
    expect(html).not.toMatch(/60 minutes/);
  });

  it('includes the "ignore if you did not request" footer', () => {
    const html = buildResetPasswordHtml({ name: 'Jane', url: FAKE_URL });
    expect(html).toMatch(/didn't request this/i);
    expect(html).toMatch(/ignore/i);
  });

  it('is a valid document (has doctype + html + body)', () => {
    const html = buildResetPasswordHtml({ name: 'Jane', url: FAKE_URL });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html');
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
    expect(html).toContain('</html>');
  });
});

describe('buildResetPasswordText', () => {
  it('contains the reset URL', () => {
    const text = buildResetPasswordText({ name: 'Jane', url: FAKE_URL });
    expect(text).toContain(FAKE_URL);
  });

  it('greets the user by name when provided', () => {
    const text = buildResetPasswordText({ name: 'Jane Doe', url: FAKE_URL });
    expect(text.startsWith('Hi Jane Doe,')).toBe(true);
  });

  it('falls back to "Hi there," when name is missing', () => {
    const text = buildResetPasswordText({ name: null, url: FAKE_URL });
    expect(text.startsWith('Hi there,')).toBe(true);
  });

  it('mentions the expiry duration', () => {
    const text = buildResetPasswordText({ name: 'Jane', url: FAKE_URL });
    expect(text).toMatch(/60 minutes/);
  });

  it('honors a custom expiryMinutes override', () => {
    const text = buildResetPasswordText({
      name: 'Jane',
      url: FAKE_URL,
      expiryMinutes: 30
    });
    expect(text).toMatch(/30 minutes/);
  });

  it('includes the "ignore if you did not request" footer', () => {
    const text = buildResetPasswordText({ name: 'Jane', url: FAKE_URL });
    expect(text).toMatch(/didn't request this/i);
  });

  it('ends with the Nextep sign-off', () => {
    const text = buildResetPasswordText({ name: 'Jane', url: FAKE_URL });
    expect(text.trimEnd().endsWith('— Nextep')).toBe(true);
  });
});

describe('EXPIRY_MINUTES_DEFAULT', () => {
  it('is 60 minutes (matches lib/auth.ts resetPasswordTokenExpiresIn)', () => {
    // If this drifts, the auth config and the email template will
    // disagree about how long the link is valid.
    expect(EXPIRY_MINUTES_DEFAULT).toBe(60);
  });
});
