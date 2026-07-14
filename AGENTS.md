# AGENTS.md — Nextep SaaS

> Loaded automatically by Mavis, Cursor, Claude Code, Aider, Codex, Devin,
> Gemini CLI, and any tool that follows the [agents.md spec](https://agents.md/).
> This is the **single source of truth** for how to write code in this repo.
> Keep it short, concrete, and current.

## What this project is

AI-assisted resume builder. Master-resume → tailored variants, ATS-style
scoring against a parsed job description, peer reviews, sharing, real-time
collaboration. See `README.md` for the user-facing overview and
`NEXTEP_REBUILD_PLAN.md` for the 14-week / 6-phase plan.

**Locked stack** (changing any of these needs a discussion, not a drive-by edit):

| Layer | Pick |
|---|---|
| Framework | Next.js 16.2+ (App Router, Turbopack default, **async cookies/headers/params**) |
| Language | TypeScript 5.x with `strict: true` |
| UI | shadcn/ui + Tailwind v4 (no MUI, no extra CSS-in-JS libs) |
| Database | Postgres (Neon in prod, postgres-js locally — driver auto-detected) |
| ORM | Drizzle (no Prisma) |
| Auth | Better Auth 1.6+ (no NextAuth, no Clerk) |
| Billing | Stripe (Free + Pro $12/mo) |
| AI | Vercel AI SDK 6 + Anthropic Claude Sonnet |
| Email | Resend |
| File storage | Vercel Blob |
| Observability | Sentry (errors) + PostHog (analytics) |
| Background jobs | Inngest |
| Realtime | Liveblocks (Phase 5) |
| Validation | Zod 4 (single source of truth for types + runtime validation) |
| Forms | react-hook-form + `@hookform/resolvers/zod` (no Formik, no RJSF) |
| Package mgr | pnpm 11 |
| Deployment | Vercel |

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
pnpm test            # 236+ unit tests must stay green
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
scripts/coderabbit-review.ps1                              # last commit, light, plain
scripts/coderabbit-review.ps1 -Base main                   # all commits since main
scripts/coderabbit-review.ps1 -Plain:$false                # agent-mode structured output
scripts/coderabbit-review.ps1 -CrBinPath '~/bin/coderabbit'  # custom WSL install location
```

`--light` keeps the review under ~5 minutes (vs the default
7-30 min). `--plain` emits human-readable text; pass
`-Plain:$false` for structured JSON. Output streams to stdout
in real time.

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

## Phase handoff (close-out 2026-07-13)

Session ends with **PDF download shipped** via the browser's native
print-to-PDF. **Mid-session pivot** from a managed-API strategy
(Browserless) to zero-dependency browser print. A fresh session is
expected to pick up at the **Phase 2.4 boundary**.

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

Round-3 is fully closed. Re-run the next session to confirm and
to start on whatever round-4 surfaces.

### Queued for next session (Phase 2.4)

- **Liveblocks collab** (Phase 5 in the rebuild plan) — the editor
  surface is ready; collab is a session model + cursor presence
  on top of the existing component tree.
- **Optimize tool** (Pro-only AI tailoring against a parsed JD) —
  needs the JD parser + a prompt template + a Vercel AI SDK 6
  call. The "tier gating" decision (Free vs Pro) lands here.

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
- `scripts/coderabbit-review.ps1` — the CodeRabbit entry point
- Legacy `nextep/` repo — reference implementation (don't port verbatim;
  use as ground truth for data shapes and product behavior)
- [agents.md spec](https://agents.md/) — how this file is consumed