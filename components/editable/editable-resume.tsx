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
import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { classicTemplate, getTemplate } from '@/components/resume-templates';
import { EditSectionDialog } from './edit-section-dialog';
import { SECTION_DIALOGS } from './section-schemas';

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
    setError(null);
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
            <Button
              type="button"
              size="sm"
              onClick={form.handleSubmit((d) =>
                handleSave(d as unknown as ResumeData)
              )}
              disabled={pending}
              data-testid="editable-save"
            >
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* The actual WYSIWYG render. */}
        <Template data={form.watch() as ResumeData} editable />

        {/* Save / error status — small, no-print, lives below the resume. */}
        <div className="no-print flex items-center justify-end gap-4 pb-8 text-sm">
          {error && (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          )}
          {savedAt && !error && (
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
