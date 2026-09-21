# nextep-saas

AI-assisted resume builder. Master-resume → tailored variants, ATS-style
scoring against a parsed job description, peer reviews, sharing, and real-time
collaboration.

> **Status:** Phase 2.5/3 — foundation, resume CRUD, WYSIWYG editor,
> import flow, share link, Optimize v0, AI Gateway migration, and password
> reset all shipped. See [Roadmap](./AGENTS.md#roadmap) in `AGENTS.md` for
> the live priority order and [`NEXTEP_REBUILD_PLAN.md`](./NEXTEP_REBUILD_PLAN.md)
> for the long-form rebuild plan.

## Stack

| Layer | Pick | Status |
|---|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack default) | ✅ |
| Language | TypeScript 5.x strict | ✅ |
| UI | shadcn/ui + Tailwind v4 | ✅ |
| Database | Postgres (any Postgres-protocol endpoint: local, Neon, RDS) | ✅ postgres-js driver |
| ORM | Drizzle | ✅ |
| Auth | Better Auth 1.6 + Drizzle adapter | ✅ email/password |
| Billing | Stripe (Free + Pro — coffee-tier pricing, 7-day trial) | ✅ |
| AI | Vercel AI SDK 6 → Vercel AI Gateway (`@ai-sdk/gateway@3`); free-tier primary `inclusionai/ling-3.0-flash-fin-free` + 4-model fallback chain | ✅ wired into JD parser, Resume parser, Optimize v0 |
| Email | Resend | ✅ wrapper, ready for keys |
| Observability | Sentry (errors) + PostHog (analytics) | ✅ init files, ready for keys |
| Background jobs | Inngest | ✅ client + serve route, dev server-ready |
| Realtime collab | Liveblocks (Phase 5) | ✅ server client stub; collab UI pending |
| File storage | Vercel Blob | 📦 env placeholder (not yet used) |
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

## What's shipped since Phase 0

Each entry below is a feature + the doc that captures the design rationale.

| Feature | Status | Notes |
|---|---|---|
| Resume CRUD + master/variant + schema-driven edit form | ✅ | `lib/db/queries.ts`, `components/schema-form/` |
| **WYSIWYG inline editor** (Basics + Work inline; rest via section dialogs) | ✅ | Plan: [`docs/plans/wysiwyg-editor.md`](./docs/plans/wysiwyg-editor.md) |
| **Import from file** (PDF / DOCX / pasted text) | ✅ | `lib/resume-parser/` |
| **JD parser** → structured `JobPostingData` | ✅ | `lib/jd-parser/` |
| **Resume parser** → structured `ResumeSections` | ✅ | `lib/resume-parser/` |
| **Template registry** (Modern, Classic, Classic-Readonly) | ✅ | `components/resume-templates/` |
| **PDF export** via browser print-to-PDF | ✅ | Pivoted from Playwright-managed-API mid-session. See AGENTS.md Phase handoff. |
| **Public share link** at `/r/{token}` (SHA-256-hashed token, 3 revocation modes) | ✅ | `lib/share/`, `app/r/[token]/page.tsx` |
| **Optimize v0** — rewrite `basics.summary` against a pasted JD (side-by-side accept/dismiss) | ✅ | `lib/optimize/`, `app/(dashboard)/dashboard/resumes/[id]/optimize/` |
| **AI Gateway migration** — all AI routes through `@ai-sdk/gateway@3` | ✅ | [`docs/ai-models-reference.md`](./docs/ai-models-reference.md) |
| **Password reset** flow (Better Auth + Resend) | ✅ | `app/(auth)/reset-password/`, `lib/email/reset-password.ts` |
| **CI** — typecheck + tests on push and PR | ✅ | `.github/workflows/ci.yml` |

Tests: **379 across 24 files** (all green). See `AGENTS.md` Phase handoff
for the institutional journal — what shipped, when, and why.

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
| `pnpm db:studio` | Drizzle Studio GUI |

> **`db:push` was removed on 2026-09-18** — it bypasses the migration
> journal and caused drift in the dev DB. Use `db:generate` + `db:migrate`.
> See AGENTS.md Phase handoff for the full post-mortem.

## Required env vars (production)

See `.env.example` for the full list. The minimum to boot:

- `POSTGRES_URL` — Postgres connection string (local docker, Neon, or any Postgres-protocol endpoint)
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
- `BETTER_AUTH_URL` — e.g. `https://nextep.app`
- `NEXT_PUBLIC_APP_URL` — same
- `BASE_URL` — same (used by Stripe redirects)
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway key. Free tier covers current usage.

Stripe + Sentry + PostHog + Resend + Liveblocks keys are needed for full
functionality but the app boots without them (each integration is
lazy-initialized).

## Reference

- [`AGENTS.md`](./AGENTS.md) — operating doc: architecture principles, locked stack, roadmap, planning discipline
- [`NEXTEP_REBUILD_PLAN.md`](./NEXTEP_REBUILD_PLAN.md) — full 14-week plan + rationale
- [`docs/plans/`](./docs/plans/) — feature plans (e.g. `wysiwyg-editor.md`)
- [`docs/decisions/`](./docs/decisions/) — architecture decision records (ADRs)
- [`docs/drift/`](./docs/drift/) — drift audits at phase boundaries
- [`docs/ai-models-reference.md`](./docs/ai-models-reference.md) — free-tier + paid AI model reference
- Legacy repo: `nextep-legacy` on GitHub (local clone at `Documents/nextep/`). Scoring algorithm reference: `nextep/RESUME_SCORING_PLAN.md`. JD parsing reference: `nextep/JOB_DESCRIPTION_PLAN.md`.

## Next on deck

The **headline next feature** is the **ATS scoring engine + scorecard UI**
(see [Roadmap](./AGENTS.md#roadmap)). The plan will land at
[`docs/plans/ats-scoring.md`](./docs/plans/) before any code.

## License

MIT.