# 0007 — Tier Gating (Auth/Billing Boundary for Pro-Only Features)

## Context

Nextep's Stripe subscription infrastructure is partially built
(`subscriptions` table, checkout, webhook, pricing page, `PLANS`
schema constants). What is missing is the **auth/billing boundary
layer** that every Pro-only feature will share — and the inline-issue
surface plan (`docs/plans/inline-issue-surface.md`) is the first
caller: `enrichBulletAction` needs a server-side gate that throws for
Free users, and `ScorecardClient` needs a client hook to hide the
"Rewrite with AI" CTA from Free users.

Three forces shaped this decision:

1. **The server is the trust boundary.** A client-side check is
   bypassable; the canonical gate must run server-side. The client
   hint is cosmetic only.
2. **The UI must not flicker.** A user on Pro should never see a Pro
   CTA flip to "Upgrade" mid-session. The plan must be available
   synchronously when the component renders.
3. **Stripe's `status` semantics are not "Pro iff status=active".**
   Trials count as Pro. Canceled-but-in-period counts as Pro.
   Past-due does not. `status` must be interpreted in conjunction
   with `currentPeriodEnd` and `plan`.

## Decision

Ship a small, layered set of helpers under `lib/billing/`:

### 1. `requirePro()` — server-authoritative gate

```ts
// lib/billing/require-pro.ts
export class ProRequiredError extends Error {
  readonly code = 'pro_required' as const;
  readonly plan: PlanId;
  readonly status: PlanStatus;
  constructor(plan: PlanId, status: PlanStatus) {
    super(`Pro required (current: ${plan} / ${status})`);
    this.plan = plan;
    this.status = status;
  }
}

export async function requirePro(): Promise<void> {
  const sub = await getSubscription();
  if (!isProEffective(sub)) throw new ProRequiredError(sub.plan, sub.status);
}
```

`isProEffective()` is the canonical predicate:

```ts
export function isProEffective(sub: Subscription): boolean {
  if (sub.plan !== 'pro') return false;
  // 'active' and 'trialing' are both Pro-effective.
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  // Canceled-but-in-period: Stripe sets status back to 'active' until
  // the period end, so we don't need to gate on currentPeriodEnd here.
  // The webhook handler trusts Stripe's status field.
  return true;
}
```

Server actions call `requirePro()` at the top, catch
`ProRequiredError` and return `{ ok: false, error: 'Pro required' }`
to the client. No raw `try/catch`.

### 2. `usePlanFromProps(plan)` — client cosmetic hook

```ts
// lib/billing/use-user-plan.ts
export function usePlanFromProps(plan: PlanId): PlanId {
  return plan;
}
```

That's intentionally a trivial wrapper. The point is that **the
parent Server Component passes the plan as a prop**, not the hook
fetches. The Server Component calls `getSubscription()` and renders
the Client Component with `plan={sub.plan}`. This avoids:

- Client-side fetch race conditions.
- Stale plan data after a webhook fires.
- A separate loading state in every gated component.

### 3. Billing card in `/dashboard/general`

No new top-level nav route. The Billing card is a new Server
Component added to the existing `/dashboard/general` page, which
already houses Account settings. It surfaces:

- Current plan name + status (Active / Trialing / Past due /
  Canceled / Inactive).
- Next renewal date (server-rendered ISO timestamp).
- "Upgrade to Pro" (Free) or "Manage billing" (Pro) CTA.

The Free CTA is a plain `<Link href="/pricing">`. The Pro CTA is a
client component that calls the existing `customerPortalAction`.

### 4. Trial UX stays as today

`createCheckoutSession` already sets `trial_period_days: 7`. The
pricing page CTA says "Start 7-day free trial". No UI changes.

### 5. Webhook → page load race

The checkout success route already attaches the Stripe customer ID
to the local row. We extend that route to also call
`handleSubscriptionChange` synchronously, so by the time the user
lands on `/dashboard`, the row's `plan` is up-to-date. Webhook is
still the source of truth for subsequent events (renewals, payment
failures, cancellations), but the success redirect removes the most
common race.

### 6. No new npm packages

Everything we need is in the lockfile: `stripe`, `zod`, `@/lib/db/queries`,
`@/lib/auth`. The new helpers are ~80 LOC of plain TypeScript.

## Consequences

**Good:**
- The inline-issue surface plan (`enrichBulletAction`) can call
  `requirePro()` without re-discovering the auth/billing boundary.
- Every future Pro-gated feature reuses the same two helpers. No
  copy-paste of `getSubscription()` + plan check + trialing edge case.
- Free users who manipulate the client to invoke a Pro-gated action
  get `{ ok: false, error: 'Pro required' }` from the server. The
  gate is enforced regardless of UI state.
- The Billing card gives the user a self-service entry point —
  critical for users who want to cancel without contacting support.

**Bad:**
- The Billing card adds visible surface to `/dashboard/general`. If
  the design grows (multiple subscription items, billing history,
  invoices), it may need to split into its own route. For v1, single
  card is sufficient.
- `requirePro()` reads the subscription row on every gated action
  call. This is one indexed query per request. Negligible at our
  scale; revisit if we ever gate a hot path.
- The webhook → success-redirect synchronous call adds ~100-300ms to
  the checkout bounce. Users see `/dashboard` slightly later. Worth
  it for the race-free UX.

## Alternatives considered

- **Single `gate()` helper that returns a discriminated union result
  instead of throwing.** Rejected: throws + caught-at-action-boundary
  matches the existing `ActionResult<T>` pattern (`ok: true | false`).
  Throwing keeps the helper composable — `await requirePro()` reads
  as English.
- **Client-side check only (no server gate).** Rejected: trust-boundary
  bug class. Free users can hit the action endpoint directly.
- **Pass `plan` via React Context instead of a prop.** Rejected:
  Context is invisible at the component boundary; a prop makes the
  dependency explicit. The Server Component parent already calls
  `getSubscription()`, so the prop is essentially free.
- **New top-level `/dashboard/billing` route.** Rejected: visible
  surface increase for a feature that's currently small (one card).
  Promote to its own route if Billing grows past two cards.
- **Stripe Tax / multi-currency.** Deferred: not in v1 scope per
  locked non-goals.
- **Annual plan.** Deferred: not in v1 scope per locked non-goals.
  `PLANS.pro` is the only paid tier today.