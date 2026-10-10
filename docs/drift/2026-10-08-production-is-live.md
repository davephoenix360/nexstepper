# Production is live — roadmap status correction (2026-10-08)

**Status:** correction of stale state, not new architecture.
**Author:** session with user, 2026-10-08.

## What was wrong

`AGENTS.md` recorded the product as **pre-launch**, with the
"next session's sole job" being the production env bring-up from
`docs/setup/production.md` §11 — including *"Neon prod DB"*, and
warning that **"nothing else should ship in the meantime."**

That was false. Production has been deployed and serving. On
2026-10-08 an assistant asserted *"the Neon prod DB doesn't exist
yet"* directly to the user, reasoning from `.env.example` — which
still shows the `postgresql://localhost:5432/nextep` placeholder —
without checking `.env` / `.env.local`, `.vercel/`, or the migrations
directory. The user corrected it.

The docs had drifted from reality because the launch work was done
outside a session that updated them.

## Actual state as of 2026-10-08

| Item | Status |
|---|---|
| Vercel production deployment | **Live** (`.vercel/project.json` linked) |
| Neon **prod** project | **Live** — separate project from dev |
| Neon **dev** project | **Live** — `ep-long-base-ajm4kkqm.c-3.us-east-2.aws.neon.tech/neondb`, wired into `.env` + `.env.local` |
| Migrations `0000`–`0008` | Applied |
| Custom domain | **Live** — `nexstepper.com`, **`www.` is canonical** |
| Resend | Verified, sending |
| Sentry + PostHog | Wired with real keys |
| Vercel AI Gateway | Authenticated |
| Stripe live mode | **Live, verified** — Pro subscription not yet enabled |

## Three corrections that matter

### 1. Two Neon *projects*, not one project with branches

`docs/setup/production.md` §1.2 recommends a `production` +
`development` **branch** pair inside a single Neon project. Reality is
**two separate projects**.

Operational consequence that was not previously documented:
**running `pnpm db:migrate` locally applies migrations to the DEV
project only.** Production migrations land when the commit reaches
`main` and Vercel's `prebuild` runs `db:migrate` (§1.3). So a schema
change is live in dev long before it is live in prod, and a bad
migration is caught in dev first. That is the good version of this
topology — but it is now a **deliberate** isolation, not an accident,
and §1.2 should say so.

### 2. `www.` is canonical, not the apex

`docs/setup/production.md` §0.2 recommends apex + `www` → apex
redirect, and the deployment cheat sheet in `AGENTS.md` still says
`nexstepper.app`. Reality: **`www.nexstepper.com`**, with the apex
308-redirecting to `www`.

This is not cosmetic. `lib/auth.ts:77-91` documents exactly what the
mismatch caused: Vercel's 308 meant every real request landed on
`www.` while `BETTER_AUTH_URL` was the apex, so Better Auth rejected
`www.` as an invalid origin and the auth flow **silently 500'd**. The
hand-built `trustedOrigins` list is the scar tissue from that.

**Anyone adding a new auth callback (Google OAuth, GitHub) must
register both hosts.** Google matches redirect URIs *exactly*.

### 3. Stripe live mode is the only remaining launch item

Every other §11 done-criteria box is satisfied. Stripe live mode is
deliberately still gated — see
`docs/drift/2026-09-27-soft-launch-pro-gating.md`, where every
"Upgrade to Pro" CTA became a waitlist mailto because live-mode
activation requires a deployed business website. That site now
exists, so the gate is ripe to lift — but lifting it is a product
decision, not a leftover chore.

### 4. The domain is `nexstepper.com`, and `.app` is aspirational

As of **2026-10-08 the only domain in service is
`nexstepper.com`**. `nexstepper.app` had been written across the
repo since the 2026-09-25 rebrand memo (which recorded
`nexstepper.app` / `nexstepper.com` as candidates) but **was never
actually acquired**. That left live pages pointing at a domain the
project does not own — including the legal pages, which promised
GDPR-compliant 30-day responses at `privacy@nexstepper.app`, an
address that cannot receive mail.

Everything is now `nexstepper.com`. `nexstepper.app` remains a
**future intent only**: if it is acquired, it should redirect to the
`.com` canonical rather than become a second canonical host — two
canonicals is exactly the class of problem that produced the
`trustedOrigins` scar tissue in `lib/auth.ts`.

**Operational follow-up (not verifiable from the repo):** the
mailboxes `privacy@`, `legal@`, `support@` and `security@` on
`nexstepper.com` must actually exist and be monitored. The legal
pages promise a 30-day GDPR response window. Only `hi@nexstepper.com`
is known to be configured (Resend). Until the others exist, the
promises are not keepable.

## Action taken

- `AGENTS.md` — roadmap rewritten to reflect live production; the
  deploy cheat sheet now names `nexstepper.com` and records the
  two-project Neon topology.
- `docs/setup/production.md` — dated "current production state"
  block added at the top; §0.2 hostname, §1.2 branch strategy and
  §11 done criteria corrected to match reality.
- `.env.example` — annotated to warn that the localhost value is a
  placeholder, not the real dev setup (this is what misled the
  2026-10-08 session).

## Standing rule for future sessions

**`.env.example` is a template, not evidence of what is configured.**
Before asserting anything about deployed state, check `.env`,
`.env.local`, `.vercel/project.json`, and the migrations directory.
Never infer live infrastructure from a placeholder file.