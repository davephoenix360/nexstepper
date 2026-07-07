# nextep-saas

AI-assisted resume builder. Master-resume → tailored variants, ATS-style
scoring against a parsed job description, peer reviews, sharing, and real-time
collaboration.

> **Status:** Phase 0 — repo + foundation (week 1 of 14).
> See [`NEXTEP_REBUILD_PLAN.md`](./NEXTEP_REBUILD_PLAN.md) for the full rebuild
> plan and decision log (carried over from the legacy `nextep` repo).

## Stack

| Layer | Pick |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) — bumping to 16 in a follow-up |
| Language | TypeScript (strict) |
| UI | shadcn/ui + Tailwind v4 |
| Database | Postgres (Neon in prod) |
| ORM | Drizzle |
| Auth | **Better Auth** (TODO — starter ships DIY JWT, swap pending) |
| Billing | Stripe |
| AI | Vercel AI SDK 6 + Anthropic Claude Sonnet (TODO — not yet wired) |
| Email | Resend (TODO) |
| Observability | Sentry + PostHog (TODO) |
| Background jobs | Inngest (TODO) |
| Deployment | Vercel |

## Foundation source

Bootstrapped from [`nextjs/saas-starter`](https://github.com/nextjs/saas-starter)
(MIT). We kept the bones (routing, layouts, build config, Drizzle wiring,
shadcn primitives, Stripe plumbing) and will replace the auth layer in a
follow-up commit.

## Local development

```bash
pnpm install
pnpm db:setup        # creates .env with Postgres + Stripe + AUTH_SECRET
pnpm db:migrate
pnpm db:seed         # seeds a test user: test@test.com / admin123
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Phase 0 — what's left to land

The starter gets us a runnable foundation, but a few items from the rebuild
plan's Phase 0 still need explicit commits before we move to Phase 1:

- [ ] **Replace DIY JWT auth with Better Auth.** Files to gut:
      `lib/auth/session.ts`, `lib/auth/middleware.ts`, `middleware.ts`,
      `app/(login)/actions.ts`. Add `better-auth` dep + Drizzle adapter.
- [ ] **Migrate from generic `postgres-js` to Neon serverless driver** for prod.
      Keep `postgres-js` for local dev.
- [ ] **Stripe webhook stub:** verify the existing `app/api/stripe/webhook/route.ts`
      is wired against the plan's subscription model (Free + Pro $12/mo).
- [ ] **Sentry + PostHog install** + env vars in `.env.example`.
- [ ] **Upgrade Next.js 15 → 16** in a focused PR (the starter is on 15.6 canary).
- [ ] **Decide on monorepo (Turborepo).** Rebuild plan calls for `apps/web` +
      `packages/{db,ai,resume-schema,pdf-render,billing}`. Single-package today;
      split before Phase 2.
- [ ] **Drop the team/multi-tenant scaffold** (the starter's `teams` table,
      `app/api/team`, `dashboard/activity`). Solo-only for v1 per rebuild plan §7.

## Reference

- Legacy repo: `nextep-legacy` on GitHub (local clone at `Documents/nextep/`).
- Canonical rebuild plan: [`nextep/NEXTEP_REBUILD_PLAN.md`](./NEXTEP_REBUILD_PLAN.md).
- Scoring algorithm reference: [`nextep/RESUME_SCORING_PLAN.md`](./RESUME_SCORING_PLAN.md).
- JD parsing reference: [`nextep/JOB_DESCRIPTION_PLAN.md`](./JOB_DESCRIPTION_PLAN.md).

## License

MIT (inherited from the upstream starter until we change it).