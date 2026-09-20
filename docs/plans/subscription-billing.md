# Subscription / Billing — Completion Plan

## Objective

Close the gaps in Nextep's Stripe subscription infrastructure so the
product can convert free users to Pro and gate Pro-only features
(starting with the inline-issue surface). The lower plumbing — Stripe
client, checkout, webhook, `subscriptions` table, pricing page, `PLANS`
schema constants — already exists and is correct. What is missing is
the auth/billing boundary layer that every gated feature will share:
`requirePro()` on the server, `useUserPlan()` on the client, a billing
entry point in the dashboard, and an ADR documenting the tier-gating
approach.

## User-visible behavior

### Today (before this plan)
- A signed-in user can visit `/pricing` and see Free + Pro cards. Pro
  CTA fires `checkoutAction` → Stripe Checkout → webhook updates the
  `subscriptions` row → user lands on `/dashboard`.
- There is no in-product entry point for billing (no "Manage billing"
  link, no upgrade CTA in the dashboard, no Pro gating anywhere).
- The inline-issue surface plan calls `requirePro()` at the server
  boundary — that helper does not exist yet.

### After this plan ships
- A new **Billing** card appears in `/dashboard/general` (Account
  settings). It shows the user's current plan, status (Active /
  Trialing / Past due / Canceled), and next renewal date.
- A **"Manage billing"** button on that card calls the existing
  `customerPortalAction` → Stripe Billing Portal (cancel, update card,
  download invoices).
- An **"Upgrade to Pro"** button appears on the same card for Free
  users; it routes to `/pricing` with the existing checkout flow.
- The inline-issue surface's `enrichBulletAction` can call
  `requirePro()` at the top of the action. Free users who manipulate
  the client to invoke the action get `{ ok: false, error: 'Pro
  required' }` from the server.

## What's already built (verified this session)

| Component | Path | Status |
|---|---|---|
| `subscriptions` table | `lib/db/schema.ts:72-90` | ✅ One row per user; plan + Stripe IDs + status + period end |
| `PLANS` constants | `lib/db/schema.ts:104-119` | ✅ `free` (20 msg/day, no Optimize, no collab) / `pro` (unlimited, all features) |
| Stripe client | `lib/payments/stripe.ts:1-15` | ✅ `apiVersion: '2025-04-30.basil'` |
| Checkout session | `lib/payments/stripe.ts:31-58` | ✅ 7-day trial, promotion codes, customer reuse |
| Customer portal session | `lib/payments/stripe.ts:60-72` | ✅ |
| Webhook handler | `app/api/stripe/webhook/route.ts` | ✅ Signature verification, 3 subscription event types |
| Checkout success redirect | `app/api/stripe/checkout/route.ts` | ✅ Attaches Stripe customer ID to local row |
| Pricing page | `app/(marketing)/pricing/page.tsx` | ✅ Free + Pro cards, current-plan highlight, CheckoutButton |
| `getSubscription` query | `lib/db/queries.ts:53-89` | ✅ Auto-creates free row on first call |
| `upsertSubscription` | `lib/db/queries.ts:115-126` | ✅ On-conflict update by userId |
| `.env.example` Stripe vars | `.env.example:16-21` | ✅ Secret key, webhook secret, price IDs |

## What's missing (must-have — this plan)

1. **`requirePro()` server helper** — `lib/billing/require-pro.ts`.
   Reads `getSubscription()`, throws a typed `ProRequiredError` if
   `plan !== 'pro'` OR `status` is not `active`/`trialing`. Returns
   the subscription on success. Used by `enrichBulletAction` and any
   future Pro-gated feature.
2. **`useUserPlan()` client hook** — `lib/billing/use-user-plan.tsx`.
   Reads from the current subscription (passed via props from a Server
   Component parent or fetched via a Server Action). Returns
   `'free' | 'pro'`. Used by `ScorecardClient` to show/hide the
   "Rewrite with AI" CTA.
3. **Billing card on `/dashboard/general`** — surfaces current plan,
   status, next renewal, and the two CTAs (Manage billing / Upgrade).
4. **Shared billing types** — `lib/billing/types.ts` for `PlanId`,
   `PlanStatus`, `BillingCardProps`. Single source of truth.
5. **ADR for tier-gating approach** —
   `docs/decisions/0007-tier-gating.md`. Documents the auth/billing
   boundary, when to use `requirePro()` vs `useUserPlan()`, edge cases
   (canceled, past_due, trialing), and why the gate is server-authoritative.

## What's missing (nice-to-have, deferred)

- **Free-tier quota enforcement** for the AI chat assistant — needs a
  `usage` table. Defer to the AI chat assistant plan.
- **Stripe product/price seeding script** — operational; can be done
  once via the Stripe Dashboard. Not blocking dev.
- **Local webhook dev setup docs** — operational; document via Stripe
  CLI in a follow-up.
- **Past-due UI state** — handle when first user hits it (probably
  show a "Payment failed — update billing" banner on `/dashboard`).

## Architecture

```
                       ┌─────────────────────────────┐
                       │  subscriptions table         │
                       │  (already exists)            │
                       └──────────────┬───────────────┘
                                      │
                       ┌──────────────┴───────────────┐
                       │  getSubscription()            │
                       │  (already exists)             │
                       └──────────────┬───────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
        ┌───────▼────────┐   ┌────────▼─────────┐   ┌──────▼────────────┐
        │  requirePro()  │   │  useUserPlan()   │   │  BillingCard      │
        │  (server)      │   │  (client hook)   │   │  (settings UI)    │
        │  throws on     │   │  reads via props │   │  shows current    │
        │  non-Pro       │   │  or Server Action│   │  plan + CTAs      │
        └───────┬────────┘   └────────┬─────────┘   └──────┬────────────┘
                │                     │                     │
                ▼                     ▼                     ▼
        enrichBulletAction      ScorecardClient       /dashboard/general
        (and future gates)      "Rewrite with AI"     (new Billing card)
```

### Key design choices

1. **`requirePro()` is server-authoritative.** It reads the
   `subscriptions` row directly (the source of truth). Client-side
   `useUserPlan()` is **only** for UI hiding/showing; a Free user who
   bypasses the client still gets blocked at the action boundary.
   This is the same pattern the inline-issue surface ADR locks in.
2. **The hook reads via the parent's props, not a Server Action.**
   The Server Component parent (e.g. `ScorecardClient`'s Server
   wrapper) calls `getSubscription()` and passes `plan` down. The
   client hook is `usePlanFromProps(plan: PlanId)`. This avoids the
   client-side race condition where the hook hasn't resolved but the
   user has already clicked.
3. **`ProRequiredError` is a typed discriminated union.** Same shape
   as `ActionResult<T>` but specifically for the billing gate. Server
   actions catch and return `{ ok: false, error: 'Pro required' }`.
   No raw `try/catch` on the action side.
4. **The Billing card lives in `/dashboard/general`.** That's the
   existing account settings page. No new top-level nav route. Keep
   the surface small.

## Files

### New

- `lib/billing/require-pro.ts` — server helper; reads subscription,
  throws typed error on non-Pro.
- `lib/billing/use-user-plan.ts` — `usePlanFromProps(plan)` hook.
- `lib/billing/types.ts` — `PlanId`, `PlanStatus`, `ProRequiredError`,
  `BillingCardProps`.
- `lib/billing/index.ts` — re-exports.
- `docs/decisions/0007-tier-gating.md` — ADR.

### Changed

- `app/(dashboard)/dashboard/general/page.tsx` — add the Billing card.
  Server Component wrapper splits: profile stays client; billing card
  is a Server Component that calls `getSubscription()`.
- `app/(dashboard)/dashboard/general/_components/billing-card.tsx`
  (new) — renders plan, status, period end, and the two CTAs.
- `app/(dashboard)/dashboard/general/_components/manage-billing-button.tsx`
  (new) — calls `customerPortalAction`.
- `app/(dashboard)/dashboard/general/_components/upgrade-button.tsx`
  (new) — links to `/pricing`.
- AGENTS.md — roadmap update (this plan moves to "Next" or stays on
  the inline-issue implementation entry).

### Tests

- `tests/unit/billing/require-pro.test.ts` — active Pro passes,
  trialing Pro passes, canceled throws, free throws, past-due throws,
  missing row throws.
- `tests/unit/billing/use-user-plan.test.tsx` — returns `'free'`
  when prop is `'free'`, returns `'pro'` when prop is `'pro'`.
- Integration: `tests/integration/billing/billing-card.test.tsx` —
  Free user sees Upgrade button; Pro user sees Manage billing.

## DB / schema

- No migrations. `subscriptions` table already has the right shape.

## Dependencies

- **npm packages:** none new. Everything we need is in the lockfile.
- **External services:** Stripe (already configured). No new keys.
- **Env keys:** none new.

## AI model

- **N/A.** This plan ships no AI features. Reuses the existing
  infrastructure.

## Risks

1. **Race condition between webhook and page load.** A user finishes
   Stripe Checkout, gets bounced to `/dashboard`, but the webhook
   hasn't fired yet → `requirePro()` returns Free → user thinks the
   upgrade failed. **Mitigation:** the checkout success route in
   `app/api/stripe/checkout/route.ts` already calls
   `attachStripeCustomer`. We can extend that route to call
   `handleSubscriptionChange` directly (synchronous) before
   redirecting, so the local row is in sync by the time the user
   lands on `/dashboard`. Document this in the ADR.
2. **`trialing` users should be treated as Pro.** Today a 7-day
   trial user is functionally Pro (they have access to Pro features)
   but the `status` column is `'trialing'`, not `'active'`. The
   `requirePro()` helper must accept both. **Mitigation:** `requirePro()`
   checks `plan === 'pro' && ['active', 'trialing'].includes(status)`.
3. **Canceled but still in period.** A user cancels but keeps Pro
   until `currentPeriodEnd`. Today `handleSubscriptionChange` sets
   `plan: 'free'` and `status: 'canceled'` immediately on
   `subscription.deleted`. Stripe's actual semantics: the subscription
   row stays `active` (or `canceled` after period end), but the user
   should retain Pro until `currentPeriodEnd`. **Mitigation:** the
   webhook handler reads the full subscription object; we trust
   Stripe's `status` field and only demote to Free when `status` is
   one of `'canceled' | 'unpaid' | 'incomplete_expired'`. A user who
   cancels mid-period keeps `status: 'active'` and `plan: 'pro'`
   locally until Stripe sends the period-end event. Document this in
   the ADR.

## Acceptance criteria

- [ ] `requirePro()` returns `void` for `plan='pro'` AND
      `status` ∈ `{'active', 'trialing'}`.
- [ ] `requirePro()` throws `ProRequiredError` for any other
      combination.
- [ ] `ProRequiredError` is a typed discriminated union.
- [ ] `usePlanFromProps(plan)` returns `'free' | 'pro'` from the
      prop value.
- [ ] `/dashboard/general` shows a Billing card with: current plan
      name, status (Active / Trialing / Past due / Canceled /
      Inactive), next renewal date.
- [ ] Free users see an "Upgrade to Pro" button on the Billing card
      that links to `/pricing`.
- [ ] Pro users see a "Manage billing" button on the Billing card
      that opens the Stripe Billing Portal via `customerPortalAction`.
- [ ] `customerPortalAction` is unchanged (already exists); only the
      UI entry point is new.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` green (existing 766+ tests + 4 new unit tests + 1
      new integration test).
- [ ] Manual smoke-test on dev: visit `/dashboard/general` as a Free
      user, see the Billing card with "Free" + "Upgrade to Pro".
      Upgrade via Stripe Checkout test mode, land on `/dashboard`,
      return to `/dashboard/general`, see "Pro" + "Manage billing".

## Test plan

- **Unit:**
  - `tests/unit/billing/require-pro.test.ts` — covers all 5 status
    values × 2 plan values × 2 user states (authenticated /
    unauthenticated).
  - `tests/unit/billing/use-user-plan.test.tsx` — render hook with
    mocked props, assert return value.
- **Integration:**
  - `tests/integration/billing/billing-card.test.tsx` — Free user
    sees Upgrade button; Pro user sees Manage billing button; the
    buttons route correctly.
- **Manual smoke:**
  - Dev server, Stripe test keys, dev subscription row.
  - As Free: visit `/dashboard/general`, see Billing card.
  - Click Upgrade → checkout → test card → land on dashboard.
  - Visit `/dashboard/general` again → see Pro + Manage billing.
  - Click Manage billing → Stripe portal opens in new tab.

## Rollback plan

- All new code lives under `lib/billing/` and
  `app/(dashboard)/dashboard/general/_components/billing-card*`.
- The Billing card addition to `general/page.tsx` is additive (a new
  Card before/after the existing Profile card).
- `requirePro()` and `usePlanFromProps()` are new helpers; nothing
  calls them yet outside the inline-issue surface plan's spec.
- If the Billing card UX fails: remove the Billing card import from
  `general/page.tsx`. No other code path depends on it.
- If `requirePro()` misbehaves: any caller can be temporarily
  converted to a no-op (return void unconditionally) — the inline-
  issue surface hasn't shipped yet, so no production impact.

## Open questions for the founder

1. **Trial UX.** Should the pricing page mention "7-day free trial"
   explicitly? It does today (in the Pro CTA). Confirm this stays in
   v1.
2. **Webhook timeout fallback.** If Stripe's webhook is delayed (>5s)
   and the user has already landed on `/dashboard`, should we show a
   "Setting up your subscription…" polling state, or just let them
   refresh? Recommend: refresh; no polling UI in v1.
3. **`currentPeriodEnd` formatting.** Server-rendered ISO timestamp
   vs client-side `Intl.DateTimeFormat`? Server-rendered is simpler
   and SSR-friendly.
4. **Canceled-but-in-period.** A user who cancels mid-period keeps
   Pro until `currentPeriodEnd`. The UI should show "Pro — ends on
   <date>". Confirm.

## ADR

`docs/decisions/0007-tier-gating.md` covers: (a) why `requirePro()`
and `usePlanFromProps()` instead of a single unified helper, (b) why
the gate is server-authoritative and the hook is cosmetic, (c) how
trial and canceled-but-in-period are handled, (d) why the Billing
card lives in `/dashboard/general` and not a new top-level nav
route, (e) why no new npm packages.