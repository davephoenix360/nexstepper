import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, GitBranch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getUser, getResume } from '@/lib/db/queries';
import { EditableResume } from '@/components/editable';

import { CreateVariantButton } from '../_components/create-variant-button';

/**
 * Resume editor page — RSC.
 *
 * Loads the resume + current revision data, then hands off to the
 * client-side <EditableResume> which renders the actual resume
 * (using <ClassicTemplate editable={true}>) and lets the user edit
 * each text value in place. Tabs (Profile / Experience / Skills /
 * Recognition) are gone in this WYSIWYG slice — the rendered resume
 * is one continuous scroll, and section-edit dialogs at the bottom
 * open the table editor for the parts we don't inline-edit yet.
 *
 * Print flow: <EditableResume> ships a "Print / Save as PDF" button
 * that hits window.print(). Layout + globals.css handle the chrome
 * strip and `@page` rules.
 *
 * Variant UX:
 *  - Master: shows the "Tailor this for a job" button (creates a variant).
 *  - Variant: shows a "← Back to master" link to parentResumeId. Both
 *    link back to /dashboard/resumes as well so the user can always
 *    reach the list.
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
    <section className="flex-1 p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <header className="no-print flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <Button asChild variant="link" size="sm" className="px-0 h-auto text-muted-foreground">
            <Link href="/dashboard/resumes">
              <ArrowLeft className="mr-1 h-4 w-4" />
              All resumes
            </Link>
          </Button>
          <h1 className="text-lg lg:text-2xl font-medium flex items-center gap-2">
            {resume.isMaster ? null : (
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            )}
            {resume.name}
          </h1>
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

      <EditableResume
        resumeId={resume.id}
        initialData={data}
        isMaster={resume.isMaster}
      />
    </section>
  );
}
