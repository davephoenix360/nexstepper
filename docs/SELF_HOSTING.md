# Self-Hosting Nextep

This is an open-source project under the MIT license. You can run it for
yourself or your team for free. This document covers what you need to do
**beyond just running the code** — the legal, billing, and operational
bits that the hosted version (`nextep.app`) handles for you but a
self-host is responsible for themselves.

> **TL;DR** — the MIT license gives you the right to run, modify, and
> distribute the code. It does not give you the right to use the
> "Nextep" name or logo. You'll need your own accounts with every
> third-party service, your own privacy policy, and your own compliance
> posture.

## What's the same vs what's different

| | Hosted (`nextep.app`) | Your self-host |
|---|---|---|
| Source code | Closed (not yet) | Yours to inspect |
| Privacy policy | Nextep's | Yours |
| Terms of service | Nextep's | Yours |
| Stripe account | Nextep's | Yours |
| Resend account | Nextep's | Yours |
| AI provider key | Nextep's | Yours |
| Database backups | Nextep's | Yours |
| Security patches | Nextep rolls them out | You apply them |
| "Nextep" brand | ✓ | ✗ — pick your own name |

## Trademark (read this)

The MIT license covers **source code only**. The "Nextep" name, logo,
and wordmark are trademarks reserved by Nextep. When you self-host:

- ✅ Pick your own name and logo for your service
- ✅ Run the code under your own brand
- ❌ Don't market it as "Nextep" or any near-derivative
- ❌ Don't use the Nextep logo
- ❌ Don't claim official affiliation with Nextep

This is the standard "open-core SaaS" split — code is open, brand is
protected. See `LICENSE` for the full text.

## What you need to bring

To run a working instance of Nextep, you need accounts + keys for:

| Service | Used for | Free tier? |
|---|---|---|
| **Postgres** (Neon, Supabase, local docker, etc.) | Database | Neon has a free tier |
| **Vercel** or any Next.js host | Web hosting | Vercel has a hobby tier |
| **Better Auth** (built-in) | Auth | — |
| **Stripe** | Billing (Free + Pro tiers) | Free to set up |
| **Resend** | Transactional email (password reset, billing receipts) | 100 emails/day free |
| **Vercel AI Gateway** | AI features (JD parse, resume parse, chat) | $5/mo credit |
| **Sentry** | Error monitoring | 5k errors/month free |
| **PostHog** | Analytics | 1M events/month free |

All required env vars are listed in `.env.example` with placeholders.

## Legal responsibilities (your checklist)

When you self-host, **you become the data controller** for any data your
users put into the system. The Nextep privacy policy at
`nextep.app/privacy` does NOT cover your self-hosted instance. You need
your own:

- [ ] **Privacy policy** — published on your self-hosted URL, naming
      yourself as the controller, listing the subprocessors you actually
      use (most are the same as Nextep's, but you're the one accountable
      to your users)
- [ ] **Terms of service** — covering what your users can/can't do with
      the system, billing terms if you charge, and your acceptable-use
      rules
- [ ] **Cookie policy** — required if you serve EU/UK traffic and use
      non-essential cookies (PostHog analytics is non-essential; you'll
      need a consent banner)
- [ ] **Data processing agreement (DPA)** — required if you serve
      business customers in the EU/UK. Most subprocessor pages let you
      download one on demand
- [ ] **Data export + delete endpoints** — already implemented in
      `lib/data-rights/` — but the legal responsibility for responding
      to user requests in a timely way is on **you**, not Nextep
- [ ] **GDPR / CCPA / PIPEDA** compliance — depending on where your
      users live. The Nextep legal pages only cover Nextep's hosted
      service; they don't transfer to your self-host

## Operational responsibilities

- [ ] **Backups** — set up automated Postgres backups (or PIT if your
      provider supports it). The hosted version uses Neon's built-in PIT;
      your self-host needs its own backup story
- [ ] **Security patches** — subscribe to GitHub releases / security
      advisories for this repo. Apply them on a schedule. Critical for
      anything touching user PII
- [ ] **Monitoring** — set up Sentry alerts. Don't ship to real users
      without error monitoring
- [ ] **Rate limiting** — Vercel has default rate limits; check they're
      appropriate for your use case
- [ ] **AI cost monitoring** — the Vercel AI Gateway bills per token.
      Set a spend cap so a runaway user doesn't bankrupt you

## What you can change

Under MIT, you can:

- Modify the source code however you want
- Distribute your modified version (just keep the copyright + license
  notice intact)
- Run a hosted service based on this code
- Sell access to your hosted service
- Embed this code in a larger product

You **cannot**:

- Use the "Nextep" name or logo
- Claim endorsement by Nextep
- Hold Nextep liable for issues with your modified version

## Getting help

- **Read the code** — `AGENTS.md` is the single source of truth for how
  this codebase works
- **File an issue** — GitHub Issues are open. Bug reports and feature
  requests welcome
- **Don't expect Nextep to support your fork** — Nextep supports the
  hosted version. Self-host support is community-driven

## See also

- `LICENSE` — full MIT text + trademark notice
- `README.md` — project overview
- `AGENTS.md` — architecture, locked stack, planning discipline
- `docs/setup/production.md` — production deploy checklist (works for
  self-hosts too — the operational steps are the same)
- `docs/setup/stripe.md` — Stripe live-mode setup
- `docs/plans/pre-launch-compliance.md` — what the data-rights work
  implements
