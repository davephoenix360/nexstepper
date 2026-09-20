/**
 * `usePlanFromProps(plan)` — client-side plan hint, intentionally trivial.
 *
 * The server is the trust boundary: `requirePro()` reads the
 * `subscriptions` row directly. This hook exists purely so client
 * components can show/hide Pro-only affordances (e.g. the inline-
 * issue surface's "Rewrite with AI" CTA) without an extra round
 * trip and without a client-side fetch race.
 *
 * The pattern is:
 *
 *   1. A Server Component parent calls `getSubscription()` and
 *      renders a Client Component with `plan={sub.plan}`.
 *   2. The Client Component calls `usePlanFromProps(plan)` to get
 *      a typed `'free' | 'pro'` discriminator.
 *   3. The discriminator drives conditional rendering.
 *
 * No fetch. No race. No loading state.
 *
 * ADR: `docs/decisions/0007-tier-gating.md`.
 */

import type { PlanId } from './types';

export function usePlanFromProps(plan: PlanId): PlanId {
  return plan;
}

export function useIsPro(plan: PlanId): boolean {
  return plan === 'pro';
}
