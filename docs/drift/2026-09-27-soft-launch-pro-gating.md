# 2026-09-27 — Soft-launch Pro gating

## Context

We shipped the launch-readiness batch through `bdb3e6d` and
the site is now Stripe-review-safe. **But Stripe live-mode
activation requires a deployed business website.** Without
activation, we can't actually accept payments — yet Pro is wired
into the codebase (auth, schema, the server-authoritative
`requirePro()` gate, the chat usage limits, etc.) and previously
exposed "Upgrade to Pro" CTAs across the app.

To ship the web app for real users **before** Pro is sellable
(because Stripe activation takes 1-2 days of business
verification), every "Upgrade to Pro" surface was rewritten
to a single, transparent "Pro is launching soon — get notified"
call-to-action. Users can leave their email; we collect demand
in the inbox while Stripe verifies the account.

## What shipped

| Surface | Before | Now |
|---|---|---|
| Landing page hero (`/`) | Live Upgrade CTAs | "Pricing — Pro launching soon" link |
| `/pricing` | Live CheckoutButton | Mailto waitlist CTA |
| `/dashboard/general` BillingCard (Free) | "Upgrade to Pro" button | `ProLaunchingSoonBadge` (mailto) |
| `/dashboard/general` BillingCard (canceled-Pro) | "Upgrade to Pro" button | `ProLaunchingSoonBadge` (mailto) |
| `/dashboard/general` BillingCard (active Pro) | Manage billing → Stripe portal | **Unchanged** (kept for any beta/grandfathered user) |
| `/dashboard/*` (every page) | No banner | Free users see top banner: "Pro is launching soon — get notified when it ships." |
| Chat (Free) | 20 messages/day limit | **Unchanged** (`isPro` prop already gates correctly) |
| Bullet "Enrich with AI" action | Server `requirePro()` throws `ProRequiredError` | **Unchanged** (server-authoritative gate kept for defense in depth) |

## New shared component

`components/billing/pro-launching-soon-cta.tsx` — single source
of truth for the waitlist pattern. Two variants:

- `<ProLaunchingSoonBadge />` — card-sized button. Replaces
  `<UpgradeButton />` in BillingCard for Free users.
- `<ProLaunchingSoonBanner />` — thin top-of-page banner. Renders
  above all dashboard pages for Free users.

Both link to the same mailto (`hi@nexstepper.com?subject=Pro%20waitlist`)
so user replies land in a single thread in your inbox.

## Files changed

- **New**: `components/billing/pro-launching-soon-cta.tsx`,
  `app/(dashboard)/_components/dashboard-shell.tsx`
- **Changed**: `app/(dashboard)/layout.tsx` (now a Server
  Component that reads `getSubscription()` + passes `plan` to
  the client shell), `app/(dashboard)/dashboard/general/_components/billing-card.tsx`
  (swaps `UpgradeButton` for `ProLaunchingSoonBadge`)
- **Deleted**: `app/(dashboard)/dashboard/general/_components/upgrade-button.tsx`
  (moved to `.trash/upgrade-button-soft-launch` per local-safety
  policy; `Remove-Item` is blocked)
- **Tests**: 2 assertions in
  `tests/unit/billing/billing-card-view.test.tsx` flipped from
  `data-testid="upgrade-button"` to `data-testid="pro-launching-soon-badge"`.

## Restore plan when Pro goes live

When Stripe live-mode is activated + the Pro product is recreated
in live mode + `STRIPE_PRICE_ID_PRO` is set in Infisical:

1. `git restore app/(dashboard)/dashboard/general/_components/upgrade-button.tsx`
   (from `.trash/upgrade-button-soft-launch`)
2. Re-import `UpgradeButton` in `billing-card.tsx`, drop the
   `ProLaunchingSoonBadge` import
3. In `app/(dashboard)/_components/dashboard-shell.tsx`, drop
   the `{plan === 'free' ? <ProLaunchingSoonBanner /> : null}`
   conditional
4. In `app/(marketing)/pricing/page.tsx`, restore
   `priceId: PRICE_IDS.pro` (was hardcoded to `null` in `72b871b`)
   and revert the closing brand-voice line
5. In `components/marketing/hero.tsx`, restore the
   "Pricing — Pro launching soon" link text to "or see pricing"
   (was changed in `282faba`)
6. Update the 2 test assertions in
   `tests/unit/billing/billing-card-view.test.tsx` back to
   `data-testid="upgrade-button"`

The codebase has a single, clean restore path. No schema changes,
no env var additions, no auth boundary changes — just swap the
gates back on.

## Why not just hide Pro entirely?

Two reasons we kept the badges + banners instead of just
deleting all mention of Pro:

1. **Demand signal.** Users who click "get notified" leave a
   traceable email; we can sort + count them when Pro ships to
   estimate launch-day demand.
2. **Honest framing.** Hiding Pro entirely would make it look
   like we don't have a plan for paid tiers. The "launching
   soon" framing sets the right expectation.

## Why not skip the chat usage limit too?

The chat Free tier (20 messages/day, enforced via
`components/chat/chat-bubble.tsx:29`) is a product feature
unrelated to billing — Free users genuinely get 20 messages per
day. Pro users get unlimited. This is the same model after Pro
ships; we just don't have paid users yet to give unlimited to.

## Stats

- Typecheck clean
- 970/970 tests pass (the 2 fixed tests were stale assertions,
  not new coverage)
- No DB or schema touches
- Commits:
  - `bdb3e6d` feat(dashboard): hide Pro upgrade paths during soft launch
  - `282faba` fix(marketing): honest hero copy + transparent pricing link
  - `72b871b` fix(marketing): gate Pro checkout on /pricing during soft launch
  - `3d01397` fix(marketing): replace faked Sarah Chen preview + gate Pro as coming soon