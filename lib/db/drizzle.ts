import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.POSTGRES_URL;
if (!url) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

/**
 * Drizzle instance.
 *
 * We use `postgres-js` for both local dev and prod. It talks the standard
 * Postgres wire protocol, so a Neon connection URL works without a separate
 * Neon serverless driver. The neon-serverless driver is meaningfully better
 * only for edge-runtime functions (faster cold start, HTTP-based queries)
 * — when we need that, we'll add a second `db` exported from this file
 * (e.g. `dbEdge`) rather than conditionally switching one driver for another
 * (which fragments the type system and breaks downstream query typings).
 */
const client = postgres(url, {
  // Recommended for serverless deployments. Locally these are no-ops.
  prepare: false
});

export const db = drizzle(client, { schema });
export { schema };