// Grant Pro access to a user by directly flipping their `subscriptions`
// row — no Stripe checkout, no card charge.
//
// WHY THIS EXISTS (2026-10-21)
//   Pro was gated behind a real Stripe purchase while we were still
//   testing the AI features it unlocks. Charging the founder a live-mode
//   subscription for access to code he wrote is silly, and it leaves the
//   upgrade path itself untested. So: flip the row.
//
//   The tradeoff is explicit — this does NOT exercise `createCheckoutSession`
//   or the webhook. That path stays unverified until a real customer uses
//   it. Restore the live CTAs only after a real purchase has round-tripped
//   once.
//
// WHY A SCRIPT AND NOT A SERVER ACTION
//   This is a deliberate override of billing state. It has to be
//   auditable and re-runnable, and it must never be reachable from the
//   running app where a bad auth check could expose it.
//
// USAGE
//   node scripts/grant-founder-pro.cjs                  # list users, change nothing
//   node scripts/grant-founder-pro.cjs <email>          # flip that user to Pro
//   node scripts/grant-founder-pro.cjs <email> --revoke # back to Free
//
// Which database it hits comes from `.env.local` (POSTGRES_URL). That is
// the DEVELOPMENT Neon project per AGENTS.md's two-project topology —
// this script never touches production. It prints the host it resolved
// before doing anything so a wrong-DB mistake is visible, not silent.

require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

function resolveTarget() {
  const host = new URL(process.env.POSTGRES_URL).hostname;
  console.log(`DB host: ${host}\n`);
  // Guard: the production project is a different Neon endpoint. Refuse
  // to run rather than silently mutating the live database.
  const PROD_MARKERS = ['prod', 'production'];
  if (PROD_MARKERS.some((m) => host.toLowerCase().includes(m))) {
    console.error(
      `REFUSING TO RUN: "${host}" looks like a production database.\n` +
        'This script is for the development project only. Open a Neon SQL\n' +
        'session against prod manually if you really mean to change it.'
    );
    process.exit(1);
  }
}

async function listUsers() {
  const rows = await sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.created_at,
      s.plan,
      s.status
    FROM "user" u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at ASC
    LIMIT 50
  `;
  console.log('users (no changes made):');
  console.table(rows);
}

async function grant(email) {
  const [user] = await sql`SELECT id, email, name FROM "user" WHERE email = ${email}`;
  if (!user) {
    console.error(`No user with email ${email}. Run with no args to list users.`);
    process.exit(1);
  }

  // `subscriptions.user_id` is unique, so ON CONFLICT upserts rather
  // than inserting a duplicate row. `getSubscription()` auto-creates a
  // free row on first read, so this may already exist.
  const [row] = await sql`
    INSERT INTO subscriptions (user_id, plan, status, created_at, updated_at)
    VALUES (${user.id}, 'pro', 'active', NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET plan = 'pro',
          status = 'active',
          updated_at = NOW()
    RETURNING user_id, plan, status
  `;
  console.log(`\n${user.email} (${user.id}) ->`, row);
}

async function revoke(email) {
  const [row] = await sql`
    UPDATE subscriptions
    SET plan = 'free', status = 'inactive', updated_at = NOW()
    WHERE user_id = (SELECT id FROM "user" WHERE email = ${email})
    RETURNING user_id, plan, status
  `;
  console.log(`\n${email} ->`, row ?? 'no subscription row found');
}

(async () => {
  resolveTarget();
  const email = process.argv[2];
  const revokeFlag = process.argv.includes('--revoke');

  if (!email) {
    await listUsers();
  } else if (revokeFlag) {
    await revoke(email);
  } else {
    await grant(email);
  }

  await sql.end();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});