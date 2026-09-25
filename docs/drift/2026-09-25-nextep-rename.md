# Nextep → Nexstepper rebrand

**Date:** 2026-09-25
**Branch:** `feat/rebrand-nexstepper`
**Author:** Diepreye (founder)

## TL;DR

`nextep-saas` is now **Nexstepper** — a one-word mashup of the old brand name and the word "stepper" (the person who takes the next step). Domain `nexstepper.com` is available; `.com/.io/.co/.app` are registered as defensive shields. The rebrand is in flight on a fresh branch — once it merges and the GitHub repo is renamed, all canonical surfaces (repo URL, package name, branding, legal pages, emails) will read **Nexstepper**.

The product vision, locked stack, schema, scoring engine, and ATS validation corpus are **unchanged**. The rename is purely a brand-surface refactor; no behavioural code was modified.

## Why we renamed

A third party already owns the "Nextep" / "nextep" trademark and `.com` / `.app` namespace, which prevents us from shipping the hosted version under that name. Continuing would have surfaced legal friction at exactly the moment we wanted to go live.

The new name keeps the **brand thread** of the original (`nex-` + `step`) and adds the missing semantic — a *stepper* is the person who takes the next step, which is exactly the user our product is built for. From Regina Brett: *"When in doubt, take the next step."* That's the brand strapline now.

## Naming audit (what we considered)

| Candidate | Verdict |
|---|---|
| Nextep Forge, Hireloom, Resumatic, Pathwise, … | Strong generic options. Tabled once we found the brand-thread winner. |
| **Nexstepper** | **Winner** — direct continuation of the original brand prefix; `.com` available; one word; community-identity friendly ("a Nexstepper"). |
| NextStepper | Stronger continuity with the original "next step" verb, but `.com` taken. |
| Doubtless | Built from Regina Brett's quote but less brand-thread continuity with Nextep. |
| Resumotive | Strong category ownership, but its `.com` is parked and the name is resume-tied (limits future scope). |

The board is at the end of this memo if a future session wants to re-litigate.

## What changed (canonical surface)

| Surface | Before | After |
|---|---|---|
| Brand name | Nextep | Nexstepper |
| Tagline | — | *Take the next step.* |
| Repo name | `nextep-saas` | `nexstepper` |
| GitHub handle | (will be set after repo rename) | `nexstepper` |
| Production domain | `nextep.app` (taken) | `nexstepper.app` / `nexstepper.com` |
| Package name (`package.json`) | `nextep-saas` | `nexstepper-web` |
| Cookie prefix (Better Auth) | `nextep.*` | `nexstepper.*` ⚠️ see "User-visible effects" |
| Theme localStorage key | `nextep-theme` | `nexstepper-theme` |
| Inngest app id | `nextep-saas` | `nexstepper` |
| Email From address (default) | `Nextep <onboarding@resend.dev>` | `Nexstepper <onboarding@resend.dev>` |
| Support / privacy / legal / security mailboxes | `*@nextep.app` | `*@nexstepper.app` |
| Copyright line | `Copyright (c) 2026 Nextep` | `Copyright (c) 2026 Nexstepper` |
| Trademark owner | "Nextep" | "the Nexstepper project / its contributors" |
| Marketing nav, login copy, footer, legal pages | "Nextep" | "Nexstepper" |

## What was deliberately NOT changed (and why)

These items stay on the old name until they can be migrated safely. Each is documented here so a future session doesn't re-litigate.

1. **Database table names / column names / Drizzle schema.** Renaming would require a migration touching every user-owned table. Risk of dangling rows on rollback; no consumer-visible benefit. Park.
2. **Better Auth migrations.** The cookie prefix move invalidates every live session. Acceptable because the product isn't public yet (per `docs/setup/production.md` §11 launch gate), but worth noting that any staging data will be wiped.
3. **`RESEND_FROM_ADDRESS` runtime env var.** The default fallback is renamed, but anyone self-hosting can keep `Nextep <…>` if they want — it's their domain.
4. **Stripe product / customer IDs.** Stripe-side identifiers stay; only the display metadata gets renamed (to be done at Stripe live-mode setup, queued).
5. **PostHog project + Sentry project.** Same — identifier renames need to be coordinated with the dashboard create flow.
6. **The `nextep-legacy` repo (the deprecated v1 Next.js 15 / Firebase build).** That repo is read-only reference; its name doesn't conflict with our new project, so the legacy name stays as a historical marker. Self-hosters reading that repo see a clean "this is the legacy version" picture.

## User-visible effects

- **Every existing session will require re-login once.** Cookie prefix `nextep.*` → `nexstepper.*`. Affects: dev, staging, and any pre-launch tester. Self-hosters will see the same on next deploy. Zero effect for fresh sign-ups.
- **Every existing user's theme preference (light/dark) will reset to system on next visit.** `localStorage` key renamed. Minor, self-resolving.
- **The Inngest dashboard for this app id will need re-registration.** Old `nextep-saas` → new `nexstepper`. Self-hosting: just leave the old value; nothing breaks.
- **Legal pages now reference `nexstepper.app`.** Anyone bookmarking `nextep.app/privacy` etc. will be redirected when DNS is repointed. Pre-launch: nobody has those URLs yet.

## Brand book (for future sessions)

- **Name:** Nexstepper. Always one word, always capitalised with the X/U/P/L only (like a brand, not a dictionary word).
- **Pronounced:** NEK-step-er (three syllables).
- **Tagline:** *"Take the next step."* Attribution chain: Regina Brett (originally); reuse anywhere.
- **Voice:** Confident but self-aware. Dev-friendly. Slightly cheeky on social. NEVER corporate.
- **Visual signature:** the double-P is the logo moment (drop a mark into the PP — a forward chevron, a stencil-style arrow). Three briefs were mocked at rebrand time; pick one before the next marketing push.
- **Forbidden:** taking the literal name in domain hacks (e.g. `nexsteppers.io` for a separate service); recycling "Nextep" anywhere, including in private branch names or migration scripts.

## Future work

1. **Logo design** — finalise the double-P mark, drop a `docs/brand/` folder with the SVG + colour tokens.
2. **Domain swap on Vercel** — once `nexstepper.com` is wired in Vercel, update the `docs/setup/production.md` step 7 with the new hostname.
3. **Open Graph / social cards** — re-render with the new logo + name. Static file in `public/og.png`.
4. **Stripe product metadata rename** — when Stripe live mode is enabled, update Stripe product names + price descriptions. Stripe identifiers themselves are immutable and don't need to change.
5. **PostHog + Sentry project names** — rename when next touched. Not blocking.
6. **TLDs:** `nexstepper.app` (mobile companion landing), `nexstepper.io` (dev-only surface). Both already registered.
7. **Trademark registration** — once revenue is meaningful, file ITM (intent-to-use) in Class 9 + Class 42. Cost is ~$750–1500 per class via an IP attorney.

## Acceptance gate

A rebrand of this scope doesn't ship light. Pre-merge:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` 970/970 green
- [ ] `pnpm build` all routes compile
- [ ] Visual sanity check on `/`, `/sign-in`, `/dashboard`, `/privacy`, `/terms`
- [ ] At least one verifier agent has signed off
- [ ] Drift memo (this file) merged with the PR

## Reviewer notes

If you're a fresh session asked to revisit this rebrand, this memo is your starting point. Do not re-run the naming audit — that work is captured in the table above. Do not touch the items under "deliberately NOT changed" without a fresh decision memo.
