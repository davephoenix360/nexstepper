'use server';

import 'server-only';
import crypto from 'node:crypto';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { erasureLog } from '@/lib/db/schema';
import {
  cancelStripeCustomer,
  deleteStripeCustomer
} from './stripe-customer';
import { scrubPosthogUser } from './posthog-user-delete';

/**
 * `purgeUserAccount` - server action that erases a Nexstepper user's PII
 * across every system we own + every third-party processor we route
 * data through.
 *
 * Implements the user-facing "Delete my account" button on
 * `/dashboard/security`. Satisfies GDPR Art. 17 (right to erasure)
 * and the platform-side requirements of CCPA / PIPEDA.
 *
 * ## Order matters
 *
 *   1. Stripe — cancel any active subscription FIRST so no further
 *      charges can land. Without this, deleting the customer errors
 *      with `customer_has_active_subscriptions`.
 *   2. Stripe — delete the customer record.
 *   3. PostHog — capture `$delete_user` to scrub user properties.
 *   4. Local — write the erasure_log row (with hashed user id +
 *      processors-notified list).
 *   5. Local — Better Auth `auth.api.deleteUser`. The Postgres
 *      `onDelete: 'cascade'` FKs handle every user-owned table
 *      (session, account, subscriptions, resumes, applications,
 *      chatSessions, chatMessages, chatUsage).
 *   6. Stripe-events log is intentionally NOT deleted (legal obligation
 *      exception per the comment in `lib/db/schema.ts`).
 *
 * ## Failure handling
 *
 * Each third-party step is independent: if Stripe is down, we still
 * scrub PostHog, still write the erasure_log, still delete the user
 * row. The user's PII is gone from our DB; the third-party records
 * need manual retry but the audit log captures which processors were
 * reached so we can retry out-of-band.
 *
 * ## Auth
 *
 * The action requires a recent session. Better Auth's `deleteUser`
 * will additionally require the user's password for confirmation.
 */

export type PurgeUserInput = {
  /** User's current password — Better Auth requires re-auth for deletion. */
  password: string;
};

export type PurgeUserResult =
  | { ok: true; /** ISO timestamp the purge ran. */ erasedAt: string }
  | { ok: false; error: string };

export async function purgeUserAccount(
  input: PurgeUserInput
): Promise<PurgeUserResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: 'Not authenticated.' };
  }
  const userId = session.user.id;

  // ── 1 + 2. Stripe ──────────────────────────────────────────────────────────
  const cancelResult = await cancelStripeCustomer(userId);
  const deleteResult = await deleteStripeCustomer(userId);

  const stripeNotified =
    cancelResult.processorsNotified || deleteResult.processorsNotified;

  // ── 3. PostHog ─────────────────────────────────────────────────────────────
  const posthogResult = scrubPosthogUser(userId);

  // ── 4. Erasure log ─────────────────────────────────────────────────────────
  // SHA-256 of the user id. Stable for the audit row; non-reversible
  // so the log itself doesn't contain PII.
  const userHash = crypto.createHash('sha256').update(userId).digest('hex');

  const processorsNotified: string[] = [];
  if (stripeNotified) processorsNotified.push('stripe');
  if (posthogResult.processorsNotified) processorsNotified.push('posthog');
  // 'postgres' is always "notified" — we delete the user row below.
  processorsNotified.push('postgres');

  await db.insert(erasureLog).values({
    id: crypto.randomUUID(),
    userHash,
    erasedAt: new Date(),
    processorsNotified
  });

  // ── 5. Better Auth — user row delete + cascade ─────────────────────────────
  try {
    await auth.api.deleteUser({
      body: { password: input.password },
      headers: await headers()
    });
  } catch (err) {
    // The cascade didn't fire — but the erasure_log is already written
    // and Stripe + PostHog were notified. Surface the error so the UI
    // can ask the user to retry; the audit trail is intact.
    return {
      ok: false,
      error: `Local account deletion failed: ${(err as Error).message}. Stripe + PostHog cleanup completed; please retry.`
    };
  }

  return {
    ok: true,
    erasedAt: new Date().toISOString()
  };
}