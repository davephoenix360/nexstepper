# WYSIWYG Editor — Phase 1+ slice

## What we're building

Make `/dashboard/resumes/[id]` render the resume itself (using `ClassicTemplate`) and let the user edit each text value in place. Click a name, a phone number, a work title — that span becomes a styled input; blur or Enter commits; the resume stays rendered at all times.

The `/preview` route stays as the clean PDF-friendly view (no editor chrome). SchemaForm does not go away — it's still used for sections we don't inline-edit in v1.

## User-confirmed forks (2026-07-07)

| Fork | Pick |
|---|---|
| Edit model | Click-to-focus input — text becomes a styled `<input>` on click, swaps back on blur/Enter |
| Tabs | Drop Profile/Experience/Skills/Recognition — single scroll, section headers double as scroll anchors |
| Scope | Inline-edit Basics (Header) + Work entries in v1; Skills/Education/etc. keep SchemaForm, accessed via "Edit [section]" link → section dialog |
| Save | Explicit Save button only — no autosave yet |

## Architecture

```
Editor page (RSC)
 └── <EditableResume initialData={...} resumeId={...} />   ← client component
      ├── <RHF form provider with resumeDataSchema>           ← same shape SchemaForm uses
      ├── <ClassicTemplate wrapped — basics + work use EditableText>
      │     └── <EditableText path="sections.basics.name" /> ← styled <span> or styled <input>
      ├── Static render of sections we don't inline-edit (Skills, Education, ...)
      │     with "Edit [section]" button → opens a Sheet/Dialog
      │     └── <Sheet><SchemaForm schema={sectionSubset} /></Sheet>
      └── <div className="sticky bottom-4"><Button onClick={handleSubmit}>Save</Button></div>
```

State plumbing reuses the same RHF setup as today's `SchemaForm` (zodResolver, defaultValues from initial revision). Save action is the existing `saveResumeAction`. We just stop using `SchemaForm`'s full-tree renderer and instead mount fields where the template needs them.

`/preview` route keeps working: a server `getResume()` + `<ClassicTemplate>` is unaffected because EditableText simply renders its static-text view when not focused — the rendered HTML is identical to today.

## File plan

### New
- `components/editable/editable-text.tsx` — `<EditableText path="..." className="..." placeholder="..." />`. Reads `useController({ name: path })`. Renders `<span className={cls}>{value || placeholder}</span>` when idle, swaps to `<input>` when focused. On blur / Enter, writes to RHF. Visual styling stays identical to the static state. Click-triggered via `onClick` + `tabIndex={0}` + key handlers for keyboard a11y.
- `components/editable/editable-textarea.tsx` — same shape, multiline. Used for `basics.summary`, `work.positions[].highlights` (chips in v2; raw `<textarea>` for v1), and `work[].description`.
- `components/editable/editable-work-item.tsx` — wraps the per-item "work entry" rendering with its own EditableText leaves. Manages the local focus so collapsing items still works (the EditableText inside a collapsed item is just hidden).
- `components/editable/editable-resume.tsx` — `<EditableResume resumeId initialData onSaved>` client component. Hosts the RHF FormProvider, the EditableText-wrapped template, the "Edit experience / skills / education / ..." section-dialog buttons, the Save button. Routes the Save through `saveResumeAction`.
- `components/editable/edit-section-dialog.tsx` — wraps a `<SchemaForm schema={...}>` for the non-v1 sections (Skills, Education, Projects, Volunteer, Awards, Certificates, Publications, Languages, Interests, References). Subset of the resume data per section, scoped.
- `components/ui/sheet.tsx` — Radix Dialog-based slide-in sheet. We don't have it yet but the slice needs it. Add via shadcn convention (`npx shadcn@latest add sheet`), or roll a thin one atop `dialog.tsx` if not yet installed — TBD on first attempt.

### Changed
- `components/resume-templates/classic.tsx`:
  - Replace plain text leaves for basics (Name, Label, Email, Phone, Url, Summary, City, Region, Country Code) with `<EditableText>` / `<EditableTextarea>`.
  - For Work entries, accept an `editable` prop (default `false` for `/preview`). When true, swap text leaves for `<EditableText>`.
  - Add a " + Add a work entry" button at the end of the Experience section (inside the template, but conditionally rendered only when `editable` is true).
  - Static rendering otherwise — keeps `/preview` and `renderToString` Phase 2 unaffected.
- `app/(dashboard)/dashboard/resumes/[id]/page.tsx`:
  - Drop `ResumeEditorForm`. Render `<EditableResume resumeId={resume.id} initialData={data} />`.
  - Header keeps the page-level breadcrumb-y title + "Tailor this for a job" button (variant only).
- `app/(dashboard)/dashboard/resumes/_components/resume-editor-form.tsx`:
  - File deleted. Its only purpose was the existing form mount; `<EditableResume>` replaces it.

### Unchanged
- `components/resume-templates/{types,index}.ts` — registry stays the same.
- `app/(dashboard)/dashboard/resumes/[id]/preview/page.tsx` — preview view of the same Classic template, untouched.
- `app/globals.css` — print rules carry over.
- `lib/db/queries.ts` — `saveResumeRevision` and `getResume` are reused as-is.
- Schema-form primitives — kept around because we still use `<SchemaForm>` inside the section dialog.

## EditableText primitive — sketch

```tsx
'use client';

export function EditableText({
  path, placeholder, className, as: Tag = 'span'
}: Props) {
  const { field, fieldState } = useController({ name: path });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (field.value ?? '') as string);

  if (editing) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { field.onChange(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(field.value ?? ''); setEditing(false); }
        }}
        className={cn(className, 'bg-transparent border-b border-indigo-300 outline-none')}
        autoFocus
      />
    );
  }

  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={() => { setDraft(field.value ?? ''); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setDraft(field.value ?? ''); setEditing(true); }}}
      className={cn(className, 'cursor-text hover:bg-indigo-50/40 rounded-sm')}
    >
      {field.value || (placeholder && <span className="text-muted-foreground">{placeholder}</span>)}
    </Tag>
  );
}
```

Notes:
- `field.value` may be `undefined` (RHF defaultValues sub-tree pruning); we coerce to `''`.
- We also handle `Escape` to roll back to the prior value (no dirty write).
- A11y: `role="button"` + `tabIndex={0}` + Enter key. Screen-reader announcement via the wrapper text content. The input has its own implicit label from the template structure (e.g., the visible "Summary" header above the field is visually adjacent).
- **Print fidelity:** the input branch uses `print:border-none print:bg-transparent print:px-0 print:cursor-default` so a focused-and-printed state prints identically to the idle span (no bottom border, no padding shift, no cursor).

## Print fidelity (the question the user asked)

The user reported the **Nexstepper topbar surviving into the print** and asked whether the PDF will look exactly like the editor. Both addressed in this slice.

**Already shipped (this turn):**

- `app/(dashboard)/dashboard/layout.tsx` — added `no-print` to the mobile topbar (`<div className="lg:hidden ...">`) and the sidebar (`<aside>`). Confirmed via Playwright that the three chrome elements on `/preview` now carry `.no-print`.
- `app/globals.css` had `.no-print { display: none !important }` under `@media print` since Phase 1 slice 3.
- `@page { size: letter; margin: 0.4in }` already in globals.css. Both `/preview` and the future editor render match on paper geometry.
- `body { background: white !important }` under `@media print` so the "paper on desk" gray page-color doesn't bleed.
- Template uses Tailwind `print:print:max-w-none print:shadow-none print:ring-0 print:px-0 print:py-0` to drop the screen-only card styling.

**Will ship in this slice (WYSIWYG):**

- Every EditableText on the idle state renders the SAME element + classes as the static template (e.g. `<h1 className="text-[26pt] font-semibold leading-none tracking-tight text-zinc-900">`). So pixels match exactly.
- EditableText's idle uses `cursor-text` + `hover:bg-indigo-50/40` — hover doesn't trigger in print, cursor is ignored in print. No `print:` variants needed for those.
- "Edit [section]" cards, "+ Add a work entry" button, Save button — all get `no-print`. Won't show in PDF.
- Each `<section>` and each item card wrap with `print:break-inside-avoid` so we don't tear a Work entry across pages.
- A "Print" button stays on the editor page (same component as `/preview`'s) for one-tap printing.

**The answer to "will the PDF look exactly like the editor?":** yes, modulo chrome (topbar, sidebar, save button, edit buttons) and interactive affordances (hover bg, cursor). That's the right cut for a PDF — those pieces don't belong on paper.

## Open follow-ups (called out, not in this slice)

- Auth layout's topbar (back-to-landing + theme toggle) — should also get `.no-print` for parity. Trivial follow-up.
- Marketing layout's topbar — same. Less critical since users don't typically print marketing pages.

## "Add a work entry" UX

Inside the template's Experience section, when `editable` is true:

```tsx
{editable && (
  <div className="no-print mt-2">
    <Button onClick={handleAddWork} variant="ghost" size="sm" type="button">
      <Plus className="size-3" /> Add a work entry
    </Button>
  </div>
)}
```

`handleAddWork` calls `useFieldArray.append({})` from RHF. The new entry renders at the bottom of the section with empty EditableText leaves. Focus jumps to the first field (company name) so the user can immediately start typing. Browser scrolls the new entry into view automatically because of focus + button placement.

## Sections beyond Basics + Work (v1 cut)

These render as small "Edit [section]" cards in the editor view:

- `<section className="no-print">` strip just below the rendered Basics + Work:
  - "Edit Skills" → opens Sheet with SchemaForm for `sections.skills`
  - "Edit Education" → Sheet for `sections.education`
  - "Edit Projects" / "Volunteer" / "Awards" / "Certificates" / "Publications" / "Languages" / "Interests" / "References" — Sheet per section
  - Plus the envelope (Name, Note, Status, Template) — same Sheet approach

Why this and not all-inline: skills/keywords are chips (separate sub-task), languages have a `fluency` enum (overkill to make a chip in place), education has degree/majors/minors triples, etc. v1 ships the visible surface (basics + work) inline; everything else stays a click away through consistent dialogs.

Phase 2+ slices can lift the rest into inline. The architecture (RHF + the existing schema-form primitives) doesn't have to change — just swap section-by-section.

## Save

Same `saveResumeAction({ id, data })`. The `<EditableResume>` reads the current form state via `form.handleSubmit(data => saveResumeAction(...))`. Submit button is at the bottom of the editor (`sticky bottom-4` so it's always reachable).

No autosave. No "Saving..." indicator. Failure shows inline as today.

## Verification

- `pnpm typecheck` clean.
- Visit `/dashboard/resumes/9663e16c-8350-49db-aa07-e30e99970d42`:
  - Page shows rendered resume, no tabs.
  - Click on the name → styled input with same h1 typography. Type. Blur. Renders as styled text. No layout shift.
  - Click "Save". Toast or status flash. Network shows `saveResumeAction`. Refresh page — new value persists.
  - Scroll to "Experience" → click "+ Add a work entry" → empty entry appears at bottom, focus in company name. Type company. Save. Refresh — entry persists.
  - Click "Edit Skills" → Sheet slides in with current Skills values. Edit a value. Close. Click "Save" — Skills persists.
  - Switch tab to Editor on `/dashboard/resumes` — values reflect the saved state.
- Visit `/dashboard/resumes/<id>/preview`:
  - Page looks identical to the editable view minus the section-edit buttons + save button. Print preview (browser) shows correct PDF.
- Tablet/mobile: edit-on-click works; tiny hit-targets on small screens — flag as a known v1 limitation. Don't ship mobile UX as part of v1 acceptance.
- A11y spot-check: Tab to a field, Enter — focus enters input. Type. Enter — commits. Esc — cancels.

## Risks

- **RHF controlled-input → EditableText contract**: same `useController({ name: path })` pattern as SchemaForm. The template statically rendering non-editable sections means RHF has to mount those fields anyway so Save can pick them up. **Mitigation:** keep a `<FormProvider>` at `<EditableResume>` level and mount a hidden `SchemaForm` (or future inline form) for the sections not rendered visibly. (Or use RHF's `register` directly inside hidden mounts.) Address in the first code pass.
- **Component purity break**: `ClassicTemplate` is currently a server component. Adding `<EditableText>` (a client component) inside it is fine in React — server can render client. But the "Add a work entry" button is interactive and must be inside a client boundary. **Mitigation:** wrap the entire editable section of the template in a `<EditableBoundary>` client component; pass the children as render-prop or split the template into "static parts" + "editable parts" composed in the page.
- **Hit-target sizing on click**: a `<h1>` styled at `text-[26pt]` has a huge visual area but only a thin clickable span. We add `cursor-text` and a hover bg to make it discoverable. (Real fix in v2.)

## Out of scope (v1)

- Skills/keywords as inline chips — sub-slice later
- Education's degree/majors triples inline — sub-slice later
- All other sections inline — sub-slice later
- Inline validation popovers — Phase 4 with AI Optimize
- Drag-reorder work entries — Phase 5 with collab
- Autosave — Phase 4 or 5
- Mobile-first touch adjustments — Phase 6
- Liveblocks presence ("Alice is editing Basics") — Phase 5 collab

## File diff size estimate

~600-900 lines added, mostly in `editable/` (~400 lines) and the EditableResume wrapper (~150 lines). Classic template diff: ~80 lines (swap plain strings for `<EditableText>` leaves). Net diff feel: medium-large but well-scoped to a small number of files.

## Open questions for the next session

- Does the user want the save button floating or in a top-right slot?
- For the multi-line Summary — do we want a fixed-height growing textarea, or expand-to-content?
- When clicking in an Experience entry, do we focus the company name first or the date range first (since date is usually filled first)?

These can be settled when the code lands; they don't gate architecture.
