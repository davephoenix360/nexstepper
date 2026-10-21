// Render the subprocessor-change notice for every real production account
// and write a Resend batch payload.
//
// WHAT IT DOES
//   1. Reads users from the PRODUCTION database (`.env.production.local`).
//   2. Renders the notice per user via `lib/email/subprocessor-notice.ts`
//      — the same module the app would use, so the email and the privacy
//      policy cannot drift apart.
//   3. Writes a batch JSON to `output/notice/` (gitignored) for
//      `resend emails batch --file`.
//
// IT SENDS NOTHING. Sending is a separate, explicit step.
//
// USAGE
//   npx --yes tsx scripts/render-subprocessor-notice.ts
//   npx --yes tsx scripts/render-subprocessor-notice.ts --include-founder
//
// WHY THE FOUNDER IS EXCLUDED BY DEFAULT
//   The founder gets a single test send first, to read it before 31 real
//   people do. Including them in the batch would double-send.

import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';

import {
  buildSubprocessorNoticeHtml,
  buildSubprocessorNoticeText,
  SUBPROCESSOR_NOTICE_SUBJECT,
  AI_SUBPROCESSORS_2026_10_21
} from '../lib/email/subprocessor-notice';

config({ path: '.env.production.local' });

const FROM = process.env.NOTICE_FROM ?? 'Nexstepper <hi@nexstepper.com>';
const PRIVACY_URL =
  process.env.NOTICE_PRIVACY_URL ?? 'https://www.nexstepper.com/privacy';
const EFFECTIVE_DATE = process.env.NOTICE_EFFECTIVE_DATE ?? 'October 21, 2026';
const FOUNDER_EMAIL = process.env.NOTICE_FOUNDER_EMAIL ?? 'davediepreye05@gmail.com';
const INCLUDE_FOUNDER = process.argv.includes('--include-founder');

const OUT_DIR = 'output/notice';

// Addresses that are obviously ours / not real recipients.
const TEST_PATTERNS = [/test/i, /mavis/i, /example/i, /\+test/i, /nextep\.(dev|test)/i];

function isRealUser(email: string): boolean {
  return !TEST_PATTERNS.some((p) => p.test(email));
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL missing — run against .env.production.local');
    process.exit(1);
  }
  console.log(`DB host: ${new URL(url).hostname}`);

  const sql = postgres(url, { ssl: 'require' });

  const rows = await sql`
    SELECT u.id, u.email, u.name, u.created_at
    FROM "user" u
    ORDER BY u.created_at ASC
  `;
  await sql.end();

  const real = rows.filter((r) => isRealUser(r.email));
  const skipped = rows.filter((r) => !isRealUser(r.email));

  console.log(`\ntotal accounts : ${rows.length}`);
  console.log(`test accounts  : ${skipped.length}${skipped.length ? ` (${skipped.map((s) => s.email).join(', ')})` : ''}`);
  console.log(`real accounts  : ${real.length}`);

  // Founder sanity check — the founder must be in the list and must be the
  // earliest account, or our exclusion below is wrong.
  const founderIdx = real.findIndex((r) => r.email === FOUNDER_EMAIL);
  if (founderIdx === -1) {
    console.log(`\nWARNING: founder ${FOUNDER_EMAIL} not found in the real-account list.`);
  } else {
    console.log(`founder        : ${FOUNDER_EMAIL} (position ${founderIdx + 1} of ${real.length}, created ${real[founderIdx].created_at.toISOString().slice(0, 10)})`);
  }

  const recipients = INCLUDE_FOUNDER ? real : real.filter((r) => r.email !== FOUNDER_EMAIL);
  console.log(`batch size     : ${recipients.length}${INCLUDE_FOUNDER ? ' (founder included)' : ' (founder excluded — they get the test send)'}`);

  const batch = recipients.map((r) => ({
    from: FROM,
    to: [r.email],
    subject: SUBPROCESSOR_NOTICE_SUBJECT,
    html: buildSubprocessorNoticeHtml({
      name: r.name,
      privacyUrl: PRIVACY_URL,
      effectiveDate: EFFECTIVE_DATE
    }),
    text: buildSubprocessorNoticeText({
      name: r.name,
      privacyUrl: PRIVACY_URL,
      effectiveDate: EFFECTIVE_DATE
    })
  }));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/batch.json`, JSON.stringify(batch, null, 2), 'utf8');

  // Single-render preview for the founder's test send.
  const founderRow = rows.find((r) => r.email === FOUNDER_EMAIL);
  writeFileSync(
    `${OUT_DIR}/preview.html`,
    buildSubprocessorNoticeHtml({
      name: founderRow?.name,
      privacyUrl: PRIVACY_URL,
      effectiveDate: EFFECTIVE_DATE
    }),
    'utf8'
  );
  writeFileSync(
    `${OUT_DIR}/preview.txt`,
    buildSubprocessorNoticeText({
      name: founderRow?.name,
      privacyUrl: PRIVACY_URL,
      effectiveDate: EFFECTIVE_DATE
    }),
    'utf8'
  );

  console.log(`\nwrote ${OUT_DIR}/batch.json  (${batch.length} messages)`);
  console.log(`wrote ${OUT_DIR}/preview.html`);
  console.log(`wrote ${OUT_DIR}/preview.txt`);
  console.log(`\nfrom      : ${FROM}`);
  console.log(`subject   : ${SUBPROCESSOR_NOTICE_SUBJECT}`);
  console.log(`privacy   : ${PRIVACY_URL}`);
  console.log(`effective : ${EFFECTIVE_DATE}`);
  console.log(`processors: ${AI_SUBPROCESSORS_2026_10_21.length} listed`);

  // Recipient list, masked — enough to eyeball the filter, not enough to
  // leak 31 addresses into a terminal scrollback.
  console.log('\nrecipients (masked):');
  for (const r of recipients) {
    console.log(`  ${r.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}  ${r.created_at.toISOString().slice(0, 10)}`);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});