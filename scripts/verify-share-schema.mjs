import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Tiny .env.local loader so this works with `node scripts/...`
function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv(resolve('.env.local'));
loadDotenv(resolve('.env'));

if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL not set');
  process.exit(1);
}

const c = postgres(process.env.POSTGRES_URL);
const cols = await c`SELECT column_name FROM information_schema.columns WHERE table_name = 'resumes' AND column_name LIKE 'share%' ORDER BY column_name`;
console.log('Share columns in resumes:', cols.map((r) => r.column_name));
const idxs = await c`SELECT indexname FROM pg_indexes WHERE tablename = 'resumes' AND indexname LIKE '%share%'`;
console.log('Share indexes:', idxs.map((r) => r.indexname));
const mig = await c`SELECT id, substring(hash, 1, 12) as hash_short, created_at FROM __drizzle_migrations ORDER BY id`;
console.log('Applied migrations:');
for (const row of mig) {
  console.log(`  ${row.id}  hash=${row.hash_short}…  created_at=${row.created_at}`);
}
await c.end();
