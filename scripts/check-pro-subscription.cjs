/**
 * Read-only check of the PRODUCTION subscription state for one user.
 *
 * Connects with POSTGRES_URL from .env.production.local (gitignored).
 * Reads only; writes nothing. Run with --live-only semantics: it refuses
 * to run if POSTGRES_URL points at a localhost database, so it can never
 * silently report dev state as production state.
 *
 * Usage: node scripts/check-pro-subscription.cjs [email]
 */
const fs = require('node:fs');
const path = require('node:path');
const postgres = require('postgres');

const EMAIL = process.argv[2] || 'davediepreye05@gmail.com';

const env = fs.readFileSync(path.resolve('.env.production.local'), 'utf8');
const url = (env.split(/\r?\n/).find((l) => l.startsWith('POSTGRES_URL=')) || '')
  .slice('POSTGRES_URL='.length).trim().replace(/^"|"$/g, '');

if (!url) throw new Error('POSTGRES_URL missing from .env.production.local');
if (url.includes('localhost') || url.includes('127.0.0.1')) {
  throw new Error('Refusing: POSTGRES_URL is a local database, not production');
}

const sql = postgres(url, { max: 1, ssl: 'require', connect_timeout: 15 });

(async () => {
  try {
    console.log(`host in use    : ${new URL(url).hostname}`);
    console.log(`looking for    : ${EMAIL}`);
    console.log('');

    const rows = await sql`
      select u.email, s.plan, s.status, s.stripe_subscription_id as "stripeSubscriptionId",
             s.stripe_price_id as "stripePriceId", s.stripe_customer_id as "stripeCustomerId",
             s.current_period_end as "currentPeriodEnd"
      from subscriptions s
      join "user" u on u.id = s.user_id
      where u.email = ${EMAIL}
    `;

    if (!rows.length) {
      console.log('NO SUBSCRIPTION ROW for that email.');
      const total = await sql`select count(*)::int as n from subscriptions where plan = 'pro'`;
      console.log(`rows with plan='pro' in this database: ${total[0].n}`);
      return;
    }

    for (const r of rows) {
      console.log('SUBSCRIPTION ROW');
      console.log(`  plan                 : ${r.plan}`);
      console.log(`  status               : ${r.status}`);
      console.log(`  stripeSubscriptionId : ${r.stripeSubscriptionId ?? '(none)'}`);
      console.log(`  stripePriceId        : ${r.stripePriceId ?? '(none)'}`);
      console.log(`  stripeCustomerId     : ${r.stripeCustomerId ?? '(none)'}`);
      console.log(`  currentPeriodEnd     : ${r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toISOString() : '(none)'}`);
      console.log('');
      console.log(`  isProEffective?      : ${['active', 'trialing'].includes(r.status) && r.plan === 'pro' ? 'YES' : 'NO'}`);
    }

    console.log('');
    console.log('RECENT WEBHOOK EVENTS PROCESSED');
    const ev = await sql`
      select event_id, event_type, processed_at
      from stripe_events_processed
      order by processed_at desc limit 5
    `;
    if (!ev.length) console.log('  (none — the webhook has not recorded any event)');
    for (const e of ev) {
      console.log(`  ${String(e.processed_at)}  ${e.event_type}  ${e.event_id}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});