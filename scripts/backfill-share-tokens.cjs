/**
 * Backfill legacy `resumes.share_token` values to the deterministic token.
 *
 * The work itself lives in
 * `tests/unit/share/backfill-share-tokens.test.ts` so it uses the REAL
 * `deriveShareToken` — the same function the app calls. A script with
 * its own copy of the HMAC would be a drift trap: the copy and the
 * production module would silently diverge, and the tool would write
 * tokens that the app could never look up.
 *
 * The test is skipped unless `BACKFILL_SHARE_TOKENS` is set, so CI
 * never touches a database.
 *
 * DRY RUN by default. `--apply` writes.
 *
 * Usage:
 *   node scripts/backfill-share-tokens.cjs           # dry run
 *   node scripts/backfill-share-tokens.cjs --apply   # write
 *
 * The prod secret lives in Vercel, not in a file. Pull it first:
 *
 *   vercel env pull .env.production.local
 *
 * An already-exported `POSTGRES_URL` / `SHARE_LINK_SECRET` wins over
 * the file, so you can also point it somewhere else explicitly.
 */
require('dotenv').config({ path: '.env.production.local' });

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');

const env = {
  ...process.env,
  BACKFILL_SHARE_TOKENS: apply ? 'apply' : '1'
};

if (!process.env.POSTGRES_URL) {
  console.error(
    '[backfill] POSTGRES_URL is not set. Expected it in .env.production.local ' +
      '(pull it with `vercel env pull .env.production.local`) or in the environment.'
  );
  process.exit(1);
}

// The secret is only needed to WRITE: the dry run reports which rows
// hold a non-canonical token without computing the replacement.
if (apply && !process.env.SHARE_LINK_SECRET) {
  console.error(
    '[backfill] SHARE_LINK_SECRET is not set. The backfill must run with the ' +
      'secret of the environment it is fixing — the prod secret lives in Vercel, ' +
      'not in a file. Pull it with `vercel env pull .env.production.local` or ' +
      'export it. Refusing to guess.'
  );
  process.exit(1);
}

console.log(
  `[backfill] mode=${apply ? 'APPLY (writes)' : 'DRY RUN (writes nothing)'}`
);

const result = spawnSync(
  'pnpm',
  [
    'vitest',
    'run',
    'tests/unit/share/backfill-share-tokens.test.ts',
    '--reporter=basic'
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env,
    shell: true
  }
);

process.exit(result.status ?? 1);
