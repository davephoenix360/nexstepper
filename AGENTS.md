# AGENTS.md — Nextep SaaS

> Loaded automatically by Mavis, Cursor, Claude Code, Aider, Codex, Devin,
> Gemini CLI, and any tool that follows the [agents.md spec](https://agents.md/).
> This is the **single source of truth** for how to write code in this repo.
> Keep it short, concrete, and current.

## Product vision

AI-assisted resume builder. The user lands, builds a **master resume**
(manually or by importing a PDF / DOCX / pasted text), pastes a
**job description** for it to parse into structured `JobPostingData`,
gets an **ATS-style score** against the resume (4 weighted dimensions),
generates a **tailored variant** via AI optimization, **shares** the
resume (public link) or invites **reviewers**, and optionally
**collaborates in real time**.

**Core user loop** — master → JD parse → score → optimize → share →
review → collab. Everything else (template studio, browser extension,
doc pages) orbits it.

> See `README.md` for the user-facing overview and `NEXTEP_REBUILD_PLAN.md`
> for the full 14-week / 6-phase plan + rationale.

### Locked non-goals (v1)

Adding any of these needs a discussion, not a drive-by edit:

| Out of v1 | Why |
|---|---|
| Cover letter builder | Stretch post-launch (rebuild plan §6). |
| LinkedIn / GitHub profile import | Out of v1 scope (rebuild plan §2). |
| Job-board integration / auto-apply | Out of v1 scope. |
| Mobile apps (Capacitor / Expo) | Out of v1 scope. |
| Multi-language i18n | Out of v1 scope. |
| Server-generated PDFs (bulk export, email attachments) | Deferred — see "Future server-side rendering" in Phase handoff. |
| LaTeX export | Deferred — HTML+CSS print is the primary render path. |

**Locked stack** (changing any of these needs a discussion, not a drive-by edit):

| Layer | Pick |
|---|---|
| Framework | Next.js 16.2+ (App Router, Turbopack default, **async cookies/headers/params**) |
| Language | TypeScript 5.x with `strict: true` |
| UI | shadcn/ui + Tailwind v4 (no MUI, no extra CSS-in-JS libs) |
| Charts | Recharts 3.x for the ATS scorecard radar (rationale + rollback in `docs/decisions/0004-recharts-for-ats-radar.md`) |
| Database | Postgres (Neon in prod, postgres-js locally — driver auto-detected) |
| ORM | Drizzle (no Prisma) |
| Auth | Better Auth 1.6+ (no NextAuth, no Clerk) |
| Billing | Stripe (Free + Pro $12/mo) |
| AI | Vercel AI SDK 6 → Vercel AI Gateway (`@ai-sdk/gateway@3`); model constants in `lib/ai/providers.ts`; free-tier primary `inclusionai/ling-3.0-flash-fin-free` with 4-model fallback chain (see `docs/ai-models-reference.md`) |
| Email | Resend |
| File storage | Vercel Blob |
| Observability | Sentry (errors) + PostHog (analytics) |
| Background jobs | Inngest |
| Realtime | Liveblocks (Phase 5) |
| Validation | Zod 4 (single source of truth for types + runtime validation) |
| Forms | react-hook-form + `@hookform/resolvers/zod` (no Formik, no RJSF) |
| Package mgr | pnpm 11 |
| Deployment | Vercel |

## Roadmap

The living priority order. Update this list when state changes — and
write a `docs/drift/` memo if the update is non-trivial (see "Drift
audit" below).

**Now (in flight)** — what this session is shipping.

Phase 3 v2 ATS scoring UI (shipped 2026-09-20, branch
`feat/ats-scoring-v2-phase3`, PR to main): 5-tier Greenhouse
scorecard badge, 7-dimension bars (4 v1 + 3 v2), 7-axis Recharts
radar, per-skill miss list grouped by priority bucket.
`ScoreBreakdown.dimensionScores` and `WEIGHTS_V2` (sum = 1.00) are
the production contract. Existing scores stay on v1 weights until
the user explicitly Recomputes (the action picks `WEIGHTS_V2` when
the JD has v2 intent-extraction fields, else falls back to
`WEIGHTS`).

Phase 3 v2 ATS scoring validation corpus (shipped 2026-09-20,
branch `feat/ats-scoring-v2-validation`, PR to main): 50
manually-curated `(resume, job, idealScore)` triples committed to
`tests/fixtures/ats-corpus.json` (~245 KB, 11 role families, 5
match-quality tiers). Pearson r vs `engine.overallScore` =
**0.907** (after Seniority Fit was wired into the sync engine
2026-09-20 — was 0.923 with seniority locked at 50) — well above
the 0.7 acceptance gate. Methodology decision (manual curation over
public / synthetic) in `docs/decisions/0005-ats-validation-corpus.md`.
Drift memo in `docs/drift/2026-09-20-ats-v2-validation-corpus.md`
(plus follow-up §"Seniority Fit wired into the sync engine"). CI
gate: `pnpm test tests/unit/scoring/validation-corpus.test.ts` must
stay green.

Inline issue surface — research + design (shipped 2026-09-20,
branch `plan/inline-issue-surface`, doc-only PR to main): the
replacement for the retired Optimize tool v0. Plan lives at
`docs/plans/inline-issue-surface.md`; ADR at
`docs/decisions/0006-inline-issue-surface.md`. Chosen direction:
**dim-bar click → scroll + pulse + inline dynamic tip (Free) +
AI-rewrite popover (Pro)**. Lazy AI (per popover open, not per
scorecard render), Mistral Nemo at `PARSER_MODEL`/`PARSE_FALLBACKS`
(no new model constant), `MatchBreakdown` JSONB type migrates from
`unknown` to a real shape. The next session ships it.

Subscription / billing — auth/billing boundary layer (shipped
2026-09-20, branch `feat/subscription-billing-complete`): the
trust-boundary helpers every Pro-only feature will share. Plan at
`docs/plans/subscription-billing.md`; ADR at
`docs/decisions/0007-tier-gating.md`. New module
`lib/billing/` with `requirePro()` (server-authoritative gate;
typed `ProRequiredError`), `usePlanFromProps()` / `useIsPro()`
(client cosmetic hints), `isProEffective()` predicate covering
`'active' | 'trialing'` Pro-effective statuses (canceled-but-in-
period and past-due handled per Stripe semantics). New Billing
card on `/dashboard/general` surfaces current plan + status +
renewal date + Upgrade / Manage billing CTAs. Inline-issue
surface's `enrichBulletAction` can now call `requirePro()` without
re-discovering the boundary.

**Next (queued, priority order)**

1. **Inline issue surface implementation** —
   `docs/plans/inline-issue-surface.md` is the spec; the next
   session builds it. New `lib/inline-issue/` module,
   `enrichBulletAction` server action with `requirePro()` gate,
   `ScorecardClient` owns the Free/Pro split, `<InlineIssuePopover />`
   anchored to the affected leaf via RHF path.
2. **AI chat assistant (Phase 4)** — `streamText` + `useChat` + tool
   registry + daily-quota enforcement (`usage` table). Free tier
   capped at 20 chat messages / day per user; unlimited on Pro.
3. **Seniority Fit calibration fix** — drift memo
   `docs/drift/2026-09-20-ats-v2-validation-corpus.md`
   §"Seniority Fit wired into the sync engine" exposes that the
   asymmetric penalty (`OVER_QUALIFIED_SLOPE = 7.5` past a ±2
   year tolerance band) penalizes senior candidates on senior-track
   JDs. Pearson r dropped from 0.923 → 0.907 once seniority was
   wired in. Two proposed fixes (flatten over-qualified penalty to
   0 past tolerance, or widen `TOLERANCE_YEARS` to 3-4). Single-
   line constant change in `lib/scoring/dimensions/seniority-fit.ts`;
   the corpus serves as the regression test.
4. **Liveblocks real-time collab UI** — presence + cursors on the
   variant editor surface; Liveblocks server stub already wired.
5. **Reviews (Phase 5)** — invite-link flow, inline comments, thumbs
   verdict.
6. **`/api/job-contexts` + extension-ready API tokens** — so
   `nextep-ext` has a clean contract.
7. **Template studio (Phase 6)** — admin-only template authoring.
8. **Monorepo split** — defer until it actually bites (likely after
   collab, when packages like `lib/scoring/` start to feel cramped).

**Later / parked** — see the locked non-goals above. Note: the
"Optimize" feature as a class of work is now parked. The inline
issue surface replaces it; no "Optimize" plan will be written. The
dead `lib/optimize/` was already deleted (2026-09-20) to prevent
naive re-use of the v0 modal-diff.

## Architectural principles (non-negotiable)

### 1. Zod schemas are the single source of truth

Never write `interface User { ... }` AND `const userSchema = z.object({...})` for the
same shape. Define the Zod schema once, infer the TypeScript type via `z.infer`.

```ts
// ✅ Right
export const resumeDataSchema = z.object({ ... });
export type ResumeData = z.infer<typeof resumeDataSchema>;

// ❌ Wrong
export interface ResumeData { ... }
export const resumeDataSchema = z.object({ ... });  // will drift
```

The same schema is used for: Drizzle insert types (via `drizzle-zod`), form
validation (via `@hookform/resolvers/zod`), AI structured output (via
`zod-to-json-schema`), and server-action input validation.

### 2. Validate at every trust boundary

Server Actions, API routes, webhook handlers, and Inngest functions are
**public endpoints** regardless of where they appear in the UI. Every one of
them:

1. Validates input with a Zod schema (`safeParse` at the top, not `parse`)
2. Checks authentication (unless intentionally public)
3. Checks authorization (user owns the resource)
4. Returns a discriminated union result (see below)

```ts
// ✅ Right
export async function saveResume(input: unknown): Promise<ActionResult<Resume>> {
  const parsed = resumeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors };
  const user = await requireUser();          // throws/redirects if not signed in
  // ... business logic ...
  return { ok: true, data: resume };
}
```

### 3. Server Action results use a discriminated union

Every Server Action returns one of these shapes. No exceptions.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
```

TypeScript narrows correctly on the client, so `if (result.ok) result.data.foo`
is fully typed.

### 4. No sensitive data in Server Action closures

Server Actions live in `'use server'` files with **top-level exports**, never
as inline closures inside React components. Closures get serialized and can
leak data across requests.

```ts
// ✅ Right — top-level export in `actions.ts`
'use server';
export async function updateProfile(input: unknown) { ... }

// ❌ Wrong — closure captures component scope
export default function Page() {
  async function save() { return updateDb(/* ... */); }  // don't do this
  return <form action={save}>...</form>;
}
```

### 5. Server Components by default, Client Components when needed

Default to a Server Component. Add `'use client'` only when the component needs:
- React hooks (`useState`, `useEffect`, `useFormStatus`, etc.)
- Browser APIs (`window`, `localStorage`)
- Event handlers (`onClick`, `onChange`)
- Third-party client libraries

If only a small part of a component needs client-side, extract that part
into a `'use client'` child and keep the parent as a Server Component.

### 6. Database queries go through `lib/db/queries.ts`

Pages and Server Actions never call `db.select(...)` directly. They import
named functions from `lib/db/queries.ts` (or feature-specific query files
under `lib/<feature>/queries.ts`). This keeps Drizzle imports centralized
and makes queries mockable for tests.

### 7. Auth is checked in the action, not just the page

The page might be behind auth middleware, but the Server Action is a public
endpoint callable by anyone with the URL. Every protected action calls
`requireUser()` (or equivalent) at the top.

## Folder structure (current + planned)

```
nextep-saas/
├── docs/                      # Plans, ADRs, drift memos, AI model reference
│   ├── plans/                 # Feature plans: docs/plans/<slug>.md
│   ├── decisions/             # ADRs: docs/decisions/NNNN-<slug>.md
│   ├── drift/                 # Phase-boundary drift audits
│   └── ai-models-reference.md # Free-tier + paid AI model reference
├── app/                       # Next.js App Router
│   ├── (marketing)/           # Public site (landing, pricing)
│   ├── (auth)/                # Sign in / sign up
│   ├── (dashboard)/           # Authed app surface
│   │   └── dashboard/
│   │       ├── page.tsx       # Overview (Phase 0 welcome)
│   │       ├── resumes/       # Phase 1: resume list + edit
│   │       ├── general/       # Profile settings
│   │       └── security/      # Password / delete account
│   ├── api/                   # Route handlers
│   │   ├── auth/[...all]/     # Better Auth catch-all
│   │   ├── stripe/            # Webhooks + checkout
│   │   ├── inngest/           # Background-job webhook
│   │   └── user/
│   ├── layout.tsx             # Root layout (PostHog provider, font, etc.)
│   └── globals.css
├── components/
│   ├── ui/                    # shadcn primitives (Input, Button, Card, etc.)
│   ├── schema-form/           # Phase 1: Zod-driven dynamic form
│   ├── resume/                # Phase 1: resume-specific UI
│   └── posthog-provider.tsx
├── lib/
│   ├── auth.ts                # Better Auth server instance
│   ├── auth-client.ts         # Better Auth React client
│   ├── resume-schema/         # Phase 1: the canonical ResumeData Zod schema
│   ├── db/
│   │   ├── schema.ts          # All Drizzle tables in one file
│   │   ├── queries.ts         # Query helpers (one per table/feature)
│   │   └── drizzle.ts         # Driver selection (Neon vs postgres-js)
│   ├── payments/              # Stripe integration
│   ├── email/                 # Resend wrapper
│   ├── inngest/               # Inngest client + serve functions
│   ├── liveblocks/            # Liveblocks server client
│   ├── posthog/               # PostHog server + client
│   ├── resume-parser/         # PDF/DOCX/TXT → AI-parsed ResumeSections
│   ├── share/                 # public-link tokens (gen, hash, URL build)
│   ├── ai/                    # Vercel AI Gateway providers + model constants
│   ├── email/                 # Resend wrapper + password-reset template
│   └── utils.ts
├── sentry.client.config.ts
├── sentry.server.config.ts
├── instrumentation.ts         # Next 16 instrumentation hook
├── next.config.ts
├── drizzle.config.ts
└── pnpm-workspace.yaml        # pnpm 11 build-script allowlist
```

**Future (when monorepo splits):**
```
packages/
├── resume-schema/             # The Zod schemas
├── ai/                        # AI SDK config, prompt registry, scoring
├── pdf-render/                # Playwright wrapper, template registry
├── billing/                   # Stripe + subscription helpers
apps/web/                      # The Next.js app (becomes current root)
```

## Planning discipline

Plans are **encouraged artifacts**, not blockers. The gate:

A plan is required when the work is any of:
- A new feature that ships end-user value (anything you'd describe in a release note).
- More than ~200 lines of code changed in one PR.
- A new env var, npm dep, external service, or DB migration.
- An architecture-shaping decision (new trust boundary, new package boundary, replacement of a locked pick).
- A change to the locked stack, the locked non-goals, or the scope of v1.

Anything below that threshold — bug fixes, small refactors, copy
tweaks, small UX polish — ships directly with a clear commit message.

### Plan template

Every plan lives at `docs/plans/<feature-slug>.md` (kebab-case,
extends the existing `docs/plans/wysiwyg-editor.md` convention). Use
this template:

```markdown
# <Feature> — Plan

## Objective
What we're building and why. One paragraph.

## User-visible behavior
What the user sees / does / receives. Concrete.

## Scope (in)
Bullet list of what's included.

## Non-goals (out of this plan)
Bullet list of related items we're explicitly NOT doing. Call out the tempting ones.

## Architecture
Diagram + key design decisions + locked tradeoffs.

## Files
- **New:** …
- **Changed:** …
- **Deleted:** …

## DB / schema
- Migrations: …
- New tables / columns / indexes: …
- Env vars: …

## Dependencies
- npm packages: …
- External services: …
- Env keys to add to `.env.example`: …

## Risks
Top 3 + mitigations.

## Acceptance criteria
Testable list. If a criterion can't be tested, it doesn't belong here.

## Test plan
- Unit: …
- Integration: …
- Manual smoke: …

## Rollback plan
How to revert cleanly if something goes wrong.

## Open questions
Anything the user must answer before/during build.
```

### Plan ↔ PR convention

- **Branch name:** `feat/<feature-slug>` or `fix/<short-slug>`.
- **Commit footer:** `Plan: docs/plans/<feature-slug>.md` (or
  `Plan: none` for sub-trigger work).
- **PR description:** links the plan and summarizes the diff vs. the
  plan.
- **Post-merge:** tick the plan's "Acceptance criteria" checkboxes if
  you used them.

### How a fresh session reads the plan

1. Read this file end-to-end — architecture principles, locked stack,
   naming, what-not-to-do.
2. Read the relevant section of `NEXTEP_REBUILD_PLAN.md` for product
   rationale.
3. Read the **Roadmap** above to see what's "Next."
4. If picking up an in-flight plan: read `docs/plans/<feature-slug>.md`
   for the spec, then the most recent `docs/drift/` memo to know
   what's changed since the plan was written.

## Architecture Decision Records (ADRs)

When we make a non-obvious architecture choice — a stack pick, a
replacement, a paid-API call, a security boundary, an explicit
deferral — write a short ADR at `docs/decisions/NNNN-short-slug.md`.
Number sequentially. Use this shape:

```markdown
# NNNN — <Decision title>

## Context
What's the situation? What forces are at play? What constraints exist?

## Decision
What we chose. One paragraph.

## Consequences
**Good:** what this unlocks / makes easier.
**Bad:** what it costs / forecloses / makes harder.

## Alternatives considered
What we didn't pick and why.
```

**When to write one** (the bar: would a fresh session reasonably
choose differently?):
- Locking a new dependency into the locked stack.
- Replacing one locked pick with another.
- Introducing a new trust boundary (auth, billing, PII handling, file uploads).
- A paid-API commitment with a cost projection.
- Any explicit "out of v1 scope" item we might revisit.

**When NOT to write one:**
- Routine bug fix.
- A refactor that doesn't change the contract.
- A small UX polish.

> The three documented pivots below (browser-print PDF, AI Gateway,
> `db:push` removal) are essentially retro-ADRs living in Phase
> handoff. New ones should land at `docs/decisions/`.

## Drift audit

On every phase boundary — or whenever shipped state diverges from
vision / roadmap — write a short drift memo at
`docs/drift/YYYY-MM-DD-phase-boundary.md` (or `…-short-slug.md` for
ad-hoc drift). The audit:

1. **Vision recap** — one paragraph: what we're shipping, who for, why
   it's differentiated.
2. **Roadmap status** — Now / Next / Later with ✅ / 🟡 / ❌ for each.
3. **Drift callouts** — anything shipped that's NOT in vision (or vice
   versa). For each: the gap, why it's drifted, and the proposed
   resolution (ship it, de-scope it, or park it).
4. **Action items** — concrete next moves.

A drift memo is the artifact that prevents future sessions from
re-litigating settled decisions.

## TypeScript conventions

- **`strict: true`** is non-negotiable. Don't add `any` to escape it; refactor.
- Prefer `import type` for type-only imports (better tree-shaking + clarity).
- One export per file unless they're tightly coupled (e.g. schema + inferred type).
- Domain enums use Zod's `z.enum([...])` so they're both runtime + type-safe.
- IDs are strings (Better Auth uses UUIDs); never use `number` for primary keys.

## Next.js 16 gotchas

- **`cookies()`, `headers()`, `params`, `searchParams` are async.** Must be awaited:
  ```ts
  const cookieStore = await cookies();   // ✅
  const session = cookieStore.get('session');
  ```
- **No `next lint`** — use the ESLint CLI directly. (We don't have lint scripts yet; add when needed.)
- **`middleware.ts` is deprecated** — renamed to `proxy.ts`. We don't have one yet; add when we need route-level auth gating.
- **Turbopack is default** for `next dev` and `next build`. Don't add `--turbopack` flags.
- **No `experimental.ppr`** — use Cache Components (`"use cache"` directive) if needed.
- **No `revalidate` magic numbers on ISR** unless we explicitly opt into dynamic rendering.

## Better Auth gotchas

- API handler lives at `app/api/auth/[...all]/route.ts` — do not duplicate.
- Server-side session reads: `const session = await auth.api.getSession({ headers: await headers() });`
- Client-side session: `const { data: session } = authClient.useSession();`
- Cookies are prefixed `nextep.*` (see `lib/auth.ts` `advanced.cookiePrefix`).
- User IDs are UUIDs (string), not numbers.

## Drizzle gotchas

- Import the `db` instance and `schema` from `@/lib/db/drizzle` and `@/lib/db/schema`.
- Use `eq`, `and`, `or`, `desc`, `asc` etc. from `drizzle-orm` (not raw SQL strings).
- JSONB columns: insert/update with typed objects. Drizzle serializes for you.
- After schema changes, run `pnpm db:generate` then `pnpm db:migrate` (prod) or `pnpm db:push` (dev).

## Naming + style

- Files: `kebab-case.ts(x)` for pages/components, `kebab-case.ts` for lib.
- React components: `PascalCase`.
- Hooks: `useThing` (camelCase, starts with `use`).
- Server Actions: verb-first (`saveResume`, `createVariant`, `deleteAccount`).
- DB columns: `snake_case` in SQL, `camelCase` in TS (Drizzle handles the mapping).
- Prefer named exports; default exports only where Next.js requires them (`page.tsx`, `layout.tsx`).

## What NOT to do

- ❌ Don't add new dependencies without checking the locked stack first.
- ❌ Don't add `useEffect` for data fetching — use Server Components / `cache()` / Server Actions.
- ❌ Don't write `try/catch` around Server Actions expecting exceptions — they return `ActionResult<T>`, they don't throw.
- ❌ Don't capture user input in action closures.
- ❌ Don't duplicate types + schemas. Infer the type from the schema.
- ❌ Don't import Drizzle in pages — go through `lib/db/queries.ts`.
- ❌ Don't add `// @ts-ignore` or `any` — fix the type.
- ❌ Don't commit secrets (`.env`, `.env.local` — both gitignored).
- ❌ Don't push to `origin/main` without a PR + CI green.

## How to verify before committing

```bash
pnpm typecheck       # must be clean
pnpm build           # must produce all routes
pnpm dev             # smoke-test any new UI
pnpm test            # 766+ unit tests must stay green (incl. ATS validation corpus, Pearson r > 0.7)
```

If you add a new env var: add it to `.env.example` with a placeholder value and
document its purpose in the comment above it.

## CodeRabbit review after each commit

CodeRabbit is installed inside WSL — the official CLI is the
Linux/macOS binary at whatever path `command -v coderabbit`
returns there (typically `~/.local/bin/coderabbit` for the
official install script). There's no native Windows build;
the unsupported Sukarth port was brittle under Win 11 /
msys2. The review process is driven from PowerShell via
`scripts/coderabbit-review.ps1` because the cross-shell hop
(msys2 bash → wsl.exe → coderabbit) is fragile for an
automatic Git hook on Windows.

**Trigger surface** — Mavis runs the launcher after every
commit it makes. Manual invocation:

```powershell
scripts/coderabbit-review.ps1                              # last commit, light, plain text
scripts/coderabbit-review.ps1 -Base main                   # all commits since main
scripts/coderabbit-review.ps1 -Plain:$false                # agent-mode structured output
scripts/coderabbit-review.ps1 -CrBinPath '~/bin/coderabbit'  # custom WSL install location
```

`--light` keeps the review under ~5 minutes (vs the default
7-30 min). Plain text is the CLI's default output (≥ 0.7.x dropped
the deprecated `--plain` flag); pass `-Plain:$false` to map to
the CLI's `--agent` flag for structured JSON. Output streams to
stdout in real time.

**CodeRabbit auto-trial** — the `cr auth status` currently
reads `Plan: Pro+`. That's the auto-trial that CodeRabbit
grants on first signup; it ends ~14 days later and the account
falls back to the Free tier (rate-limited: 200 files/hr,
4 PRs/hr; no persistent learnings). After downgrade, the
launcher still works; the only behavior change is that
context-aware reviews with team learnings are disabled.
Don't be alarmed when the plan flips.

**Why no Git hook** — a `.git/hooks/post-commit` was attempted
on 2026-07-08 and abandoned. The cross-shell detachment chain
(msys2 `nohup` + `disown` → wsl.exe → coderabbit) was unreliable;
the WSL child process often died with the parent bash, leaving
no log trail. The PowerShell launcher is simpler, debuggable,
and version-controlled.

**Path portability** — the launcher does NOT hardcode a
WSL-home path. It discovers the binary via `wsl bash -lc
'command -v coderabbit'` at runtime and falls back to
`-CrBinPath` if the discovery returns empty. AGENTS.md
references (and the launcher's own banner output) intentionally
avoid mentioning `/home/<user>/` paths so this doc reads for
any collaborator.

## Phase handoff (close-out 2026-07-13, refreshed 2026-09-01, refreshed 2026-09-18, refreshed 2026-09-18 (Optimize shipped), refreshed 2026-09-18 (planning session), refreshed 2026-09-19 (variant-first UX shipped), refreshed 2026-09-19 (JD Markdown formatting shipped), refreshed 2026-09-19 (ATS scoring shipped))

> Per-phase **drift audits** live at `docs/drift/`. Architecture
> **decisions** are recorded as ADRs at `docs/decisions/`. This section
> is the institutional journal — what was shipped, when, and why it
> mattered.

Session ends with **PDF download shipped** (2026-07-13), a
**resume import flow** (2026-09-01), a **public share-link
flow** (2026-09-01), an **AI Gateway migration** (2026-09-18),
a **password reset flow** (2026-09-18), and the
**Optimize tool v0** (2026-09-18, basics.summary rewrite
against a pasted JD). The reset flow closes the long-standing
"email + password only, no recovery" gap. Optimize is the
first end-user feature that consumes the AI Gateway; it goes
through the same `openai/gpt-4o-mini` + 3-model fallback chain
as the parsers. Both parsers (JD + resume) now route through
Vercel AI Gateway instead of calling `@ai-sdk/anthropic`
directly. The Gateway gives us free observability, automatic
cross-provider failover, 0% markup on tokens, and a single
`AI_GATEWAY_API_KEY` env var. The share link lets an owner
generate a read-only `/r/{token}` URL anyone can view without
a Nextep account. A fresh session is expected to pick up at the
**variant-first UX boundary** (2026-09-19): variants are now
the editorial surface, masters are library cards, the variant
editor carries a collapsible right rail with a JD panel (now
rendering AI-formatted Markdown; raw text fallback when the AI
fails) plus an ATS scorecard stub (slot is wired; scoring lands
next). The dashboard home now opens with "Recent variants"
pinned at the top — drop the user into their latest in-progress
variant instead of an empty hero. A new headline CTA "Tailor
with a JD" on each master card creates a variant AND attaches
the JD in one click via `createVariantFromJdAction` — that
action now also kicks off the Markdown formatter, so the very
first open of the variant editor shows formatted Markdown.
Plan B (JD Markdown) is shipped; Plan C (ATS scoring) is next
and has a home on the new right rail.

### Strategy: browser print-to-PDF (no managed API, no third-party)

The "Download PDF" affordance is a button that opens
`/dashboard/resumes/[id]/preview?print=1` in a new tab. The preview
page auto-runs `window.print()` once on mount; the user picks
"Save as PDF" in the browser's native dialog. Two clicks total.

**Why browser print, not a managed PDF API:**
- **$0 forever.** No Browserless / DocRaptor / Cloudflare bill, no
  free-tier cliff to design around.
- **No paywall on a core feature.** Every user exports PDFs
  forever; gating it behind Pro would be hostile.
- **Pixel-identical to the on-screen preview.** The PDF is the
  same Chromium engine rendering the same `app/globals.css` — no
  pipeline drift, no "looks different than what I saw" surprises.
- **Privacy-friendly.** Resume data is PII. Browser print keeps it
  on the user's machine; nothing leaves our servers.
- **No env vars, no API keys, no third-party auth surface.**

**The 3 UX concerns, verified end-to-end with Playwright:**
1. **Button UX** — chrome bar above the preview shows the help text
   "Destination: **Save as PDF** in the print dialog" inline, so
   the user knows what to do before the dialog snaps in. Hidden in
   print via `.no-print` (`@media print` in `globals.css`).
2. **Filename** — `generateMetadata()` sets `document.title` to
   `"${resumeName} — Resume"`, which Chromium uses as the default
   `Content-Disposition: filename` in the Save dialog.
3. **Background colors** — `print-color-adjust: exact` in
   `globals.css` keeps the indigo section accents, chip backgrounds,
   and divider rules visible in the PDF. Verified visually with
   `output/playwright/12-print-color-check.png` and a real 64 KB PDF
   in `output/playwright/13-print-pipeline.pdf`.

### Code map

- **Editor "Download PDF" button** —
  `app/(dashboard)/dashboard/resumes/[id]/download-pdf-button.tsx`.
  `window.open('/preview?print=1', '_blank', 'noopener,noreferrer')`.
  New tab so the editor stays usable while the print dialog is up.
- **Preview route** —
  `app/(dashboard)/dashboard/resumes/[id]/preview/page.tsx`.
  Server Component, owns `generateMetadata` for the filename, owns
  the chrome bar (Back to editor / help text / template tag / Print
  button). Renders the saved revision via the template registry.
- **Auto-print client component** —
  `app/(dashboard)/dashboard/resumes/[id]/preview/auto-print.tsx`.
  `useEffect` + `useRef` double-mount guard + 100 ms delay so the
  resume paints before the dialog opens. Opt-in via `?print=1`
  (preview is also useful for just looking).
- **Print button** — `print-button.tsx` (existing) repointed to
  `window.print()` (it was already that — just label/icon polish:
  Download icon + "Save as PDF").
- **Print CSS** — `app/globals.css` `@media print` + `@page` rules
  (page size, margins, `print-color-adjust: exact`, `.no-print`
  utility, `.page-break-before` / `.page-break-after` / `.avoid-break`
  utilities). No separate `app/print.css`; one source of truth.

### State
- `pnpm test`: **239/239 green** (was 274 before the pivot; the 35
  pdf-render tests came out with the code)
- Typecheck: clean
- 0 managed-API dependencies; 0 env vars; 0 API keys
- CI: `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile
  && pnpm typecheck && pnpm test` on push and PR (added this session)

### Mid-session pivot (Option A: clean cut)

Started the session with a full `lib/pdf-render/` adapter
(Browserless + stub provider + cache + telemetry, ~3000 lines across
10 files), a Tailwind-compile pipeline (`app/print.css` +
`pdf:css:build` script), and a smoke-test API route. Verified it
worked end-to-end (real 47 KB PDF from Browserless, real 64 KB PDF
from a local Playwright pipeline).

Pivoted to browser print after a "let's just verify the native
flow first" thought experiment. The verification passed all three
UX concerns. **All `lib/pdf-render/` code, the API routes, the
Tailwind compile pipeline, the smoke-test scripts, and the pdf-render
test files were removed in this session** — clean cut, no orphans
(verified: `lib/pdf-render/` and `app/api/pdf/` directories no
longer exist; no stale imports). `package.json`, `pnpm-lock.yaml`,
`vitest.config.ts`, `.env.example`, and `.gitignore` updated to drop
the dead config.

### Pre-existing CodeRabbit findings — triage

Round-3 review found 11 issues in pre-existing code. **All 11
fixed** across two commits this session:
- `1096a60` — 5 quick wins (`label.tsx`, `url.ts`, `dialog.tsx`,
  `modern.tsx`, `layout.tsx`)
- `925510f` — 6 remaining (`date-range.tsx` ×2, `classic.tsx`,
  `editable-resume.tsx`, `form-errors.ts`, `inspect-revisions.cjs`)

Round-3 is fully closed. Round-4 (re-run of the browser-print
migration) found 6 issues: 2 fixed in `1a2b3c4` (auto-print
strict-mode bug; missing `print-color-adjust` in globals.css),
4 pre-existing in `lib/payments/stripe.ts` + `.env.example`
queued for the next session.

### Queued for next session (Phase 2.6)

- **Liveblocks collab** (Phase 5 in the rebuild plan) — the editor
  surface is ready; collab is a session model + cursor presence
  on top of the existing component tree.
- **Optimize tier gate** — removed 2026-09-20 (drift memo
  `2026-09-20-optimize-removed.md`). The dead code path
  (`lib/optimize/`) was deleted. Future Optimize plans will
  design the inline-issue-surface UX fresh, not retrofit the
  old modal-diff.
- **Optimize work highlights** — removed 2026-09-20 (same memo).
  The stubbed `buildWorkHighlightsUserPrompt` was deleted with
  the rest of `lib/optimize/prompts.ts`.

### JD Markdown formatting (shipped 2026-09-19)

Plan: [`docs/plans/jd-markdown-format.md`](./docs/plans/jd-markdown-format.md)
(Plan B in the variant-first UX series). Two commits on
`feat/jd-markdown-format` (still in review):

- **`03319cb`** — Schema extension (`markdown` + `markdownGeneratedAt`
  on `jobPostingSchema`, both optional / nullable so legacy rows load
  fine) + the render path. `<JdPanel>` now renders
  `jobContext.markdown` via `react-markdown` when present, falling
  back to a `<pre>` of the raw `description` text when null.
- **`5bc68aa`** — The AI call. New module
  `lib/jd-parser/format-jd-as-markdown.ts` with
  `formatJdAsMarkdown(rawText): Promise<FormatJdResult>`. New
  `generateTextWithFallbacks` helper in `lib/ai/fallback.ts` (parallel
  to the existing `generateObjectWithFallbacks`, but for plain-text
  output). `setVariantJobContextAction` and `createVariantFromJdAction`
  both call the formatter and populate the schema fields.

**Why `react-markdown` v10, not v9** — plan said `^9`. v10 is the
current stable; same default-export API. v10 dropped rehype-sanitize
from the default plugin chain (it was bundled in v9), so we use the
`skipHtml` prop to strip raw HTML. JD content has no legitimate need
for raw HTML rendering, so this is the right tradeoff — no extra dep
(`rehype-sanitize` ~10KB), no behavior change for legitimate JDs,
zero XSS surface.

**Why a separate fallback chain** — formatter reuses `PARSE_FALLBACKS`
(4 models, 4 providers), so cross-provider diversification is free.
The free-tier primary (`mistral/mistral-nemo`) handles ~99% of calls;
the chain only kicks in during an outage. Output cap is 4K tokens
(real formatted JDs are 1-3K); input cap is 16K chars (matches
`setVariantJobContextSchema.max`); 30s AbortSignal per model.

**Failure as a value** — `formatJdAsMarkdown` returns a discriminated
union with codes `no_api_key | input_too_short | input_too_large |
ai_failure | empty_output`. Callers silently fall back to
`markdown: null`, and `<JdPanel>` renders raw text. The user is
never blocked on this enhancement — same offline / no-API-key
behavior as the parser calls.

**Faithfulness discipline** — the system prompt is strict:
"preserve every sentence in the same order with the same wording.
Never summarize, paraphrase, rephrase, rewrite, translate, polish,
or 'improve' the text." Mirrors the Optimize tool's anti-hallucination
discipline. The `cleanOutput()` post-processor strips wrapper
```markdown fences and "Here is the formatted JD:" preambles that
small models occasionally emit despite the prompt.

**Tests** — 21 new tests across `tests/unit/jd-panel.test.tsx` (4
Markdown render path tests: heading/list/emphasis, fenced code,
raw-text fallback, XSS strip) and
`tests/unit/jd-parser/format-jd-as-markdown.test.ts` (17 tests:
input_too_short/large, no_api_key, success, ai_failure, empty_output,
fence strip, preamble strip, blank-line collapse, prompt-injection,
AbortSignal forwarding, schema round-trip with/without/null markdown).
Total `pnpm test`: **424/424 green** (was 403).

**New deps** — exactly one: `react-markdown` (`^10.1.0`). Plan said
`^9`; we accepted `^10` (latest stable, same API). No `rehype-sanitize`
because we use `skipHtml` instead.

### ATS scoring (shipped 2026-09-19)

Plan: [`docs/plans/ats-scoring.md`](./docs/plans/ats-scoring.md) —
"Plan C" in the variant-first UX series. Three commits on
`feat/ats-scoring` (still in review):

- **`4c2dd49`** — Pure scoring engine. `lib/scoring/` ships
  `score.ts` (top-level composition), `similarity.ts` (tokenize +
  Jaccard + flatteners), `dictionaries.ts` (action verbs / weak
  verbs / soft skills / stop words), and 4 dimension modules
  (`ats-matching`, `structure`, `content-quality`, `alignment`).
  Hard constraints (plan §"Hard constraints") all enforced:
  sync, no IO, no external services, deterministic, no new deps.
  148 unit tests covering each dimension in isolation, golden
  regression (bounded ranges — see Drift below), purity test
  (static grep of `lib/scoring/` for `fetch` / `http` / `https` /
  `crypto` / `Date.now` / `Math.random` / `async` / `await`), and
  a latency benchmark (100-iteration `scoreResume` < 100 ms).
- **`9b11506`** — Scorecard UI + variant badge.
  `components/scorecard/{scorecard,dimension-bar,empty-state}.tsx`
  form the presentational surface. `<AtsScorecard>` (the slice-2
  placeholder) gains a `breakdown?: ScoreBreakdown | null` prop
  and delegates to `<ScorecardPanel>` when present. The variant
  editor page computes the score server-side on first render (plan
  §"Key design decisions" #6). `listResumes()` now batches every
  variant's revision in one query and returns a per-variant score
  map; `<VariantRow>` renders a color-coded score badge on every
  variant card. Tier thresholds exported from
  `dimension-bar.tsx` (80 / 50) so the scorecard + badge stay in
  lock-step.
- **`f92ef93`** — Recompute wiring. `recomputeScoreAction` Server
  Action validates session + ownership + input via Zod, refuses
  to score master / no-JD variants, calls
  `scoreResumeFromEnvelope`, and revalidates the editor path.
  `<ScorecardClient>` wraps `<ScorecardPanel>` and owns
  `useTransition` for the Recompute button (acceptance criterion
  #7). Inline error display below the panel — no toast.

**Adapter pattern** — `scoreResume` itself takes a narrow
`ScoreableResume` + `ScoreableJob` shape so the engine stays
dependency-free. `scoreResumeFromEnvelope(resume, job)` adapts the
wide `ResumeData` + `JobPosting` envelope down to the narrow shape
for callers that already hold parsed envelope data (Server
Components, `listResumes()`).

**Drift from plan:**
  - Golden-fixture tests assert **bounded ranges** (well-matched
    ≥ 50, poorly-matched < 30) rather than literal legacy-output
    equality. The legacy uses `@xenova/transformers` embeddings
    which v1 explicitly drops per plan §"Hard constraints"; numeric
    equality is unreachable by construction. Documented in
    `tests/unit/scoring/score.test.ts`.
  - Readability (Flesch-Kincaid) sub-criterion dropped per plan
    §"Non-goals" — saves the `flesch-kincaid` + `syllable` deps.
    Content-quality weights are 40/30 (sum 70%) instead of the
    legacy's 40/30/30 (sum 100%). Documented in
    `dimensions/content-quality.ts`.
  - `<AtsScorecard>` was deleted in slice 3. The placeholder lived
    as a temporary shape until `<ScorecardClient>` + `<ScorecardPanel>`
    shipped; the placeholder tests moved to
    `tests/unit/scorecard.test.tsx`.

**Test count:** 424 → 588 (+164). `pnpm typecheck` clean.

**New deps:** zero. Pure TypeScript + the Zod schemas we already
have.

### Resume import flow (shipped 2026-09-01)

The create form (`CreateMasterResumeForm` at
`app/(dashboard)/dashboard/resumes/_components/create-master-form.tsx`)
ships with two modes: **Start from scratch** (existing behavior) and
**Import from file** (new). The import mode accepts PDF, DOCX, or
pasted text.

- **UI** — `EditorTabs` segmented control switches modes. The
  Import tab has its own sub-toggle: "Upload file" (drag-and-drop
  area + file picker) or "Paste text" (textarea). Both share one
  name field and one submit button ("Import & create").
- **Server Action** — `importResumeAction(formData)` in
  `app/(dashboard)/dashboard/resumes/actions.ts`. Validates session,
  file size (10 MB cap), file type, runs extraction + AI parse,
  creates the master with the parsed `ResumeSections` in the first
  revision. Returns a discriminated union with 12 typed error codes
  (`not_signed_in`, `no_api_key`, `ai_failure`, `pdf_parse_failed`,
  etc.) so the UI surfaces specific guidance instead of a generic
  toast.
- **Parser module** — `lib/resume-parser/` with three files:
  - `extract-file-text.ts` — `unpdf` for PDF, `mammoth` for DOCX,
    UTF-8 decode for TXT. Discriminated-union result with
    `pdf_parse_failed` / `docx_parse_failed` / `text_too_short` /
    `empty_file` / `unsupported_type` codes.
  - `parse-resume.ts` — Vercel AI SDK 6 `generateObject` with
    `resumeSectionsSchema` as the output contract. The model can't
    return a non-conforming object. Returns `no_api_key` /
    `ai_failure` / `validation_failed` / `resume_too_short` codes.
  - `prompts.ts` — system prompt that mirrors the JD parser's
    structure: role + output contract + rules of thumb + anti-
    hallucination discipline.
- **Why not the legacy's 12-parallel-call pattern?** Vercel AI SDK
  6's structured output handles the whole `resumeSectionsSchema` in
  one call. Single call = single round trip = cheaper + faster + no
  cross-call consistency issues. The legacy needed 12 calls because
  it was using a non-structured Mistral call with manual retries.
- **Privacy** — File bytes are read into memory only for the
  request duration. The text is sent to Anthropic Claude. The
  original file is **not** stored in Vercel Blob or anywhere else.
  A one-line disclosure is shown under the upload area.
- **Next.js body size** — `next.config.ts` sets
  `experimental.serverActions.bodySizeLimit: '10mb'`. The parser
  also has a `MAX_FILE_BYTES` cap (defense in depth).
- **Tests** — 18 new unit tests in `tests/unit/resume-parser/`
  covering the file extractor (PDF / DOCX / TXT / size guards /
  error mapping) and the AI parser (mocked `generateObject`,
  same shape as the JD parser tests).

### Privacy stance for AI features

Both AI features (JD parse in `lib/jd-parser/` and resume parse in
`lib/resume-parser/`) send the user's text to Anthropic Claude via
Vercel AI Gateway. This is documented in each parser's JSDoc. The
UI shows a one-line disclosure in the relevant form. The
file-PDF-to-text path keeps bytes in memory only — no third-party
upload, no Vercel Blob storage. Consistent with the PDF-print
decision: keep PII handling visible and minimal.

### Password reset flow (shipped 2026-09-18)

Closes the long-standing "email + password only, no recovery"
gap. Two UI pages + a server-side email hook, all on Better Auth's
existing token machinery.

- **Server config** — `lib/auth.ts` wires up
  `emailAndPassword.sendResetPassword`, sets
  `resetPasswordTokenExpiresIn: 60 * 60` (1 hour), and points
  `resetPasswordURL` at `/reset-password`. Better Auth generates
  the single-use token, stores it in the `verification` table, and
  invokes our callback with `{ user, url }`.
- **Email send** — `lib/email/reset-password.ts` builds a clean
  HTML + text template and sends via the existing Resend wrapper.
  When `RESEND_API_KEY` is unset (dev mode), the URL is logged to
  the server console so the developer can copy it manually. The
  constant `EXPIRY_MINUTES_DEFAULT` is exported so tests can
  assert the value stays in sync with the auth config.
- **Forgot password page** — `/forgot-password`. Calls
  `authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })`.
  Returns a generic success state whether or not the email is
  registered (no enumeration leak).
- **Reset password page** — `/reset-password`. Reads `?token=…`,
  calls `authClient.resetPassword({ newPassword, token })`,
  redirects to `/sign-in?reset=1` on success. If the token is
  missing, it routes the user back to the request flow instead of
  showing a confusing form. Does NOT auto-sign-in (safer default —
  an attacker with the token would still need the new password).
- **Sign-in polish** — "Forgot password?" link under the password
  field (signin mode only). Reset-success banner shows when
  redirected from the reset flow.
- **Privacy** — the email body never contains the password, only a
  single-use URL with a 1h expiry token. The template HTML-escapes
  the user's name and the URL when interpolating (defense in depth
  against weird-but-not-malicious input).
- **Tests** — 20 unit tests in `tests/unit/email/reset-password.test.ts`
  covering: URL in href + plain-text fallback, name greeting +
  fallbacks (null / undefined / whitespace), HTML escaping of name
  and URL, expiry wording + custom override, footer text, doctype
  validity, and the `EXPIRY_MINUTES_DEFAULT` constant.

### AI Gateway migration (shipped 2026-09-18)

Both parsers and (when built) the Optimize tool route through
Vercel AI Gateway (`@ai-sdk/gateway@3`) instead of calling
`@ai-sdk/anthropic` directly.

- **Why** — Single `AI_GATEWAY_API_KEY` env var gives us access
  to 275+ models across Anthropic, OpenAI, Google, Mistral,
  DeepSeek, etc. with 0% markup, automatic cross-provider
  failover, and free spend / latency observability in the Vercel
  dashboard. The free tier covers our current usage ($5/mo credit,
  no card).
- **Where** — `lib/ai/providers.ts` holds the model constants
  (`JD_PARSER_MODEL`, `RESUME_PARSER_MODEL`, `OPTIMIZE_MODEL`)
  and the `getModel(modelId)` resolver. The parsers import the
  constants and never touch `@ai-sdk/gateway` directly.
- **Pinned versions** — `@ai-sdk/gateway@3` is the bridge
  version that works with the current `ai@6.x`. `@ai-sdk/gateway@4`
  is for AI SDK 7 only (returns `LanguageModelV4`, which AI SDK 6
  rejects). When we upgrade to AI SDK 7 (recommended, see
  `output/deep-research/20260901_222225_ai-integration-options/`),
  we'll bump both `ai` and `@ai-sdk/gateway` to v7/v4 together.
- **Switching providers** — Change `JD_PARSER_MODEL` /
  `RESUME_PARSER_MODEL` to a different model string (e.g.
  `'google/gemini-2.5-flash'`). The Gateway supports them all.
- **Optimize tool planning** — `OPTIMIZE_MODEL` is pre-set to
  `claude-haiku-4.5` so the Optimize action can `import { OPTIMIZE_MODEL }`
  from day one; we'll add a `fallback: 'anthropic/claude-sonnet-5'`
  chain when Optimize ships.
- **Tests** — 8 new unit tests in `tests/unit/ai/providers.test.ts`
  lock in the model string conventions and the `getModel` shape.
  Both parser test files swap the mocked `@ai-sdk/anthropic` for
  a mocked `@ai-sdk/gateway`.

### Optimize tool v0 (shipped 2026-09-18)

The first end-user feature built on the AI Gateway. Rewrites a
specific resume section against a pasted job description —
the section is shown side-by-side with the original so the
candidate can accept or dismiss the suggestion.

**V0 scope:** `basics.summary` only. Plumbing (server action,
UI, fallback chain, save-as-revision) is section-type-agnostic
so the next section type is one PR away. The `work[*].highlights`
prompt builder is already stubbed at
`buildWorkHighlightsUserPrompt` in `lib/optimize/prompts.ts`.

**UX flow:**
1. Click "Optimize" in the editor header → `/dashboard/resumes/[id]/optimize`.
2. Paste the JD (min 200 chars). Click "Optimize summary" (3-8s).
3. Side-by-side view: Current vs Optimized (emerald accent +
   "AI suggestion" badge). Accept & save creates a new revision;
   Dismiss drops the suggestion.
4. On accept → `revalidatePath` → editor shows the new summary.

**Hard anti-hallucination discipline.** The system prompt
explicitly forbids inventing facts, changing identifying data,
adding metrics, or replacing the candidate's voice. The summary
prompt asks for a section that surfaces keywords the candidate
*already* claims elsewhere in their resume — never new ones.

**No tier gate in v0.** Anyone can use Optimize. Pro gating is
a small follow-up that adds an entitlement check (Stripe
subscription status) at the top of `runOptimizeSummaryAction`.
The Phase 3 plan has Optimize as Pro-only; we ship ungated first
to validate the UX.

**Code map:**
- `lib/optimize/prompts.ts` — `OPTIMIZER_SYSTEM_PROMPT` (the
  no-invent, no-fluff discipline) + `buildSummaryUserPrompt` +
  stub `buildWorkHighlightsUserPrompt`.
- `lib/optimize/optimize-resume.ts` — `optimizeSummarySection()`
  (calls `generateObjectWithFallbacks` with the same 4-model
  chain as the parsers; strict Zod output schema; 90s abort
  signal; `MAX_JD_CHARS` 8K + `MAX_SUMMARY_CHARS` 2K caps),
  `extractSummaryFromResumeData`, `applyOptimizedSummary`
  (pure, structural-sharing immutability).
- `app/(dashboard)/dashboard/resumes/[id]/optimize-actions.ts`
  — `runOptimizeSummaryAction` (auth + Zod input + ownership via
  `getResume()` + AI call + return `{ original, optimized,
  modelUsed }`) and `applyOptimizeSummaryAction` (auth + Zod +
  ownership + `applyOptimizedSummary` + `saveResumeRevision` +
  `revalidatePath`).
- `app/(dashboard)/dashboard/resumes/[id]/optimize/page.tsx` —
  Server Component, auth redirect + `getResume()` ownership check
  + `extractSummaryFromResumeData()` to seed the client.
- `app/(dashboard)/dashboard/resumes/[id]/optimize/optimize-client.tsx`
  — staged UX (idle → running → done → error), useTransition
  pattern from the password-reset fix, side-by-side result view.
- `app/(dashboard)/dashboard/resumes/[id]/optimize-button.tsx` —
  tiny client component linking to the Optimize page.
- Editor header wiring — `<OptimizeButton resumeId={resume.id} />`
  added next to `<ShareButton>` and `<DownloadPdfButton>`.

**Persistence pattern.** Optimize creates a new `resume_revisions`
row on accept (same path as `saveResumeAction`). The original
summary stays in revision history. Reversible for free.

**Privacy.** Text is sent to OpenAI/etc via Vercel AI Gateway
for the rewrite. Never persisted outside the user's own
revisions. One-line UI disclosure on the Optimize page:
"Minimum 200 characters. Your text is sent to the AI provider
via Vercel AI Gateway and is not stored."

**Tests** — 38 new unit tests in `tests/unit/optimize/`:
- `prompts.test.ts` (17 tests): system-prompt discipline,
  prompt shape, empty/whitespace handling, no-HTML-escape (LLM
  is the consumer), bullet numbering for the future work
  highlights path.
- `optimize-resume.test.ts` (21 tests): `jd_too_short` (incl.
  length in msg), `no_api_key`, success path (whitespace
  trimmed), `validation_failed` on empty output, `ai_failure`
  walks all 4 models in the chain, empty-summary passthrough,
  `MAX_JD_CHARS` truncation, schema + temperature + abortSignal
  wiring, pure-helper immutability + structural sharing.

Total: **379 tests across 24 files, all green**. Typecheck
clean. **End-to-end requires `AI_GATEWAY_API_KEY`** in
`.env.local`; without it, the action returns `no_api_key`
and the UI shows a setup hint.

**2026-09-20 follow-up -- removed.** The Optimize card on the
dashboard home was taken down on 2026-09-20 (the founder
considered the side-by-side modal UX "extremely strange" --
it pulled the user out of the resume editor they were trying
to improve). This session deleted the rest of the dead code:
`lib/optimize/` (orchestrator + prompts) and
`tests/unit/optimize/` (38 tests). `OPTIMIZE_MODEL` was
removed from `lib/ai/providers.ts`. The
`app/(dashboard)/dashboard/resumes/[id]/optimize*` files
were already gone by the time this session touched the
codebase. Drift memo: `docs/drift/2026-09-20-optimize-removed.md`.
The next session that picks up "Optimize" will start from
zero (research + plan) rather than retrofit this UX.

### DB migrations: `db:push` vs `db:generate` + `db:migrate` (learned the hard way)

Drizzle-kit has **two mutually-exclusive dev workflows** and mixing them gets you stuck. We hit this on 2026-09-18 when the share-link columns were missing from the dev DB.

| Command | What it does | Audit trail? |
|---|---|---|
| ~~`pnpm db:push`~~ (**removed**) | Syncs schema → DB directly. No files, no history. | **No.** Don't use. The script was deleted from `package.json` to prevent accidental use. |
| `pnpm db:generate` + `pnpm db:migrate` | Generates numbered `.sql` files in `lib/db/migrations/`, applies them in order, tracks them in `__drizzle_migrations`. | **Yes.** Replayable, version-controlled. |

**`db:push` was deliberately removed** from `package.json` on 2026-09-18 after we hit the drift problem below. If you ever feel tempted to call `pnpm exec drizzle-kit push` directly, that's the same foot-gun — use `db:generate` + `db:migrate` instead.

**The fix that worked** — `scripts/sync-pending-migrations.mjs`:
1. Creates `__drizzle_migrations` if missing.
2. For each migration 0000..0003, computes the SHA-256 hash (drizzle's scheme) and inserts a row.
3. For 0003, also runs the SQL (since the columns aren't yet in the DB).
4. For 0000..0002, only marks them applied (the tables are already there from prior `db:push` calls).

Run once to reconcile, then use `db:generate` + `db:migrate` from now on. Idempotent — safe to re-run.

**Known drizzle-kit bug** (drizzle-kit 0.30.4 .. 0.31.5): `db:push` on Postgres 18 fails with `column "id" is in a primary key` (code 42P16) on tables with NOT NULL PK columns. Fixed in 0.31.7. We hit this; the sync script sidesteps it entirely.

**Going forward**: use `pnpm db:generate` to create migrations from schema diffs, commit the SQL files, then `pnpm db:migrate` to apply. The sync script exists for the one-off reconciliation.

### Public share-link flow (shipped 2026-09-01)

Owners can flip a switch in the editor header → generate a
`/r/{token}` URL → share with recruiters/mentors without forcing
them to sign up.

- **URL shape** — `/r/{token}`. Short, magic-link style. NOT
  `/share/{token}` (tells crawlers the page is meant to be shared;
  we want it quiet).
- **Token format** — 21 chars of CSPRNG entropy (nanoid with a
  custom URL-safe alphabet; excludes `0/O/1/l/I` to avoid
  ambiguity). 126 bits — collision odds are zero at any realistic
  scale. Picked over UUIDv4 for URL brevity (21 vs 36 chars) and
  over signed JWT for instant revocation (no denylist needed).
- **Hash, don't store** — the DB column `resumes.share_token_hash`
  is the **SHA-256 hex digest** of the token. A DB leak does not
  leak shareable URLs. The unhashed token lives in the URL only.
- **Revocation** — three modes:
  1. Disable (`share_enabled = false`): existing URL returns 404
     instantly. Token hash kept on the row.
  2. Rotate: new hash, new URL, old URL dies immediately.
     `share_view_count` preserved (lifetime stat).
  3. Delete the resume: cascade wipes everything (including
     `share_token_hash`) via the existing FK on cascade.
- **Schema** — migration `0003_common_blizzard.sql`. Five new
  columns on `resumes` + a btree index on `share_token_hash` for
  the O(1) public lookup. No joins; no new tables.
- **Owner UI** — `ShareButton` client component, next to the
  Download PDF button in the editor header. State machine:
  `disabled → enabled → rotated`. URL is shown only after a fresh
  enable/rotate (never displays a stale URL).
- **Public route** — `app/r/[token]/page.tsx`. Server component, no
  auth, no chrome. `notFound()` for both unknown-token and
  disabled-share (no information leak between the two). Increments
  `share_view_count` fire-and-forget.
- **SEO** — `noindex, nofollow, nocache` on every share-page
  render. PII should never be indexed. Resume data is PII.
- **Module layout** —
  - `lib/share/token.ts` — generate / hash / build-URL
  - `lib/share/index.ts` — barrel
  - `lib/db/queries.ts` — 6 new functions (getShareStatus,
    enableShare, disableShare, rotateShareToken,
    getResumeByShareToken, recordShareView)
  - `app/(dashboard)/dashboard/resumes/actions.ts` — 3 new
    actions (enableShareAction, disableShareAction,
    rotateShareTokenAction) sharing the
    `ShareActionErrorCode` discriminated union
  - `app/r/[token]/page.tsx` — public render
  - `app/(dashboard)/dashboard/resumes/[id]/share-button.tsx` —
    owner dialog
- **Tests** — 15 unit tests in `tests/unit/share/token.test.ts`
  (token format, hash determinism, URL building edge cases). The
  DB-touching functions are exercised via the integration with the
  editor page; mock-based unit tests for them would be testing
  Drizzle, not our code.

### Future server-side rendering — decision deferred

If we ever need server-generated PDFs (anonymous share links, email
attachments, bulk export), the right shape is a **separate worker
process** that owns the template registry + a headless renderer —
NOT `react-dom/server` inside a Next.js app route (Next.js 16
reserves that module for its own RSC pipeline). The
`DownloadPdfButton` JSDoc documents the seam so the constraint is
captured without baking the complexity in.

None of the above are in the launch roadmap. The core use case
(edit → download → attach to application) is fully served by the
browser-print path.

## Reference

- `NEXTEP_REBUILD_PLAN.md` — full 14-week plan with rationale
- `README.md` — user-facing overview + setup
- `docs/plans/` — feature plans (`<feature-slug>.md`)
- `docs/decisions/` — Architecture Decision Records (`NNNN-<slug>.md`)
- `docs/drift/` — drift audits at phase boundaries
- `docs/ai-models-reference.md` — free-tier + paid AI model reference
- `scripts/coderabbit-review.ps1` — the CodeRabbit entry point
- Legacy `nextep/` repo — reference implementation (don't port verbatim;
  use as ground truth for data shapes and product behavior)
- [agents.md spec](https://agents.md/) — how this file is consumed