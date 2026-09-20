/**
 * Shared billing types — single source of truth for plan / status
 * identifiers and the Pro gate predicate.
 *
 * The `plan` and `status` columns on the `subscriptions` table are
 * `text` (not Postgres enums) so we can add new plan tiers and
 * statuses without a migration; the literal-string unions here are
 * the TypeScript-side contract that keeps the surface type-safe.
 */

import type { Subscription } from '@/lib/db/schema';

/** A subscription-shaped value with `plan` and `status` as strings. */
type SubscriptionLike = Pick<Subscription, 'plan' | 'status'>;

/** Plan identifiers — must match `subscriptions.plan` values. */
export type PlanId = 'free' | 'pro';

/** Narrow a `string` plan value to a `PlanId`. */
export function asPlanId(value: string): PlanId {
  return value === 'pro' ? 'pro' : 'free';
}

/** Narrow a `string` status value to a `PlanStatus`. */
export function asPlanStatus(value: string): PlanStatus {
  switch (value) {
    case 'active':
    case 'trialing':
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'past_due':
    case 'unpaid':
    case 'paused':
    case 'inactive':
      return value;
    default:
      return 'inactive';
  }
}

/**
 * Stripe subscription status values we mirror locally. The
 * `handleSubscriptionChange` helper in `lib/payments/stripe.ts`
 * treats `active` and `trialing` as Pro-effective; everything else
 * demotes to Free. We mirror Stripe's vocabulary so debugging is
 * one search away.
 *
 * See ADR `docs/decisions/0007-tier-gating.md` for the rationale
 * on which statuses are Pro-effective.
 */
export type PlanStatus =
  | 'active'
  | 'trialing'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'unpaid'
  | 'paused'
  | 'inactive';

export const PRO_EFFECTIVE_STATUSES: readonly PlanStatus[] = [
  'active',
  'trialing'
] as const;

/**
 * The canonical "is this user currently Pro?" predicate.
 *
 * Used by both `requirePro()` (server) and the Billing card UI.
 * Pure / sync — no IO. Stripe's webhook handler keeps the local
 * `status` field in sync with Stripe's view; once that view says
 * `active` or `trialing`, the user is Pro-effective here.
 *
 * Edge cases handled:
 *
 * - **Canceled-but-in-period:** Stripe keeps `status: 'active'`
 *   (or `trialing`) until `currentPeriodEnd`. We trust Stripe's
 *   status; if Stripe says `active`, the user is Pro until they
 *   say otherwise. We don't double-gate on `currentPeriodEnd`.
 *
 * - **Past-due / unpaid:** Stripe sets these statuses when payment
 *   fails. We demote to Free immediately so the user is nudged
 *   back to billing.
 *
 * - **`inactive`:** the auto-created default row when a user has
 *   never subscribed. Treated as Free.
 *
 * - **`incomplete` / `incomplete_expired` / `paused`:** treated as
 *   Free. The user never finished checkout or paused voluntarily.
 */
export function isProEffective(sub: SubscriptionLike): boolean {
  if (sub.plan !== 'pro') return false;
  return (PRO_EFFECTIVE_STATUSES as readonly string[]).includes(sub.status);
}

/**
 * Human-readable label for the status. Used by the Billing card.
 */
export function statusLabel(status: PlanStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Trialing';
    case 'canceled':
      return 'Canceled';
    case 'incomplete':
      return 'Incomplete';
    case 'incomplete_expired':
      return 'Expired';
    case 'past_due':
      return 'Past due';
    case 'unpaid':
      return 'Unpaid';
    case 'paused':
      return 'Paused';
    case 'inactive':
      return 'Inactive';
  }
}

/**
 * Typed error thrown by `requirePro()` when the caller is not on
 * an effective Pro plan. Server actions catch this and return
 * `{ ok: false, error: 'Pro required' }` to the client; the
 * `code` discriminator makes the catch site explicit.
 */
export class ProRequiredError extends Error {
  readonly code = 'pro_required' as const;
  readonly plan: PlanId;
  readonly status: PlanStatus;

  constructor(plan: PlanId, status: PlanStatus) {
    super(`Pro required (current plan: ${plan}, status: ${status})`);
    this.name = 'ProRequiredError';
    this.plan = plan;
    this.status = status;
  }
}

/**
 * Props for the Billing card Server Component. Kept narrow so the
 * Server Component does all the DB work and passes plain serializable
 * data to whatever nested client components render the CTAs.
 */
export interface BillingCardProps {
  plan: PlanId;
  status: PlanStatus;
  /** `null` for Free users and canceled-before-period-end users. */
  currentPeriodEnd: string | null;
}
