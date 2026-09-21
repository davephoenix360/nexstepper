/**
 * Currency formatting helpers for Stripe `unit_amount` values.
 *
 * Stripe amounts are always expressed in the smallest currency unit
 * (cents for USD/CAD/EUR, yen for JPY, etc.). `Intl.NumberFormat`
 * does NOT know about this convention — it always expects the
 * major-unit value — so we have to divide by hand. The trick is that
 * for zero-decimal currencies (JPY, KRW, …) the smallest unit IS the
 * major unit, so dividing by 100 produces garbage ("¥3.00" instead of
 * "¥300"). This helper handles both cases correctly.
 *
 * The zero-decimal list below is the canonical ISO 4217 + Stripe-docs
 * set. If we ever onboard a new currency, add it here (and add a test).
 */

/**
 * ISO 4217 zero-decimal currencies — the smallest unit equals the
 * major unit, so we do NOT divide by 100 before formatting.
 *
 * Source: https://stripe.com/docs/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set<string>([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF'
]);

/**
 * Format a Stripe `unit_amount` + lowercase `currency` into a display string.
 *
 * - For zero-decimal currencies (JPY/KRW/...), passes the amount
 *   through unchanged.
 * - For everything else, divides by 100 (cents → major unit).
 * - Uses `Intl.NumberFormat` so symbol placement matches the locale.
 * - Caps at 0 fraction digits — "the price of a coffee" should be
 *   "$12", not "$12.00".
 * - Falls back to `${CODE} ${amount/100}` for malformed currency
 *   codes (anything that isn't exactly 3 ASCII letters — Node 22+
 *   `Intl.NumberFormat` silently substitutes `¤` for unknown codes
 *   instead of throwing, so we validate the shape up front).
 */
export function formatPrice(unitAmount: number, currency: string): string {
  const code = currency.toUpperCase();

  // Reject anything that isn't exactly 3 ASCII letters so the fallback
  // path fires deterministically regardless of the host Intl backend.
  if (!/^[A-Z]{3}$/.test(code)) {
    return `${code} ${(unitAmount / 100).toFixed(0)}`;
  }

  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(code);
  const majorAmount = isZeroDecimal ? unitAmount : unitAmount / 100;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0
    }).format(majorAmount);
  } catch {
    // Defensive: if a future Node still throws on a code we passed the
    // shape check (e.g. a code Intl considers invalid), preserve the
    // legacy graceful fallback.
    return `${code} ${(unitAmount / 100).toFixed(0)}`;
  }
}
