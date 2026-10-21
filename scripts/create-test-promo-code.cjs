/**
 * Create a dev-test discount code in the SANDBOX Stripe account.
 *
 * Why sandbox, not live:
 *   `.env.local` points at the sandbox, so that is the account the dev
 *   server actually talks to. Testing the promo-code path there is a
 *   complete, zero-risk test (card 4242 4242 4242 4242). The live CLI
 *   key is a restricted key without `coupon_write` — create live codes in
 *   the Stripe Dashboard. See docs/setup/stripe.md.
 *
 * The discount it creates:
 *   - 50% off, duration `once` — the FIRST invoice only, so even if the
 *     code leaks it can never discount more than a single billing period
 *   - capped at 5 redemptions and expiring in 90 days, so it cannot
 *     linger on the account indefinitely
 *   - `percent_off`, not `amount_off`, so it is currency-agnostic and
 *     does not need to be pinned to CAD
 *
 * Idempotent: re-running with the same code will not create duplicates.
 *
 * Usage: node scripts/create-test-promo-code.cjs [CODE]
 */
const fs = require('node:fs');
const path = require('node:path');

const CODE = (process.argv[2] || 'NEXSTEP50').toUpperCase();

const env = fs.readFileSync(path.resolve('.env.local'), 'utf8');
function envValue(name) {
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '') : null;
}

const key = envValue('STRIPE_SECRET_KEY');
if (!key) throw new Error('STRIPE_SECRET_KEY missing from .env.local');
if (key.startsWith('sk_live_')) {
  throw new Error('Refusing to run: .env.local holds a LIVE key, expected a test key');
}

async function stripe(pathname, body) {
  const res = await fetch(`https://api.stripe.com/v1${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    ...(body ? { body: new URLSearchParams(body).toString() } : {}),
  });
  return { status: res.status, json: await res.json() };
}

async function main() {
  // Idempotency: is this code already there?
  const existing = await fetch(
    `https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(CODE)}&active=true`,
    { headers: { Authorization: `Bearer ${key}` } }
  ).then((r) => r.json());

  if (existing.data?.length) {
    const pc = existing.data[0];
    console.log(`promotion code already exists: ${pc.id}`);
    console.log(`  code          = ${pc.code}`);
    console.log(`  active        = ${pc.active}`);
    console.log(`  coupon        = ${pc.coupon?.id}`);
    console.log(`  times_redeemed= ${pc.times_redeemed}`);
    return;
  }

  // 1. Coupon (Stripe caps `name` at 40 characters).
  const redeemBy = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
  const coupon = await stripe('/coupons', {
    name: 'Nexstepper dev test — 50% off',
    percent_off: '50',
    duration: 'once',
    max_redemptions: '5',
    redeem_by: String(redeemBy),
  });

  if (!coupon.json?.id) {
    console.error(`FAILED to create coupon (HTTP ${coupon.status})`);
    console.error(`  ${coupon.json?.error?.type}: ${coupon.json?.error?.message}`);
    process.exitCode = 1;
    return;
  }

  // 2. Customer-facing promotion code wrapping that coupon.
  //
  // NOTE the API shape: the promotion code no longer takes a top-level
  // `coupon` param. It takes a nested `promotion` object —
  // `promotion[type]=coupon` plus `promotion[coupon]=<id>`. Passing the
  // old flat `coupon` fails with "Received unknown parameter: coupon".
  const promo = await stripe('/promotion_codes', {
    code: CODE,
    'promotion[type]': 'coupon',
    'promotion[coupon]': coupon.json.id,
  });

  if (!promo.json?.id) {
    console.error(`coupon ${coupon.json.id} was created, but the promotion code failed:`);
    console.error(`  ${promo.json?.error?.type}: ${promo.json?.error?.message}`);
    process.exitCode = 1;
    return;
  }

  console.log('discount code ready');
  console.log(`  code           = ${promo.json.code}`);
  console.log(`  coupon         = ${coupon.json.id}`);
  console.log(`  discount       = ${coupon.json.percent_off}% off, duration ${coupon.json.duration}`);
  console.log(`  max_redemptions= ${coupon.json.max_redemptions}`);
  console.log(`  expires        = ${new Date(coupon.json.redeem_by * 1000).toISOString()}`);
  console.log('');
  console.log(`Enter "${promo.json.code}" in the "Add promotion code" box at Checkout.`);
  console.log('Remember: with the 7-day trial, the discount lands on the first');
  console.log('INVOICE (at trial end), not on the CA$0.00 due today.');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});