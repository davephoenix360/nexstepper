# Delete resume — Plan

> Plan template: [`AGENTS.md`](../../AGENTS.md) §Planning discipline.
> Branch: `feat/delete-resume`. Commit footer: `Plan: docs/plans/delete-resume.md`.

## Objective

Wire the **already-existing** `deleteResume(resumeId, userId)` query in
`lib/db/queries.ts` to a Server Action and a UI button, so the user can
permanently remove a master resume (and all its variants, revisions, score
snapshots, and chat sessions via FK cascade) or a single variant. Today the
query exists but has zero callers — the dashboard list view and the editor
header offer no way to trigger it.

This is a small, scope-bounded UX gap surfaced immediately after the v1
deploy. Not a structural change.

## User-visible behavior

- **Library list (`/dashboard/resumes`)** — every master card gets a small
  "Delete" button next to "Open master" / "Tailor this for a job" /
  "Create variant". Clicking it opens a confirmation dialog.
- **Editor page (`/dashboard/resumes/[id]`)** — for **masters**, a
  destructive "Delete master" button sits in the header next to Share /
  Download PDF. For **variants**, the same affordance reads "Delete
  variant". The button is hidden on masters when in the list view (because
  the list already shows one). The editor's variant view doesn't currently
  expose any delete — so adding it here covers the "I created the wrong
  variant" case.
- **Confirmation dialog** — destructive action, no undo. The dialog spells
  out what will be removed:
  - Master with **0 variants**: "Delete 'Master name'? This cannot be undone."
  - Master with **N variants**: "Delete 'Master name' and its N variant(s)?
    This cannot be undone."
  - Variant: "Delete this variant? This cannot be undone."
- **Success** — list refreshes (master disappears, children disappear),
  or, in the editor, the user is router-pushed to `/dashboard/resumes`.
- **Failure** — error string rendered inside the dialog (stays open); the
  user can dismiss and try again.

## Scope (in)

- New `deleteResumeAction(input)` Server Action (auth + Zod + query call +
  revalidate + PostHog event).
- New `RESUME_DELETED` PostHog event in `lib/posthog/events.ts`.
- New `<DeleteResumeButton>` client component with confirmation `<Dialog>`.
- Wire the button into `MasterCard.actions` slot in `resume-list.tsx`
  (list view), passing `variantCount` so the dialog can warn.
- Wire the button into the editor page header (works for both masters and
  variants).
- Update existing `tests/unit/resume-list.test.tsx` to assert the button
  is rendered in the actions slot.
- New unit test for `deleteResumeAction` (auth + validation + call).

## Non-goals (out of this plan)

- **Soft-delete / trash / 30-day retention.** The product hasn't asked for
  it, GDPR Art. 17 already gives users a hard-delete escape hatch via
  `/dashboard/security`, and FK cascade is straightforward enough that we
  don't need a tombstone column. If we ever ship a Trash view we'll add a
  `deletedAt` column then.
- **Bulk delete / multi-select.** No UI demand yet; one-at-a-time keeps the
  dialog copy simple.
- **Undo toast / "just deleted — restore" snackbar.** Adds complexity (we'd
  need to either retain tombstoned rows for N minutes or store the row in
  a separate cache). Skip for v1.
- **Per-resume export before delete.** The `/dashboard/security` page
  already exposes a full data export — discoverable and one click away. No
  need to duplicate it on every delete.

## Architecture

The query is already correct (`lib/db/queries.ts > deleteResume`):

```
db.transaction
  ├── SELECT id FROM resumes WHERE id = ? AND userId = ?    (ownership)
  ├── DELETE FROM resumes WHERE parentResumeId = ? AND userId = ?  (variants)
  └── DELETE FROM resumes WHERE id = ?                       (master → CASCADES)
```

Cascade chains via FKs already in `lib/db/schema.ts`:

- `resume_revisions.resume_id → resumes.id` ON DELETE CASCADE ✓
- `score_snapshots.resume_id → resumes.id` ON DELETE CASCADE ✓
- `chat_sessions.resume_id → resumes.id` ON DELETE CASCADE ✓
  (then `chat_messages.session_id → chat_sessions.id` ON DELETE CASCADE ✓)
- `resume_variants.resume_id → resumes.id` ON DELETE CASCADE ✓
  (also `resume_variants.application_id → applications.id` — but
  `applications` is independent of `resumes`, so deleting a resume leaves
  the application row, which is intentional — the JD capture is the
  user's source of truth even if the tailored resume is gone)

No new DB migration. No new dependency. No new env var.

The Server Action follows the `renameResumeAction` template (Zod
`safeParse` + session check + ownership-checked query call + PostHog track
+ `revalidatePath`). Dialog uses the existing `components/ui/dialog.tsx`
primitive + `Button variant="destructive"`. No new shadcn primitive.

## Files

- **New:**
  - `app/(dashboard)/dashboard/resumes/_components/delete-resume-button.tsx` — the client button + confirmation dialog.
  - `docs/plans/delete-resume.md` — this file.
  - `tests/unit/delete-resume-action.test.ts` — action unit test.
- **Changed:**
  - `app/(dashboard)/dashboard/resumes/actions.ts` — add `deleteResumeAction` + `deleteResumeSchema` (mirroring `renameResumeAction` shape).
  - `app/(dashboard)/dashboard/resumes/_components/resume-list.tsx` — thread `variantCount` through `MasterCard` → actions render prop so the dialog can warn. Also slot the new button into `defaultVariantActions`.
  - `app/(dashboard)/dashboard/resumes/[id]/page.tsx` — render `<DeleteResumeButton>` in the header for both masters and variants.
  - `lib/posthog/events.ts` — add `RESUME_DELETED` constant + typed props.
  - `tests/unit/resume-list.test.tsx` — update the existing `StubLink` test signature / add an assertion that the action slot is still rendered (it already is; we just confirm we don't regress when adding the new render-prop arg).

## DB / schema

No changes. The cascade is already wired.

## Dependencies

None. Uses existing `Dialog`, `Button`, and `deleteResume` query.

## Acceptance criteria

1. Clicking "Delete" on a master with 0 variants shows the dialog,
   confirming the action removes that one master only.
2. Clicking "Delete" on a master with N variants shows the dialog with
   "and its N variant(s)" copy.
3. After confirmation, the master and all its variants, revisions, score
   snapshots, chat sessions/messages are gone (DB-verifiable).
4. Calling `deleteResumeAction` with an id the user doesn't own returns
   `{ ok: false, error: 'Resume not found' }` and writes no rows.
5. After delete from the editor page, the user is redirected to
   `/dashboard/resumes`.
6. `RESUME_DELETED` event fires on success with `{ resumeId, isMaster,
   variantCount }` props.
7. Existing 970-test suite still passes; new tests add 4+ assertions.

## Test plan

- **Unit:**
  - `tests/unit/delete-resume-action.test.ts` — mocks `auth.api.getSession`
    and `deleteResume`. Asserts:
    - Not-signed-in → `{ ok: false, error: 'Not signed in' }`.
    - Invalid input shape → `{ ok: false, error: 'Invalid input' }` with
      `fieldErrors`.
    - `deleteResume` returns false → `{ ok: false, error: 'Could not
      delete resume' }`.
    - `deleteResume` returns true → `{ ok: true, data: { id } }`, PostHog
      tracked, paths revalidated.
  - `tests/unit/resume-list.test.tsx` — add a check that the new button
    is rendered in the action slot when the render prop is provided.
- **Manual smoke (post-merge):**
  - Sign in → `/dashboard/resumes` → click "Delete" on a master with
    variants → confirm → list refreshes, master + variants gone.
  - Open a master → click "Delete master" → confirm → redirected to
    `/dashboard/resumes`, master gone from list.
  - Open a variant → click "Delete variant" → confirm → redirected to
    parent master, variant gone from list.
  - Try to delete a resume you don't own (curl) → 404-shaped error.

## Rollback plan

Revert the merge commit + delete the preview branch. The query and FK
cascades already exist; nothing new was added at the DB layer, so
rollback is a code-only revert with zero data implications for users who
didn't delete anything.

## Open questions

None. Scope is tight enough that we can ship and iterate.