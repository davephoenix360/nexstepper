# Nextep

AI-assisted resume builder. Master-resume → tailored variants, ATS-style
scoring against a parsed job description, AI chat assistant, public share
links, and (planned) peer reviews + real-time collaboration.

> **Open source under the [MIT license](./LICENSE)** — free to use, modify,
> and self-host. We charge for the hosted version at `nextep.app` (Free +
> Pro tiers). The Nextep name and logo are reserved trademarks; if you
> self-host, please rebrand your instance. See
> [`docs/SELF_HOSTING.md`](./docs/SELF_HOSTING.md) for the rules.

## What's in the product

| Feature | Status | Where |
|---|---|---|
| Email + password auth (Better Auth) | ✅ | `lib/auth.ts` |
| **Master + variant** resume model with schema-driven form | ✅ | `components/schema-form/`, `lib/db/queries.ts` |
| WYSIWYG inline editor with per-section print-hide | ✅ | `docs/plans/wysiwyg-editor.md`, `docs/plans/inline-issue-surface.md` |
| Import from PDF / DOCX / pasted text | ✅ | `lib/resume-parser/` |
| JD parser → structured `JobPostingData` | ✅ | `lib/jd-parser/` |
| ATS scoring v2 — 7 dimensions (Pearson r = 0.907 on 50-row validation corpus) | ✅ | `lib/scoring/`, `docs/plans/ats-scoring-v2.md` |
| Inline issue surface — dim-bar click → Free tip or Pro AI rewrite | ✅ | `lib/inline-issue/`, `docs/plans/inline-issue-surface.md` |
| AI chat assistant — streaming SSE + tool registry + 20-turn/day Free quota | ✅ | `app/api/chat/`, `lib/chat/`, `docs/plans/ai-chat-assistant.md` |
| Public share link at `/r/{token}` (SHA-256-hashed, 3 revocation modes) | ✅ | `lib/share/`, `app/r/[token]/page.tsx` |
| PDF export via browser print-to-PDF | ✅ | AGENTS.md Phase handoff |
| Stripe Free + Pro tiers with 7-day trial | ✅ | `lib/billing/`, `docs/setup/stripe.md` |
| GDPR Art. 17 erasure (`/dashboard/security`) + Art. 20 export | ✅ | `lib/data-rights/`, `docs/plans/pre-launch-compliance.md` |
| `/privacy`, `/terms`, `/cookies` pages | ✅ | `app/(legal)/` (Termly-template-derived, not lawyer-reviewed) |
| Reviews (peer feedback) | 📋 Phase 5 | AGENTS.md |
| Liveblocks real-time collab UI | 📋 Phase 5 | server stub wired |
| `/api/job-contexts` for browser extension | 📋 post-launch | — |

**Test count:** **970/970 green** across 78 files. Run `pnpm test`.

## Stack

| Layer | Pick |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack default) |
| Language | TypeScript 5.x strict |
| UI | shadcn/ui + Tailwind v4 |
| Database | Postgres (Neon in prod, postgres-js locally — driver auto-detected) |
| ORM | Drizzle (no Prisma) |
| Auth | Better Auth 1.6 |
| Billing | Stripe |
| AI | Vercel AI SDK 6 → Vercel AI Gateway (`@ai-sdk/gateway@3`); free-tier primary `mistral/mistral-nemo` + 4-model fallback chain |
| Email | Resend |
| Observability | Sentry (errors) + PostHog (analytics) |
| Background jobs | Inngest |
| Realtime | Liveblocks (Phase 5) |
| Package mgr | pnpm 11 |
| Deployment | Vercel |

> The locked stack is documented in [`AGENTS.md`](./AGENTS.md). Changing
> anything in this table is a discussion, not a drive-by edit.

## Local development

```bash
pnpm install
cp .env.example .env.local        # then fill in real keys

# Local Postgres (Docker):
docker run --name nextep-pg \
  -e POSTGRES_PASSWORD=dev \
  -p 5432:5432 -d postgres:16

# Or use Neon (free tier) — paste the pooled connection string into .env.local
pnpm db:migrate                   # apply migrations to your DB
pnpm dev                          # http://localhost:3000
```

> **`pnpm db:push` was deliberately removed** — it bypasses the migration
> journal and has caused drift in dev DBs. Use `db:generate` + `db:migrate`
> from now on. See AGENTS.md for the post-mortem.

### Verification (before you commit)

```bash
pnpm typecheck       # tsc --noEmit — must be clean
pnpm test            # 970+ unit tests must stay green
pnpm build           # all routes must compile
```

## Self-hosting

If you want to run this for yourself or your team without using
`nextep.app`:

- **`docs/SELF_HOSTING.md`** — full checklist: accounts you need,
  legal responsibilities, what's different from the hosted version
- **`LICENSE`** — MIT terms + trademark notice
- **`docs/setup/production.md`** — operational runbook (same steps as
  launching the hosted version, minus the DNS/Stripe setup if you
  already have those)

Quick version: clone the repo, fill in `.env.local` with your own
Stripe / Resend / AI Gateway / Sentry / PostHog keys, run migrations,
ship. The hosted version is "the same codebase with our keys"; a
self-host is the same codebase with yours.

> Don't use the Nextep name or logo on a self-hosted instance. Pick
> your own brand.

## Project structure

```
nextep-saas/
├── app/                       # Next.js App Router (marketing, auth, dashboard, legal, public share)
├── components/                # UI primitives + feature components (resume, scorecard, chat, inline-issue, marketing)
├── lib/                       # auth, db, billing, data-rights, chat, scoring, jd-parser, share, ai, ...
├── docs/                      # plans, decisions, drift memos, operational runbooks
├── AGENTS.md                  # the single source of truth for how to write code in this repo
├── NEXTEP_REBUILD_PLAN.md     # the 14-week / 6-phase rebuild plan
└── LICENSE                    # MIT
```

`AGENTS.md` is the **operating doc** — architecture, locked stack,
naming conventions, planning discipline, and the phase handoff journal
of what shipped when. Read it before you touch code.

## Reference

- [`AGENTS.md`](./AGENTS.md) — operating doc (architecture + planning discipline + phase handoff)
- [`NEXTEP_REBUILD_PLAN.md`](./NEXTEP_REBUILD_PLAN.md) — long-form rebuild plan
- [`docs/plans/`](./docs/plans/) — feature plans
- [`docs/decisions/`](./docs/decisions/) — ADRs
- [`docs/drift/`](./docs/drift/) — drift audits at phase boundaries
- [`docs/setup/`](./docs/setup/) — operational runbooks (production.md, stripe.md)
- [`docs/ai-models-reference.md`](./docs/ai-models-reference.md) — free-tier + paid AI model reference
- [`docs/SELF_HOSTING.md`](./docs/SELF_HOSTING.md) — self-hoster's checklist
- [`LICENSE`](./LICENSE) — MIT + trademark notice
- Legacy repo: [`nextep-legacy`](https://github.com/davephoenix360/nextep-legacy) — reference implementation, not port verbatim

## License

[MIT](./LICENSE) — for source code. The Nextep name, logo, and wordmark
are reserved trademarks; see LICENSE for details.
