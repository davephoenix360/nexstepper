/**
 * Side-effect module: loads environment variables for standalone scripts.
 *
 * Import this FIRST, before anything that captures `process.env` at module
 * load time — `lib/db/drizzle.ts` reads `POSTGRES_URL` the moment it is
 * evaluated, so the env has to be in place before that import runs. ES
 * modules evaluate in import order, so `import './load-env'` above the
 * other imports does the job.
 *
 * Precedence matches Next.js: `.env.local` wins over `.env`, because dotenv
 * does not overwrite a variable that is already set and `.env.local` is
 * loaded first.
 *
 * `.env.production.local` is deliberately NOT loaded. It points at the live
 * database, and a local script has no business writing there. The seeder
 * additionally refuses to run if the resolved host matches production's.
 */

import { config } from 'dotenv';
import path from 'node:path';

const root = process.cwd();

config({ path: path.resolve(root, '.env.local') });
config({ path: path.resolve(root, '.env') });
