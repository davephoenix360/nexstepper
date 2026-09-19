# Variant-First UX Restructure — Plan

> Plan template: [`AGENTS.md` § Planning discipline](../../AGENTS.md#planning-discipline).
> Branch: `feat/variant-first-ux`. Commit footer: `Plan: docs/plans/variant-first-ux.md`.
> Depends on: nothing. **Sets the surface** for
> [`docs/plans/jd-markdown-format.md`](./jd-markdown-format.md) (Plan B)
> and [`docs/plans/ats-scoring.md`](./ats-scoring.md) (Plan C).

## Objective

Flip the resume editing experience from **master-centric** to
**variant-centric**:

- The **master resume** is the user's source library — the canonical
  "everything about me" document. It's less prominent in the UI; we
  only advertise creating one when the user has none.
- The **variant resume** is the editorial unit. It's what the user
  opens, edits, scores, shares, and sends. Variants are children of
  a master (via `resumes.parentResumeId`).
- The **job description** lives in a collapsible right-rail panel on
  the variant editor. The user sees the JD alongside the resume,
  always.

This is a navigation + editor surface change, not a schema change.
The data model already supports it (`isMaster`, `parentResumeId`,
`ResumeData.jobContext` are all in place — see § DB / schema).

**Why now:** the legacy had this model. The Optimize tool v0 was
shipped ungated on `basics.summary` and shows the JD on its own page.
The share-link flow is per-resume. None of these required
variant-first UX. The two features coming next — JD display
(Plan B) and ATS scoring (Plan C) — both want a JD in a side panel
on the editor. Building the variant-first surface first gives them a
home and fixes the master-overemphasis at the same time.

## User-visible behavior

### New `/dashboard/resumes` list page

```
┌─ Your resumes ─────────────────────────────────────────────────────┐
│                                                                     │
│ ▾ John Smith — Senior Software Engineer         (master · updated 3d)
│   │
│   ├─ Acme Corp — Senior Engineer     variant · 78 score · 2d
│   │  └─ Senior full-stack role focused on TypeScript + React
│   │
│   ├─ Vercel — Frontend Engineer      variant · 82 score · 1w
│   │  └─ UI-heavy role, design-system experience emphasized
│   │
│   └─ [+ New variant from JD]    [+ Edit master]
│                                                                     │
│ ▸ Jane Doe — Product Designer       (master · 0 variants · updated 1mo)
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- **Masters are collapsed by default** if they have variants; expanded
  if they have none (so the user sees their one resume).
- **Variants are the rows the user clicks.** Each variant card shows
  the target company + role, the ATS score (from Plan C), and a
  short tagline (the variant's `basics.label` field).
- **Score placeholder** shows "—" before Plan C lands; "—" + a
  tooltip "Score lands with the next feature."
- **"+ New variant from JD"** is the headline CTA on a master card.
  Opens the JD-paste flow (existing pattern, slightly tweaked).
- **"+ Edit master"** opens the master in the editor (same surface
  as variants; master is just a resume with `isMaster: true` and no
  JD side rail).

### New variant editor (`/dashboard/resumes/[variantId]`)

```
┌────────────────────────────────────────────────────────────────────┐
│ Variant editor (left, 2/3 width)        │ JD (right rail, 1/3)    │
│                                         │ ┌──────────────────────┐│
│ Breadcrumb: Master John Smith > Acme    │ │ Acme Corp            ││
│              Corp variant               │ │ Senior Engineer      ││
│                                         │ │ ──────────────────── ││
│ Header: [Share] [Download PDF] [Optimize]                         │
│                                         │ │ About the role       ││
│ ──────────────────────────────────────  │ │                      ││
│                                         │ │ We are looking for…  ││
│ [Inline WYSIWYG editor — Basics + Work] │ │                      ││
│                                         │ │ Requirements         ││
│  Name: John Smith                       │ │ • 5+ years TS        ││
│  Label: Senior Software Engineer       │ │ • React / Next.js    ││
│  Summary: ...                           │ │ • ...                ││
│                                         │ │                      ││
│  Experience                             │ │ Nice to have         ││
│   Acme Corp · 2024–Present              │ │ • Postgres           ││
│     - Built ...                         │ │ • ...                ││
│                                         │ └──────────────────────┘│
│ [Edit Education / Skills / ...]         │ [▸ Collapse panel]      │
│                                         │                         │
│ [Save]                                  │                         │
└────────────────────────────────────────────────────────────────────┘
```

- **Right rail is collapsible.** A small "▸ Collapse panel" toggle
  shrinks it to a thin vertical strip showing just "JD attached" +
  the company name; click to re-expand.
- **When expanded**, the rail shows the formatted JD (rendered
  Markdown, from Plan B) — scrolled independently from the editor.
- **The right rail is empty when no JD is attached.** Shows "Paste a
  job description to score this variant" with a button that opens
  the JD-parser flow (also reachable from the master card).

### Updated dashboard

The `/dashboard` page gets a "Recent variants" section above the
existing overview — 3 most-recently-edited variants across all masters,
each linking to its editor. (Mirrors the legacy's "Recent activity"
intent.)

### Empty state when user has no master

The current flow nudges the user to "Start from scratch" / "Import
from file" when no resumes exist. After this plan:

- **If the user has zero resumes:** the existing "Start from scratch"
  / "Import from file" CTA is shown (creates a master).
- **If the user has a master but zero variants:** the master is shown
  expanded with the headline "Create your first variant from a job
  description" CTA inside the master card.
- **If the user has variants:** the standard list (above).

## Scope (in)

- **Reshape `/dashboard/resumes`** list page (currently a flat
  resume list) into the master→variant tree above.
- **Add a right-rail `<JdPanel>`** to the editor page when the
  resume has an attached JD. Stub render for now (Plan B fills it
  in with formatted Markdown).
- **Add `<ResumeCard>` and `<VariantCard>` components** in
  `components/resumes/`.
- **Add `<ResumeList>` (server component)** that calls the existing
  `listResumesGrouped()` query (already in `lib/db/queries.ts:128`).
- **Add `+ New variant from JD` flow** — paste-JD dialog → calls
  existing `importResumeAction` (extended) or a new
  `createVariantFromJdAction` (TBD in implementation).
- **Add "Recent variants" section** to `/dashboard/page.tsx`.
- **Update empty-state copy** on `/dashboard/resumes` for the
  no-master vs. no-variant cases.
- **Add a small client-side `useJdPanelCollapsed`** preference
  (persisted to `localStorage`) so the collapse state survives
  page reloads.

## Non-goals (out of this plan)

- **JD Markdown formatting** itself — Plan B (next).
- **ATS scoring** — Plan C (depends on this + Plan B).
- **Master vs. variant visual differentiation beyond labels.** No
  new icon set, no template-specific styling.
- **Bulk variant operations** (multi-select, batch delete).
- **Variant rename UI** — variants start with the default name
  "Master name - Variant"; user can rename via the existing
  resume settings (deferred to a follow-up).
- **Variant templates** (one variant type for "SWE", another for
  "PM"). Out of v1 scope.
- **Application/Job tracking** — the existing `resumeVariants`
  table (Phase 2.4a) tracks AI-tailored outputs per Application;
  this plan doesn't touch that flow.
- **Multi-master enforcement.** Currently `countMasterResumes()`
  exists but isn't enforced. We still allow multiple masters in v1.
- **Drag-to-reorder variants** — defer to Liveblocks collab phase.

## Architecture

```
User lands on /dashboard/resumes
        │
        ▼
<ResumeList>  (Server Component)
  │
  ├─ listResumesGrouped(userId)        ← already in queries.ts:135
  │
  └─ for each { master, variants[] }:
       │
       ├─ <MasterCard master={...} expanded={variants.length === 0}>
       │     ├─ <VariantCard variant={...} /> × N (client component)
       │     └─ [+ New variant from JD]   [+ Edit master]
       │
       └─ collapsed (variants.length > 0): just the master row
```

```
User opens a variant  /dashboard/resumes/[variantId]
        │
        ▼
<ResumeEditorPage>  (Server Component)
  ├─ getResume(variantId, userId)
  │
  ├─ <EditorLayout>                     ← new 2-column grid layout
  │     ├─ <EditorColumn>               ← existing editable surface
  │     │     ├─ Breadcrumb
  │     │     ├─ Action bar (Share / Download PDF / Optimize)
  │     │     ├─ <EditableResume />    ← existing
  │     │     └─ Save button
  │     │
  │     └─ <JdPanel resumeId={...}>    ← new; Plan B fills it
  │           ├─ collapsed state (localStorage)
  │           ├─ if jobContext: <FormattedJd jobPosting={...} />
  │           └─ else: <EmptyJdCta />
  │
  └─ (Plan C will add <ScorecardPanel /> inside <JdPanel />)
```

### Key design decisions

1. **Server Components for the list and the editor page shell.**
   The existing `listResumesGrouped()` query already returns the
   `{ master, variants[] }[]` shape — we just consume it.
2. **Client Component for `<JdPanel>`** so the collapse toggle is
   stateful and the localStorage preference survives navigation.
3. **Right rail is part of the editor page, not a global shell.**
   Master editor (no JD) doesn't show the rail; variant editor
   (with JD) does. The page decides.
4. **"Recent variants" section reuses `<VariantCard>`.** Same
   component, different query (`listRecentVariants` — new, small
   helper in `lib/db/queries.ts`).
5. **No new env vars, no new routes.** The path
   `/dashboard/resumes/[id]` is unchanged; only the surface
   inside it changes.
6. **Existing Optimize button stays** on the editor — it works
   for both masters and variants today; we'll decide in Plan C
   whether variants get a richer Optimize UX (JD-aware).
7. **Empty-state copy is a client component** so we can switch
   between the "no master" and "no variants" states with a
   smooth fade.

## Files

### New

- `components/resumes/resume-card.tsx` — `<ResumeCard>` (renders
  master or variant based on props).
- `components/resumes/variant-card.tsx` — `<VariantCard>` (target
  role + company + score placeholder + tagline).
- `components/resumes/master-card.tsx` — `<MasterCard>` (compressed
  view of the master + slots for variants).
- `components/resumes/resume-list.tsx` — `<ResumeList>` (Server
  Component; consumes `listResumesGrouped()`).
- `components/resumes/create-variant-cta.tsx` — `<CreateVariantCta>`
  client component (opens the paste-JD dialog).
- `components/editor/jd-panel.tsx` — `<JdPanel>` client component
  (collapse toggle, localStorage persistence, empty state).
- `components/editor/jd-panel-fallback.tsx` — placeholder render
  for Plan B to fill in.
- `components/editor/editor-layout.tsx` — `<EditorLayout>` 2-column
  grid wrapper.
- `lib/db/queries.ts` (add) — `listRecentVariants(userId, limit)`
  helper.
- `tests/unit/resumes/resume-list.test.tsx` — list rendering tests.

### Changed

- `app/(dashboard)/dashboard/resumes/page.tsx` — replace flat list
  with `<ResumeList>`.
- `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — wrap in
  `<EditorLayout>`; add `<JdPanel>` to the right column when
  `resume.jobContext` is non-null.
- `app/(dashboard)/dashboard/page.tsx` — add "Recent variants"
  section above the overview.
- `app/(dashboard)/dashboard/resumes/_components/create-master-form.tsx` —
  tweak copy: "Create your master resume" (instead of "Create a
  resume") so the master/variant distinction is taught.
- `components/editable/editable-resume.tsx` — accept an
  `onVariantFocus` callback (optional) so the editor can highlight
  a variant when navigated to from the variant list.
- `app/(dashboard)/dashboard/resumes/_components/create-variant-button.tsx` —
  minor copy + the JD-paste flow lives here now (or is wired into
  the new CTA).

### Deleted

None.

## DB / schema

**No changes.** v1 of this plan consumes the existing schema
verbatim:

- `resumes.isMaster: boolean` — dist inguishes master vs. variant.
- `resumes.parentResumeId: text | null` — variants point at their
  master.
- `ResumeData.jobContext: jobPostingSchema | null` — JD lives on the
  resume data (per-resume).
- `lib/db/queries.ts:128 listResumesGrouped(userId)` — already
  returns the `{ master, variants[] }[]` shape we need.

A future "v1.1" of this plan may add a `resumes.archivedAt` column
for hiding old variants from the default list — defer until we have
user feedback.

No env vars. No migrations. No backfill.

## Dependencies

**No new npm packages.** Uses:
- `react-markdown` (TBD — may or may not already be a dep; we'll
  check during implementation. If not, Plan B adds it. Plan A
  ships with a stub JD panel render until Plan B lands.)
- Existing `components/ui/*` for buttons, cards, sheet, etc.
- `nanoid` (already in deps) for nothing — variants use
  `crypto.randomUUID()` already.

## Risks

1. **Refactor risk on the existing list page.** The current
   `/dashboard/resumes` page is small but battle-tested. Moving
   to a tree view is a real rewrite. **Mitigation:** keep the
   current component as `_legacy_list.tsx` for one PR cycle, swap
   behind a feature flag, fall back if Playwright smoke fails.
2. **Right-rail collapse preference drift across browsers.**
   localStorage is per-origin; a user with two browsers sees two
   different collapse states. **Mitigation:** not a real problem;
   document it in the PR description.
3. **Variant-as-default changes the share-link path semantics.**
   Currently `/r/{token}` uses the share token on the resume row
   itself, regardless of master/variant. After this plan, when
   someone shares a variant, the recipient lands on the variant
   (which has the JD-shaped data). **Mitigation:** nothing — this
   is the right behavior. Just call it out in the PR description.
4. **Empty-state copy for "no master" might confuse users who
   come from the legacy UX.** **Mitigation:** copy review in PR;
   optional onboarding tooltip deferred to v1.1.
5. **Score placeholder ("—") shows before Plan C lands.** Looks
   unfinished to users. **Mitigation:** add a tooltip "ATS score
   lands with the next feature" so it reads as intentional, not
   broken.

## Acceptance criteria

A reviewer can verify each of these from the diff + a manual
click-through.

1. ✅ `/dashboard/resumes` shows masters as collapsed rows with
   variants as children. Masters with zero variants render
   expanded. Visual proof in Playwright screenshot.
2. ✅ Clicking a variant navigates to
   `/dashboard/resumes/[variantId]` (the existing editor route
   with the same `getResume()` ownership check).
3. ✅ On the variant editor, a right rail appears when
   `resume.jobContext !== null`. The rail is collapsible via a
   visible toggle; the collapse state persists across page reloads
   (verified in Playwright).
4. ✅ On the master editor (no JD attached), the right rail does
   not render — the editor takes full width.
5. ✅ "Recent variants" section on `/dashboard` shows the 3 most
   recently edited variants across all masters. Click navigates to
   the variant editor.
6. ✅ Empty state for "no master" advertises the master creation
   flow (using the existing `CreateMasterResumeForm`). Empty
   state for "master with no variants" advertises the JD-paste
   CTA.
7. ✅ `listResumesGrouped()` is the single query the list page
   uses — no per-row fetches. Verified by inspecting the network
   tab on `/dashboard/resumes` (one request, returns the grouped
   shape).
8. ✅ `pnpm typecheck` clean. `pnpm test` green (existing 379 tests
   + new ~5 list-rendering tests stay green).
9. ✅ Mobile viewport (≤ 640 px wide) collapses the right rail
   below the editor (CSS-only, no JS). Verified in Playwright
   at 375 × 812 (iPhone).
10. ✅ Keyboard navigation: Tab order is `breadcrumb → header
    buttons → editable fields → JD panel (if open) → save`. Esc
    closes the JD-paste dialog without losing the master scroll
    position.
11. ✅ No `package.json` diff.
12. ✅ No DB migrations, no env-var additions.

## Test plan

- **Unit (Vitest):** `<ResumeList>` renders the expected tree
  shape for `{ master, variants[] }[]`; `<VariantCard>` displays the
  target company + role; `<MasterCard>` collapses/expands based on
  variant count. ~5 tests.
- **Playwright smoke:**
  - Visit `/dashboard/resumes` → assert the tree renders.
  - Click a variant → assert the editor + JD panel appear.
  - Open the JD-paste dialog, paste a sample JD, click "Create
    variant" → assert the new variant appears in the tree.
  - Reload → assert the JD panel collapse state persists.
- **Manual:** verify the variant card placeholder ("ATS score —
  coming soon") reads as intentional, not broken.

## Rollback plan

- Restore the previous flat list from `_legacy_list.tsx`.
- Revert the `<EditorLayout>` wrap on the editor page.
- Keep the `<JdPanel>` component in place (Plan B will need it);
  just don't mount it.
- No DB to roll back. No schema changes to revert. No `package.json`
  entries to remove.
- Estimated revert time: < 10 minutes.

## Open questions

1. **Where does the JD-paste dialog live in the new flow?** On
   the master card as a CTA (`+ New variant from JD`), or as a
   standalone route `/dashboard/resumes/new-variant`? Default:
   dialog from the master card. Standalone route is a v1.1
   improvement.
2. **Do we let users edit the master from the variant editor
   ("jump to master" button), or only from the master card?**
   Default: only from the master card. Breadcrumb in the variant
   editor shows the master name but isn't a link.
3. **Variant rename UI.** Default name is "<Master name> - Variant".
   Do we ship a rename UI in this plan, or punt? Default: punt to
   v1.1.
4. **Multiple masters.** `countMasterResumes()` already exists
   and we allow multiple. Should the empty state for "no master"
   create a master OR offer "import a master / start from scratch"
   like today? Default: same as today (Start from scratch + Import
   from file).
5. **Share-link from the variant list.** The Share button exists
   on the editor. Should each `<VariantCard>` also have a
   one-click "Copy share link" affordance? Default: no — keep the
   share action inside the editor where the user can verify
   the resume before sharing.
