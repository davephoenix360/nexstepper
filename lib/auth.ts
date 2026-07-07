import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/lib/db/drizzle';
import * as schema from '@/lib/db/schema';

/**
 * Better Auth server instance.
 *
 * Phase 0 setup: email + password only. OAuth providers and magic links
 * can be added in a follow-up commit (the API contract is the same).
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification
    }
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 100
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5 // 5 minutes — keeps server reads low
    }
  },
  user: {
    additionalFields: {}
  },
  advanced: {
    cookiePrefix: 'nextep'
  },
  plugins: [nextCookies()]
});

export type Auth = typeof auth;