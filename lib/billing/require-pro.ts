/**
 * `requirePro()` — server-authoritative gate for Pro-only features.
 *
 * Throws `ProRequiredError` (a typed discriminated error with `code
 * === 'pro_required'`) if the current user is not on an effective
 * Pro plan. Returns `void` on success. Designed to be called at the
 * top of a Server Action: the action catches the typed error and
 * returns `{ ok: false, error: 'Pro required' }` to the client.
 *
 * Why server-authoritative: the client-side `usePlanFromProps()`
 * hint is bypassable. The canonical gate must read the source of
 * truth (the `subscriptions` row) directly. A Free user who
 * manipulates the client to invoke a Pro-gated action still gets
 * blocked here.
 *
 * ADR: `docs/decisions/0007-tier-gating.md`.
 *
 * Example usage in a Server Action:
 *
 * ```ts
 * export async function enrichBulletAction(input: unknown) {
 *   try {
 *     await requirePro();
 *   } catch (err) {
 *     if (err instanceof ProRequiredError) {
 *       return { ok: false, error: 'Pro required' } as const;
 *     }
 *     throw err;
 *   }
 *   // ... actual work ...
 * }
 * ```
 */

import 'server-only';

import { getSubscription } from '@/lib/db/queries';
import {
  ProRequiredError,
  asPlanId,
  asPlanStatus,
  isProEffective
} from './types';

/**
 * Throws `ProRequiredError` if the current user is not Pro-effective.
 * Returns the user's subscription row on success — most callers don't
 * need it, but exposing it costs nothing and saves a second DB read
 * for callers that do.
 */
export async function requirePro() {
  const sub = await getSubscription();
  if (!isProEffective(sub)) {
    throw new ProRequiredError(
      asPlanId(sub.plan),
      asPlanStatus(sub.status)
    );
  }
  return sub;
}
