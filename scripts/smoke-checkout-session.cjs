/**
 * Stripe checkout smoke test.
 *
 * PROVES, WITHOUT SPENDING MONEY, that the exact parameter set
 * `createCheckoutSession()` in `lib/payments/stripe.ts` passes Stripe's
 * request validation under Managed Payments.
 *
 * Why this exists
 * ---------------
 * On 2026-10-21 every Upgrade click 500'd with no visible cause. The
 * blocking error was a product-level `tax_code` that Managed Payments
 * requires before it will let you create a Checkout session at all.
 * Nothing in the app, Sentry, or the UI pointed at it — see
 * `docs/setup/stripe.md` §4.8.
 *
 * This test is how you find that class of bug for free, by creating a
 * session and throwing it away. It creates the session in the SANDBOX
 * account and then expires it, so nothing is ever chargeable.
 *
 * Scope and limits — read before trusting a green result:
 *   - It exercises Stripe's REQUEST VALIDATION only. It does NOT prove a
 *     card can be authorized, and it does NOT touch the live account.
 *   - It proves the params are valid. Whether `STRIPE_PRICE_ID_PRO` in
 *     production points at the right price is a SEPARATE question (see
 *     the note in docs/setup/stripe.md §0).
 *   - It uses the sandbox key from `.env.local`. Live objects are not
 *     touched and the key is never printed.
 *
 * ⚠️  KEEP THE PARAMETER BLOCK BELOW IN SYNC with
 * `createCheckoutSession()` in lib/payments/stripe.ts. If the app's
 * params change, this test silently stops testing the real thing.
 *
 * ⚠️  PROMOTION CODES ARE NOT TESTABLE HERE. An earlier version of this
 * script accepted a promo code and applied it via
 * `discounts[0][promotion_code]`. That path returns
 * `No such promotion code: '…'` on this account for every code tried —
 * including bare ones with no restrictions — while the sibling
 * `discounts[0][coupon]` applies correctly. The codes themselves are
 * fine: NEXSTEP50 was confirmed working 2026-10-21 by customer entry at
 * the live Checkout page (CA$5.00 → −CA$2.50, GST recomputed on the
 * discounted subtotal). So the restriction is on the server-side apply
 * path, not on promotion codes. Verifying one requires the real browser
 * UI, which this script deliberately does not drive.
 *
 * Usage: node scripts/smoke-checkout-session.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve('.env.local');
const env = fs.readFileSync(envPath, 'utf8');

function envValue(name) {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '') : null;
}

const apiKey = envValue('STRIPE_SECRET_KEY');
const priceId = envValue('STRIPE_PRICE_ID_PRO');

if (!apiKey) throw new Error('STRIPE_SECRET_KEY missing from .env.local');
if (apiKey.startsWith('sk_live_')) {
  throw new Error('Refusing to run against a LIVE key — this script only creates sandbox sessions');
}
if (!priceId) throw new Error('STRIPE_PRICE_ID_PRO missing from .env.local');

const SUCCESS_URL = 'https://www.nexstepper.com/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = 'https://www.nexstepper.com/pricing';

/** Mirrors the body of createCheckoutSession() in lib/payments/stripe.ts. */
function checkoutSessionParams() {
  return {
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    mode: 'subscription',
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
    // The app passes `customer` OR `customer_email`, never both. A
    // brand-new user has no Stripe customer yet, so it sends the email.
    customer_email: 'smoke-test@example.com',
    client_reference_id: 'smoke-test',
    allow_promotion_codes: 'true',
    subscription_data: { trial_period_days: '7' },
  };
}

/** Flatten the nested `subscription_data` object into Stripe's form encoding. */
function encode(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    // Drop undefined/null rather than sending the literal string "undefined".
    // A param conditionally omitted by setting it to undefined is NOT the same
    // as a param set to undefined — Stripe sees the latter as a real value and
    // rejects it.
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) out[`${k}[${sk}]`] = sv;
    } else {
      out[k] = v;
    }
  }
  return new URLSearchParams(out).toString();
}

async function stripe(pathname, method = 'POST', body) {
  const res = await fetch(`https://api.stripe.com/v1${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    ...(body ? { body: encode(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
}

async function main() {
  console.log(`price under test : ${priceId}`);
  console.log('account         : sandbox (test mode)');
  console.log('');

  const { status, json } = await stripe('/checkout/sessions', 'POST', checkoutSessionParams());

  if (!json || json.error) {
    console.error(`FAILED to create Checkout Session (HTTP ${status})`);
    console.error('');
    console.error(`  type    : ${json?.error?.type}`);
    console.error(`  code    : ${json?.error?.code}`);
    console.error(`  param   : ${json?.error?.param}`);
    console.error(`  message : ${json?.error?.message}`);
    console.error('');
    console.error('This is exactly the class of error that surfaces to the user as a');
    console.error('bare 500. Fix the Stripe object it names, then re-run.');
    process.exitCode = 1;
    return;
  }

  console.log('PASS — Checkout Session created.');
  console.log(`  session id    : ${json.id}`);
  console.log(`  status        : ${json.status}`);
  console.log(`  mode          : ${json.mode}`);
  console.log(`  livemode      : ${json.livemode}`);
  console.log(`  currency      : ${json.currency}`);
  console.log(`  amount_total  : ${json.amount_total}`);
  console.log(`  has url       : ${Boolean(json.url)}`);
  console.log(`  promo codes   : ${json.allow_promotion_codes ? 'enabled (customer entry)' : 'disabled'}`);
  if (json.amount_total === 0) {
    console.log('');
    console.log('  Note: amount_total is 0 because the 7-day trial applies. The');
    console.log('  first real charge happens when the trial ends.');
  }

  // Expire it immediately so the session can never be completed or charged.
  const exp = await stripe(`/checkout/sessions/${json.id}/expire`, 'POST');
  console.log('');
  console.log(`  expired       : ${exp.json.status === 'expired'} (session can never be charged)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});