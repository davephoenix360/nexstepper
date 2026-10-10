# 2026-10-10 — Stripe live account activated; Pro not yet enabled

## Context

Stripe live mode is now activated and verified. The Pro subscription
has not yet been created in Stripe Dashboard, so
`STRIPE_PRICE_ID_PRO` is not yet set and the Pro CTAs across the app
remain in the soft-launch waitlist state.

## What changed

| Item | Before | After |
|---|---|---|
| Stripe live mode | NOT live — soft-launch-gated | **Live, verified** |
| Pro subscription | N/A — not yet enabled | **Not yet enabled** — pending Pro product + Price creation in Stripe Dashboard |

## What this means operationally

- The Stripe **webhook endpoint** (`https://www.nexstepper.com/api/stripe/webhook`) can now be registered in the Stripe Dashboard live environment.
- The **Pro product and Price** need to be created in Stripe Dashboard (live mode) — same steps as `docs/setup/stripe.md` §2.2.
- Once `STRIPE_PRICE_ID_PRO` is set in Vercel, run the restore plan
  in `docs/drift/2026-09-27-soft-launch-pro-gating.md` to flip the
  Pro CTAs from waitlist to live checkout.

## Files updated

- `AGENTS.md` — "Now (in flight)" + "Next (queued)" sections
- `docs/setup/production.md` — CURRENT STATE table
- `docs/drift/2026-10-08-production-is-live.md` — Stripe status line

## Standing

**Pro subscription enablement is a product decision, not a leftover
chore.** The waitlist CTAs are still collecting demand. When you're
ready to enable Pro, the restore plan in `docs/drift/2026-09-27-soft-launch-pro-gating.md`
is the single source of truth.
