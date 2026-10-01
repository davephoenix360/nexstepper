# Template Gallery Modal — Plan

## Objective
Replace the compact `TemplatePicker` dropdown on the resume editor with a
gallery modal that shows every available template as a card and lets the user
preview each one with sample data before committing. Today the picker lists
five templates in a 72-character-wide dropdown — the user picks blind. The
gallery makes the templates visual and lets the user see the actual rendered
output of each one before switching.

## User-visible behavior
1. On the resume editor, the "Template" trigger button (currently a
   dropdown) now reads **"Template: Classic v1.1.0 ▾"** and opens a
   full gallery modal on click.
2. The modal is a **2-column responsive grid** of template cards
   (1 column on phones, 2 on tablets, 2 on desktop — 3 doesn't fit
   the modal width without cards getting cramped).
3. Each card shows:
   - Template name (e.g. "Classic")
   - Version (e.g. "v1.1.0")
   - ATS-safe badge if applicable
   - Pro badge if `tier === 'pro'`
   - One-line description from meta
   - Tags (the existing `meta.tags`)
   - Two buttons:
     - **Preview** — opens a second modal showing the template rendered
       with `sampleResumeData` so the user sees exactly what their
       resume will look like.
     - **Use this template** — selects the template, closes the
       gallery, saves the resume. Same behavior as picking from the
       old dropdown.
4. The currently-active template is marked with a "Current" badge so
   the user doesn't accidentally re-select what they already have.
5. **Preview modal** opens on top of the gallery (stacked dialogs).
   Shows the full rendered template, scaled to fit the dialog. The
   preview shows the template's chrome (accent color, fonts, section
   headers, bullet styling) but NOT interactive editor affordances
   (`editable={false}`).
6. Closing the preview returns the user to the gallery, which is
   still open.
7. Pressing **Esc** closes the topmost modal (preview first, then
   gallery). Backdrop clicks do the same.
8. Same keyboard shortcut, save behavior, and `requestSave` plumbing
   as the old picker — picking a template still optimistically
   updates the form value and persists via the existing save pipeline.

## Scope (in)
- New `<TemplateGalleryModal>` component (outer modal).
- New `<TemplatePreviewModal>` component (inner modal that renders
  one template with sample data).
- Replace `<TemplatePicker>` usage in
  `components/editable/editable-resume.tsx`.
- Add a richer "preview sample" constant (`gallerySampleResumeData`)
  in `lib/resume-schema/sample.ts` so the previews look like real
  resumes, not the existing thin JSON-Resume fixture.
- Unit tests for both new components.
- Update `components/resume-templates/index.ts` exports.

## Non-goals (out of this plan)
- **Filtering by tags** in the gallery. Five templates fit on one
  screen; tag filters would be UI noise. Add when we ship
  10+ templates.
- **Search bar**. Same reason — five templates.
- **Drag-to-reorder**. Templates ship in a fixed display order.
- **Preview at custom data sizes**. We render with one sample; the
  user picks and edits to see how their data looks.
- **Tier-gating paywall animations**. Today every template is
  `tier: 'free'`, so the Pro badge is informational only. When we
  ship paid templates, this modal is the place that shows the
  "Locked — upgrade to Pro" overlay.
- **Persisting the "last previewed" template**. Closing the modal
  and reopening it starts fresh.
- **Animations**. The existing `<Dialog>` doesn't animate; the new
  modals match that.

## Architecture

```
editable-resume.tsx
   └─ <TemplateGalleryButton>
        ├─ shows current template name + version
        ├─ opens ↓ on click
        │
        └─ <TemplateGalleryModal>
             ├─ 2-col grid of <TemplateCard /> (one per template)
             │     └─ per card:
             │          ├─ "Preview" → opens ↓
             │          └─ "Use this template" → switches + closes
             │
             └─ <TemplatePreviewModal> (stacked, optional)
                  └─ renders <Template.Component
                                data={gallerySampleResumeData}
                                editable={false} />
```

**Why a stacked modal vs single-modal-view-switch:**
- The gallery and the preview serve different mental models. The
  gallery is "where am I picking from?", the preview is "what does
  this one look like?". Keeping them as separate dialogs gives the
  user an obvious way back (close preview → see gallery) and matches
  every modern UI convention (Linear, Notion, Figma all do this).
- View-switching inside one modal requires explicit back navigation
  + state machine; stacked dialogs leverage the existing
  `<Dialog>` primitive + native `<dialog>` element's stacking
  behavior for free.

**Why `<Template.Component editable={false}>` directly:**
- All five templates already support `editable={false}` as the
  default — Modern/Minimal/Executive/Creative render a plain
  read-only view via the `Field` abstraction; Classic delegates
  to `ClassicReadOnly`. No `FormProvider` needed, no hooks, no
  editor affordances leak into the preview.
- We render the templates INSIDE the editor's client tree (the
  modal is mounted from `editable-resume.tsx`), so importing the
  Components from the registry just works — no server/client
  boundary issues.

**Why a separate `gallerySampleResumeData`:**
- The existing `sampleResumeData` in `lib/resume-schema/sample.ts`
  is the JSON-Resume fixture — 1 work entry, 1 education entry,
  2 skills. That's OK for dev fixtures but a thin preview.
- A richer sample (2-3 work entries with multiple positions each,
  2-3 projects, fuller skills, education with minors) exercises
  more of each template's layout — bullets, dates, multi-position
  rendering — so the preview looks like a real resume.
- We don't change the exported `sampleResumeData` because other
  tests depend on its exact shape. The new constant lives in the
  same file and is additive.

## Files
- **New:**
  - `components/resume-templates/template-gallery-modal.tsx`
  - `components/resume-templates/template-preview-modal.tsx`
  - `tests/unit/template-gallery-modal.test.tsx`
  - `tests/unit/template-preview-modal.test.tsx`
- **Changed:**
  - `components/editable/editable-resume.tsx` — swap `<TemplatePicker>`
    for `<TemplateGalleryButton>`
  - `components/resume-templates/index.ts` — export the new
    components, remove the `TemplatePicker` re-export
  - `lib/resume-schema/sample.ts` — add `gallerySampleResumeData`
- **Deleted:**
  - `components/resume-templates/template-picker.tsx` — replaced
    by the gallery modal; only consumer was the editor

## DB / schema
None. Pure UI work; the persisted `resumes.template` field is
already updated through the existing `saveResumeAction`.

## Dependencies
None. All work uses existing primitives (`<Dialog>`, the registry
in `components/resume-templates/index.ts`, Tailwind classes already
in the bundle).

## Risks

1. **Modal-stacking on mobile (small viewports).** The preview
   modal is wide (~820px) and tall (full US Letter page). On a
   phone in portrait, two stacked modals would cover everything.
   **Mitigation:** the gallery modal caps its body height via
   `max-h-[calc(100dvh-3rem)]` (already in `<Dialog>`); the
   preview modal does the same. On very small screens the inner
   scroll takes over.

2. **Render perf when previewing all 5 templates on the same
   page.** Each card doesn't render its template — only the
   preview modal does, and only one at a time. So we only mount
   one `<Template.Component>` at a time, not 5.

3. **Existing tests for `TemplatePicker`.** A grep shows no
   existing picker tests, so the deletion is safe. The existing
   test for `template-meta.test.ts` covers the registry + meta
   contract, which we're not touching.

4. **Hydration mismatch from the sample data.** The sample is
   static and identical between server and client (no
   `Date.now()`, no `Math.random()`), so SSR-safe.

## Acceptance criteria
- [ ] Clicking the new "Template" button on the editor opens the
      gallery modal with all 5 templates as cards.
- [ ] Each card displays: name, version, ATS badge (if applicable),
      Pro badge (if applicable), description, tags, and the
      current-template indicator on the active one.
- [ ] Clicking "Preview" on any card opens the preview modal on
      top of the gallery, showing the template rendered with
      `gallerySampleResumeData`.
- [ ] The preview shows the actual template chrome (fonts, colors,
      section rules) — not editor affordances.
- [ ] Closing the preview returns to the gallery (which is still
      open). Closing the gallery returns to the editor.
- [ ] Clicking "Use this template" on a card closes the gallery,
      updates the form, and saves (via the existing save pipeline).
- [ ] The old `<TemplatePicker>` dropdown is no longer mounted on
      the editor route.
- [ ] Unit tests pass (≥95% coverage of the new components).
- [ ] `pnpm typecheck` and `pnpm test` both pass.

## Test plan
- **Unit:**
  - Gallery renders 5 cards.
  - Gallery marks the current template with a "Current" badge.
  - Clicking "Preview" on a card opens the preview modal with the
    right template rendered.
  - Closing the preview returns to the gallery (gallery still
    mounted).
  - Clicking "Use this template" calls `onPick(templateId)` and
    closes the gallery.
  - Gallery button label shows the current template name + version.
- **Integration / smoke:** (manual)
  - Open the editor → click "Template" → gallery opens → click
    "Preview" on Modern → preview opens → close preview → close
    gallery → click "Use this template" on Minimal → resume
    re-renders with Minimal.
- **No automated e2e:** the project has no Playwright setup; manual
  smoke covers this.

## Rollback plan
Revert the merge commit. The old `<TemplatePicker>` is preserved in
git history. If we want a partial rollback (keep the new gallery
but reintroduce the dropdown as a fallback), the picker is a
~225-line file that imports only from the registry + UI primitives,
so re-adding it is mechanical.

## Open questions
None. Sample data shape is unambiguous (richer variant of the
existing JSON-Resume fixture), modal stacking is the obvious
choice, and the existing save pipeline is reused as-is.
