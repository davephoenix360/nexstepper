'use client';

/**
 * EditableResume — the WYSIWYG editor surface for a resume.
 *
 * Wraps the rendered ClassicTemplate (with `editable`) inside an RHF
 * <FormProvider>. Each text leaf in the template is an
 * <EditableText> that binds to the form via `useController`. Sections
 * we don't inline-edit in v1 (Skills, Education, etc.) get an
 * "Edit [section]" button underneath the rendered content that opens a
 * <EditSectionDialog> with the existing <SchemaForm> for that section.
 *
 * Save flow:
 *  - The <Button> at the bottom calls form.handleSubmit -> saves the
 *    whole shape through saveResumeAction (server-side validation via
 *    Zod; redirects handled by the caller).
 *  - On success we router.refresh() so the parent RSC page re-fetches
 *    the latest revision timestamp + shows the inline "Saved" hint.
 *  - On validation failure (Zod reject) we surface the errors through
 *    the <ValidationSummary> panel above the resume, so the user sees
 *    exactly which field blocked the save instead of a silent no-op.
 *
 * Why a single client component instead of going further server-side:
 *  - All text leaves need interactivity -> the whole surface is
 *    inside a client component.
 *  - Print fidelity still works because <ClassicTemplate editable>
 *    renders the same DOM as <ClassicTemplate> when no EditableText is
 *    in editing state.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Printer, Redo2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { getTemplate, TemplateGalleryButton } from '@/components/resume-templates';
import { EditSectionDialog } from './edit-section-dialog';
import { SECTION_DIALOGS } from './section-schemas';
import {
  flattenFormErrors,
  humanizeFormPath,
  type FlatFormError
} from './form-errors';
import { getSaveShortcutLabel, useSaveShortcut } from './save-shortcut';

import {
  resumeDataSchema,
  type ResumeData
} from '@/lib/resume-schema';
import {
  coercePrintSettings,
  printSettingsToCssVars
} from '@/lib/print-settings';
import { triggerPrint } from '@/lib/print/safe-print';
import { PrintSettingsVars } from './print-settings-vars';
import { saveResumeAction, autosaveResumeAction } from '@/app/(dashboard)/dashboard/resumes/actions';
import {
  subscribeToInlineIssueApply,
  InlineIssueTip,
  pathToSectionId
} from '@/lib/inline-issue';
import type { DynamicTips } from '@/lib/scoring/tips';
import type { PrintSettings } from '@/lib/print-settings';
import { useDebouncedAutosave } from './use-debounced-autosave';
import {
  useUndoHistory,
  useUndoRedoShortcuts
} from './use-undo-history';

interface EditableResumeProps {
  resumeId: string;
  initialData: ResumeData;
  /**
   * Per-resume print formatting (margin / line height / font size /
   * section spacing). Lives on the resume envelope, not inside the
   * `data` JSON blob, and is what the `.printable` wrapper below
   * consumes. The page RSC coerces it before passing it in.
   */
  initialPrintSettings?: PrintSettings;
  isMaster: boolean;
  /**
   * Dynamic tips map from the page RSC's
   * `buildDynamicTips(breakdown, resume, job)` call. Threaded
   * to `<InlineIssueTip />` so the inline tip rendered under
   * the section header can use the rich dynamic tips (with
   * `<strong>` keyword emphasis) instead of just the static
   * `CRITERIA_TIPS` fallback.
   */
  initialDynamicTips?: DynamicTips;
}

export function EditableResume({
  resumeId,
  initialData,
  initialPrintSettings,
  isMaster,
  initialDynamicTips = {}
}: EditableResumeProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<
    FlatFormError[]
  >([]);

  // RHF. Use `mode: 'onSubmit'` so we only validate when the user
  // clicks Save — we don't want error popovers interrupting typing
  // in the inline WYSIWYG view (those are a Phase 2 follow-up).
  const form = useForm({
    resolver: zodResolver(resumeDataSchema) as never,
    defaultValues: initialData as never,
    mode: 'onSubmit'
  });

  // The four print-setting CSS vars. Computed once so the `.printable`
  // style prop and the root-element mirror (PrintSettingsVars) can
  // never drift apart.
  const printCssVars = printSettingsToCssVars(
    coercePrintSettings(initialPrintSettings)
  );

  // ── Re-sync the form when the server hands us newer data ────────────────
  //
  // `useForm({ defaultValues })` is read ONCE, on mount. It is not reactive.
  // So when the AI chat writes a revision and the page calls
  // `router.refresh()`, the Server Component re-renders and hands us a fresh
  // `initialData` — and react-hook-form silently keeps showing the OLD values.
  // That is why "I don't like the summary" appeared to do nothing until the
  // user hit F5: the edit was saved correctly, the editor just never picked
  // it up.
  //
  // `form.reset(next)` is the documented way to push new server data into an
  // existing RHF instance. Guarded on identity so it only fires when the
  // incoming data actually changed (RHF deep-compares structurally, and the
  // Server Component hands us a new object identity on every render).
  React.useEffect(() => {
    form.reset(initialData as never);
  }, [initialData]);

  // Resolve the template reactively from the form value so the picker
  // can switch templates without a page reload. The picker calls
  // `form.setValue('template', id)` on selection, which re-renders
  // this and swaps the rendered template.
  //
  // The form is typed as `never` because of the resolver cast
  // (above); we read the template field through an `as never` cast
  // to keep the rest of the form types loose without losing
  // template-reactivity.
  const watchedTemplate = (form as { watch: (n: string) => unknown }).watch(
    'template'
  );
  const currentTemplateId =
    (typeof watchedTemplate === 'string' ? watchedTemplate : null) ??
    initialData.template;
  const template = getTemplate(currentTemplateId);
  const Template = template.Component;

  // Ref on the scrollable container so the "Go to field" button
  // on ValidationSummary can scroll the basics (no formal section
  // header) up to the top. We attach it to the editor wrapper
  // below and use it as a "scrollIntoView" anchor when the resolved
  // section header isn't found in the DOM.
  const editorScrollRef = React.useRef<HTMLDivElement | null>(null);

  // "Go to field" handler — resolves a form path to a section
  // header (or scrolls the editor to the top for `sections.basics.*`)
  // and smooth-scrolls it into view. Honors `prefers-reduced-motion`
  // automatically (the browser turns smooth scroll into instant
  // for that user pref).
  const handleGoToField = React.useCallback((path: string) => {
    const targetId = pathToSectionId(path);
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    // `sections.basics.*` (or anything we don't have a header
    // for) — scroll the editor to the top so the basics form
    // is visible. Falls back to `window` scroll if the editor
    // ref isn't attached.
    const container = editorScrollRef.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  /**
   * Autosave.
   *
   * A safety net, not the source of truth: the explicit Save below stays
   * authoritative (it validates, appends a revision, and refreshes the
   * page). This only keeps the working copy current so navigating away
   * or crashing doesn't lose edits.
   *
   * Disabled while an explicit save is in flight so the two can't race,
   * and while the form is mounted-but-empty during the first paint.
   */
  const autosave = useDebouncedAutosave({
    // `form` is built with `as never` casts (see useForm above), so its
    // control is `Control<never>` and not assignable to `Control`. The
    // cast matches the rest of this file's convention; the hook only
    // JSON-serializes what it watches, so there is nothing type-unsafe
    // about it.
    control: form.control as never,
    enabled: !pending,
    save: async (values) => {
      const result = await autosaveResumeAction({ id: resumeId, data: values });
      return result.ok;
    }
  });

  async function handleSave(values: ResumeData) {
    // Clear any prior validation banner — a successful save has no errors.
    setError(null);
    setValidationErrors([]);
    setPending(true);
    try {
      const result = await saveResumeAction({ id: resumeId, data: values });
      if (!result.ok) {
        setError(result.error ?? 'Could not save');
        return;
      }
      setSavedAt(new Date());
      // The explicit save just persisted these exact values; tell the
      // autosave hook so it doesn't immediately re-persist them.
      autosave.markSaved(values);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setPending(false);
    }
  }

  function handleInvalid(errors: unknown) {
    // RHF rejected the form (Zod validation failed). Surface the
    // leaf-level errors through the validation banner above the
    // resume so the user immediately sees which fields blocked the
    // save — otherwise clicking Save with an invalid URL silently
    // no-ops and the user has to debug by trial-and-error.
    const flat = flattenFormErrors(errors as Record<string, unknown>);
    setValidationErrors(flat);
    setError(null);

    // Scroll the first failing field into view and put it in edit
    // mode. The data-testid on every EditableText is `editable-<path>`,
    // so we can find the node straight from the Zod issue path.
    if (flat.length > 0) {
      const first = flat[0];
      requestAnimationFrame(() => {
        const node = document.querySelector(
          `[data-testid="editable-${first.path}"]`
        );
        if (node) {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' });
          (node as HTMLElement).click();
        }
      });
    }
  }

  // Single submit pipeline shared by the Save button AND the
  // Ctrl/Cmd+S keyboard shortcut. The hook keeps the latest callback
  // via a ref so the listener itself is stable across renders —
  // we don't need to memoize here.
  const submit = () =>
    form.handleSubmit(
      (d) => handleSave(d as unknown as ResumeData),
      handleInvalid
    )();

  // Ctrl/Cmd+S → save. Suppresses the browser's "Save Page As" via
  // preventDefault (handled inside the hook). Disabled while a save
  // is in flight so a second Ctrl+S can't pile on top of the first.
  useSaveShortcut(submit, { disabled: pending });

  // Inline-issue bridge — the scorecard's popover dispatches a
  // window event when the user clicks Apply (see
  // `lib/inline-issue/apply-bridge.ts`). We write the rewrite
  // into our RHF form and trigger the same save pipeline as the
  // Save button. Plan: docs/plans/inline-issue-surface.md
  // §"Architecture".
  //
  // Cast `form` to a loose record shape because the resolver
  // cast earlier (`as never`) widens the form's API; this matches
  // the pattern used by the template picker one effect above.
  React.useEffect(() => {
    const looseForm = form as unknown as {
      setValue: (
        path: string,
        value: string,
        opts?: { shouldDirty?: boolean; shouldTouch?: boolean }
      ) => void;
    };
    return subscribeToInlineIssueApply((event) => {
      looseForm.setValue(event.path, event.text, {
        shouldDirty: true,
        shouldTouch: true
      });
      // Save + recompute. We reuse the same submit() so the
      // server-side validation pipeline runs identically. The
      // scorecard listens for `revalidatePath` on the variant
      // route and re-renders the new scores via `router.refresh`.
      submit();
    });
  }, [form, submit]);

  // Label for the shortcut shown in the Save button's tooltip. We
  // start with the Win/Linux default to keep SSR + first client
  // paint identical (avoids hydration mismatch), then upgrade to
  // "⌘S" on Mac after mount via useEffect. The cosmetic label is
  // the only thing that depends on the platform — the actual save
  // gesture in `isSaveShortcut` accepts both modifiers.
  const [saveShortcutLabel, setSaveShortcutLabel] = React.useState('Ctrl + S');
  React.useEffect(() => {
    setSaveShortcutLabel(getSaveShortcutLabel());
  }, []);

  // Undo / redo.
  //
  // The history lives in the browser (local storage), not the database:
  // it is a transient editing aid over a JSON document, and the resume
  // itself is still saved to Postgres exactly as before. Undo/redo never
  // causes a write of its own — it changes the form, and the existing
  // debounced autosave picks that up like any other edit.
  const history = useUndoHistory({
    resumeId,
    control: form.control as never,
    reset: (values) => form.reset(values as never)
  });
  useUndoRedoShortcuts({
    onUndo: history.undo,
    onRedo: history.redo,
    disabled: pending
  });

  return (
    <FormProvider {...form}>
      {/*
        The editor is intentionally one continuous scroll, NOT a
        tabbed view: tab Profile/Experience/Skills/Recognition is gone
        per the WYSIWYG plan. Section headers in the rendered resume
        serve as scroll anchors ("Edit [section]" buttons live just
        below the relevant section).
      */}
      <div className="space-y-6">
        {/* Top action row — chrome that's not part of the resume.
            Hidden in print via .no-print. */}
        <div className="no-print flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <TemplateGalleryButton
              disabled={pending}
              // The gallery button needs the parent-owned save trigger
              // so it doesn't have to reach into the DOM for the form
              // (which would be ambiguous once portals/mount).
              // Reusing the same `submit` as the Save button +
              // Ctrl+S means validation + onSave pipeline stays
              // identical to the rest of the editor.
              requestSave={submit}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              // Routed through lib/print/safe-print.ts so the inline
              // toolbar's print trigger and the toolbar's Print button
              // share one safe-print code path. The toolbar Print
              // button additionally renders a "Not opening?" help link
              // (see app/(dashboard)/dashboard/resumes/[id]/print-button.tsx)
              // for users on iPhone / iPad / Safari; the inline button
              // inherits the same synchronous window.print() semantics
              // by going through the same `triggerPrint()` helper.
              onClick={() => {
                triggerPrint();
              }}
              data-testid="editable-print-button"
            >
              <Printer className="mr-2 size-4" />
              Print / Save as PDF
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={history.undo}
                  disabled={!history.canUndo || pending}
                  aria-label="Undo"
                  data-testid="editable-undo"
                >
                  <Undo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo (Ctrl + Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={history.redo}
                  disabled={!history.canRedo || pending}
                  aria-label="Redo"
                  data-testid="editable-redo"
                >
                  <Redo2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Redo (Ctrl + Shift + Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  onClick={submit}
                  disabled={pending}
                  data-testid="editable-save"
                >
                  {pending ? 'Saving...' : 'Save'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" data-testid="editable-save-tooltip">
                <SaveTooltipBody shortcutLabel={saveShortcutLabel} />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Validation summary — appears only after a failed Save.
            Renders inline below the action row so it's the first
            thing the user sees without scrolling. Hidden in print. */}
        <ValidationSummary
          errors={validationErrors}
          onGoToField={handleGoToField}
        />

        {/* The actual WYSIWYG render.

            The `.printable` wrapper + the four per-resume print
            settings CSS vars are what make the popover's margin /
            line-height / font-size / section-spacing actually apply.
            Without the wrapper:
              - the on-screen `:where(.printable)` rules in
                globals.css never match, so font size / line height /
                section spacing stay at the template defaults
              - the printed `@page { margin: var(--resume-margin) }`
                rule reads the var from the cascade, which has no
                source here, so it falls back to 0.4in for every
                resume

            The popover's `updatePrintSettingsAction` calls
            `revalidatePath` on the editor route after persisting, so
            the re-render that follows re-fetches the resume with the
            new settings — `initialData.printSettings` updates, this
            style recomputes, and both screen and print reflect the
            change on the next render. We coerce defensively in case
            the JSONB blob is missing or stale-migrated.

            `PrintSettingsVars` additionally mirrors the same four
            properties onto the ROOT element, because `@page` resolves
            custom properties against `:root` and not against a
            descendant. Without that, the printed margin silently falls
            back to 0.4in no matter what the user picked — see
            components/editable/print-settings-vars.tsx. */}
        <div
          ref={editorScrollRef}
          className="printable"
          style={printCssVars}
        >
          <PrintSettingsVars vars={printCssVars} />
          <Template data={form.watch() as ResumeData} editable />
        </div>

        {/* Save / error status — small, no-print, lives below the resume. */}
        <div className="no-print flex items-center justify-end gap-4 pb-8 text-sm">
          {error && (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          )}
          {savedAt && !error && validationErrors.length === 0 && (
            <p className="text-muted-foreground" aria-live="polite">
              Saved {savedAt.toLocaleTimeString()}.
            </p>
          )}
          {/* Autosave state. Deliberately subordinate to the explicit
              "Saved at <time>" line above — the user should never wonder
              whether their work is safe, so this only needs to be
              truthful, not prominent. */}
          {!savedAt && !error && autosave.state !== 'idle' && (
            <p
              className="text-muted-foreground"
              aria-live="polite"
              data-testid="autosave-status"
            >
              {autosave.state === 'pending' && 'Saving…'}
              {autosave.state === 'saved' && 'All changes saved.'}
              {autosave.state === 'error' && 'Autosave failed — press Save.'}
            </p>
          )}
        </div>

        {/* Section-edit triggers for everything we don't yet
            inline-edit. Each opens a Dialog with the existing
            SchemaForm, scoped to that section of the data. The
            dialog calls back with the full form shape — we cast here
            because the cast context (RHF + ResumeData) is known at
            this layer. */}
        <SectionEditTriggers
          onSaved={(v) => handleSave(v as unknown as ResumeData)}
        />

        {/*
          Inline-issue tip portal. Subscribes to
          `dispatchInlineIssueTip` events from the scorecard and
          renders the dynamic tip anchored to the affected section
          header (Free + Pro both see this; the popover is a
          Pro-only add-on). Mounted once here so it's a single
          subscription source per editor mount.
        */}
        <InlineIssueTip dynamicTips={initialDynamicTips} />
      </div>
    </FormProvider>
  );
}

/**
 * The body of the tooltip that hangs off the Save button. Extracted
 * from the main component so the silly copy lives in one place and
 * the kbd element can be styled once. The string in `shortcutLabel`
 * is the platform-aware label ("⌘S" on Mac, "Ctrl + S" otherwise).
 *
 * Tone is intentionally a little goofy — the product is a resume
 * builder, "holds the entire weight of your career" lands because
 * it leans into that. Replacing this with a button-up Toast later
 * is straightforward: move <SaveTooltipBody> into a Toast action.
 */
function SaveTooltipBody({
  shortcutLabel
}: {
  shortcutLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <p>
        This little button holds the entire weight of your career in its tiny
        digital hands.
      </p>
      <p className="flex items-center gap-1.5">
        <span>Or just hit</span>
        <kbd className="pointer-events-none inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded border border-background/30 bg-background/20 px-1.5 font-mono text-[0.7rem] font-semibold text-foreground">
          {shortcutLabel}
        </kbd>
        <span>— same thing, mouse not required.</span>
      </p>
    </div>
  );
}

/**
 * Validation summary — a destructive-styled alert listing the leaf
 * errors that blocked the most recent Save attempt. Renders nothing
 * when there are no errors, so it's safe to mount unconditionally.
 *
 * The `errors` prop is the flattened result of the most recent
 * server-side validation. It updates on the next Save attempt;
 * we deliberately don't re-render on every keystroke (the user
 * clicks Save to re-validate, which is the natural feedback loop).
 *
 * Each error has a "Go to field" button (Oct 2026) that resolves
 * the form path to the rendered section header via
 * `pathToSectionId()` and smooth-scrolls to it. For `sections.basics.*`
 * paths — which have no formal section header (basics renders inline
 * above the section list) — we fall back to scrolling the editor's
 * container to the top so the user sees the basics form fields.
 *
 * Exported for unit testing — see tests/unit/validation-summary.test.tsx.
 */
export function ValidationSummary({
  errors,
  onGoToField
}: {
  errors: FlatFormError[];
  onGoToField: (path: string) => void;
}) {
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      data-testid="validation-summary"
      className="no-print rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="flex-1">
          <p className="font-medium text-destructive">
            Couldn't save — please fix{' '}
            {errors.length === 1
              ? 'this field'
              : `these ${errors.length} fields`}
            :
          </p>
          <ul className="mt-1 space-y-1 pl-0 text-destructive/90">
            {errors.map((e) => {
              // Resolve up front so we can hide the button when
              // the path doesn't map to anything scrollable
              // (e.g. a future top-level envelope field).
              const target = pathToSectionId(e.path);
              return (
                <li
                  key={e.path}
                  data-testid={`validation-error-${e.path}`}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="flex-1">
                    <span className="font-medium">
                      {humanizeFormPath(e.path)}
                    </span>
                    : {e.message}
                  </span>
                  {target !== null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onGoToField(e.path)}
                      data-testid={`validation-go-to-${e.path}`}
                      aria-label={`Jump to ${humanizeFormPath(e.path)}`}
                    >
                      Go to field
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SectionEditTriggers({
  onSaved
}: {
  /**
   * The dialog hands us its parent-form values back. We type this as
   * `unknown` because RHF's `getValues()` returns `unknown`-shaped;
   * the caller — here, EditableResume — knows the concrete shape and
   * narrows it.
   */
  onSaved: (values: unknown) => void;
}) {
  // When every section is inline-editable, SECTION_DIALOGS is empty and
  // we don't need to render the "Other sections" footer band at all —
  // it would just be a heading with nothing under it.
  if (SECTION_DIALOGS.length === 0) return null;
  return (
    <div className="no-print border-t pt-4">
      <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
        Other sections — open the table editor
      </p>
      <div className="flex flex-wrap gap-2">
        {SECTION_DIALOGS.map((s) => (
          <EditSectionDialog
            key={s.path}
            label={s.label}
            sectionPath={s.path}
            schema={s.schema}
            description={s.description}
            toItems={s.toItems}
            fromItems={s.fromItems}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  );
}