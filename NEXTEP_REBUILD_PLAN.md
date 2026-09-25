# Nexstepper — Rebuild Plan v1

> **Status:** Decisions confirmed 2026-07-06. Refreshed 2026-09-18 to match
> shipped state (Phase 2.5/3 boundary). For the current priority order
> and what's "Next", see the **Roadmap** section in [`AGENTS.md`](./AGENTS.md).
> Phase-by-phase shipped status is annotated in §6 below.
>
> Original 2026-07-06 decisions:
> - ✅ Auth: **Better Auth**
> - ✅ Boilerplate: **Build from `nextjs/saas-starter`** (no Makerkit budget)
> - ✅ Templates: **HTML+CSS** (PDF rendering later pivoted to browser print-to-PDF — see AGENTS.md Phase handoff). LaTeX is export-only / deferred.
> - ✅ Repo: **New GitHub repo**, current `nexstepper` folder kept as reference
> - 🆕 Browser extension `nexstepper` becomes a JD-capture client for the SaaS (post-launch, but the SaaS API must support it from day one)
>
> **TL;DR:** Rebuild as a Next.js 16 + React 19 + TypeScript SaaS on a Postgres + Drizzle
> foundation, with Better Auth, Stripe billing, Vercel AI SDK 6 → Vercel AI
> Gateway for the AI layer, and browser print-to-PDF for export (lets templates
> stay as React/HTML/CSS while still giving the user a real PDF). Real-time
> collab via Liveblocks (Phase 5). Browser extension is a downstream client
> of the same `/api/job-contexts` endpoint (still pending).

---

## 1. What we're keeping and what we're throwing out

### Keep (the spine of the product)
- The **structured resume model** (basics / work / education / projects / skills / volunteer /
  awards / certificates / publications / languages / interests / references). This is the
  contract your templates and AI both depend on. Don't change the shape, just clean it up.
- The **master-resume pattern** (one "general" resume, then per-target variants). Good.
- The **ATS-style scoring algorithm** (4 dimensions, weighted). The math is defensible and the
  weighted structure matches recruiter rubrics. Keep the math, replace the implementation.
- The **template-render-to-PDF pipeline** in concept — data → template → PDF — but rebuild
  the templates and renderer.
- The **per-resume job context**. Killer differentiator, keep it.

### Throw out
- **The Python FastAPI embedding service.** `@xenova/transformers` runs in the browser and a
  SHA1 fallback already exists. Delete the file. Use the provider's embedding API directly when
  needed (`text-embedding-3-small` for OpenAI, `embeddings` for Cohere, etc.).
- **The Cloud Run LaTeX compiler.** External dependency, latency, cost. We replace it with
  Playwright running an HTML+CSS render. Power users who really want LaTeX can download a
  `.tex` source export.
- **Firestore.** Move to Postgres. You'll thank yourself the moment you want joins, full-text
  search, or pgvector.
- **The Clerk + Firebase dual-auth dance** (Clerk on frontend, Firebase on backend). One auth,
  one DB. Pick a lane.
- **LaTeX-first templates.** This is the biggest call — see §4. We're keeping the *idea* of
  "structured data → beautiful output" but switching the format. LaTeX stays as a power-user
  export, not the primary render path.
- **MUI in the dashboard.** Mixing MUI with Tailwind is a code smell. Pick one. Recommendation:
  shadcn/ui on top of Tailwind. It's what 90% of new SaaS ships in 2026.
- **`@xenova/transformers` 2.5.x as primary embedding path.** Below your needs.

### Why a clean rebuild instead of incremental refactor
You already know this, but to spell out the case:
- Two storage systems (Firestore + Blob for assets) → split-brain
- Two auth layers (Clerk + Firebase Auth) → split-brain
- MUI + Tailwind + custom CSS vars → 3 styling systems fighting each other
- "use client" everywhere → can't leverage RSC streaming, server actions, edge runtime
- LangChain-specific glue (the `extractWithZodStrict` loop) → custom solutions for things the
  Vercel AI SDK now gives you in 20 lines
- PDF chain goes through external Google Cloud Run → every export is a network round trip

The line count of code that actually moves to the new project is small. The line count of code
that *just gets deleted* is large. That's why we're wiping.

---

## 2. The product we're building (high-level)

### Core product
AI-assisted resume builder with structured templates, master-resume → tailored variants, job
context attached per resume, ATS-style scoring against a parsed job description.

### Add-on features (from your notes)
- **Reviews** — peer feedback on resumes. Suggest "review requests" (you send a link, reviewer
  leaves inline comments + a thumbs up/down)
- **Sharing** — public link per resume, gated by visibility setting (private, unlisted, public)
- **Collaborations** — multiple users edit the same resume in real time (Liveblocks)
- **Template-making** — admin-only (and later, community) template studio. Build a template as
  a React component + a Zod schema for what data it needs; preview & publish flow.

### Out of v1 scope (call them out so we don't drift)
- Cover letter builder
- LinkedIn profile import
- Job board integration (auto-apply)
- Mobile apps
- Multi-language i18n

---

## 3. Recommended stack

If you want to use a boilerplate to skip weeks of glue work:
- **Makerkit** ($249+): multi-tenant ready, plugin architecture, ships Drizzle + Stripe +
  Better Auth or Supabase variants. I'd start here if budget allows.
- **`nextjs/saas-starter`** (free, 15k stars): the Next.js team's reference. Postgres + Drizzle
  + Stripe + shadcn/ui. Less batteries, less opinions.

Either way, here's the canonical stack I'd put on top of Next.js 16:

| Layer | Pick | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | Streaming, RSC, server actions, mature ecosystem |
| Language | **TypeScript strict** | Non-negotiable for a structured-data product |
| UI | **shadcn/ui + Tailwind v4** | The 2026 default; copy-paste components, owns your code |
| Database | **Postgres on Neon** | Serverless, branching, the Vercel Postgres underneath is Neon anyway |
| ORM | **Drizzle** | Type-safe SQL-first; small bundle, edge-ready |
| Auth | **Better Auth** (recommended) or Clerk | See decision below |
| Billing | **Stripe** + `better-auth/stripe` plugin (or Clerk Billing) | Industry standard, receipts done |
| File storage | **Vercel Blob** (assets) or **UploadThing** (user uploads) | Blob for templates, UploadThing for resume PDFs |
| AI orchestration | **Vercel AI SDK 6** (`streamText`, `generateObject`, `useChat`) | Streaming-first, Next.js native, way less glue than LangChain |
| Provider(s) | **Vercel AI Gateway** (`@ai-sdk/gateway@3`); free-tier primary `inclusionai/ling-3.0-flash-fin-free` + 4-model fallback chain (see [`docs/ai-models-reference.md`](./docs/ai-models-reference.md)) | Single API key for 275+ models across Anthropic, OpenAI, Google, Mistral, DeepSeek. 0% markup. Automatic cross-provider failover. Free tier ($5/mo credit) covers current usage. First pick was Anthropic Claude Sonnet direct; pivoted to the Gateway on 2026-09-18. |
| Embeddings | **Defer until we need them** — most flows stay as direct text comparisons | Optimizer + scoring don't need embeddings today. Add `text-embedding-3-small` (OpenAI) or `voyage-3` when a search/use-case lands. |
| Vector search | **Defer** — pgvector is fine when we need it (small N) | Same rationale as embeddings. No need yet. |
| PDF rendering | **Browser print-to-PDF** via `window.print()` on a `/preview?print=1` route | Pivoted from Playwright-managed-API mid-session (2026-07-13). $0 forever, pixel-identical to the on-screen preview, no third-party data egress, no API keys. Full rationale in AGENTS.md Phase handoff. |
| Real-time collab | **Liveblocks** (managed) | Presence + Yjs sync + comments, no infra to run |
| Email | **Resend** | Clean DX, React Email templates |
| Observability | **Sentry** (errors) + **PostHog** (product analytics) | Free tiers, real signal |
| Background jobs | **Inngest** or **Trigger.dev** | For embeddings, score recompute, async exports |
| Deployment | **Vercel** | Where Next.js lives |
| Package mgr | **pnpm** | What you already use |

### The auth decision
This is the only pick I'd want you to weigh in on:

- **Better Auth (open-source, in your DB):** You own everything, free, plays nicely with Drizzle.
  The 2026 default for solo founders who want long-term control. Newer (v1.6 mid-2026) but
  gaining fast.
- **Clerk (hosted, paid above 50k MAU):** Faster setup, polished UI, Organizations built in.
  ~$0.02 per MAU past 50k.

For a resume-builder where most users are individuals (not org accounts), Better Auth is the
better fit. For B2B / HR-team features you'd add later, Clerk's Organizations win.

### The LaTeX-vs-HTML decision
This is the other big call. Your current code does LaTeX-first rendering. Two paths forward:

1. **HTML+CSS templates → PDF (Playwright).** Faster to build (templates are React/HTML/CSS),
   easier to iterate, looks great. 90% of "resume builders" in 2026 ship this. Power users can
   still export `.tex` for academics.
2. **Keep LaTeX-first.** Continued ATS-quality typography, the engineer/academic market
   respects it, but templates are slow to author and you pay the Playwright vs LaTeX render tax.

**Recommendation:** go #1. Use HTML+CSS with @page rules + print stylesheets. Playwright via a
managed PDF API (Browserless, PDF4.dev, or similar) so you don't run Chromium on Vercel. Keep
LaTeX as an optional export, generated from the same structured data via a simple Jinja-style
templater.

---

## 4. Architecture overview

### Repo structure
```
nexstepper/
  apps/
    web/                          # Main Next.js app
      app/                        # App Router (RSC by default)
        (marketing)/              # Public landing, blog, pricing
        (auth)/                   # Sign-in, sign-up, callback
        (app)/                    # Authed dashboard surface
          dashboard/
          resumes/
          reviews/
          templates/              # User-facing template gallery
        api/
          ai/                     # AI SDK endpoints
          stripe/                 # Webhook
          liveblocks/             # Auth endpoint
  packages/
    db/                           # Drizzle schema, migrations, client
    ai/                           # AI SDK config, prompt registry, parsers
    resume-schema/                # Zod schemas (single source of truth)
    pdf-render/                   # Playwright wrapper, template registry
    billing/                      # Stripe + subscription helpers
  tooling/
    eslint-config/
    tsconfig/
```

### Data model (Drizzle, high-level)
- `users` — Better Auth / Clerk-owned user table
- `resumes` — master + variants, with `parentResumeId` for the family
- `resumeRevisions` — append-only history (cheap, useful for collab & restore)
- `jobContexts` — parsed job description tied to a resume
- `reviews` — peer reviews (a `resumeId + invitedUserId + status`)
- `reviewComments` — inline + thread comments (anchors to text positions)
- `shares` — public links with TTL + visibility
- `templates` — registered templates, each with a `schemaKey` + `componentPath`
- `templateAssets` — preview PNGs stored on Blob
- `usage` — daily tokens-per-feature counters for billing enforcement
- `subscriptions` — Stripe-synced mirror

### Template / render pipeline

```
[User data + template ID]
        ↓
[Template registry: <Template> React component]
        ↓
[React renders to HTML string (renderToString) using template-aware styling]
        ↓
[Playwright loads HTML, paginates with @page CSS, prints to PDF]
        ↓
[Cache PDF by hash(data + template + revision)]
        ↓
[User downloads OR we store in Vercel Blob]
```

Templates are React components in `packages/pdf-render/templates/<id>/`. Each template exports:
- `<Template data={...} />` — the visual
- `meta`: name, version, author, schemaKey, previewUrl
- `printCss`: the `@page` and `@media print` rules

Power-user LaTeX export is a separate path: a Jinja-style `.tex.j2` template for each
HTML template, same data shape, generates compilable LaTeX. Best-effort, not pixel-identical.

### AI / scoring pipeline

```
[Parsed resume + jobContext]
        ↓
[Structured extraction (AI SDK generateObject + Zod)]
        ↓
[Four-dimension score: ATS matching, structure, content quality, alignment]
        ↓
[Display Scorecard component with per-criterion bars]
```

The scoring math from `src/lib/score.ts` is good. Port it as a pure function in
`packages/ai/scoring.ts` and unit-test it (the current version has no tests).

---

## 5. Migration plan (what gets ported forward)

### Port / extract
- **The Zod schemas** (`src/app/models/ResumeData.ts`) → `packages/resume-schema/` with cleanup
  (rebuild using `zod/v4`, drop the workaround in `parsers.ts`)
- **The score algorithm** (`src/lib/score.ts`) → `packages/ai/scoring.ts`, with tests
- **The template data shapes** (`latex_eta/*.eta`) → rebuild as React/HTML/CSS templates
- **The plans and design notes** (`RESUME_SCORING_PLAN.md`, `JOB_DESCRIPTION_PLAN.md`) →
  build on them, don't restart from zero

### Drop
- The Firestore data model
- The Clerk + Firebase Auth crossover
- The Cloud Run LaTeX compiler integration
- The MUI dependency
- All the long per-section edit forms — rebuild as one schema-driven dynamic form
- `PDFViewer.tsx` (empty) and `@react-pdf/renderer` (not actually used)
- `embedding_server.py`
- The Vercel cron / ngrok debug plumbing

### Open: should you keep any old content?
Old LaTeX templates (`src/resumetemplates/latex/jake_original.tex`) can be rewritten as
HTML/CSS with the same typography spirit. Worth preserving as a "Classic" template since users
already loved it.

---

## 6. Phased milestones

### Phase 0 — Repo + foundation (week 1) — ✅ Shipped 2026-07-13
- ~~Init `apps/web` (Next.js 16) + pnpm monorepo (Turborepo)~~ — **monorepo split deferred** (single-package still; not blocking `apps/web` features)
- Tailwind v4 + shadcn/ui + ESLint + Prettier + TS strict
- Set up Drizzle + Postgres (Neon)
- Better Auth wired in
- Stripe keys + webhook stub
- Sentry + PostHog installed
- Vercel deploys cleanly

### Phase 1 — Resume CRUD + master/variant (weeks 2–3) — ✅ Shipped
- Resume list page + master-resume creation flow
- Schema-driven edit form (one component, driven by Zod + UI spec)
- Save / version (write to `resumeRevisions` table)
- **WYSIWYG inline editor** (Basics + Work inline; rest via section dialogs) — added in a follow-up slice, plan at [`docs/plans/wysiwyg-editor.md`](./docs/plans/wysiwyg-editor.md)
- **Import from file** (PDF / DOCX / pastes text) — follow-up slice

### Phase 2 — Templates + PDF render (weeks 4–5) — ✅ Shipped (with PDF pivot)
- Template registry (3 templates: Modern, Classic, Classic-Readonly)
- ~~Playwright PDF service wrapped in `packages/pdf-render`~~ — **pivoted to browser print-to-PDF**. All `lib/pdf-render/` + `app/api/pdf/` + Tailwind-compile pipeline removed mid-session; full rationale in AGENTS.md Phase handoff.
- Template selector on the resume page
- ~~PDF preview cached by hash~~ — not needed in the browser-print flow
- ~~Optional LaTeX export (beta)~~ — deferred per locked non-goals in AGENTS.md

### Phase 3 — Job context + scoring (weeks 6–7) — 🟡 Partial (parsers + Optimize v0)
- ✅ Job URL/text → structured `JobPostingData` via `generateObject` (`lib/jd-parser/`)
- ✅ Resume text → structured `ResumeSections` via `generateObject` (`lib/resume-parser/`)
- ❌ **Score function** — never ported from the legacy `nexstepper/src/lib/score.ts`. **Next priority.**
- ❌ Scorecard UI in the resume editor sidebar
- ✅ Per-section "Optimize" button (basics.summary only) — Optimize v0

### Phase 4 — AI assistant (weeks 8–9) — ❌ Not started
- ~~AI SDK 6 streaming chat endpoint~~ — not built
- ~~Tool: `optimize_section(...)`~~ — implemented as a one-shot Optimize page, not via chat
- ~~Chat UI~~ — not built
- ~~Daily-quota enforcement~~ — not built (no `usage` table yet)

### Phase 5 — Sharing + reviews + collab (weeks 10–12) — 🟡 Partial (sharing done)
- ✅ Sharing: signed public link at `/r/{token}` (SHA-256-hashed token, 3 revocation modes)
- ❌ Reviews: invite link → reviewer leaves inline comments + verdict
- 🟡 Liveblocks for real-time collab editing — server client stub wired; UI not started
- ~~Activity feed~~ — deferred
- ❌ **Browser extension `nexstepper` v1** — `/api/job-contexts` not built; the SaaS API must support it before the extension is a client

### Phase 6 — Template studio + polish (weeks 13–14) — ❌ Not started
- Admin-only template studio
- Public template gallery
- Landing page polish, doc pages, pricing compliance
- First paying user milestone

### Stretch (post-launch)
- Cover-letter builder reusing the same data
- LinkedIn/GitHub data import
- Mobile app wrapper (Capacitor/Expo)
- Public API for HR partners

---

## 7. Open questions for you

### ✅ Answered (2026-07-06)
1. **Auth:** Better Auth.
2. **Boilerplate:** Build from `nextjs/saas-starter`. No budget for Makerkit right now.
3. **Templates:** HTML+CSS templates rendered via Playwright → PDF. LaTeX is export-only.

### Still open
4. **Multi-tenant from day one?** "Organizations" feature (one org = a person's collection of
   resumes plus optional collaborators). Or solo-only first, add multi-tenant later? I'd say
   **solo-only first**, add orgs in Phase 5 alongside collab.
5. **Free vs paid launch tier?** Free lets you get users without friction, paid gets you
   revenue. I'd recommend Free + Pro at launch: free = unlimited resumes + 20 chat
   messages/day + no Optimize tool; Pro $12/mo = unlimited chat + Optimize tool + reviews +
   collab up to N collaborators.
6. **Brand / domain / logo — keeping the Nexstepper name?** I assume yes. Confirm.
7. **Where to handle `.tex` exports?** Hand user the `.tex` source, let them compile on
   Overleaf. No need for us to run a TeX engine. Confirm.
8. **Deploy target: Vercel?** Pricing has changed in 2026. If you want to evaluate Cloudflare
   or Railway, let me know now.
9. **Existing browser extension `nexstepper`** — when to ship it? Recommendation: keep it on
   its own branch / separate repo; build the SaaS first; in Phase 0 design the API so the
   extension has a clean client to talk to from day one. Re-decide ship date at end of Phase 4.

---

## 8. Browser extension `nexstepper` (your side project, will become a JD-capture client)

### What I love about this
- Captures JDs at the source — LinkedIn, Indeed, Lever, Greenhouse, Workday — instead of
  copy-paste. Way better UX.
- Real differentiator vs Rezi / Teal / Kickresume. None of them have a good extension.
- Natural top-of-funnel. Extension users without SaaS accounts funnel into the marketing site.
- You already have `nexstepper` (existing extension code) — repurposing costs you a fraction
  of building from scratch.

### API surface the extension will need
Build these into the SaaS in Phase 1, even before the extension exists:

- **`POST /api/job-contexts`** — extension posts `{ url, html?, text, detectedMeta? }`;
  SaaS scrapes/parses, returns the canonical `JobPostingData` + a `jobContextId`.
- **`GET /api/job-contexts`** — list user's captured JDs (paginated).
- **`GET /api/job-contexts/:id`** — fetch one (so the SaaS dashboard can pull it).
- **Auth: API token model.** User generates a token in the SaaS dashboard settings ("Extensions"),
  pastes it into the extension's options page. Tokens are hashed at rest, scoped, revocable.
  This is the standard pattern (1Password, Raycast, GitHub CLI all do this).
- **Webhook (optional):** when a JD is captured, optionally push to the user's SaaS in real
  time so it shows up in the dashboard inbox immediately.

### Browser extension arch (when you do ship it)
- Manifest V3, single content script, service worker for background tasks
- Detect JD pages via URL pattern + DOM heuristics (h1 with job title, JSON-LD `JobPosting`
  schema.org block, common selectors per site)
- Popup UI: "Save JD to Nexstepper" + "Save JD and start a tailored resume"
- Storage: chrome.storage for the API token (encrypted at rest by the browser)
- Cross-browser: Chrome first; Firefox is a 2-day port; Safari is a longer lift (skip v1)

### When to ship it
- **Phase 0**: design the `/api/job-contexts` endpoint contract so the extension is a future client.
- **Phase 1**: implement the endpoint for paste-in-the-SaaS workflow; extension begins to work.
- **Phase 5**: build the Chrome extension itself, link from the SaaS dashboard, submit to
  Chrome Web Store.

### Risks
- Chrome Web Store review can take days; rejections are common; have a fallback plan (self-host
  as "load unpacked" with install instructions while you iterate).
- LinkedIn and others actively block scrapers. Architecture around a server-side scrape so you
  don't run into client-side detection. Detect-then-fallback-to-user-pasted-text.
- Two-product surface for a solo dev. Keep extension code on a separate branch / repo until
  SaaS ships, then merge.

---

- **PDF render latency**: Playwright on a managed API is 250–500ms for warm pools, plus HTML
  build. Cache aggressively by hash of (data + template + revision).
- **AI costs**: Each Optimize call is ~$0.01–0.05 with Sonnet. Cap on free, unlimited on paid.
  Track per-user in `usage` table.
- **LaTeX export quality is lower than HTML/Playwright**: Be honest about it in the UI — "Power
  user export, may need hand-tuning in Overleaf."
- **Real-time collab cost**: Liveblocks free tier is small (50 connections). Start with
  presence-only collab (cheaper); add Yjs shared editing only after we know people want it.
- **Scope creep**: Reviews + sharing + collabs + template studio are all real features. If
  you only have 3 months to ship, cut to: resume CRUD + templates + scoring + sharing by
  link. Reviews and collab can land in v2.

---

## 9. Decision summary (one glance)

| Decision | Choice | Alternative |
|---|---|---|
| Framework | Next.js 16 + TS strict | Remix |
| UI | shadcn/ui + Tailwind v4 | MUI alone, Radix |
| DB | Postgres (Neon in prod, postgres-js locally — driver auto-detected) | Supabase, PlanetScale |
| ORM | Drizzle | Prisma |
| Auth | Better Auth | Clerk |
| Billing | Stripe (Free + Pro $12/mo, 7-day trial) | Lemon Squeezy, Paddle |
| AI orchestration | Vercel AI SDK 6 → Vercel AI Gateway (`@ai-sdk/gateway@3`) | LangChain 1.x |
| AI provider | Free-tier `inclusionai/ling-3.0-flash-fin-free` + 4-model fallback chain via the Gateway (see `docs/ai-models-reference.md`) | Direct Anthropic Claude Sonnet (original pick, pivoted 2026-09-18) |
| PDF render | Browser print-to-PDF (pivoted 2026-07-13) | Playwright via managed API (original pick — kept as a future option) |
| Templates | React/HTML/CSS templates, browser print → PDF | LaTeX-first |
| Real-time | Liveblocks (server client wired, UI pending) | Self-hosted Hocuspocus |
| Email | Resend | Postmark |
| Hosting | Vercel | Cloudflare, Railway |
| Background jobs | Inngest (client + serve route, functions pending) | Trigger.dev, queue-on-Vercel |
| Analytics | PostHog | Plausible, Mixpanel |
| Errors | Sentry | Rollbar |
| Boilerplate | `nextjs/saas-starter` (MIT) | Makerkit (not budgeted) |

---

## 10. What I want from you to start coding

- Decision on Better Auth vs Clerk
- Decision on Buy (Makerkit) vs Build-from-official-starter
- Decision on the open questions in §7
- 30-minute call (or chat thread) where you tell me the *actual* product shape — features,
  priorities, "must have for v1 vs nice to have for v2" — because right now I'm working from
  your "reviews / sharing / collabs / template-making" line and want to be sure I read it right.

Once those are answered, I'll set up the repo (or fork Makerkit), wire Drizzle, and we'll build
Phase 0 together.
