'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { resumeDataSchema, type ResumeData } from '@/lib/resume-schema';
import { SchemaForm } from '@/components/schema-form';

import { saveResumeAction } from '../actions';

/**
 * Client wrapper around SchemaForm for the resume editor. Submits go to
 * saveResumeAction; on success we router.refresh() so the RSC parent
 * re-fetches and shows the new revision timestamp.
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
    <div className="space-y-4">
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
      />
    </div>
  );
}