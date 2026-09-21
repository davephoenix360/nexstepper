/**
 * Tests for `formatPrice` — `lib/format/currency.ts`.
 *
 * Stripe amounts are always in the smallest unit. The helper has to:
 *   - divide by 100 for normal currencies (USD, CAD, EUR, GBP, …)
 *   - NOT divide for zero-decimal currencies (JPY, KRW, …)
 *   - cap at 0 fraction digits ("$12", not "$12.00")
 *   - gracefully fall through for unknown / test-mode currencies
 */

import { describe, expect, it } from 'vitest';

import { formatPrice } from '@/lib/format/currency';

describe('formatPrice', () => {
  it('formats USD cents as a whole-dollar currency string', () => {
    // 1200 cents = $12.00 — but we cap at 0 fraction digits, so "$12".
    expect(formatPrice(1200, 'usd')).toBe('$12');
  });

  it('formats CAD cents using the Canadian dollar symbol', () => {
    // 300 cents = CA$3.
    expect(formatPrice(300, 'cad')).toBe('CA$3');
  });

  it('does NOT divide JPY by 100 (zero-decimal currency)', () => {
    // 300 yen should be "¥300", NOT "¥3.00" or "¥3".
    expect(formatPrice(300, 'jpy')).toBe('¥300');
  });

  it('does NOT divide KRW by 100 (zero-decimal currency, with grouping)', () => {
    // 5000 won — Intl.NumberFormat should add the thousands separator.
    expect(formatPrice(5000, 'krw')).toBe('₩5,000');
  });

  it('falls back gracefully for malformed currency codes', () => {
    // 'ab' isn't 3 letters, '12$' isn't letters at all, and '' is empty.
    // The shape check rejects these up front and we fall back to the
    // legacy "CODE amount/100" string format (rather than Intl's
    // permissive-but-unhelpful `¤` placeholder).
    expect(formatPrice(1200, 'ab')).toMatch(/^AB 12$/);
    expect(formatPrice(1200, '12$')).toMatch(/^12\$ 12$/);
    expect(formatPrice(1200, '')).toMatch(/^ 12$/);
  });

  it('uppercases the lowercase Stripe currency code', () => {
    // Stripe sends currency as lowercase ("usd"). The helper should
    // uppercase before passing to Intl.NumberFormat.
    expect(formatPrice(1200, 'eur')).toBe('€12');
  });
});
