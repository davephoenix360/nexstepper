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
import { useForm, FormProvider, useFormState } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { classicTemplate, getTemplate } from '@/components/resume-templates';
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
import { saveResumeAction } from '@/app/(dashboard)/dashboard/resumes/actions';

interface EditableResumeProps {
  resumeId: string;
  initialData: ResumeData;
  isMaster: boolean;
}

export function EditableResume({
  resumeId,
  initialData,
  isMaster
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

  const template = getTemplate(initialData.template);
  // We're always using the Classic template here; the registry's `template`
  // resolves to it as well, kept for the meta label + version.
  const Template = classicTemplate.Component;

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
            <span className="text-xs text-muted-foreground">
              Template: <strong>{template.meta.name}</strong> v
              {template.meta.version}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="mr-2 size-4" />
              Print / Save as PDF
            </Button>
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
        <ValidationSummary errors={validationErrors} />

        {/* The actual WYSIWYG render. */}
        <Template data={form.watch() as ResumeData} editable />

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
 * Re-subscribes to formState via `useFormState` so individual
 * EditableText components can clear their errors as the user fixes
 * them — when the array empties, the panel disappears.
 */
function ValidationSummary({ errors }: { errors: FlatFormError[] }) {
  // Subscribe to formState to trigger re-renders when errors
  // change (e.g. the user fixes a field and the error clears).
  // We don't read anything from the state here — the `errors`
  // prop is the source of truth — but subscribing ensures we
  // re-render in sync with RHF.
  useFormState();

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
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-destructive/90">
            {errors.map((e) => (
              <li key={e.path} data-testid={`validation-error-${e.path}`}>
                <span className="font-medium">
                  {humanizeFormPath(e.path)}
                </span>
                : {e.message}
              </li>
            ))}
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