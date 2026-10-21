// Verify the Resend email setup, and report how many real users would
// need a subprocessor notice. Read-only: nothing is sent.
//
// WHY THIS EXISTS (2026-10-21)
//   Swapping the chat model to `anthropic/claude-haiku-5.5` adds Anthropic
//   as a named AI subprocessor, and `app/(legal)/privacy/page.tsx` promises
//   "30 days' notice via email before adding a new subprocessor that handles
//   personal data". No broadcast has ever been sent, so there is no list and
//   possibly no verified sending domain. Both need checking BEFORE the change
//   reaches production, not after.
//
// USAGE
//   node scripts/verify-email-setup.cjs            # dev DB
//   DB_ENV=.env.production node scripts/...         # prod DB (see note below)
//
// NOTE ON PRODUCTION
//   `POSTGRES_URL` for production lives only in Vercel as a Hidden secret.
//   This script reads a local env file, so it will report the DEVELOPMENT
//   user list unless you point it at a production env file. The dev list is
//   almost entirely test accounts and is NOT who needs the notice.

require('dotenv').config({ path: process.env.ENV_FILE || '.env.local' });
const postgres = require('postgres');

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_ADDRESS;

function maskEmail(e) {
  if (!e) return '(empty)';
  const [u, d] = e.split('@');
  if (!d) return '(not an email)';
  return `${u.slice(0, 2)}***@${d}`;
}

async function checkResend() {
  console.log('=== Resend ===');
  if (!RESEND_KEY) {
    console.log('  RESEND_API_KEY: (missing)');
    return;
  }
  const auth = RESEND_KEY.startsWith('re_') ? RESEND_KEY.slice(3) : RESEND_KEY;

  const domains = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` }
  });
  if (!domains.ok) {
    console.log(`  ERROR listing domains: ${domains.status} ${await domains.text()}`);
    return;
  }
  const { data } = await domains.json();
  console.log(`  RESEND_API_KEY : ${auth.slice(0, 4)}… (${RESEND_KEY.length} chars)`);
  console.log(`  RESEND_FROM   : ${FROM || '(missing)'}`);
  console.log(`  domains (${data.length}):`);
  for (const d of data) {
    console.log(`    - ${d.name}  [${d.status}]`);
    for (const r of d.records ?? []) {
      console.log(`        ${r.type}: ${r.name} -> ${r.value} ${r.status ? `[${r.status}]` : ''}`);
    }
  }
  if (data.length === 0) {
    console.log('    (no domains — Resend will only send from the sandbox');
    console.log('     onboarding@resend.dev, which delivers to YOUR inbox only)');
  }
}

async function countUsers() {
  console.log('\n=== Users in the connected database ===');
  const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });
  try {
    const rows = await sql`
      SELECT u.id, u.email, u.created_at, s.plan, s.status
      FROM "user" u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      ORDER BY u.created_at ASC
    `;
    console.log(`  total: ${rows.length}`);
    // Print masked — these are real email addresses.
    for (const r of rows) {
      const looksReal = !/test|mavis-agent|example/i.test(r.email);
      console.log(
        `    ${maskEmail(r.email).padEnd(34)} ${r.plan}/${r.status}  ` +
          `${r.created_at.toISOString().slice(0, 10)}  ${looksReal ? '' : '(test account)'}`
      );
    }
    const real = rows.filter((r) => !/test|mavis-agent|example/i.test(r.email));
    console.log(`\n  plausibly-real accounts: ${real.length}`);
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  } finally {
    await sql.end();
  }
}

(async () => {
  try {
    await checkResend();
  } catch (err) {
    console.log(`  Resend check failed: ${err.message}`);
  }
  await countUsers();
})();