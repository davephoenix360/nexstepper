# Stripe Setup

One-time setup for Nextep's Stripe integration — both local dev and
production. Read top to bottom; each section builds on the previous
one.

> **TL;DR** — Set 4 env vars (`STRIPE_SECRET_KEY`,
> `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_FREE`, `STRIPE_PRICE_ID_PRO`),
> create one Pro product in Stripe, run `stripe listen` locally.
> That's it for dev. Add a second webhook endpoint in Stripe Dashboard
> when you deploy to Vercel.

---

## 1. Local dev (Stripe test mode)

### 1.1 Get test API keys

1. Sign in to <https://dashboard.stripe.com> with **test mode** toggle
   ON (top-right of the Dashboard).
2. Developers → **API keys** → copy **Secret key**
   (`sk_test_...`). The Publishable key is not used by this app —
   checkout happens server-side via the Stripe Node SDK.

### 1.2 Create the Pro product

1. Products → **Add product**:
   - **Name:** `Nextep Pro`
   - **Description:** (optional)
   - **Pricing model:** Recurring
   - **Price:** set your amount + currency + interval
   - **Billing period:** Monthly
   - **Free trial:** leave blank here (the code forces a 7-day trial
     at checkout — see "Managed Payments + trial" below for why)
2. Save. Copy the **Price ID** (`price_...`) from the resulting page.

### 1.3 Add env vars to `.env.local`

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=                # leave blank for now — filled in §1.5
STRIPE_PRICE_ID_FREE=                 # leave empty — Free has no Stripe product
STRIPE_PRICE_ID_PRO=price_...         # from §1.2
```

Free has no Stripe product. The `subscriptions` row auto-creates with
`plan: 'free'` on first read (see `lib/db/queries.ts:53-89`), and the
Billing card surfaces the **Upgrade to Pro** CTA. No Stripe call is
ever made for Free users until they click Upgrade.

### 1.4 Install + log in to the Stripe CLI

The Stripe CLI is installed inside WSL (per AGENTS.md "CodeRabbit
review" tooling conventions).

```bash
# One-time, if not already installed:
#   curl -s https://packages.stripe.com/api/v1/stripe-cli/install.sh | bash
# Or follow https://docs.stripe.com/stripe-cli

stripe --version          # confirm it's on PATH inside WSL
stripe login              # opens browser, paste the pairing code
```

On Windows, the PowerShell launcher can call into WSL via
`wsl stripe ...`. Don't run `stripe` directly in PowerShell unless
you've installed a native build.

### 1.5 Forward webhooks to localhost

In a separate terminal, start the webhook forwarder:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

It will print a banner like:

```
Ready! Your webhook signing secret is whsec_...
2026-09-20 16:30:00  -->  customer.subscription.created [evt_...]
```

**Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET` in
`.env.local`** and restart `pnpm dev` so the new secret takes effect.

> **Why a CLI secret and not the Dashboard one?** The Dashboard's
> signing secret signs webhooks sent to your production URL. The
> CLI's signing secret signs webhooks forwarded to localhost during
> dev. They are different secrets for different endpoints. See §2.3
> for the production setup.

### 1.6 End-to-end smoke test

Make sure both processes are running:

- Terminal 1: `pnpm dev` (port 3000)
- Terminal 2: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

Then in the browser:

1. Sign in (or sign up) — land on `/dashboard`.
2. Visit `/dashboard/general` → see the Billing card showing
   `Free / Inactive / Upgrade to Pro`.
3. Click **Upgrade to Pro** → routes to `/pricing`.
4. Click **Start 7-day free trial** on the Pro card → Stripe
   Checkout opens in a new tab/page.
5. Use test card `4242 4242 4242 4242` (any future expiry, any CVC,
   any ZIP, any email).
6. Click **Subscribe** → bounces back to `/dashboard`.
7. **Watch Terminal 2** — should print `customer.subscription.created`
   within 1-2 seconds.
8. Visit `/dashboard/general` → card should now show
   `Pro / Trialing / Sep 27, 2026 / Manage billing`.
9. Click **Manage billing** → Stripe Billing Portal opens in same
   tab.
10. Cancel the subscription in the portal → terminal prints
    `customer.subscription.deleted` → `/dashboard/general` shows
    `Pro / Canceled / Upgrade to Pro` (per `isProEffective` — the
    Pro plan string is sticky but the user is demoted).

If step 8 still shows `Free / Inactive`, see §4 troubleshooting.

---

## 2. Production (Vercel)

### 2.1 Get live API keys

In Stripe Dashboard, **toggle off test mode**. Developers → API keys →
copy the **Secret key** (`sk_live_...`). This goes in Vercel, NOT
`.env.local`.

### 2.2 Create the Pro product in live mode

Same shape as §1.2 but in live mode. Many teams create both a test
and a live product (with matching Price IDs) so dev and prod track
each other. Whatever you do, the Price ID for live goes in
`STRIPE_PRICE_ID_PRO` in **Vercel**, not `.env.local`.

### 2.3 Register the production webhook endpoint

> **You need TWO webhook endpoints in Stripe Dashboard**, one for dev
> (handled by `stripe listen`) and one for prod (registered here).

1. Stripe Dashboard → Developers → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:** `https://<your-prod-domain>/api/stripe/webhook`
   (the Vercel auto-generated domain, or your custom domain if set).
3. **Description:** `Nextep production subscription events`
4. **API version:** `2026-08-26.dahlia` (matches
   `lib/payments/stripe.ts:14`). Stripe will warn if the Dashboard
   version differs from the SDK version — match it to suppress.
5. **Events to send** (under "Select events"):
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Click **Add endpoint**.
7. On the endpoint detail page → **Reveal** the **Signing secret**
   (`whsec_...`). This is DIFFERENT from the CLI one in §1.5.
8. **Add to Vercel** (NOT `.env.local`):
   - Vercel dashboard → Project → Settings → Environment Variables.
   - `STRIPE_SECRET_KEY` = `sk_live_...` (from §2.1)
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...` (from step 7 — the
     production endpoint secret)
   - `STRIPE_PRICE_ID_FREE` = empty
   - `STRIPE_PRICE_ID_PRO` = live Price ID (from §2.2)
   - Scope: **Production** (and **Preview** if you want the same
     to work on preview deploys).
9. **Redeploy** so the new env vars take effect.

### 2.4 Verify the production webhook

1. Place a real (small) test charge via a real card on your live
   account, OR use a live test card in live mode if your account has
   that enabled.
2. Stripe Dashboard → Developers → Webhooks → click your production
   endpoint → **Logs** tab → confirm `customer.subscription.created`
   shows a 200 response.

---

## 3. Managed Payments gotcha (Stripe API `>= 2025-04-30.basil`, still applies on `2026-08-26.dahlia`)

Stripe's "Managed Payments" feature, enabled by default on accounts
created/running on API version `2025-04-30.basil` (still the
default on `2026-08-26.dahlia`, the current pin),
**auto-selects payment methods** based on the customer's locale and
your Dashboard settings.

If you pass `payment_method_types: ['card']` to
`stripe.checkout.sessions.create`, Stripe returns:

```
400 Bad Request
Unsupported parameter: payment_method_types.
Managed Payments, which is enabled by default on your account, handles
this parameter for you. Remove payment_method_types, or pass
managed_payments[enabled]=false to disable it for this request.
```

**The fix in this codebase:** `lib/payments/stripe.ts:42` deliberately
omits `payment_method_types`. Comment in source explains why.
Don't add it back without understanding the trade-off (you'll lose
auto-selected payment methods like iDEAL, SEPA, Klarna, etc., for
international customers).

**If you need to disable Managed Payments** (e.g. to keep the
explicit `payment_method_types` API):

```ts
// lib/payments/stripe.ts
const session = await stripe.checkout.sessions.create({
  managed_payments: { enabled: false },
  payment_method_types: ['card'],
  // ... rest of config
});
```

But there's no good reason to disable it. Managed Payments is better.

---

## 4. Troubleshooting

### 4.1 `No API key provided`

`STRIPE_SECRET_KEY` is missing or empty in `.env.local`. Restart
`pnpm dev` after editing env vars — Next.js doesn't hot-reload env
changes.

### 4.2 `Webhook signature verification failed`

`STRIPE_WEBHOOK_SECRET` doesn't match the secret the forwarder is
using. If `stripe listen` is running, copy the printed `whsec_...`
into `.env.local` and restart `pnpm dev`. For production, copy the
**endpoint-specific** signing secret from the Dashboard (§2.3).

### 4.3 `No such price: 'price_...'`

The Price ID in `STRIPE_PRICE_ID_PRO` doesn't exist in the Stripe
account you're hitting. Common causes:

- **Test/live mode mismatch.** Your Stripe Dashboard is in test mode
  but the Price ID is from a live product (or vice versa). Toggle
  the Dashboard and check.
- **Product was deleted.** Check `stripe products list --limit 5`.
- **Wrong account.** The CLI is logged into a different Stripe
  account than the Dashboard. Run `stripe login` and confirm.

### 4.4 `No such customer: 'cus_...'`

The local `subscriptions` row has a `stripeCustomerId` that doesn't
exist in Stripe. Usually means a webhook was lost — the customer was
created in Stripe but the row update never fired. Run
`stripe customers list --limit 5` to see what's actually in Stripe,
then update the local row manually in your DB or just create a fresh
user.

### 4.5 Test subscription fills up the DB

Every test run creates a row in your local DB. To clean up:

```sql
-- In Neon SQL editor or your local Postgres client
DELETE FROM subscriptions WHERE user_id != '<your-real-user-id>';
```

Or, easier: the `getSubscription` query auto-creates a free-tier
row, so a missing row is harmless — the user is just on Free.

### 4.6 `customer.subscription.created` never fires

The webhook forwarder isn't running. In Terminal 2, you should see
`stripe listen` printing `customer.subscription.created` as you
complete checkout. If it's silent, the forwarder died — restart it.

### 4.7 Pricing page Pro card shows "Start 7-day free trial" but Upgrade does nothing

`STRIPE_PRICE_ID_PRO` is empty or invalid. The pricing page detects
`plan.priceId === null` and shows a disabled button — see
`app/(marketing)/pricing/page.tsx:117`. Set the Price ID in
`.env.local` and restart.

---

## 5. Verifying env vars are wired correctly

After every env change, run:

```bash
# In your Next.js dev console or a quick Node REPL:
node -e "console.log({secret: !!process.env.STRIPE_SECRET_KEY, webhook: !!process.env.STRIPE_WEBHOOK_SECRET, pro: !!process.env.STRIPE_PRICE_ID_PRO})"
```

All three should be `true`. If `STRIPE_SECRET_KEY` is somehow unset
even after editing `.env.local`, check that `.env.local` is in the
project root (not a subdirectory) and that `pnpm dev` was restarted
after the edit.

---

## 6. Where this lives in the codebase

| Concern | File |
|---|---|
| Stripe client init | `lib/payments/stripe.ts:13` |
| Checkout session (no `payment_method_types`!) | `lib/payments/stripe.ts:42-55` |
| Customer portal session | `lib/payments/stripe.ts:60-72` |
| Webhook → subscription upsert | `lib/payments/stripe.ts:74-114` |
| Server actions (checkout + portal) | `lib/payments/actions.ts` |
| Webhook route | `app/api/stripe/webhook/route.ts` |
| Checkout success redirect | `app/api/stripe/checkout/route.ts` |
| Pricing page | `app/(marketing)/pricing/page.tsx` |
| Subscription row query + auto-create | `lib/db/queries.ts:53-89` |
| `PLANS` schema constants | `lib/db/schema.ts:104-119` |
| Billing card UI | `app/(dashboard)/dashboard/general/_components/billing-card.tsx` |
| Pro gate (server) | `lib/billing/require-pro.ts` |
| Pro gate (client hook) | `lib/billing/use-user-plan.ts` |
