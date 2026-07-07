import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool as NeonPool } from '@neondatabase/serverless';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.POSTGRES_URL;
if (!url) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

/**
 * Driver selection:
 * - Neon in prod (serverless, works in Node + Edge runtime via WebSocket pool)
 * - postgres-js locally for fastest hot-reload
 *
 * Auto-detected by hostname; override with DATABASE_DRIVER=neon|postgres.
 */
function pickDriver(): 'neon' | 'postgres' {
  const explicit = process.env.DATABASE_DRIVER?.toLowerCase();
  if (explicit === 'neon' || explicit === 'postgres') return explicit;
  try {
    const host = new URL(url!).hostname;
    if (host.endsWith('.neon.tech') || host.endsWith('.neon.build')) return 'neon';
  } catch {
    // fall through
  }
  return 'postgres';
}

const driver = pickDriver();

function makeDb() {
  if (driver === 'neon') {
    const pool = new NeonPool({ connectionString: url! });
    return drizzleNeon(pool, { schema });
  }
  const client = postgres(url!);
  return drizzlePostgres(client, { schema });
}

export const db = makeDb();
export { schema };