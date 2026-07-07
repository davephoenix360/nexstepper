# nextep-saas

AI-assisted resume builder. Master-resume → tailored variants, ATS-style
scoring against a parsed job description, peer reviews, sharing, and real-time
collaboration.

> **Status:** Phase 0 — repo + foundation (week 1 of 14). All 8 punch-list
> items landed. See [`NEXTEP_REBUILD_PLAN.md`](./NEXTEP_REBUILD_PLAN.md) for
> the full rebuild plan and decision log (carried over from the legacy
> `nextep` repo).

## Stack

| Layer | Pick | Status |
|---|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack default) | ✅ |
| Language | TypeScript 5.x strict | ✅ |
| UI | shadcn/ui + Tailwind v4 | ✅ |
| Database | Postgres (Neon in prod, postgres-js locally) | ✅ auto-detected |
| ORM | Drizzle | ✅ |
| Auth | Better Auth 1.6 + Drizzle adapter | ✅ email/password |
| Billing | Stripe (Free + Pro $12/mo, 7-day trial) | ✅ |
| AI | Vercel AI SDK 6 + Anthropic Claude Sonnet | 📦 deps installed, wire-up in Phase 4 |
| Email | Resend | ✅ wrapper, ready for keys |
| Observability | Sentry (errors) + PostHog (analytics) | ✅ init files, ready for keys |
| Background jobs | Inngest | ✅ client + serve route, dev server-ready |
| Realtime collab | Liveblocks (Phase 5) | ✅ server client stub |
| File storage | Vercel Blob (Phase 1+) | 📦 env placeholder |
| Deployment | Vercel | — |
| Package mgr | pnpm 11 | ✅ |

## Foundation source

Bootstrapped from [`nextjs/saas-starter`](https://github.com/nextjs/saas-starter)
(MIT) in commit `88e1995`. The starter provided routing, layouts, build config,
Drizzle wiring, shadcn primitives, and Stripe plumbing — all of which we've
since customized.

## Phase 0 — done

| # | Item | Commit |
|---|---|---|
| 1 | Replace DIY JWT auth with Better Auth + Drizzle adapter | `d5947eb` |
| 2 | Drop team/multi-tenant scaffold (solo-only v1) | `d5947eb` |
| 3 | Stripe Free + Pro $12 tiers with 7-day trial | `d5947eb` |
| 4 | Upgrade Next.js 15.6 canary → 16.2 (CVE-2026-44578 fix) | `512d9b2` |
| 5 | Wire Neon serverless driver (prod) + postgres-js (local) | this PR |
| 6 | Sentry init + `withSentryConfig` wrap | this PR |
| 7 | PostHog server + client providers | this PR |
| 8 | Resend + Inngest + Liveblocks stubs | this PR |

## Local development

```bash
pnpm install
cp .env.example .env   # then fill in real keys

# Local Postgres (Docker example):
docker run --name nextep-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16

pnpm db:push           # apply schema to local Postgres (use migrate for prod)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Drizzle Kit: generate migration from schema diff |
| `pnpm db:migrate` | Drizzle Kit: apply pending migrations |
| `pnpm db:push` | Drizzle Kit: push schema directly (dev iteration) |
| `pnpm db:studio` | Drizzle Studio GUI |

## Required env vars (production)

See `.env.example` for the full list. The minimum to boot:

- `POSTGRES_URL` — Postgres connection string (Neon in prod)
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
- `BETTER_AUTH_URL` — e.g. `https://nextep.app`
- `NEXT_PUBLIC_APP_URL` — same
- `BASE_URL` — same (used by Stripe redirects)

Stripe + Anthropic + Sentry + PostHog keys are needed for full functionality
but the app boots without them (each integration is lazy-initialized).

## Reference

- Legacy repo: `nextep-legacy` on GitHub (local clone at `Documents/nextep/`).
- Canonical rebuild plan: [`nextep/NEXTEP_REBUILD_PLAN.md`](./NEXTEP_REBUILD_PLAN.md).
- Scoring algorithm reference: [`nextep/RESUME_SCORING_PLAN.md`](./RESUME_SCORING_PLAN.md).
- JD parsing reference: [`nextep/JOB_DESCRIPTION_PLAN.md`](./JOB_DESCRIPTION_PLAN.md).

## Open Phase 0 follow-up

The single remaining Phase 0 item is the **monorepo split** (Turborepo +
`apps/web` + `packages/{db,ai,resume-schema,pdf-render,billing}`). The
rebuild plan defers this to before Phase 2 — single-package is fine while
we're only building `apps/web` features.

## License

MIT.