# AGENTS.md — Nexstepper

> **Take the next step.**

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
| Billing | Stripe (Free + Pro ≈ the price of a coffee; see `docs/setup/stripe.md` for the actual amount + brand-voice rationale) |
| AI | Vercel AI SDK 6 → Vercel AI Gateway (`@ai-sdk/gateway@3`); model constants in `lib/ai/providers.ts`. **Two tiers:** `PARSER_MODEL = mistral/mistral-nemo` for structured extraction ($0.03/$0.03, 131K ctx, 12B) and `CHAT_MODEL = anthropic/claude-haiku-5.5` for the agentic chat ($0.10/$0.50, 1M ctx, 4 endpoints), each with its own fallback chain. **The Gateway requires paid credits** — without a top-up most paid models return `403 Free tier users do not have access`, so every chat fallback chain starts with $0 models. Model comments are dated snapshots and rot; re-verify with `npx --yes vercel@latest ai-gateway models endpoints <id> --format json` before planning against any of them — see `docs/ai-models-reference.md` and `docs/plans/chat-agent-v2.md` |
| Email | Resend |
| Observability | Sentry (errors) + PostHog (analytics) |
| Background jobs | Inngest |
| Realtime | Liveblocks (Phase 5) |
| Validation | Zod 4 (single source of truth for types + runtime validation) |
| Forms | react-hook-form + `@hookform/resolvers/zod` (no Formik, no RJSF) |
| Package mgr | pnpm 11 |
| Deployment | Vercel |

## Deployment + production keys (cheat sheet)

Full operational runbook lives at **`docs/setup/production.md`** (11
sections: Neon DB → Stripe live → Resend → AI Gateway → Sentry/PostHog
→ domain → Vercel env vars → 16-step smoke test → monitoring → 5-scenario
rollback → done criteria). The summary below is what to wire in Vercel
project settings before going live.

**Topology** (corrected 2026-10-08) — Single Vercel project,
**two separate Neon projects** (one for production, one for local
development — not one project with branches), all third-party
services bound by env vars. No multi-region, no read replicas.
Free-tier defaults throughout; the `docs/setup/production.md` §3
has an explicit upgrade-trigger table.

> **Two-project consequence** — running `pnpm db:migrate` locally
> applies migrations to the **dev** Neon project only. Production
> migrations land when the commit reaches `main` and Vercel's
> `prebuild` runs `db:migrate`. Schema changes are therefore live in
> dev long before prod, and a bad migration fails in dev first.

| Service | Env vars (server-only unless marked public) | Where to get |
|---|---|---|
| **Neon** | `POSTGRES_URL` | neon.tech → project → connection string (pooled endpoint, `-pooler` suffix) |
| **Vercel AI Gateway** | `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN` in prod — auto-provisioned on Vercel) | vercel.com → AI Gateway → API Keys |
| **Better Auth** | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | `openssl rand -base64 32` for the secret |
| **Stripe (live mode)** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO` | dashboard.stripe.com → Developers → API keys + Webhooks + Products |
| **Resend** | `RESEND_API_KEY` | resend.com → API Keys |
| **Sentry** | `SENTRY_DSN` (server), `NEXT_PUBLIC_SENTRY_DSN` (client), `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (build-time, for sourcemap upload) | sentry.io → Settings → Projects → Client Keys + Auth Tokens |
| **PostHog** | `POSTHOG_KEY` (server), `NEXT_PUBLIC_POSTHOG_KEY` (client), `POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_HOST` | posthog.com → Project Settings → API Keys |
| **Liveblocks** | `LIVEBLOCKS_SECRET_KEY` (server), `NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY` | liveblocks.io → Dashboard → API Keys |
| **Inngest** | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | inngest.com → Apps → Manage → Keys |

**Public env vars (`NEXT_PUBLIC_*`)** are exposed to the browser — they
must be safe to publish. Sentry DSNs, PostHog keys, and Liveblocks
public keys are all designed to be public; the rest are server-only.

**Vercel-specific wiring**

- **Production branch**: `main` (auto-deploys on push; PR previews get
  their own ephemeral URLs with their own env-var subset if you set
  them up under "Preview" environment).
- **Build command**: `pnpm build` (Next.js default; no custom command).
- **Custom domain**: `nexstepper.com` is live, and **`www.` is the
  canonical host** — Vercel 308-redirects the apex to `www`.
  Registered via Vercel → Domains; SSL auto-provisioned via Let's
  Encrypt. Because the apex redirects, `lib/auth.ts` carries an
  explicit `trustedOrigins` list — **any new auth callback (Google
  OAuth, GitHub) must register BOTH hosts**, since providers match
  redirect URIs exactly.
- **Postgres**: `POSTGRES_URL` is a Neon pooled connection string.
  Neon works from serverless Vercel functions out of the box because
  the pooled endpoint speaks the standard Postgres wire protocol.

**Smoke-test order** (after deploying; matches §9 of production.md):

1. Sign up → sign in → land on dashboard
2. Create master resume, edit + save (revisions)
3. Create variant from JD (AI parser + intent extractor fire)
4. Compute ATS score (score snapshot writes)
5. Send a chat message (AI observability trace fires)
6. Enable share link → open in private tab → view counter increments
7. Upgrade to Pro (Stripe Checkout → webhook → plan tier flips)
8. Export data (GDPR Art. 20)
9. Delete account (GDPR Art. 17 → erasure_log writes → PostHog scrubs)

**Free-tier-first launch defaults** — Neon Free, Stripe $0/mo
monthly fee (2.9% + 30¢ per transaction), Vercel Free (100 GB
bandwidth, hobby-tier limits), Resend Free (3k emails/mo, 100/day),
PostHog Free (1M events/mo), Sentry Free (5k errors/mo). Pro plan
($1-2/mo per user) is well above the per-user cost of all the above,
so even at 10 paying users we're gross-margin positive.

**Don't ship without** — `BETTER_AUTH_URL` set to your production
URL (cookie scoping depends on it), `SENTRY_DSN` + `POSTHOG_KEY` set
(observability is the only signal you'll have when something breaks
at 3am), and the Stripe webhook endpoint registered in live mode
(`https://www.nexstepper.com/api/stripe/webhook`). **As of
2026-10-08 everything here is live except the Stripe live-mode
webhook**, which stays gated under the soft-launch decision.

## Roadmap

The living priority order. Update this list when state changes — and
write a `docs/drift/` memo if the update is non-trivial (see "Drift
audit" below).

**Now (in flight)** — `main` is at `7f0d320` as of **2026-10-09**.
**Production is LIVE.** All §11 boxes are checked: Vercel deployed,
**two separate Neon projects** (one prod, one dev — *not* one project
with branches), migrations `0000`–`0008` applied,
**`www.nexstepper.com`** serving with valid SSL,
Resend + Sentry + PostHog + Vercel AI Gateway all wired with real
keys. **Stripe live mode is now live and verified** (account
activated 2026-10-10). The Pro subscription product has not yet been
created in Stripe Dashboard, so `STRIPE_PRICE_ID_PRO` is not yet set
and Pro CTAs remain in the soft-launch waitlist state — see
`docs/drift/2026-09-27-soft-launch-pro-gating.md` for the restore
plan. Drift memo:
`docs/drift/2026-10-10-stripe-live-activated.md`.

> **Standing rule (added 2026-10-08 after this bit us)** —
> `.env.example` is a **template of placeholders**, not evidence of
> what is deployed. Before asserting anything about live
> infrastructure, check `.env`, `.env.local`, `.vercel/project.json`
> and the migrations directory. A session inferred "the prod DB does
> not exist yet" from the localhost line in `.env.example` and said
> so to the user; it was wrong.

**Recently shipped (for context, last 7 days)**

- **ATS scoring v3 EVALUATED (nothing shipped yet)** — the ATS score was
  measuring the wrong things, and Jev's role in fixing it is now
  measured rather than guessed. Plan:
  `docs/plans/ats-scoring-v3-jev.md`. Drift memo:
  `docs/drift/2026-10-22-ats-scoring-jev-evaluation.md`.
  **The finding:** the skill matcher is NOT broken — Jev agrees with it
  81.6% of the time and finds zero false alarms across the 50-JD
  corpus. What IS broken is the VOCABULARY: the ATS Keyword Match
  sub-criterion counts every non-stop-word token in the JD (including
  the benefits list) and asks what fraction the resume contains. For a
  realistic JD that is 49 tokens of which **33 are missing (67%)** for
  a candidate who has every required skill — the missing ones include
  `insurance`, `budget`, `remote`, `friendly`, `company`. That
  sub-criterion carries 12.6% of the score and feeds the tip that says
  **"Add these missing keywords from the JD"**, so the product was
  advising users to keyword-stuff their resumes. **Jev
  (`typesafe-ai/jev`, on the Vercel AI Gateway at $0.042/M input and
  FREE output) is genuinely good at the job it was proposed for:**
  classifying which JD lines are genuine skills scores **AUC 0.926**
  against the corpus's hand-authored skill lists, and substituting a
  Jev-derived ATS Matching dimension into the real engine moves Pearson
  r from 0.910 to **0.927** (mean absolute error 13.40 → **10.60**,
  a 21% cut). A full 50-JD measurement sweep costs **$0.0058** and
  takes 7.3 s. **The degree bug is three problems and only one needs a
  model:** (a) `JobPosting` has NO field for eligibility criteria, so a
  "Bachelor's degree" requirement has nowhere to go but into
  `mustHaveSkills` — and the extractor prompt explicitly lists
  "Qualifications" as a must-have section header; (b) the engine cannot
  express "or equivalent experience" (Jev answers that at 0.96 in a live
  probe); (c) the eligibility check needs NO model at all —
  `EducationEntry` already carries `degreeLevel` / `startDate` /
  `endDate`, so "will they hold it by the start date?" is arithmetic in
  pure TypeScript. **Two integration paths, and they differ:** the
  gateway's TypeSafe-compatible API
  (`https://ai-gateway.vercel.sh/typesafe/v1/systemone`) was VERIFIED
  working against the project's own `AI_GATEWAY_API_KEY` with no
  dependency change; the AI SDK's documented `experimental_decide` needs
  `ai` ≥ 7.0.128 and this project is on 6.0.224 (a locked-stack
  change, deliberately not bundled in). Harness:
  `scripts/measure-jev-corpus.cjs` → `tests/fixtures/jev-corpus-measurements.json`,
  pinned offline by `tests/unit/scoring/jev-corpus.test.ts`. **No
  production code changed** — the ATS score users see today is
  unchanged.

- **The agent can now MEASURE page length instead of guessing it** —
  branch `feat/chat-agent-v3-phase-a`. New tool `estimatePageCount`
  (`lib/chat/tools/estimate-page-count.ts`, backed by
  `lib/chat/page-fit.ts`) returns the estimated page count, the content
  height in inches, where the height went, and — the part users ask for
  — what hiding each visible section would save and what the resume
  would then print as. The numbers behind it are **measured**: 486 real
  resumes were rendered through the real templates under the real print
  CSS, printed to PDF, and their pages counted; the height formula
  `height = fixed + roles x (perRole + bullets x perBullet)` reproduces
  **478 of those 486 page counts (98.4%)**. The prompt tables are
  GENERATED (`lib/chat/page-fit.generated.ts`,
  `lib/chat/section-space.generated.ts`) — the old hand-written
  "2 roles / 3 roles / 4 roles" table was measured at the wrong width
  and with the wrong margin and nothing would have flagged it.
  **Two measurement bugs found and fixed** (both had made every earlier
  number wrong while looking entirely reasonable): the DOM was being
  measured at the 8.5in SCREEN width instead of the 7.0in PAPER
  content width, so text wrapped less and every height was short; and
  the `@page` margin was not in force when the PDFs were rendered,
  because the per-resume CSS variable is mirrored onto `:root` inside a
  `useEffect` and the harness printed before that ran — so all 486 PDFs
  had silently used the 0.4in fallback margin. Both are now handled in
  one place, `scripts/lib/print-harness.cjs`, which all three
  measurement scripts use. The estimator was also checked against five
  real resumes from the dev database that were printed and counted
  (5/5 correct). Fixture of the 486 real page counts committed at
  `tests/fixtures/measured-page-counts.json` so a harness regression
  fails the build instead of shipping optimistic numbers. Drift memo:
  `docs/drift/2026-10-22-page-fit-measurement-fix.md`. Data:
  `docs/plans/resume-length-guidelines.md`.

- **Jake's Resume template (sixth entry in the registry)** — branch
  `feat/jake-resume-template`. Modelled on Jake Gutierrez's famous
  LaTeX/Overleaf template. Jake is the only SERIF template in the
  set (Lora fallback via `font-serif` so it renders in vitest
  without a `next/font/google` load); every other template is
  sans-serif. Visual identity: centered NAME in
  `[font-variant:small-caps]` + uppercase, single-line contact row
  with inline lucide icons (phone, mail, globe, LinkedIn, GitHub),
  hairline slate rule UNDER every section title (not the
  accent-bar-to-the-left of Modern / Executive), two-column
  name/date rows on Education / Experience / Projects / Volunteer,
  italic role / city rows under the name, **4-column coursework
  grid** in the Education block (the academic touch no other
  template has), bold `Category:` + value rows for Technical
  Skills (no chips, no border), and the LaTeX project's
  `Name | tech-stack` format on the Projects line. Section
  title renames: "Skills" → "Technical Skills",
  "Volunteer" → "Leadership / Extracurricular". Architecture: a
  single `JakeTemplate` (modern pattern, Field primitive, no
  classic two-file split), exporting `JakeReadOnly` as a thin
  `<JakeTemplate editable={false} />` alias so the print-hide /
  design-lab tests can target the read-only path explicitly.
  The article wrapper carries `data-template="jake"`,
  `data-accent="slate"`, `data-max-pages="auto"`,
  `data-page-size="letter"` so the existing print-CSS / page
  rules just work. Picker lane `category: "jake"`, accent
  `slate`, tier `free`, atsSafe `true` (single column, no
  tables, no graphics). New thumbnail SVG (`JakeThumbnail`)
  in `template-thumbnail.tsx` — same Slate-hairline chrome as
  the real template, generic enough to read at 320×192.
  **Coverage:** the schema's full 11 sections render
  (Summary, Education, Experience, Projects, Skills,
  Volunteer, Awards, Certificates, Publications, Languages,
  Interests) plus References — every existing section, with
  Jake's chrome applied to all of them. **Tests:** new
  `tests/unit/jake-template.test.tsx` pins the visual identity
  (15 tests): small-caps + uppercase on the h1, centered
  header, every contact channel present, scheme-prefix
  stripped from the website, hairline rule under section
  titles, "Leadership / Extracurricular" + "Technical Skills"
  renames, 4-col coursework grid testid, all 8 courses
  rendered, "Relevant Coursework" sub-header, project
  " | tech-stack" line, every section ID present when it has
  content, empty sections suppressed, `font-serif` on the
  article wrapper. Existing tests updated to 6-template
  reality: `template-meta.test.ts` (registry size 5→6, Jake
  meta + category, Jake is free / atsSafe / jake / slate),
  `template-gallery.test.tsx` (Jake card, thumbnail, badges,
  preview, version), `print-hide-templates.test.tsx` (Jake
  in summary-hide, in back-compat, new JakeTemplate describe
  block), `design-lab.test.ts` (5→6 anchors + design-lab
  page text "five" → "six"). **Visual verification:**
  Playwright headed screenshot at
  `output/playwright/jake-template.png` — visually matches
  the original Jake LaTeX template (centered name,
  hairline rules, 4-col coursework, inline contact icons,
  bold category labels). Drift memo:
  `docs/drift/2026-10-19-jake-resume-template.md`.

  **Closed with a jsdom interaction harness.** User asked
  for "one more round" — a real DOM test for the repeatable
  form arrays. New `tests/interaction/` directory with
  `harness.tsx` (`renderWithForm` + `user()` + `FormCapture`),
  6 `EditableSection` interaction tests, 5
  `JakeProfilesEditor` interaction tests that assert DOM
  **and** `form.getValues`. Vitest config picks up the new
  directory; `environment: 'node'` is kept global, jsdom is
  opted into per-file via the `@vitest-environment jsdom`
  docblock (120+ `renderToStaticMarkup` suites stay fast). New
  devDeps: `jsdom@^25`, `@testing-library/react@^16`,
  `@testing-library/user-event@^14`. Mutation proof:
  reintroducing per-row `useFieldArray` in the Jake profiles
  editor (the bug shipped round 5 to fix) makes 4/5 tests
  fail with the user's exact symptom — harness catches what
  markup assertions cannot. Final state: 1663 tests / 126
  files, `pnpm typecheck` + `pnpm build` clean, merged into
  `main` as 6 commits behind the prior `1a82acc`.

- **Safari / iOS print fallback (first Apple-using customer report)**
  — branch `fix/safari-print-fallback`, no schema or infra changes.
  The Apple-using customer reported "I clicked Print and nothing
  happened." Root cause: iPhone Safari *did* open the system print
  sheet, but as a small toolbar at the bottom of the screen that
  the user didn't see (Safari's print UX is genuinely
  harder-than-everywhere-else to discover). The pre-existing
  toolbar `PrintButton` was already calling `window.print()`
  *synchronously inside the click handler* (per Apple/Safari's
  documented "must run inside the user click, never after any
  awaited boundary" rule) so the call itself was fine — the
  problem was just that there was no contextual hint pointing
  Apple users at where the sheet actually appears. Fix:
  `lib/print/{detect-safari,safe-print}.ts` + a new
  `PrintHelpDialog` component. `getPrintHint(probe)` returns a
  branch-specific hint (iPhone / iPad / Mac Safari) and is wired
  into the toolbar `PrintButton` via a small "Not opening?" link
  (only rendered on Apple branches, so non-Apple platforms stay
  chrome-clean). The dialog always carries the cross-platform
  `Cmd/Ctrl+P` keyboard fallback so users with browsers that
  block `window.print()` have a way out. Both call sites (the
  toolbar Print button and the inline `Print / Save as PDF`
  button inside `EditableResume`) now route through the same
  `triggerPrint()` helper so future print fixes live in one
  place; the helper returns a discriminated
  `opened | error × safari-ios | safari-mac | other` union for
  future analytics attribution. Detection honours iPadOS 13+'s
  `Macintosh`-disguised UA by layering in
  `navigator.maxTouchPoints > 0` (real Macs report 0 unless a
  touchscreen is attached). All detection helpers accept an
  injected `BrowserProbe` so tests don't read `navigator` and
  don't leak the CI runner's UA into results. UA sniffing is
  intentionally informational only — we never gate behavior on
  it (we ship the same `triggerPrint` to every browser); wrong
  copy on the wrong branch is a sentence of extra text, gating
  on UA would silently break something on the next iOS version.
  54 new tests across `detect-safari.test.ts` (26),
  `safe-print.test.ts` (14), `print-help-dialog.test.tsx`
  (10), and the existing `print-button.test.tsx` (4). Test
  total: 1613 passing. Drift memo:
  `docs/drift/2026-10-13-safari-print-fallback.md`.

- **Feedback form + GitHub Issues sync (new feedback channel)** —
  branch `feat/feedback-form-and-github-sync`. Three entry
  points, one form, one Postgres table, one optional GitHub
  Issues fan-out. (a) A full-page route at `/feedback`
  (marketing layout, footer included). (b) A "Send feedback"
  item in the dashboard user-menu dropdown. (c) A floating
  "Feedback" pill in the bottom-right of every dashboard page
  (`FeedbackPill`, `no-print` so it never bleeds into PDFs).
  All three feed a shared `FeedbackForm` component (radio
  category, message textarea with live char counter, optional
  reply-to email) which calls a single server action,
  `submitFeedbackAction`. The action validates with Zod
  (`feedbackInputSchema` in `lib/feedback/schema.ts`), checks
  the URL count (≤3, anti-spam), rate-limits per IP (5/min,
  rolling minute window, Postgres-side timestamp so it
  survives clock skew), inserts the row in the new `feedback`
  table (migration `0010_melodic_warpath.sql`), then
  **best-effort** fans out to GitHub Issues via
  `lib/feedback/github.ts` + Octokit. The Postgres row is the
  source of truth: missing `GITHUB_ISSUES_TOKEN`, GitHub down,
  or a 4xx/5xx all return `githubSynced: false` to the form
  while still saving the feedback. Every submission also lands
  in the GDPR data export (`exportFeedbackSchema` in
  `lib/data-rights/schema.ts`) and respects `on delete set
  null` so a user can be fully erased without losing the
  message. The form copy is explicit that submissions become
  public GitHub issues — "please don't include anything you
  wouldn't want linked to your account" is rendered next to
  the textarea. PostHog event `feedback_submitted` fires with
  `githubSynced` + optional `githubIssueNumber`. 53 new tests
  (`feedback-schema`, `feedback-github`, `feedback-action`,
  `feedback-form`, `feedback-page`, `feedback-pill`,
  `marketing-footer`, `user-menu-feedback`) — total
  1478 → 1531. `pnpm add octokit` (5.0.5, ~50KB). Environment
  vars live in `.env.example` under a dedicated "User feedback
  → GitHub Issues sync" section with the same "leave it blank
  and everything still works" pattern as
  `SHARE_TOKEN_ENCRYPTION_KEY`. The form's message label +
  placeholder swap per category (bug / idea / other) so the
  prompt always matches the kind of feedback being collected;
  copy maps live in `lib/feedback/schema.ts` next to the
  category enum. **Honest dev note on the sidebar piece of
  the same branch:** the first cut of the dashboard-sidebar
  fix used `position: sticky` on the aside but kept
  `overflow-hidden` on the inner flex wrapper. The body
  never scrolled, so the aside never stuck — the user
  reported it scrolled with the page. Round 2 drops
  `overflow-hidden` on the wrapper and `<main>`'s own
  `overflow-y-auto` so the body IS the scroll context, and
  pins a regression test that asserts the wrapper doesn't
  carry an `overflow-*` class. **Round 2 was still wrong.**
  The aside had `sticky` (base) AND `lg:relative` (lg+).
  Tailwind 4 emits the position utilities in source order
  (static, fixed, absolute, relative, sticky), so the
  `lg:relative` block is emitted AFTER the base `sticky`
  in the generated CSS — and won the cascade on desktop.
  The aside was actually `position: relative` and scrolled
  with the page. The test pinned "sticky is in the
  className" and passed, but the *computed* position was
  relative. **Round 3 fix:** use `lg:sticky` (only on lg+)
  and keep `absolute` (base, for mobile). Now the two
  position utilities are in different media-query blocks
  and never fight. The regression test now pins the
  *absence* of `lg:relative` so a future contributor
  re-adding it fails the test instead of re-introducing
  the bug. **Generalised lesson:** when a className has
  multiple position utilities, the test that pins
  "the right one is in the className" is not enough —
  the cascade winner matters. Either pin the
  absent-classes-by-name (what we did) or render in a
  real DOM and assert `getComputedStyle(el).position`.
  **Honest dev note on the tip-card piece:** the first cut
  rendered the tip anchored to the section header
  (`left: rect.left; maxWidth: rect.width`) which collapsed
  to ~30px on a narrow Skills section. The second cut
  pins the tip in the bottom-left of the viewport with a
  fixed 420px width. Round 2 was: drop the section-anchored
  style block, set `position: fixed; bottom: 24; left: 24;
  width: 420; maxWidth: calc(100vw - 48px)`.


- **Drag-to-reorder for every repeatable section** — branch
  `feat/drag-to-reorder`, three commits ahead of `main`. Every
  section that routes through `EditableSection` (Work, Projects,
  Education, Awards, Certificates, Publications, Volunteer,
  References, plus the nested `positions` inside each Work entry)
  gains a left-edge drag handle (lucide `GripVertical`,
  `cursor-grab` / `cursor-grabbing`, `aria-label="Drag to
  reorder [section]"`). Mouse drag and full keyboard drag (Tab →
  Space → ↑/↓ → Space) both wired. Persistence is `useFieldArray.
  move` on drag-end + the existing explicit Save (no new server
  action, no migration, no autosave — matches the lock from
  `docs/plans/wysiwyg-editor.md`). `SortableRow` is its own
  primitive so handle styling / a11y label / no-print cannot drift
  across sections or templates. New `reorderable={false}` prop opts
  the consumer out (for the SchemaForm array path). 17 tests added;
  1478 total passing. `@dnd-kit/{core,sortable,utilities}` shipped
  in v6.3.1 / v10.0.0 / v3.2.2. Verification surface:
  `/dev/design-lab/reorder` (noindex, unauthenticated — mounts
  Modern in `editable={true}` against the gallery sample; sidebar
  shows live order). Plan: `docs/plans/drag-to-reorder.md`.
  Honest dev note: during commit-time visual verification the
  in-app FilePanel browser was unresponsive across inspect / query
  / navigate / screenshot locally (including on the pre-existing
  /dev/design-lab page — not specific to the new route); the
  Next.js dev server returned 200 on every GET with no compile
  errors, so the page is structurally verified; manual drag
  testing should be done against `http://localhost:3000/dev/
  design-lab/reorder` in the user's own browser. Drift memo:
  `docs/drift/2026-10-12-drag-to-reorder.md`.

- **Print settings now actually apply on screen, not just in print** —
  branch `fix/print-settings-actually-apply`. The earlier
  `printable` + CSS-vars wiring (commit `161b5fa`) was a UI
  dead-end: the popover saved to the DB and the wrapper had the
  vars, but **the templates' own `text-[Npt]` Tailwind classes
  won every time** (176 occurrences across 5 templates, classic
  alone had 68). `:where(.printable) { font-size: var(...) }` has
  specificity 0,0,0; `text-[Npt]` is 0,1,0. The body never
  actually moved on screen. The fix is **one CSS rule** that
  targets `[class*="text-[11pt]"]` inside `.printable` and forces
  the var with `!important` — the attribute selector + the
  templates' own class are at the same specificity, so the
  source-order tiebreak plus !important makes the var win
  deterministically. Targets `text-[11pt]` only (body text size)
  so headings (`text-[12pt]`) and captions (`text-[10pt]`) keep
  their own sizes. Section spacing: each template's inter-section
  wrapper is now `space-y-[var(--resume-section-spacing)]`
  (modern/executive/creative/minimal/classic — 5 edits). Classic
  had no inter-section gap at all before (sections sat flush), so
  the fix actually *adds* a var-driven gap there. **Honest dev
  note on the way there:** the first attempt made the
  print-settings panel change the URL params and the *selects*
  show the new values, but the rendered body was identical
  because the templates' own classes shadowed the var. Verified
  visually this time, not just structurally: full-page screenshots
  of the design lab with `?fontSize=large&sectionSpacing=relaxed`
  vs defaults show the body text visibly larger and the section
  gaps visibly wider across all five templates. The earlier
  "wired correctly" claim was wrong; the screenshots are the
  receipt. 1451 → 1459.
- **Design Lab at /dev/design-lab + page-settings now apply to the
  editor** — branch `fix/design-lab-and-page-settings`. The user
  asked for an unauthenticated dev surface so layout / typography /
  per-template identity can be reviewed without a sign-in or an
  editor. `app/dev/design-lab/page.tsx` renders every registered
  template against `gallerySampleResumeData`, with a live
  print-settings panel (margin / line height / font size / section
  spacing) backed by URL state, so changes preview the same
  `--resume-*` CSS variables the editor consumes. `noindex` via
  the route layout. The page-settings bug fix is a one-line
  consequence of building it: the editor's `<Template />` was
  rendered bare, so the on-screen `:where(.printable)` rules
  never matched and the printed `@page { margin }` rule fell
  back to 0.4in because the var was never set in the cascade.
  `EditableResume` now wraps the template in `<div
  className="printable" style={printSettingsToCssVars(...)}>`
  driven by a new `initialPrintSettings` prop threaded through
  `page.tsx`. **Honest dev note on the way there:** the first
  attempt read URL params via `useSearchParams()` in a client
  component and got the values on the server but rendered defaults
  because `coercePrintSettings({margin,fontSize})` is a 4-key
  schema and rejects a partial. The current implementation makes
  the page a server component, reads `searchParams` directly, and
  overlays onto DEFAULT_PRINT_SETTINGS so every key is always
  present before Zod sees it. The earlier dev-server smoke test
  was useful for catching this — the prod build alone wouldn't
  have surfaced the partial-object rejection as cleanly. 15
  tests (design-lab public + noindex + template coverage + dev
  chrome + print panel; editor printable wrapper regression).
  1434 → 1451.
- **All four non-Classic templates now support add/remove for every
  section** — branch `fix/template-edit-affordances`. The user
  reported that on Modern/Executive/Creative/Minimal they could edit
  existing fields but could not add a new work item, project,
  education entry, skill, language, or interest — and could not
  remove one either. Classic was the only template with these
  affordances. Two distinct defects: (1) every section used a plain
  `.map(...)` over `mode.data.sections.X` with no `useFieldArray`,
  so the user had no path to "+ Add" or per-row "✕". (2) In
  Executive/Creative/Minimal the `<DateRange>` calls were missing
  `editable={mode.editable}` and `startPath`/`endPath` props, so
  even date fields rendered as static text. Fix: a shared
  `EditableSection` / `EditableNestedSection` helper that owns the
  `useFieldArray` + `append` + `remove` + "+ Add" / "✕" chrome;
  every section across all four templates now uses it. DateRange
  fixed in the three templates that needed it. The row closure
  reads via `mode.data.sections.X[i] ?? EMPTY_X` so a freshly
  appended row renders placeholders rather than crashing on an
  undefined index. Centralised empty-row defaults in
  `lib/resume-schema/defaults.ts` so the four templates cannot
  drift. Creative's `variant="chips"` accent pills are preserved
  — they are a deliberate part of that template's identity. 9
  tests for the helper (rounds-trip append/remove, no-print
  coverage, the `addLabel` → `Remove` aria-label normalisation),
  plus a pin that re-introducing the bug fails the test. 1425 →
  1434.
- **Skills render as a comma list, and the wrapping bug is fixed** —
  branch `fix/skills-comma-list`. Two separate defects the user spotted
  in the shared view. (1) Classic's read-only skills/languages/
  interests rows were `flex gap-2` **per row**, so every row sized its
  own columns independently — a long category ("Technologies/
  Frameworks") wrapped inside its own box and collided with the
  em-dash while short ones stayed on one line, giving the ragged
  misaligned output in the screenshot. Replaced with ONE two-column
  grid for the whole list (`grid-cols-[minmax(0,9.5rem)_1fr]`,
  `items-baseline`), which is the only way columns can align across
  rows. Applied to all three sections, not just the one that was
  screenshotted. (2) Read-only `FieldChips` rendered boxed pills; a
  resume is not a UI. Now a plain `values.join(', ')` with **no**
  per-item wrapper, so there is nothing for print CSS to strip.
  `variant="chips"` restores the pills and Creative opts in — its
  accent-coloured chips are deliberate template identity, so don't
  flatten it. **Editor chips keep their interactivity**: the box is
  gone and entries are comma-separated, but each one is still
  click-to-rename and hover-to-remove. Flattening them to static text
  would have looked identical and silently removed the ability to
  delete a single skill. 15 tests. Note: verified structurally and by
  rendered markup, **not** by screenshot — the preview is auth-gated
  and a standalone CSS harness wouldn't prove the real container
  width.
- **Share links are now recoverable by the owner** — branch
  `feat/share-link-retrieval`, migration `0009`. The share token is
  stored **twice**: as the existing SHA-256 `share_token_hash` (still
  the only thing `/r/[token]` looks up, untouched) and, when
  `SHARE_TOKEN_ENCRYPTION_KEY` is set, as an AES-256-GCM envelope in
  the new nullable `share_token_ciphertext` column. The key lives in
  the environment, never the database — so a stolen dump holds
  ciphertext with no way to open it, which is the property the
  hash-only design existed to provide. This is the resolution to a
  false dilemma: the old design chose "never store the token" and
  "owner can't re-read their link" *together*, when only the first
  was actually required. `getShareUrlAction` re-hashes the decrypted
  token and compares it against the stored hash (`timingSafeEqual`) so
  a ciphertext left stale by a rotation can never produce a URL that
  404s. **Every crypto failure returns `null` rather than throwing** —
  a missing or malformed key degrades to the old hash-only behaviour
  instead of taking sharing offline. Links that predate the column are
  unrecoverable and the UI says so; they become recoverable on their
  next rotation. **Changing `SHARE_TOKEN_ENCRYPTION_KEY` makes every
  existing link unreadable in the dialog** — same effect as rotating
  all of them. 23 crypto tests + 15 ShareButton tests.
- **Reopening the share dialog claimed sharing was off** — branch
  `fix/share-token-not-restored`, commit `d196225`. `ShareButton`
  selected its view with `const isEnabled = Boolean(url)` —
  **client-only** state, so any later visit fell through to
  "Sharing is currently off" while the trigger button beside it
  rendered a correct "on" badge. Worse, the visible "Enable sharing"
  button overwrote `share_token_hash`, silently killing a link the
  user had already sent to someone. `enabled` is now seeded from
  `initialStatus.enabled` and is the only input to view selection.
  `tests/unit/share-button.test.tsx` renders the component and asserts
  markup — reintroducing `Boolean(url)` fails 8 tests, including the
  two symptoms the user reported.
- **`app/favicon.ico` was Vercel's stock icon and outranked ours** —
  branch `fix/site-verification-seo`. The saas-starter shipped a
  `favicon.ico` (commit `61195ab`); the rebrand in `be07071` added
  `app/icon.png` but left it. Next.js gives `favicon.ico` **precedence**
  in the `<link rel="icon">` tags, so the browser tab rendered Vercel's
  logo for seven commits while the correct icon sat in the repo,
  correctly named, correctly formatted, and git-clean. **A test asserting
  "favicon.ico exists" passes throughout that entire bug** — only a
  content check catches it. `tests/unit/favicon.test.ts` pins the actual
  bytes against the known Vercel blob hash
  (`718d6fea…`), asserts the ICO's ICONDIR/entry table is well-formed,
  and checks that `icon.png` and `favicon.ico` both exist (the bare
  `/favicon.ico` path must not 404 for bookmark managers and RSS
  readers). Both files are regenerated together by
  `scripts/make-favicon.ps1` — never hand-edit one without the other.
  **Generalised lesson: in this app directory, adding a favicon does not
  replace one.** Check for the sibling file first.
- **robots.txt + sitemap + site-verification meta tag** — same branch.
  Neither `app/robots.ts` nor `app/sitemap.ts` existed: `/robots.txt`
  returned an **HTML 404 page**, on the same live site whose owner was
  simultaneously being told by Google that *"the website of your home
  page URL is not registered to you."* A 404ing robots file on a site
  asking Google for verification is a poor look and a real crawl
  problem. `lib/site.ts` is now the single source of site-origin truth
  (`NEXT_PUBLIC_APP_URL` → `BASE_URL` → `http://localhost:3000`),
  consumed by `app/sitemap.ts`, `app/robots.ts`, `metadataBase`, and
  share links — replacing the inline copy in `lib/share/token.ts`. It
  degrades to the dev default rather than throwing, because a typo in
  `NEXT_PUBLIC_APP_URL` would otherwise crash the whole production build
  from inside `new URL()`. `robots.ts` disallows `/r/` — public share
  links are one URL per recipient and contain real resumes; leaving them
  crawlable invites a search index of every resume ever shared.
  `GOOGLE_SITE_VERIFICATION` (optional, non-public) emits
  `<meta name="google-site-verification">` and is **omitted entirely**
  when unset. Note the build/runtime split, verified against
  `pnpm build` on 2026-10-09: `robots.txt` + `sitemap.xml` prerender
  STATIC (`○`), so the **origin** they bake in is frozen at build time —
  `NEXT_PUBLIC_APP_URL` must be correct *when the build runs*, not just
  at runtime. The `verification` tag lives in the root layout, and since
  that layout awaits `getUser()` every page renders DYNAMIC (`ƒ`), so
  the tag is read per-request and does **not** need a redeploy. (Both
  halves of that claim were asserted the other way round in the first
  draft of this file; the build output is what settled it.)
  `tests/unit/site-verification.test.ts` (39 tests) pins the origin
  fallback chain, the robots/sitemap contents, and the invariant that
  **no sitemap URL is blocked by robots** — the one that silently breaks
  when someone adds a route.

- **Google sign-in (optional) + account auto-linking** — branch
  `feat/google-oauth`. Google is registered in `lib/auth.ts` **only
  when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set**
  (helper: `lib/auth-google.ts`), so local dev, CI and self-hosters
  keep working on email+password with no crash and no dead button —
  the sign-in pages render the button off the *same* predicate that
  gates registration. **No DB migration**: the `account` table already
  carries `accountId`/`providerId`/`idToken`/`scope`. Verified
  working both as a new-user signup and as an auto-link onto an
  existing email+password account (`account.accountLinking`,
  `trustedProviders: ['google']`, `requireLocalEmailVerified: false`
  — the `false` is required only because we run no email-verification
  flow; the reasoning is in the config comment). **⚠ Do not add
  another provider to `trustedProviders` unless it is documented as
  verifying every email it issues** — that re-opens GHSA-g38m-r43w-p2q7.
  Redirect URIs must be registered for **both** `nexstepper.com` and
  `www.nexstepper.com` (Vercel 308s apex → www); setup steps are in
  `.env.example`. Free at any volume; basic identity scopes only keep
  the app exempt from Google's 100-user test cap.
- **Consent gating + legal page redesign** — same branch. PostHog no
  longer initialises in `instrumentation-client.ts` (it did, at page
  load, before anyone could decline); init moved to
  `components/consent/analytics-gate.tsx` inside `ConsentProvider`, so
  a mid-session "Accept all" starts tracking without a reload.
  `<AnalyticsGate />` must render **before** `<PostHogIdentify />` —
  React runs sibling effects in tree order. Consent stored in
  `localStorage`, deliberately not a cookie. **GPC now actually
  implemented** — the cookie policy claimed it was honored and it
  wasn't. Removed `nexstepper.csrf_token` and `nexstepper.share_token`
  from the cookie policy: both were invented, neither exists in code.
- **`@tailwindcss/typography` was never installed** — the legal pages
  carried `prose prose-neutral dark:prose-invert` on an article
  wrapper, so every one of those classes was an inert string: `<h2>`
  rendered at body size, `<ul>` had no bullets, tables had no header
  treatment. Reading the JSX cannot reveal this; only opening the page
  can. Installed + registered via `@plugin` in `globals.css` (with a
  comment warning against removing it). Also: legal `<main>` was
  capped at `max-w-3xl`, silently overriding the two-column shell.
  `tests/unit/legal-rendering.test.ts` pins all of it.
- **Print settings panel (margin / line height / font size / section
  spacing)** — on top of `fix/print-page-break-quality` (same branch).
  Gives the user four per-resume formatting knobs that solve the
  "Dayforce Virtual entry finished with a ~30% blank gap on page 1"
  screenshot — the user can now tighten margin / line height / font
  size until the next entry fits, or relax them for more breathable
  output. Storage: new `print_settings jsonb` column on `resumes`
  (per-resume — variants can differ from their master). Plumbing: 4
  CSS custom properties (`--resume-margin`, `--resume-line-height`,
  `--resume-font-size`, `--resume-section-spacing`) set inline on the
  `.printable` wrapper via `printSettingsToCssVars(settings)`; the
  `@page { margin }` rule in `globals.css` reads `--resume-margin`
  directly. UX: `Page settings` button in the editor toolbar opens a
  Radix Popover with 4 selects that save on change via the new
  `updatePrintSettingsAction` server action (with optimistic local
  update + rollback on error). Migration `0008_print_settings.sql`
  adds the column. PostHog event `print_settings_updated` fires on
  each change with all four values in the property bag. Tests:
  `tests/unit/print-settings.test.ts` (16 cases) pins the 4 preset
  value tables, the `printSettingsSchema` enum validation, the
  `coercePrintSettings` defensive fallback, and the CSS-var
  contract. 1229 → 1245 tests passing.
- **AI parsing modal — per-tip duration + minimal/premium polish** —
  on top of `fix/print-page-break-quality` (same branch as the print
  fix, since it's the active one and the user wanted both shipped
  together). The tip carousel inside the AI-parsing loading modal
  used a fixed `TIP_INTERVAL_MS = 6_000` — a 30-word tip flashed by
  faster than a comfortable read, and a 12-word tip sat longer than
  needed. v2 replaces it with `tipDurationMs(text)` in
  `lib/resume-tips.ts`, computed from the tip's word count at NN/G's
  3-WPS carousel standard (clamped to a 5–15 s floor/ceiling).
  Research: Brysbaert 2019 meta-analysis (190 studies, 17,887
  participants) puts average silent adult non-fiction reading at 238
  WPM; screen reading is ~10% slower; NN/G's auto-rotating-slide
  guideline is 3 WPS for a comfortable read; 5–7 s minimum so the
  carousel doesn't feel twitchy. Visual: dropped the trailing emojis
  + casual adjectives from `PARSING_HEADLINES` ("Sprinkling stardust",
  "Like a boss" — both out), replaced the heavy `bg-muted/40`
  rounded box around the tip with a thin left-border accent +
  generous padding + editorial pull-quote typography, and replaced
  the static dot row with a thin progress bar that fills over each
  tip's computed duration (single-shot `transform: scaleX(0→1)`
  animation keyed on tip change so it always restarts cleanly).
  Tests: `tests/unit/resume-tips.test.ts` pins the formula
  (worked examples for 15/18/30/45 words, monotonicity, floor /
  ceiling, headline emoji ban + word-count ceiling). 1219 → 1229
  tests.
- **JD attach → ATS scorecard refresh** — branch
  `fix/jd-attach-scorecard-stale`. After pasting a job description
  into a variant and hitting Save, the ATS score didn't appear in
  the right rail until the user hard-refreshed the page. Root cause
  was the `useState(initialBreakdown)` pattern in
  `app/(dashboard)/dashboard/resumes/[id]/_components/scorecard-client.tsx`:
  the breakdown returned by the page Server Component after
  `revalidatePath` arrived as a new `initialBreakdown` prop, but
  `useState` only uses the prop on mount — the same recurring trap
  as `form.reset(initialData)` in `editable-resume.tsx` (recurring
  trap #1 in this file). Fix: three `useEffect` calls that re-sync
  `breakdown`, `dynamicTips`, and `matchBreakdown` local state when
  the corresponding `initial*` prop changes. Object-identity deps
  are fine because the score engine returns a fresh object on every
  action; identical-reference re-renders bail out via React's
  setState bailout. New `tests/unit/scorecard-server-mirror.test.ts`
  pins the structural invariant (the project's standard
  `renderToStaticMarkup` test pattern — no jsdom in the runner).
- **One-click print + deprecate preview as a print trigger** —
  branch `feat/one-click-print-deprecate-preview`. The editor's
  "Save as PDF" / "See PDF preview" button used to open a new tab
  to the preview route with `?print=1`, which auto-triggered
  `window.print()`. The new-tab hop was unnecessary — the editor
  already renders the template at `max-w-[8.5in]` and the global
  `@media print` rules (`.no-print` chrome, `@page` margin from
  `--resume-margin`) carry the per-resume settings into the PDF
  unchanged. The button now calls `window.print()` directly. The
  preview route remains as a pure viewing page (back-link + share
  button + template badge) — useful for share-previews but no
  longer a print trigger. Side cleanup: `share-button.tsx` moved
  out of the `(dashboard)` route group into `components/share/` to
  dodge a TS phantom caused by an earlier-in-this-session
  `app/(dashboard` directory (missing closing paren) created by
  the write tool. `tests/unit/print-button.test.tsx` (4 cases) pins
  the new "Print" wording, the Printer icon, the data-testid, and
  the source-level guarantee that the onClick is `window.print()`
  (no `window.open`, no `location.href`, no `router.push`).
  1245 → 1249 tests passing.
- **Print page-break quality v2** — branch `fix/print-page-break-quality`
  (second commit, on top of v1 below). The v1 fix added
  `print:break-after-avoid` to every section `<h2>`. That worked for
  the orphan-header case but, in combination with the
  pre-existing `break-inside-avoid print:break-inside-avoid` on
  Modern's `<section>` wrapper, produced a worse artifact: when the
  Experience section was too big to fit at the bottom of page 1
  (after Summary), the WHOLE section jumped to page 2 — leaving ~half
  a page of blank space below Summary. Fix: remove the
  section-level `break-inside-avoid` from `ModernSection`. The
  `break-after-avoid` on the `<h2>` + per-entry `break-inside-avoid`
  on each work / edu / project wrapper is the right combination —
  it keeps the header glued to its body, lets the browser split
  the section between entries when it must, and doesn't waste a
  blank page when the section is too big. New guard tests in
  `tests/unit/print-page-breaks.test.tsx` assert NO template's
  `<section>` wrapper may carry `break-inside-avoid` (verified by
  re-introducing the bad class — 12 sections trip the guard).
  Web research confirms the W3C / MDN / Sitepoint consensus: apply
  `break-inside-avoid` to **leaves** (work entries, tables, figures)
  — never to a section container that can exceed a page. 1213 →
  1219 tests.
- **Print page-break quality v1** — branch `fix/print-page-break-quality`.
  Users reported that the Save-as-PDF print output had "random and bad"
  page breaks. Root cause was that every section wrapper already had
  per-entry `print:break-inside-avoid` (so individual work / edu /
  project entries don't get torn across pages) — but the section
  *header* (`<h2>`) had no rule preventing it from orphaning alone at
  the bottom of a page. Result: a "EXPERIENCE" header could sit at
  the bottom of page 1 with the first job entry pushed to page 2.
  Fix: add `print:break-after-avoid` to every section `<h2>` across
  all 5 templates (Classic [both editor and read-only paths],
  Minimal's `SmartSection`, Executive, Creative, Modern). New
  `tests/unit/print-page-breaks.test.tsx` pins the source-level
  class (source-level because jsdom doesn't run the real print
  engine — see file header for the rationale). v1 was correct
  *intuitively* but produced the giant-blank-page artifact that
  motivated v2. 1112 → 1209 tests.

- **Chat agent v2 + AI-parsing modal** — branch
  `feat/chat-agent-v2`. The chat "suggests but never does" was **five**
  independent defects, not one: (1) `stopWhen` was never set and the AI SDK
  defaults to `stepCountIs(1)`, so a turn that spent its step calling a tool
  ended immediately and could never confirm; (2) `editResume` required an
  `id` on every entry but the resume context contains no IDs, so validation
  always failed; (3) `buildMergedData` rebuilt the whole `sections` object in
  *each* conditional spread, so every operation **overwrote** the previous —
  `setBasics` + `addWork` in one call silently lost the summary edit; (4) the
  tool schema disagreed with `ResumeData` (skills lacked `keywords`, projects
  used `link` not `url`, hidden behind `as any`); (5) history was built in the
  v4 `UIMessage` shape with `Math.random()` tool-call IDs and tool results
  were never replayed. The system prompt compounded it by instructing tools
  fire *"ONLY when the user explicitly asks … in their own words"*, which
  refused the implied request *"I don't like my summary."* `editResume` is
  now **surgical** (setBasics / add|update|remove work, education, skills,
  projects, leaf sections, clearSection) with **no ids anywhere** and
  case-insensitive `matchCompany` / `matchRole` targeting; the merge moved to
  a pure, directly-tested `lib/chat/tools/merge-resume.ts` that folds every
  op into one accumulator and reports `applied[]` + `warnings[]` back to the
  model so a failed match retries instead of falsely claiming success. Chat
  moved to **`inclusionai/ling-3.1-flash`** (560B/25B-active, tool-use +
  reasoning, **$0/$0**, 262K ctx vs Nemo's 60K) with a gateway-native
  `order` fallback ending in Nemo — the only model proven on this account.
  `PARSER_MODEL` is deliberately untouched: the `structured-output` capability
  is the *only* reason Nemo is right for parsing and the reason Ling can't be.
  The editor now revalidates on a `resume_updated` SSE event. The AI-import
  loading text is replaced by a non-dismissible portal modal with rotating
  emoji headlines and a tip carousel covering resume craft, cover letters,
  and Nexstepper usage (incl. the master-resume → variant explanation).
  Plan: `docs/plans/chat-agent-v2.md`. 1023 → 1090 tests.

- **Chat UI + import-modal follow-up** — branch `feat/chat-agent-v2`
  (same branch, second commit). Five fixes, all found by using the preview:
  (1) **Chat history vanished on every new message** — `useChatStream` seeded
  its own two-element array per turn, so sending a message *replaced* the
  transcript; it only came back after closing and reopening the chat. The
  live conversation is now passed into `sendMessage` so the hook appends, and
  the three error paths restore the prior transcript instead of `[]` (a 429
  used to erase the whole chat). (2) **The editor ignored AI edits until a
  manual reload** — `useForm({ defaultValues })` is read *once*, so
  `router.refresh()` delivered a new `initialData` that react-hook-form
  silently discarded; added `form.reset(initialData)` on change. This was the
  "it said it updated my summary and I had to hit F5" report. (3) Assistant
  replies are rendered with `react-markdown` (already a dependency — used by
  the JD panel), with an explicit compact component map so raw `**bold**`
  stops showing as asterisks. (4) Chat autoscroll now yields: scrolling up
  unpins, and a jump-to-latest button appears instead of dragging the
  viewport back on every token. (5) The system prompt now receives whether
  the resume is a **master or a variant** (plus the parent master's name and
  variant count, via `resolveResumeKind` in the chat route), so it can answer
  "is this my master?" and knows that a master should stay general while a
  variant may be narrow.
  Also: the AI-parsing modal gained a **success beat** — the work no longer
  snaps shut the instant the parse lands. Spinner and checkmark cross-fade,
  the tip carousel and ETA fade out, and a "Your resume is ready to view 🎉"
  message holds for ~1.5s before the route changes (the parent now holds the
  new resume id in state and lets the modal own the timing). The same modal
  is now reused for **JD → variant creation**, which had the identical 30–90s
  bare-spinner wait. 1090 → 1112 tests.
  Also: new skill `vercel-ai-gateway-models` (user scope) captures the
  `npx vercel@latest ai-gateway models endpoints` workflow — see
  "Verifying AI model claims" below.

- **Template gallery modal** — shipped 2026-10-01, branch
  `feat/template-gallery-modal`. The compact `<TemplatePicker>`
  dropdown on the resume editor (a 72-char list with name +
  version + badges and no visual preview) is replaced with a
  full gallery modal: a 2-column responsive grid of template
  cards (name, version, ATS-safe badge, Pro badge, description,
  tags, "Current" badge on the active template), each with a
  **Preview** CTA that opens a stacked `<TemplatePreviewModal>`
  rendering that template against `gallerySampleResumeData` (a
  richer Alex-Morgan / 2-company / 2-project resume fixture so
  previews look like real resumes, not the existing thin
  JSON-Resume sample). Closing the preview returns to the
  gallery; closing the gallery returns to the editor. Same
  optimistic-update + `requestSave` plumbing as the old picker —
  the save pipeline is untouched. Old `template-picker.tsx`
  deleted; gallery surface is the new single entry point.
  Plan: `docs/plans/template-gallery-modal.md`. 1010 → 1031
  tests.

- **Rebrand: Nextep → Nexstepper** — shipped 2026-09-25, branch
  `feat/rebrand-nexstepper` (merged as PR #2) + drift memo
  `docs/drift/2026-09-25-nextep-rename.md`. Third party owns the
  "Nextep" / `.com` / `.app` namespace, so we shipped a one-word
  mashup of the original brand. Updates repo (renamed to
  `nexstepper`), `package.json` name, all marketing surfaces, legal
  pages, email templates, Better Auth cookie prefix (`nextep.*`
  → `nexstepper.*`; sessions invalidated once at merge boundary —
  acceptable because the product isn't yet public), Inngest app id,
  localStorage theme key, share-link event names, and the AI system
  prompt's brand voice. **Deferred** to follow-up: DNS cutover for
  hosted URL, Stripe product metadata, PostHog/Sentry project name,
  trademark ITM filing. Plan: `docs/drift/2026-09-25-nextep-rename.md`.

- **AI chat assistant (Phase 4)** — shipped 2026-09-24, branches
  `feat/ai-chat-assistant` + `feat/chat-ats-context`. Streaming
  SSE (`streamText` + custom `useChatStream` hook), tool registry
  with `edit_section` / `switch_template` / `noop`, 20-turn/day
  Free quota enforced server-side via the `chat_usage` table,
  ATS score fed into the system prompt so the model sees current
  numbers, raw `fetch` + `ReadableStream` (no `@ai-sdk/react`).
  Plan: `docs/plans/ai-chat-assistant.md`.
- **Chat cleanup + `parseChatToolCalls` helper** — shipped 2026-09-24,
  branch `fix/chat-cleanup`. Stripped the `[chat-server]` /
  `[chat-client]` / `[chat-bubble]` debug logs from `app/api/chat/route.ts`,
  `components/chat/use-chat-stream.ts`, `components/chat/chat-bubble.tsx`
  (along with their `LOG_PREFIX` constants and the now-dead
  `reqStartedAt`). Extracted `parseChatToolCalls(raw: unknown)` to
  `lib/db/queries.ts` next to `getChatMessages` — handles string-OR-object
  JSONB round-trip + JSON.parse + non-array + corruption (all return
  `undefined`). Also fixed a pre-existing `computedInMs` typecheck gap
  in `tests/unit/chat/ats-context.test.ts`. 949 → 954 tests.
- **Production deploy checklist** — shipped 2026-09-24, branch
  `docs/production-deploy-checklist`. `docs/setup/production.md` —
  11-section operational runbook: Neon DB bring-up, Stripe live mode,
  Resend domain verification, AI Gateway auth, Sentry/PostHog
  wiring, custom domain + SSL, Vercel env-var wiring, **16-step
  end-to-end smoke test on prod**, post-deploy monitoring, **5-scenario
  rollback playbook**, done-criteria gate. **Defaults to Neon Free
  tier** with an explicit 5-signal upgrade table (storage >400MB,
  compute hours capped >3 days early, slow first-paint, >100 paying
  users, first data-loss scare) — the $19/mo Launch upgrade is a
  trigger, not a launch cost.
- **Legal pages + GDPR data rights + landing polish** — shipped
  2026-09-24, branch `feat/pre-launch-compliance`. `/privacy`,
  `/terms`, `/cookies` under `app/(legal)/` (each opens with a
  `<PolicyNotice>` "last updated + not lawyer-reviewed" banner —
  generated from Termly CC0 templates adapted to Nextep facts).
  New `lib/data-rights/` module: `purgeUserAccount({ password })`
  orchestrator cancels Stripe subscription → deletes Stripe customer
  → scrubs PostHog via `$delete_user` → writes a hashed `erasure_log`
  row → calls Better Auth `deleteUser` (cascade FKs handle every
  user-owned table); `exportUserData()` returns a JSON bundle
  satisfying GDPR Art. 20 portability (profile + subscriptions +
  every resume + every revision + every application + every score
  snapshot + every chat session + every chat usage day + active
  shares), validated against a Zod schema versioned at `1.0.0`.
  `/dashboard/security` gained an "Export your data" button + the
  delete flow routes through the server-authoritative action. New
  query `getSubscriptionByUserId(userId)` (companion to session-
  scoped `getSubscription()`). Landing hero tightened, secondary
  CTA demoted to a text link, `<TrustStrip>` added with three
  real, defensible claims (GDPR-ready / Export & delete anytime /
  Stripe-secured). Plan: `docs/plans/pre-launch-compliance.md`.
  954 → 970 tests.
- **No-fake-testimonials policy** — shipped 2026-09-24, branch
  `fix/no-fake-testimonials`. Block comment in `components/marketing/hero.tsx`
  makes the policy explicit so a future TODO can't be misread as
  a green light for fabricated quotes. Real testimonials go in a
  separate `<TestimonialBlock />` component below the hero, never
  in the trust strip.
- **Seniority Fit calibration fix** — shipped 2026-09-25, commit
  `f5c462c`. Over-qualification past the ±2-year tolerance band
  now sets the dimension to `MAX_SCORE` instead of applying the
  asymmetric `OVER_QUALIFIED_SLOPE = 7.5` penalty. Senior
  candidates on senior-track JDs were being penalized for being
  too senior. Pearson r recovered from 0.907 → **0.9238**
  (matches pre-regression baseline). Drift memo:
  `docs/drift/2026-09-20-ats-v2-validation-corpus.md` §"Seniority
  Fit calibration fix shipped".
- **Open-source + LICENSE + SELF_HOSTING** — shipped 2026-09-25,
  commit `1908601`. MIT license at repo root with a Nextepper
  trademark notice (the "Nexstepper" name + logo are reserved);
  `docs/SELF_HOSTING.md` for self-hosters (legal responsibilities,
  their own privacy policy, their own subprocessors list). Terms
  page gained §3 (Open-source + hosted), §8 (hosted-vs-self-host
  AI disclaimer), §9 (Trademark clause). Privacy page gained §11
  (Open-source + self-hosting scope).
- **PostHog AI observability + privacy mode** — shipped 2026-09-25,
  commit `e75a1dd`. Wired `@posthog/ai` (`withTracing`) around
  every gateway model call. Privacy mode ON: PostHog captures
  metadata only (model, latency, tokens, errors, trace ID) — no
  prompts or responses. Privacy Policy §4 PostHog entry expanded
  into three sub-capabilities (product analytics, AI observability,
  session replay). 970/970 tests, .gitignore additions for wizard
  transient artifacts.
- **PostHog client init + Sentry nav hook** — shipped 2026-09-25,
  commits `3e1e4e9` + `e151f5d`. Migrated client init to
  `instrumentation-client.ts` (Next.js 15.3+ pattern, captures
  first $pageview before React mounts). Wired
  `onRouterTransitionStart = Sentry.captureRouterTransitionStart`
  to silence Sentry's `ACTION REQUIRED` warning. `.env.example`
  documents the server/client env var split.
- **Sentry 11 wizard cleanup** — shipped 2026-09-25, commit
  `0c2ee60`. Upgraded `@sentry/nextjs` 10.63 → 11.0 (replaced
  deprecated `sendDefaultPii` with `dataCollection` config). Fixed
  three things the wizard got wrong: hardcoded Sentry DSN in three
  files (moved to env vars), hardcoded org/project in
  `next.config.ts` (env vars), dropped sourcemap-upload guard
  (restored). Deleted wizard tutorial scaffolds
  (`app/sentry-example-page/`, `app/api/sentry-example-api/`).
  Kept `app/global-error.tsx` (real value) and
  `sentry.edge.config.ts` (needed for edge runtime).
- **PostHog identify + business-event catalog** — shipped
  2026-09-25, commits `e9a0829` + `c4a2cbc`. Wired
  `posthog.identify(userId)` on sign-in + `posthog.reset()` on
  sign-out via a tiny no-render client component. Created
  `lib/posthog/events.ts` as the single source of truth for 24
  event names across 6 categories (resume/variant lifecycle,
  scoring/AI, sharing, subscription, data rights, auth). Wired
  `trackServer(...)` calls across 10 action/route files. Subscription
  events fire only on actual plan transitions, not every webhook
  reconciliation (avoids double-counting on Stripe price-change
  replays).
- **Soft-launch Pro gating** — shipped 2026-09-27, commits
  `3d01397` + `72b871b` + `282faba` + `bdb3e6d`. Stripe live-mode
  activation requires a deployed business website, so every
  "Upgrade to Pro" CTA across the app was rewritten to a single
  "Pro is launching soon — get notified" mailto waitlist pattern.
  New shared component `components/billing/pro-launching-soon-cta.tsx`
  exports both a `<ProLaunchingSoonBadge />` (for cards) and a
  `<ProLaunchingSoonBanner />` (top-of-dashboard for Free users).
  Dashboard layout split into a server-side plan check + a
  client-side shell. `UpgradeButton` moved to `.trash/` for soft
  launch. Full restore plan in
  `docs/drift/2026-09-27-soft-launch-pro-gating.md` — search
  for that drift memo when you're ready to flip Pro back on.

**Next (queued, priority order)**

1. **Enable Pro subscription** — Stripe live mode is now active
   (verified 2026-10-10). The remaining step is creating the Pro
   product + Price in the Stripe Dashboard and setting
   `STRIPE_PRICE_ID_PRO` in Vercel. Until then, the Pro CTAs
   remain in the soft-launch waitlist state per
   `docs/drift/2026-09-27-soft-launch-pro-gating.md`, which
   also holds the full restore plan — read it before enabling.
2. **Reviews (Phase 5)** — invite-link flow, inline comments,
   thumbs verdict. Strong differentiator, but not launch-blocking.
3. **Liveblocks real-time collab UI** — presence + cursors on the
   variant editor surface; Liveblocks server stub already wired.
4. **`/api/job-contexts` + extension-ready API tokens** — so
   `nextep-ext` has a clean contract.
5. **Template studio (Phase 6)** — admin-only template authoring.
6. **Monorepo split** — defer until it actually bites (likely
   after collab, when packages like `lib/scoring/` start to feel
   cramped).

**Housekeeping owed (blocks nothing, cheap, and one of them is a
compliance gap)**

- **Create the legal mailboxes.** The privacy policy promises a
  GDPR-compliant 30-day response from `privacy@nexstepper.com`,
  `legal@nexstepper.com` and `security@nexstepper.com`. **None of
  these are verified to exist** — only `hi@nexstepper.com` is
  configured (Resend). Until they exist and are monitored, the
  promises are not keepable. Not verifiable from the repo.
- **Google brand verification.** Until it is done, the Google consent
  screen shows the GCP project name and number instead of "Nexstepper",
  with no logo. Free, ~2–3 business days, and already eligible —
  `/privacy` and `/terms` are live. Do it before real users see the
  auth screen.

**Later / parked** — see the locked non-goals above. Note: the
"Optimize" feature as a class of work is now parked. The inline
issue surface replaces it; no "Optimize" plan will be written.
The dead `lib/optimize/` was already deleted (2026-09-20) to
prevent naive re-use of the v0 modal-diff.

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

## Recurring traps (learned the hard way — reuse these)

These are not stylistic preferences. Each one cost a real user-facing bug, and
each will bite again if reintroduced.

### 1. `useForm({ defaultValues })` is read ONCE — it is not reactive

`components/editable/editable-resume.tsx` takes `initialData` from a Server
Component and hands it to react-hook-form as `defaultValues`. RHF captures that
value on mount and **never re-reads it**. So when anything server-side changes
the resume (the AI chat writing a revision, an inline-issue apply, another
tab), `router.refresh()` hands the component a brand-new `initialData` and
RHF silently keeps rendering the old values.

Symptom: *"the AI said it updated my resume and I had to press F5."* The write
was correct; only the editor was stale.

Fix (already in place — keep it):

```tsx
React.useEffect(() => {
  form.reset(initialData as never);
}, [initialData]);
```

Any new surface that receives server data and feeds a form needs this. If you
see "I have to reload for the change to show up", this is the first suspect.

### 2. Never let a stream/hook own a list it cannot see

`useChatStream` originally rebuilt its own two-element array per turn, so
sending a message replaced the visible transcript. The hook had no access to
the parent's `messages`, so it could not append.

**Rule:** a hook that mutates a collection takes the current collection as an
argument. Error paths restore the prior value — never `[]`. "Reset to empty on
error" silently deletes user-visible history.

### 3. LLM output is Markdown — render it

`react-markdown` is already a dependency (used by the JD panel). Assistant
replies that print inside a `whitespace-pre-wrap <p>` show literal `**bold**`.
Give it an explicit compact `components` map rather than a prose reset: chat
bubbles live in a 34rem sidebar where typography-plugin spacing blows the
layout out, and an unmapped tag would inject unstyled block layout.

Never render *user* text as markdown — it is literal input.

### 4. Autoscroll must yield to the user

Calling `scrollIntoView` on every streamed token yanks the viewport away from
anyone reading back through the conversation. Use a single `isPinnedToBottom`
flag: set from the scroll container's distance-from-bottom (with ~48px of
slack), drive the follow from it, and show a jump-to-latest button when
unpinned. Re-pin when the session id changes.

### 5. Verify AI model claims against the account, not the browser

The model browser at vercel.com has twice listed a model as free-tier that this
account could not actually call (`zai/glm-5.3-flash`,
`inclusionai/ling-3.0-flash-fin-free` — both 403'd in practice). Treat browser
metadata as a hint, never as evidence.

Use the authenticated CLI. Note the globally-installed CLI is **45.0.8 and has
no `ai-gateway` subcommand** — it silently falls through to `vercel deploy
--help`, which looks like a bad flag rather than a missing command:

```bash
npx --yes vercel@latest ai-gateway models ls --format json
npx --yes vercel@latest ai-gateway models endpoints <model-id> --format json
```

`endpoints` is the account-level view: per-provider `tags` (look for
`"free"`), `status` (0 = healthy), `context_length`, `supported_parameters`,
and live `uptime_last_1h` / `latency_last_1h` / `throughput_last_1h`. It is
also where per-provider **price and context disagree** for the same model, so
quote the endpoint, not the catalog summary.

The loadable skill `vercel-ai-gateway-models` wraps all of this
(`~/.minimax/skills/vercel-ai-gateway-models/SKILL.md`).

### 6. `structured_output` is the capability boundary — don't blur it

The model split in this repo is not a quality preference:

| need | requirement | model |
|---|---|---|
| parse a PDF into `ResumeSections` (strict JSON Schema) | `structured_output` | `mistral/mistral-nemo` |
| agentic chat with tool calls, 1M resume context | tool-use + reasoning | `anthropic/claude-haiku-5.5` |

The split holds, but **not for the reason it was originally written**.
Nemo is no longer "wrong for chat because it lacks reasoning" — the actual
reason, verified by live call on 2026-10-21, is that **Nemo's tool calling
is unreliable**: on 2 of 3 forced `tool_choice` calls it narrated the call as
prose and returned an empty `tool_calls` array. In the chat loop that reads as
"the model had nothing to say" rather than "the tool call failed", which is
silent data loss. So Nemo is parser-only and must not appear in
`CHAT_FALLBACKS`.

Check `endpoints[].supported_parameters` before moving a model between tiers —
and then **call it**, because the flag lied about three models this year.

### 6a. Catalog metadata is not evidence — call the model

Every price, tag, and capability claim in this repo's docs is a dated
snapshot that rots. Four separate times this year a model we had documented as
free turned out not to be callable, and twice a model tagged `tool-use`
silently failed to call a tool. The standing rule:

```powershell
npx --yes vercel@latest ai-gateway models endpoints <model-id> --format json
```

`endpoints` beats `models ls` beats the vercel.com browser page. And neither
substitutes for a live request with the capability you need. Full changelog
with the four documented failures: `docs/ai-models-reference.md`.

### 7. Never hand-roll an `IN (...)` list — use `inArray`

The GDPR export built its list clauses as:

```ts
sql`${resumeRevisions.resumeId} IN ${sql.join(
  rows.map((r) => sql`${r.id}`),
  sql`, `
)}`
```

`sql.join` does **not** add parentheses. Drizzle rendered
`"resume_revisions"."resume_id" IN $1, $2, $3`, which Postgres rejects with
`42601: syntax error at or near "$1"` — it parses `IN $1` as a legal
single-element IN, then trips on the comma. The reported position points at a
token that is itself fine, which is what makes this one slow to read.

**It only ever failed with 2+ rows.** A one-element list renders as `IN $1`,
which is valid, so an account with a single resume exported fine and the bug
hid in plain sight until someone had two.

Use `inArray(col, ids)`. It also guards the empty case (`in ()` is itself a
syntax error), so still check `rows.length > 0` first.
`tests/unit/db/in-array-sql-shape.test.ts` locks the rendered shape.

### 8. A TS `number` can be an integer column — it will not warn you

`score_snapshots.computed_in_ms` is an `integer` column, and the value written
to it came straight off `performance.now()`:

```ts
const computedInMs = Math.max(0, nowMs() - t0); // 15.795039999997243
```

Postgres rejects the whole INSERT with `invalid input syntax for type
integer`, and the recompute UI reported it to the user as *"Scoring failed"*.
TypeScript cannot catch this: `number` covers both integers and floats, and
`integer()` columns in Drizzle are typed `number`. There is no compile-time
signal at all — it is a runtime failure against a database the unit tests
don't have.

**Rule:** when writing to any `integer()` column from computed data, round at
the source *and* at the DB boundary in the query function. Round in the engine
(`lib/scoring/score.ts`) so every consumer is correct, and again in
`saveScoreSnapshot` so the next caller can't reintroduce a failure that tests
can't see. The integer columns in this schema to watch are
`computed_in_ms`, `match_score`, `share_view_count`, `tokens_in/out`, and
`tokens_used` / `turns_used`. `tests/unit/scoring/integer-columns.test.ts`
asserts the invariant.

## Folder structure (current + planned)

```
nexstepper/
├── docs/                      # Plans, ADRs, drift memos, AI model reference
│   ├── plans/                 # Feature plans: docs/plans/<slug>.md
│   ├── decisions/             # ADRs: docs/decisions/NNNN-<slug>.md
│   ├── drift/                 # Phase-boundary drift audits
│   ├── setup/                 # Operational runbooks (production.md, stripe.md)
│   └── ai-models-reference.md # Free-tier + paid AI model reference
├── app/                       # Next.js App Router
│   ├── (marketing)/           # Public site (landing, pricing)
│   ├── (auth)/                # Sign in / sign up / forgot / reset
│   ├── (dashboard)/           # Authed app surface
│   │   └── dashboard/
│   │       ├── page.tsx       # Overview + recent variants
│   │       ├── resumes/       # Resume list + edit + variant + optimize
│   │       ├── general/       # Profile settings + Billing card
│   │       └── security/      # Password + Export + Delete Account
│   ├── (legal)/               # /privacy, /terms, /cookies (shared layout)
│   ├── api/                   # Route handlers
│   │   ├── auth/[...all]/     # Better Auth catch-all
│   │   ├── chat/              # AI chat SSE stream
│   │   ├── stripe/            # Webhooks + checkout
│   │   ├── inngest/           # Background-job webhook
│   │   └── user/
│   ├── r/[token]/             # Public share-link route (no auth)
│   ├── layout.tsx             # Root layout (PostHog provider, font, etc.)
│   └── globals.css
├── components/
│   ├── ui/                    # shadcn primitives (Input, Button, Card, etc.)
│   ├── schema-form/           # Zod-driven dynamic form
│   ├── resume/                # Resume-specific UI
│   ├── scorecard/             # ATS scorecard surface (radar + bars + miss list)
│   ├── inline-issue/          # Inline-issue popover + pulse + apply bridge
│   ├── chat/                  # Chat bubble + SSE stream hook
│   ├── marketing/             # Hero / features / CTA / footer / preview
│   └── posthog-provider.tsx
├── lib/
│   ├── auth.ts                # Better Auth server instance
│   ├── auth-client.ts         # Better Auth React client
│   ├── resume-schema/         # Canonical ResumeData Zod schema
│   ├── db/
│   │   ├── schema.ts          # All Drizzle tables in one file
│   │   ├── queries.ts         # Query helpers (one per table/feature)
│   │   ├── drizzle.ts         # Driver selection (Neon vs postgres-js)
│   │   └── migrations/        # Drizzle journal + SQL files
│   ├── data-rights/           # GDPR Art. 17 (purge) + Art. 20 (export)
│   ├── billing/               # Pro-gating helpers (requirePro, useIsPro)
│   ├── chat/                  # Chat system prompt + tools + tool executor
│   ├── inline-issue/          # Orchestration + path-to-section mapper + prompts
│   ├── scoring/               # Pure ATS scoring engine + 7 dimensions
│   ├── scoring-async/         # Async scoring (db-touched) wrapper
│   ├── jd-parser/             # JD → structured JobPostingData (incl. Markdown formatter)
│   ├── resume-parser/         # PDF/DOCX/TXT → AI-parsed ResumeSections
│   ├── share/                 # Public-link tokens (gen, hash, URL build)
│   ├── payments/              # Stripe SDK singleton + helpers
│   ├── email/                 # Resend wrapper + reset-password template
│   ├── inngest/               # Inngest client + serve functions
│   ├── liveblocks/            # Liveblocks server client (Phase 5 stub)
│   ├── posthog/               # PostHog server + client (analytics)
│   ├── ai/                    # Vercel AI Gateway providers + model constants + fallback
│   ├── format/                # Misc formatters
│   └── utils.ts
├── scripts/
│   └── coderabbit-review.ps1  # CodeRabbit launcher (PowerShell)
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
- Cookies are prefixed `nexstepper.*` (see `lib/auth.ts` `advanced.cookiePrefix`). Renamed from `nextep.*` during the 2026-09-25 rebrand; see `docs/drift/2026-09-25-nextep-rename.md`. Existing sessions were invalidated at the rename boundary — acceptable because the product isn't yet public.
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
pnpm test            # 970+ unit tests must stay green (incl. ATS validation corpus, Pearson r > 0.7)
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

## Phase handoff (close-out 2026-07-13, refreshed 2026-09-01, refreshed 2026-09-18, refreshed 2026-09-18 (Optimize shipped), refreshed 2026-09-18 (planning session), refreshed 2026-09-19 (variant-first UX shipped), refreshed 2026-09-19 (JD Markdown formatting shipped), refreshed 2026-09-19 (ATS scoring shipped), refreshed 2026-09-20 (Phase 3 v2 ATS + inline-issue + subscription/billing), refreshed 2026-09-21 (inline-issue surface + print-hide), refreshed 2026-09-24 (AI chat assistant + launch-readiness batch: cleanup, deploy checklist, legal/data rights, landing polish))

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

### Launch-readiness batch (shipped 2026-09-24)

Five branches merged in one working session to close the
v1-launch gate defined in `docs/setup/production.md` §11.
The first three are product features; the last two are
operational.

- **AI chat assistant (Phase 4)** — `feat/ai-chat-assistant`
  + `feat/chat-ats-context` (PR to main). The fourth end-user
  feature that consumes the AI Gateway. Streaming SSE via raw
  `fetch` + `ReadableStream` (no `@ai-sdk/react` dependency
  added). Tool registry with `edit_section`, `switch_template`,
  `noop` — server-authoritative execution through
  `lib/chat/execute-tool.ts`. 20-turn/day Free quota enforced
  server-side via the `chat_usage` table. ATS score fed into
  the system prompt so the model sees current numbers per
  turn. The follow-up commit wires the score in and tightens
  the assistant-message shape so tool-call events that arrive
  before any text-delta still attach to the assistant bubble.
  Plan: `docs/plans/ai-chat-assistant.md`.
- **Chat cleanup + `parseChatToolCalls` helper** —
  `fix/chat-cleanup`. The chat assistant shipped with
  `LOG_PREFIX`-tagged debug logs across three files
  (`route.ts`, `use-chat-stream.ts`, `chat-bubble.tsx`) that
  were needed to diagnose SSE / tool-call / history-loading
  bugs — all fixed by ship time. Stripped every console call
  plus the `LOG_PREFIX` constants, and extracted the
  `toolCalls` JSONB round-trip parsing into
  `parseChatToolCalls(raw: unknown)` next to `getChatMessages`
  in `lib/db/queries.ts`. Also fixed a pre-existing
  typecheck regression: `tests/unit/chat/ats-context.test.ts`
  was missing the new `computedInMs` field on `ScoreBreakdown`
  (added by `3233ab7 feat(scoring-v2): wire scoreSeniorityFitFromEnvelope`).
  949 → 954 tests.
- **Production deploy checklist** —
  `docs/production-deploy-checklist`. `docs/setup/production.md`
  is an 11-section operational runbook that walks a fresh
  operator through Neon prod DB → Stripe live mode → Resend
  domain verification → AI Gateway auth → Sentry/PostHog →
  custom domain → Vercel env-var wiring → **16-step end-to-end
  smoke test on prod** → post-deploy monitoring → **5-scenario
  rollback playbook** → done criteria. The two opinionated
  calls baked into the doc: (a) **start on Neon Free tier** with
  an explicit 5-signal upgrade table — the $19/mo Launch upgrade
  is a trigger, not a launch cost; (b) "apex canonical, www →
  apex redirect" as the cookie-scoping default.
- **Legal pages + GDPR data rights + landing polish** —
  `feat/pre-launch-compliance`. Three new routes
  (`/privacy`, `/terms`, `/cookies`) under `app/(legal)/` with
  a shared minimalist layout (no nav rail) and a `<PolicyNotice>`
  banner on each that discloses "generated from open templates,
  not lawyer-reviewed" with a $300-500 lawyer-review
  recommendation. Footer 404s resolved. New `lib/data-rights/`
  module: `purgeUserAccount({ password })` orchestrator cancels
  Stripe subscription → deletes Stripe customer → scrubs PostHog
  via the `$delete_user` GDPR endpoint → writes a hashed
  `erasure_log` row → calls Better Auth `deleteUser` (whose
  cascade FKs handle every user-owned table); `exportUserData()`
  returns a Zod-validated JSON bundle satisfying GDPR Art. 20
  portability, versioned at `EXPORT_SCHEMA_VERSION = "1.0.0"`.
  New `getSubscriptionByUserId(userId)` companion query so the
  purge orchestrator can look up Stripe linkage without a session.
  New `erasure_log` table added in migration
  `0006_chat_sessions_and_erasure_log.sql` (consolidated with
  the previously hand-added 0006). `/dashboard/security` gained
  an "Export your data" button. Landing hero tightened ("Land
  your next role, faster" → "Tailored, ATS-scored resumes for
  every job you apply to."); "See pricing" demoted to a text
  link; new `<TrustStrip>` with three real, defensible claims.
  Plan: `docs/plans/pre-launch-compliance.md`. 954 → 970 tests.
- **No-fake-testimonials policy** — `fix/no-fake-testimonials`.
  Follow-up to the TrustStrip work: the original block comment
  floated a future TODO to "swap the middle item for a real
  testimonial" which could be misread as a green light for
  fabricated quotes. Replaced with an explicit policy comment:
  no fake testimonials, ever; if/when real user quotes land,
  they go in a separate `<TestimonialBlock />` component below
  the hero, never in the trust strip.

**Why this matters** — the v1 product loop (master → JD parse →
score → optimize → share → review → collab) is now feature-
complete, and as of **2026-10-08** it is also **deployed and
serving real users**. Three of the four "hard requirements" from
`docs/setup/production.md` §11 (Neon prod DB, Resend domain
verification, Vercel env-var wiring) are **done**. Only **Stripe
live mode** remains open, and it is open *by choice* under the
soft-launch gate. Everything else (Reviews, Liveblocks, extension
API, template studio) is post-launch polish that earns its keep
once there are users telling us what they actually want.

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