import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, GitBranch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getUser, getResume } from '@/lib/db/queries';

import { ResumeEditorForm } from '../_components/resume-editor-form';
import { CreateVariantButton } from '../_components/create-variant-button';

/**
 * Resume editor page. RSC loads the resume + current revision data, then
 * hands off to the client form (which wraps SchemaForm).
 *
 * Variant UX:
 *  - Master: shows "Tailor this for a job" button (creates a variant).
 *  - Variant: shows "← Back to master" link to parentResumeId.
 */
export default async function ResumeEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const result = await getResume(id, user.id);
  if (!result) {
    notFound();
  }

  const { resume, data } = result;

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6 max-w-4xl">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-lg lg:text-2xl font-medium flex items-center gap-2">
            {resume.isMaster ? null : (
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            )}
            {resume.name}
          </h1>
          {!resume.isMaster && resume.parentResumeId && (
            <Button asChild variant="link" size="sm" className="px-0 h-auto">
              <Link href={`/dashboard/resumes/${resume.parentResumeId}`}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to master
              </Link>
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {resume.isMaster
              ? 'Your master resume. Variants branch off this without touching it.'
              : 'Variant tailored from a master resume.'}
          </p>
        </div>
        {resume.isMaster ? (
          <CreateVariantButton masterId={resume.id} />
        ) : null}
      </header>

      <ResumeEditorForm resumeId={resume.id} initialData={data} />
    </section>
  );
}