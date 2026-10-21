// Verify the Stripe integration is wired correctly, in whatever mode the
// current env points at. Read-only: retrieves and reports, changes nothing.
//
// WHY THIS EXISTS (2026-10-21)
//   Pro has been gated behind a waitlist for a month, so the Stripe path
//   has been sitting untested. By the time we need it, `STRIPE_PRICE_ID_PRO`
//   has to already be a real recurring price in the right mode, the webhook
//   has to be registered for the three subscription events, and the local
//   webhook secret has to be the one `stripe listen` is printing — not the
//   Dashboard's. Those are three separate failure modes that all present as
//   "checkout did nothing".
//
// WHAT IT CHECKS
//   1. Which mode the secret key is in (test vs live) — a test key against
//      a live price id is the single most common silent failure here.
//   2. Whether the Pro price actually exists, and its amount / currency /
//      interval / active state.
//   3. Which webhook endpoints are registered, and for which events.
//   4. Whether a webhook signing secret is present locally.
//
// USAGE
//   node scripts/verify-stripe-setup.cjs
//
// Secrets are never printed — only their mode and last 4 characters.

require('dotenv').config({ path: process.env.ENV_FILE || '.env.local' });
const Stripe = require('stripe');

const REQUIRED_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
];

function mask(v) {
  if (!v) return '(empty)';
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}

function modeOf(key) {
  if (!key) return 'MISSING';
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'LIVE';
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'TEST';
  return 'UNKNOWN';
}

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID_PRO;

  console.log('=== 1. Key mode ===');
  const mode = modeOf(secret);
  console.log(`STRIPE_SECRET_KEY   : ${mask(secret)}  [${mode}]`);
  console.log(`STRIPE_WEBHOOK_SECRET: ${mask(process.env.STRIPE_WEBHOOK_SECRET)}`);
  console.log(`STRIPE_PRICE_ID_PRO : ${priceId || '(empty)'}`);

  if (mode === 'MISSING') {
    console.error('\nSTOP: no STRIPE_SECRET_KEY. Nothing below can be verified.');
    process.exit(1);
  }

  const stripe = new Stripe(secret);

  console.log('\n=== 2. Pro price ===');
  if (!priceId) {
    console.log('  (not set — the pricing page renders the soft-launch waitlist CTA)');
  } else {
    try {
      const price = await stripe.prices.retrieve(priceId);
      const unit = (price.unit_amount ?? 0) / 100;
      console.log(`  id            : ${price.id}`);
      console.log(`  active        : ${price.active}`);
      console.log(`  amount        : ${price.currency.toUpperCase()} ${unit}`);
      console.log(`  interval      : ${price.recurring?.interval ?? '(not recurring)'}`);
      console.log(`  interval_count: ${price.recurring?.interval_count ?? '-'}`);
      console.log(`  type          : ${price.type}`);
      console.log(`  nickname      : ${price.nickname ?? '-'}`);

      const product = await stripe.products.retrieve(price.product);
      console.log(`  product       : ${product.name}${product.active ? '' : ' (INACTIVE)'}`);

      const problems = [];
      if (!price.active) problems.push('price is INACTIVE — checkout will fail');
      if (!product.active) problems.push('product is INACTIVE — checkout will fail');
      if (price.type !== 'recurring') problems.push('price is NOT recurring — Pro is a subscription');
      if ((price.recurring?.interval ?? '') !== 'month')
        problems.push(`interval is "${price.recurring?.interval}", expected "month"`);
      console.log(problems.length ? `\n  PROBLEMS:\n${problems.map((p) => `   - ${p}`).join('\n')}` : '\n  OK');
    } catch (err) {
      console.error(`  ERROR retrieving price: ${err.message}`);
      console.error('  A "No such price" error here almost always means the Price ID');
      console.error('  is from the OTHER Stripe mode than the secret key.');
    }
  }

  console.log('\n=== 3. Webhook endpoints ===');
  try {
    const hooks = await stripe.webhookEndpoints.list({ limit: 20 });
    if (hooks.data.length === 0) {
      console.log('  (none registered)');
    }
    for (const h of hooks.data) {
      const missing = REQUIRED_EVENTS.filter((e) => !h.enabled_events.includes(e));
      const relevant = h.url.includes('nexstepper') || h.url.includes('localhost');
      console.log(`  ${h.url}`);
      console.log(`    id      : ${h.id}`);
      console.log(`    status  : ${h.status}`);
      console.log(`    api_ver : ${h.api_version ?? '(default)'}`);
      console.log(`    events  : ${h.enabled_events.length}`);
      console.log(`    ${relevant ? 'RELEVANT' : '(other endpoint)'}`);
      if (relevant && missing.length) {
        console.log(`    MISSING EVENTS: ${missing.join(', ')}`);
      }
    }
  } catch (err) {
    console.error(`  ERROR listing endpoints: ${err.message}`);
  }

  console.log('\n=== 4. SDK API version pin ===');
  console.log(`  lib/payments/stripe.ts should pin the same version as the`);
  console.log(`  production endpoint above, or Stripe will log version drift.`);
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});