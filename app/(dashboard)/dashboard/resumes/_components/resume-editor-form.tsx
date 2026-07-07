'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { resumeDataSchema, type ResumeData } from '@/lib/resume-schema';
import { SchemaForm, type SchemaFormProps } from '@/components/schema-form';

import { saveResumeAction } from '../actions';
import { EditorTabs } from './editor-tabs';

const EDITOR_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'experience', label: 'Experience' },
  { id: 'skills', label: 'Skills' },
  { id: 'recognition', label: 'Recognition' }
] as const;

/**
 * Per-field layout overrides for the schema-driven form. Keys are full
 * dotted paths into the resume shape. The `colSpan` hint gives the field
 * 1 (default) or 2 columns inside the 2-column ObjectField grid; 2 means
 * "break to your own row" — right shape for long-form text like Summary
 * or full URLs.
 *
 * For array items, use `<array-path>.0.<leaf>` — `0` is a stand-in index
 * that ArrayField substitutes for the real index, so the override applies
 * uniformly to every item the user adds.
 */
const FIELD_OVERRIDES: NonNullable<SchemaFormProps<typeof resumeDataSchema>['fieldOverrides']> = {
  // --- Basics (Profile tab) ---
  'sections.basics.name': { colSpan: 1 },
  'sections.basics.label': { colSpan: 1 },
  'sections.basics.email': { colSpan: 1 },
  'sections.basics.phone': { colSpan: 1 },
  // `url` reads better as "Website" in a user-facing resume editor, while
  // still posting the JSON Resume `url` field on save.
  'sections.basics.url': { colSpan: 1, label: 'Website' },
  'sections.basics.summary': { colSpan: 2, multiline: true },

  // --- Location (nested inside Basics) ---
  'sections.basics.location.address': { colSpan: 2 },
  'sections.basics.location.city': { colSpan: 1 },
  'sections.basics.location.postalCode': { colSpan: 1 },
  'sections.basics.location.countryCode': { colSpan: 1 },
  'sections.basics.location.region': { colSpan: 1 }
};

/**
 * Client wrapper around SchemaForm for the resume editor. Submits go to
 * saveResumeAction; on success we router.refresh() so the RSC parent
 * re-fetches and shows the new revision timestamp.
 *
 * Tab state is held locally here; we tag the form container with
 * `data-active-tab` and rely on globals.css to show/hide field groups
 * (each top-level section is tagged with `data-tab` via field-dispatcher).
 *
 * Errors surface inline; the SchemaForm's own zodResolver catches field-
 * level validation client-side before we even hit the wire.
 */
export function ResumeEditorForm({
  resumeId,
  initialData
}: {
  resumeId: string;
  initialData: ResumeData;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>('profile');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(data: ResumeData) {
    setError(null);
    startTransition(async () => {
      const result = await saveResumeAction({ id: resumeId, data });
      if (!result.ok) {
        setError(result.error ?? 'Could not save');
        return;
      }
      // Pull the new revision from the server so the form re-renders with
      // updated data (e.g. a future `updatedAt` indicator in the header).
      router.refresh();
    });
  }

  return (
    <div className="space-y-4" data-active-tab={activeTab}>
      <div className="flex items-center justify-end">
        <Button asChild variant="outline" size="sm">
          {/* Opens in a new tab so unsaved edits stay in the editor session.
              The preview always reads the *last saved* revision, so save
              first if you want to see changes. */}
          <Link
            href={`/dashboard/resumes/${resumeId}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="editor-preview-button"
          >
            <Eye className="mr-2 size-4" />
            Preview
          </Link>
        </Button>
      </div>
      <EditorTabs
        tabs={EDITOR_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <SchemaForm
        schema={resumeDataSchema}
        defaultValues={initialData}
        onSubmit={handleSubmit}
        submitLabel={pending ? 'Saving...' : 'Save'}
        submitting={pending}
        omitFields={['jobContext']}
        fieldOverrides={FIELD_OVERRIDES}
      />
    </div>
  );
}