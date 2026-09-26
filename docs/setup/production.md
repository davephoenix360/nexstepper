# Production Deploy Checklist

One-time setup for launching Nexstepper to real users. Walk top to bottom; each
section produces a verifiable artifact before you move on. Most of this is
cloud-console work, not code.

> **TL;DR** — Set up **Neon prod DB** + run all migrations on a clean branch,
> switch **Stripe** to live mode + create the Pro Price + webhook endpoint,
> verify your **Resend** sending domain (SPF/DKIM), wire real **Sentry +
> PostHog** keys, point a custom domain at **Vercel**, fill all env vars in
> the Vercel project, then run the **end-to-end smoke test** before
> announcing anything.

> **Rollback** at every step: Vercel "Redeploy previous deployment" rolls
> the app back in ~30s. Neon "Restore to point-in-time" can roll the DB
> back to any second in the last 7 days (paid tier; 24h on free). Stripe
> webhook events are idempotent — replay if a deploy raced with a payment.

---

## 0. Pre-flight (before you touch any cloud console)

### 0.1 You need accounts for

| Service | Why | Account owner |
|---|---|---|
| Vercel | Hosting | you |
| Neon | Postgres | you |
| Stripe | Billing (live mode requires activated account) | you, business |
| Resend | Transactional email | you |
| Sentry | Error monitoring | you (or team) |
| PostHog | Product analytics | you (or team) |
| Domain registrar | Custom domain | you |
| Vercel AI Gateway | AI model access | you |

### 0.2 Decide your prod hostname

Pick before you start so you can fill it in once and not revisit:

- **Apex** (`nexstepper.app`) + **www** redirect → apex
- Or **subdomain** (`app.nexstepper.com`) under a domain you already own

You'll need this for: Stripe webhook URL, Resend domain verification,
Better Auth `BETTER_AUTH_URL`, the `NEXT_PUBLIC_APP_URL` exposed to the
client, and the `BASE_URL` Stripe redirects to after checkout.

### 0.3 Open this checklist in one tab + Vercel/Neon/Stripe/Resend in the others

You're going to bounce between consoles. Keep `.env.example` open in the
editor so you know exactly which env vars need which value.

---

## 1. Database (Neon)

> Goal: a fresh Postgres DB in the cloud, with backups, that migrations
> apply to cleanly.

### 1.1 Create the Neon project

1. <https://console.neon.tech> → **Create project**.
2. Name: `nexstepper`. Region: closest to your Vercel region
   (Vercel auto-selects `iad1` / `fra1` etc. on Pro; pick the matching
   Neon region to keep latency low).
3. **Postgres version**: 16 (matches the local docker image per README).
4. **Plan: start on the Free tier.** It's enough for a soft launch —
   see "When to upgrade" below for the trigger.
5. Copy the **pooled** connection string (looks like
   `postgresql://…?sslmode=require&pgbouncer=true&connect_timeout=15`) —
   that's what you'll set as `POSTGRES_URL` in Vercel.
6. **No PIT backups on free tier.** See §10.2 for how this changes the
   rollback playbook. The first thing to do once you upgrade is enable
   backups under **Settings → Backups**.

#### When to upgrade from Free → Launch ($19/mo)

Launch unlocks more storage (10 GB vs 0.5 GB), more compute hours,
and 7-day PIT backups. Upgrade when **any one** of these:

| Trigger | Where to see it |
|---|---|
| Storage > 400 MB | Neon dashboard → project → **Usage** |
| Compute hours hit cap before month-end (≥3 days early) | Same |
| First user complains about slow first-paint on a cold DB | Sentry / customer email |
| **> 100 paying users** | Stripe Dashboard → active subscriptions |
| First data-loss scare you can't recover from | postmortem-driven |

The $19/mo buys you more than scale — it buys you the rollback
playbook in §10.2. Every public SaaS postmortem that mentions
"we couldn't restore" also mentions that backups are cheap insurance.

### 1.2 Branch strategy

Neon branches give you per-environment DBs without managing separate
instances. Recommended for v1:

- `production` — what the live app points at
- `development` — your local + staging branch (Neon auto-creates this
  on project creation; keep it)

For **preview deploys** on Vercel, you can either (a) skip the per-PR
DB and just point previews at the dev branch with a write-blocked role,
or (b) use Neon's GitHub Action to spin a fresh branch per PR. **Defer
(a) for now** — preview DBs are nice-to-have, not launch-blocking.

### 1.3 Apply migrations to a clean DB

Before pointing the app at `production`:

```bash
# Locally, with prod connection string in a side-shell
$env:POSTGRES_URL = 'postgresql://…production-pooler…?sslmode=require'
pnpm db:migrate
```

Expected: every migration in `lib/db/migrations/` applies without error.
Drizzle Kit prints `… migrations applied` and exits 0. **If any
migration fails: stop, do not deploy the app yet.** The fix is usually
either a bad migration (regenerate from the schema diff) or a Neon
permission issue (default `neondb_owner` role has full DDL — should be
fine).

### 1.4 Smoke the DB

```bash
# Same shell as 1.3
pnpm db:studio
```

Open Drizzle Studio, confirm all the expected tables exist:
`user`, `session`, `account`, `verification` (Better Auth),
`resumes`, `resume_revisions`, `job_contexts`,
`chat_sessions`, `chat_messages`, `chat_usage`,
`subscriptions`, `stripe_events_processed`,
`applications`, `reviews` (if schema present), `shares`, `score_snapshots`.

### 1.5 Verify

- [ ] `pnpm db:migrate` exits 0 against the prod connection string
- [ ] **Free tier:** PIT backups intentionally absent — see §10.2 for
      how this changes the rollback playbook
- [ ] **Launch tier (after upgrade):** PIT backups visible in Neon
      dashboard with 7-day retention
- [ ] Drizzle Studio shows all expected tables, zero rows

---

## 2. Stripe (live mode)

> Goal: real prices, real webhook, real money. You will need a
> **Stripe-activated account** — that requires your legal entity info
> (EIN/SSN, address, bank account for payouts). Start this in parallel
> with the other steps; activation can take a day or two.

### 2.1 Activate your Stripe account

1. <https://dashboard.stripe.com> → toggle **off** test mode → follow the
   activation wizard (business type, address, bank, tax info).
2. When done, you'll land on the live dashboard with no products yet.

### 2.2 Create the Pro product (mirror what you did in test mode)

Per [`docs/setup/stripe.md`](./stripe.md) §1.2, in **live mode** this time:

1. **Products → Add product**:
   - **Name:** `Nexstepper Pro`
   - **Pricing model:** Recurring
   - **Price:** same amount + currency as test mode (per AGENTS.md
     locked stack, "Pro ≈ the price of a coffee")
   - **Billing period:** Monthly
   - **Tax code:** if you're enabling Stripe Tax (§2.5), pick
     "General — SaaS" or your jurisdiction's equivalent; otherwise
     leave blank
2. Save. Copy the **Price ID** (`price_...`) → this is
   `STRIPE_PRICE_ID_PRO`.
3. **Free** has no Stripe product — `STRIPE_PRICE_ID_FREE` stays empty.

### 2.3 Create the webhook endpoint

1. **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL:** `https://<your-domain>/api/stripe/webhook`.
3. **Listen for:** select every event the code subscribes to. From
   `lib/payments/` / `app/api/stripe/webhook/route.ts`:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Save. Copy the **Signing secret** (`whsec_...`) → this is
   `STRIPE_WEBHOOK_SECRET`.

### 2.4 Configure the customer portal

1. **Settings → Billing → Customer portal**.
2. Allow customers to: **cancel subscriptions**, **update payment
   methods**. Don't enable product switching (we only have one paid
   tier).
3. Save.

### 2.5 (Optional but recommended) Stripe Tax

If you serve EU/UK users, Stripe Tax handles VAT collection automatically:

1. **Settings → Tax → Enable Stripe Tax**.
3. Add your business address + tax registrations.
4. Edit the Pro Price → enable **Automatic tax**.
5. Set `automatic_tax: { enabled: true }` on the Checkout Session in
   `lib/payments/create-checkout-session.ts` (verify the call site
   already passes this — it should, per AGENTS.md tier-gating ADR).

> Defer Stripe Tax to the day before launch if activation isn't done by
> then. You can launch without it (Stripe will collect 0% tax and you
> owe nothing for the first €10k/year in most EU jurisdictions), but
> add it before you cross any threshold.

### 2.6 End-to-end Stripe test (with a real card)

1. Sign up a fresh test user on your production URL (after deploy).
2. Click **Upgrade to Pro**.
3. Use a real card (your own — you'll refund immediately).
4. Confirm: redirected back to `/dashboard/general`, Billing card shows
   `Pro · active`, `requirePro()` lets you through, `useIsPro()` is
   `true`.
5. Open Sentry / PostHog — confirm the events landed.
6. Refund from Stripe Dashboard; confirm `subscription` row flips back
   to `free`.

### 2.7 Verify

- [ ] Stripe account **Activated** (not just `Restricted`)
- [ ] Pro product + monthly Price exist in live mode
- [ ] Webhook endpoint showing recent 200 OK deliveries in Stripe Dashboard
- [ ] Customer portal configured
- [ ] Test subscription round-trip works end-to-end

---

## 3. Email (Resend)

> Goal: password resets and any future transactional mail land in
> Inbox, not Spam.

### 3.1 Verify your sending domain

1. <https://resend.com/domains> → **Add domain** → enter `nexstepper.app`
   (or whatever you're using).
2. Resend shows the DNS records you need to add. Go to your registrar /
   DNS host (Cloudflare, Namecheap, Route53, …) and create:
   - **SPF** (`TXT` at apex): `v=spf1 include:resend.com ~all`
   - **DKIM** (`CNAME`s at the three subdomains Resend shows)
   - **DMARC** (`TXT` at `_dmarc.nexstepper.app`):
     `v=DMARC1; p=quarantine; rua=mailto:dmarc@nexstepper.app`
3. Back in Resend → **Verify**. Usually takes < 5 min once the records
   propagate.

### 3.2 Set the API key for the production domain

1. **API Keys → Create API key** → scope: **Sending access**, domain:
   your prod domain (NOT the `resend.dev` sandbox).
2. Copy the key (`re_...`) → this is `RESEND_API_KEY` in Vercel.
3. Update `lib/email/` if the "from" address is hardcoded to anything
   other than a verified domain — search for `from:` and verify.

### 3.3 End-to-end email test

1. After deploy: trigger **Forgot password**, enter your real email.
2. Confirm mail arrives within 60s, link works, sets a new session.
3. Check the email's **Authentication-Results** header in your client:
   should show `spf=pass`, `dkim=pass`, `dmarc=pass`.

### 3.4 Verify

- [ ] Sending domain verified in Resend dashboard (green check)
- [ ] SPF / DKIM / DMARC all pass on a real test send
- [ ] Password reset email arrives in Inbox (not Spam), link works

---

## 4. AI Gateway (Vercel)

> Goal: prod traffic to the AI layer routes through the gateway, with
> spend limits and observability.

### 4.1 Choose your auth mode

Two options per `.env.example`:

| Mode | When | Env var |
|---|---|---|
| **OIDC token** (recommended for Vercel deploys) | App runs on Vercel; the token auto-rotates | `VERCEL_OIDC_TOKEN` (auto-provisioned by Vercel when you enable OIDC for the integration) |
| **Static API key** | App runs outside Vercel, or you want a stable key for dev parity | `AI_GATEWAY_API_KEY` from <https://vercel.com/dashboard/ai-gateway> |

Set **one or the other**, not both. The code prefers OIDC when present.

### 4.2 Set a spend limit (if available on your plan)

Vercel AI Gateway lets you cap monthly spend. Set a reasonable v1 cap
(e.g., $50/mo) — your free tier is $5/mo and you'll start on the paid
tier once you exceed it. If a Pro user suddenly hammers the chat, this
cap keeps the bill bounded until you notice.

### 4.3 Verify

- [ ] `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` set in Vercel env
- [ ] Test JD parse on prod (paste a real JD → see structured
      `JobPostingData`)
- [ ] Vercel dashboard → AI Gateway → shows requests landing

---

## 5. Observability (Sentry + PostHog)

> Goal: when prod breaks, you find out before users do.

### 5.1 Sentry

1. <https://sentry.io> → create project (Next.js).
2. Copy the DSN → `SENTRY_DSN` in Vercel.
3. Set **environment** to `production` (the Sentry init files should
   read `process.env.NODE_ENV`; verify in
   `sentry.client.config.ts` / `sentry.server.config.ts`).
4. **Alerts** (Settings → Alerts):
   - **Alert #1:** "Error rate > 5% over 5 min" → email you
   - **Alert #2:** "5xx on `/api/chat`" → email you
   - **Alert #3:** "First occurrence of any new error" → lower priority,
     daily digest
5. **Source maps**: Sentry's Next.js integration uploads source maps
   automatically on build. Verify after the first deploy that error
   stack traces show original TypeScript frames, not minified.

### 5.2 PostHog

1. <https://posthog.com> → create project.
2. Copy the API key + decide host (`us` or `eu`).
3. Set `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` in Vercel.
4. (Optional) set up a couple of key funnels: **Signup → first resume
   created**, **Free user → Pro upgrade**.

### 5.3 Verify

- [ ] `pnpm dev` shows no Sentry/PostHog init errors
- [ ] After deploy: trigger an intentional 500 (e.g., POST to
      `/api/chat` without a session cookie), confirm Sentry captures it
- [ ] PostHog live events tab shows the test session

---

## 6. Custom domain + SSL (Vercel handles most of this)

> Goal: users hit `https://nexstepper.app`, not `nexstepper<hash>.vercel.app`.

### 6.1 Add domain to Vercel

1. Vercel project → **Settings → Domains → Add** → enter your apex.
2. Vercel shows the records you need. At your registrar / DNS host:
   - **Apex** (`nexstepper.app`): either A record to Vercel's IP, or
     ALIAS/ANAME if your registrar supports it (Cloudflare does).
   - **www**: CNAME to `cname.vercel-dns.com`.
3. Vercel auto-provisions a Let's Encrypt cert — wait a few minutes
   after DNS propagates, refresh the Domains page, confirm the SSL
   badge is green.

### 6.2 Decide on `www` redirect

Vercel lets you redirect `www → apex` or `apex → www`. Pick one as the
canonical. Recommendation: **apex canonical, www → apex redirect**.

### 6.3 Update env vars to the prod domain

In Vercel project env vars:

```
BASE_URL=https://nexstepper.app
NEXT_PUBLIC_APP_URL=https://nexstepper.app
BETTER_AUTH_URL=https://nexstepper.app
```

These three must agree exactly (no trailing slash, https not http).

### 6.4 Verify

- [ ] `https://nexstepper.app` resolves to your Vercel deploy
- [ ] SSL Labs or `curl -I https://nexstepper.app` returns a valid cert
- [ ] `https://www.nexstepper.app` redirects to apex (or vice versa, your pick)
- [ ] Better Auth login flow works on the prod domain (cookies are
      scoped correctly, no SameSite warnings in browser devtools)

---

## 7. Vercel project + env vars

> Goal: every secret the app reads at runtime is set in the Vercel
> dashboard, never committed to the repo.

### 7.1 Connect repo

1. Vercel → **Add New Project** → import the GitHub repo.
2. **Framework Preset:** Next.js (auto-detected).
3. **Build Command:** `pnpm build` (auto-detected).
4. **Install Command:** `pnpm install --frozen-lockfile` (auto-detected
   but worth pinning — prevents lockfile drift in CI).
5. **Output Directory:** `.next` (auto-detected).

### 7.2 Fill every env var

Walk `.env.example` top to bottom. For each variable, set it in **all
three** environments Vercel offers: **Production**, **Preview**,
**Development** (the values may differ — Development keys are usually
test-mode Stripe, Preview should use Neon dev branch + test-mode Stripe).

| Variable | Production value | Preview value |
|---|---|---|
| `POSTGRES_URL` | Neon prod pooler | Neon dev branch pooler |
| `BASE_URL` | `https://nexstepper.app` | `https://<preview>.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | `https://nexstepper.app` | same as BASE_URL |
| `BETTER_AUTH_URL` | `https://nexstepper.app` | same as BASE_URL |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (new, prod-only) | new, preview-only |
| `NODE_ENV` | `production` | `preview` |
| `STRIPE_SECRET_KEY` | `sk_live_…` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | from §2.3 | from your local `stripe listen` |
| `STRIPE_PRICE_ID_PRO` | live price ID | test price ID |
| `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` | per §4 | dev key OK |
| `RESEND_API_KEY` | per §3 | dev key (sandbox domain) |
| `SENTRY_DSN` | prod | dev (or empty) |
| `NEXT_PUBLIC_POSTHOG_KEY` | prod | dev |
| `NEXT_PUBLIC_POSTHOG_HOST` | prod host | dev host |

> **Never commit `.env` or `.env.local`** — both are gitignored. These
> values live in Vercel only.

### 7.3 First deploy

1. **Deploy**. Vercel builds and pushes to a preview URL first.
2. Open the preview URL → does the landing page render? Does `/sign-up`
   work? If anything 500s, check the Vercel build log + the
   Function logs (Vercel → project → Logs).
3. Once the preview is clean, **Promote to Production** (or just merge
   to `main` — Vercel auto-deploys on push to the production branch).

### 7.4 Verify

- [ ] Preview deploy succeeds, basic smoke (landing + sign-up) passes
- [ ] Production deploy succeeds after promote
- [ ] All env vars visible in Vercel dashboard (sanity: do `console.log(process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'))` from any route — should be `true`)

---

## 8. End-to-end smoke test on production

> Goal: before you tell anyone the product exists, walk the core loop
> yourself on the real prod URL. Takes 15 minutes. Catches every
> integration bug the unit tests can't.

Do this in an **incognito window** so you exercise the unauthenticated
+ new-signup flow:

| # | Step | Expected |
|---|---|---|
| 1 | Visit `https://nexstepper.app` | Landing renders, no console errors |
| 2 | Click **Sign up** | Form loads, no errors |
| 3 | Sign up with your real email | Redirects to `/dashboard`, empty state |
| 4 | **Create master resume** (manual or import PDF) | Resume saves, appears in list |
| 5 | Edit basics + work entries | WYSIWYG editor saves, no 500s |
| 6 | **Parse a JD** (paste a real job description) | Returns structured `JobPostingData`, attaches to resume |
| 7 | See **ATS score** | Scorecard renders, 7 dimensions with values, radar chart |
| 8 | Click a **weak dim bar** (Free tier) | Inline tip appears, no popover (correct Free gating) |
| 9 | **Upgrade to Pro** (real card, then refund later) | Stripe checkout, return URL, Billing card shows Pro · active |
| 10 | Click the same dim bar (now Pro) | AI-rewrite popover opens, model returns a rewrite |
| 11 | **AI chat** — ask "make my summary shorter" | Streams response, tool call fires, persists to history |
| 12 | **Download PDF** | `/preview?print=1` opens, print dialog shows correct filename, colors render |
| 13 | **Share link** — generate `/r/{token}` | Public page renders read-only, token works in a different browser |
| 14 | **Revoke share** | Token now 404s |
| 15 | **Delete account** from `/dashboard/security` | All user rows cascade, session cleared |
| 16 | Try sign-in with the deleted email | "User not found" (not a confusing error) |

If any step fails, **stop and triage before announcing**. The most
common failures and their fixes:

- **Step 5 saves 500** → check `BETTER_AUTH_SECRET` is set, check the
  user row was created in Neon Studio
- **Step 7 score never loads** → AI Gateway key missing, or ATS engine
  hit a JD-parsing failure (check Vercel function logs)
- **Step 11 chat times out** → `RESEND_API_KEY` not the issue here; this
  is AI Gateway → check the function log for the actual error
- **Step 13 share returns 404 immediately** → `BETTER_AUTH_URL` mismatch

### 8.1 Verify

- [ ] All 16 steps pass
- [ ] Sentry shows zero new errors during the smoke test
- [ ] PostHog live events shows the test session end-to-end

---

## 9. Post-deploy monitoring (set and forget, mostly)

### 9.1 Alerts (you set these up; they fire when you're not looking)

- **Sentry**: 3 alerts from §5.1
- **Vercel**: project → Settings → Notifications; turn on **Deployment
  failed**, **Build error**, **Function error spike**
- **Stripe**: dashboard → Developers → Webhooks → your endpoint → turn
  on **Webhook failing** emails
- **Resend**: dashboard → Domains → your domain → turn on **Bounce /
  complaint** alerts
- **Neon**: project → Settings → Integrations → connect to a Slack
  webhook for **connection count high** + **disk usage high**

### 9.2 Weekly health check (10 min, set a recurring calendar block)

- Sentry: any unresolved errors older than 7 days?
- Stripe: any subscriptions in `past_due` you should chase?
- Neon: storage + compute within plan?
- AI Gateway: spend within cap? any spike?
- Resend: bounce rate < 5%?

### 9.3 Backups

- **Free tier:** no PIT backups. Forward-fix migrations only; keep
  every prod migration tested on a Neon branch first. This is the
  biggest reason §1.1 lists data-loss as an upgrade trigger.
- **Launch tier:** 7-day PIT retention. Verify quarterly under
  Neon → Settings → Backups.
- **Scale tier:** longer retention available.
- **Code backups**: GitHub is the source of truth. No additional code
  backup needed.

---

## 10. Rollback playbook

For when prod breaks and you need to recover fast.

### 10.1 App-only bad deploy

Symptom: a feature works locally but 500s on prod. No DB migration
involved.

Fix: **Vercel → Deployments → previous green deployment → Promote to
Production**. Takes ~30s. The deploy you just promoted becomes a "bad"
deployment in the history; you can re-promote later if you fix forward.

### 10.2 Bad DB migration

Symptom: a migration applied cleanly locally but corrupted data on
prod, or a column type mismatch.

Fix (most common): **write a forward-fix migration**, deploy, run
`pnpm db:migrate`. Don't roll back the migration in prod — Drizzle
doesn't make this easy and you risk a worse state.

Fix (catastrophic, on **Launch tier**): **Neon → Restore to
point-in-time** → pick a timestamp before the bad migration. Restores
the DB but loses any writes since. Coordinate with Stripe: any
subscription state changes that landed in the lost window need to be
replayed via `markStripeEventProcessed` + the webhook handler.

Fix (catastrophic, on **Free tier** — no PIT): your recovery options
are limited to **the most recent Neon auto-snapshot** (typically the
last 24 hours) plus **forward-fix migrations**. If the bad migration
corrupted data in a way that's hard to reverse, you're doing manual
data repair. **This is the biggest operational risk of launching on
free tier** — it's also why §1.1 lists data-loss as an explicit upgrade
trigger. Keep every prod migration tested on a Neon branch first, and
keep the post-migration Drizzle Studio smoke test under §1.4 as a
discipline.

### 10.3 Stripe is down

Symptom: webhook deliveries failing, or Stripe Checkout won't load.

The webhook has retry logic; missed events replay when Stripe recovers.
User-visible: the upgrade button doesn't work. There's no immediate
fix on your side — wait for Stripe, communicate clearly if it goes on
>1 hour.

### 10.4 AI Gateway is down or rate-limiting

Symptom: JD parse / chat / inline issue all fail with 5xx or 429.

The 4-model fallback chain in `lib/ai/providers.ts` should handle
single-model rate limits. If the entire gateway is down: degrade
gracefully (the parser returns `ai_failure`, the chat surfaces a
"temporarily unavailable" message via the SSE `{ type: 'error' }`
event — confirm this UX is acceptable before launch).

### 10.5 Verify (run this drill once a quarter)

- [ ] Practice: redeploy a previous build (10.1)
- [ ] Practice: restore a Neon branch from PIT (against the dev branch,
      not prod)

---

## 11. Done criteria — you're cleared to announce

Every box ticked:

- [ ] Neon prod DB live, migrations applied, upgrade trigger (§1.1)
      noted in your calendar
- [ ] Stripe in live mode, Pro product + webhook + customer portal
- [ ] Resend domain verified, SPF/DKIM/DMARC pass, password reset
      works in real Inbox
- [ ] AI Gateway authenticated (OIDC or static key), spend cap set
- [ ] Sentry + PostHog wired, alerts configured, test events captured
- [ ] Custom domain live with valid SSL
- [ ] All env vars set in Vercel Production environment
- [ ] End-to-end smoke test (§8) passes all 16 steps
- [ ] Rollback playbook (§10) reviewed; you've practiced the Vercel
      redeploy drill at least once
- [ ] **Separate launch tasks** done: legal pages live, account
      delete + data export audit clean — see follow-up session

---

## Reference

- [`docs/setup/stripe.md`](./stripe.md) — full Stripe setup (test +
  live), webhook local listener, customer portal
- [`AGENTS.md`](../../AGENTS.md) — locked stack, planning discipline,
  drift audit format
- [`README.md`](../../README.md) — env var reference, scripts table
- [`NEXTEP_REBUILD_PLAN.md`](../../NEXTEP_REBUILD_PLAN.md) — full
  rebuild plan and rationale
- [`docs/ai-models-reference.md`](../ai-models-reference.md) — model
  fallback chain + cost notes
- [Vercel docs: Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Neon docs: Point-in-time restore](https://neon.tech/docs/guides/branch-restore)
- [Stripe docs: Webhook signatures](https://docs.stripe.com/webhooks/signatures)
- [Resend docs: Domain verification](https://resend.com/docs/dashboard/domains/introduction)