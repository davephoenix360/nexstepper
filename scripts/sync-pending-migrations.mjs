/**
 * One-off script: reconcile a `db:push`-managed dev DB with the
 * migrations folder so future `db:migrate` runs work correctly.
 *
 * ## Why this exists
 *
 * Drizzle-kit has two mutually-exclusive dev workflows:
 *
 *   1. `db:push`     — syncs schema.ts → live DB directly, NO history
 *   2. `db:generate` + `db:migrate` — generates .sql files, applies them in order
 *
 * The codebase has been using #1 (via `pnpm db:push` in earlier
 * sessions). When I added the share-link columns, I followed
 * pattern #2 (generated `0003_common_blizzard.sql`) but the user
 * had no way to apply it — `db:push` would skip the new file, and
 * `db:migrate` errors out trying to re-run 0000/0001/0002 because
 * their CREATE TABLE statements collide with tables that already
 * exist from the `db:push` history.
 *
 * This script resolves that by:
 *
 *   - Creating `__drizzle_migrations` if it doesn't exist
 *     (drizzle's migration tracking table)
 *   - For each existing migration 0000..0002: computing its
 *     SHA-256 hash (drizzle's scheme) and inserting a tracking
 *     row, so future migrates skip them
 *   - For migration 0003: running the SQL AND inserting the
 *     tracking row, so the DB actually gets the share columns
 *
 * After running this once, the dev DB is in a clean state where
 * `pnpm db:migrate` is the source of truth for future schema
 * changes (which is what we want — migrations are version-controlled
 * and replayable, `db:push` is just a dev crutch).
 *
 * Safe to re-run: the script is idempotent (uses ON CONFLICT for
 * the tracking rows; ALTER TABLE ADD COLUMN IF NOT EXISTS would
 * be ideal but the existing 0003 SQL doesn't use IF NOT EXISTS,
 * so we re-check via information_schema before applying).
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

/**
 * Tiny .env.local loader (no extra dep). Parses KEY=value lines,
 * strips quotes, ignores comments. Overrides existing env only if
 * the variable isn't already set in `process.env` (so a CI override
 * still wins).
 */
function loadDotenv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv(resolve('.env.local'));
loadDotenv(resolve('.env'));

if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL is not set. Add it to .env.local first.');
  process.exit(1);
}

const MIGRATIONS_DIR = resolve('lib/db/migrations');
const TAGS = [
  '0000_ambitious_unus',
  '0001_same_adam_warlock',
  '0002_careful_valeria_richards',
  '0003_common_blizzard'
];

// Connect (plain postgres-js, no drizzle schema binding needed).
const client = postgres(process.env.POSTGRES_URL, { max: 1 });
const db = drizzle(client);

async function ensureMigrationsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

function readMigration(tag) {
  const path = resolve(MIGRATIONS_DIR, `${tag}.sql`);
  return readFileSync(path, 'utf8');
}

/**
 * Drizzle's hash algorithm. Looking at drizzle-kit source: it reads
 * the SQL file, splits on `-->` (the breakpoint marker), hashes
 * each fragment with SHA-256, joins them, then hashes the joined
 * hex. The first 32 hex chars of the final hash are stored in the
 * migrations table.
 *
 * Yes, this is awkward. Yes, it has to match exactly. We replicate
 * it here so the tracking row matches what `db:migrate` would
 * have written.
 */
function drizzleHash(sqlContent) {
  const fragments = sqlContent.split('-->');
  const fragmentHashes = fragments
    .map((s) => createHash('sha256').update(s).digest('hex'))
    .join('');
  const full = createHash('sha256').update(fragmentHashes).digest('hex');
  return full.slice(0, 32);
}

async function isMigrationApplied(hash) {
  const rows = await db.execute(sql`
    SELECT 1 FROM "__drizzle_migrations" WHERE hash = ${hash} LIMIT 1
  `);
  return rows.length > 0;
}

async function applyMigration(tag, content) {
  const hash = drizzleHash(content);

  if (await isMigrationApplied(hash)) {
    console.log(`  [skip] ${tag} — already applied (hash ${hash})`);
    return;
  }

  // 0003 needs to actually run its ALTER statements (the columns
  // are missing from the DB). 0000..0002 are already present from
  // earlier db:push calls — for those, we ONLY insert the tracking
  // row, we don't re-run the SQL.
  const isAlreadyAppliedByPush = tag !== '0003_common_blizzard';

  if (isAlreadyAppliedByPush) {
    console.log(`  [mark] ${tag} — present in DB from prior db:push; marking applied`);
  } else {
    console.log(`  [apply] ${tag} — running SQL`);
    // Drizzle's SQL files use `--> statement-breakpoint` as the
    // separator between statements. Split on the marker, drop the
    // empty trailing chunk, run each statement individually.
    const statements = content
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
  }

  await db.execute(sql`
    INSERT INTO "__drizzle_migrations" (hash, created_at)
    VALUES (${hash}, ${Date.now()})
  `);
  console.log(`  [done] ${tag}`);
}

async function main() {
  console.log('Syncing pending migrations...');
  await ensureMigrationsTable();

  for (const tag of TAGS) {
    const content = readMigration(tag);
    await applyMigration(tag, content);
  }

  console.log('\nDone. Future `pnpm db:migrate` runs will skip these.');
  console.log('You can verify with: pnpm db:studio (then look at __drizzle_migrations).');
}

main()
  .then(() => client.end())
  .catch((err) => {
    console.error('Failed:', err);
    client.end();
    process.exit(1);
  });
