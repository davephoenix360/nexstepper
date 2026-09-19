import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, GitBranch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getUser, getResume, getShareStatus } from '@/lib/db/queries';
import { EditableResume } from '@/components/editable';

import { CreateVariantButton } from '../_components/create-variant-button';
import { DownloadPdfButton } from './download-pdf-button';
import { ShareButton } from './share-button';
import { OptimizeButton } from './optimize-button';
import { JdPanel } from './_components/jd-panel';
import { ScorecardClient } from './_components/scorecard-client';
import { scoreResumeFromEnvelope } from '@/lib/scoring';

/**
 * Resume editor page — RSC.
 *
 * Slice 2 of the variant-first UX (plan: docs/plans/variant-first-ux.md).
 *
 *   - For variants, the page renders a two-column layout: the
 *     existing editable resume on the left, and a right rail
 *     housing the JD panel (top) and the ATS scorecard (below).
 *   - For masters, the rail is hidden — masters don't have a JD,
 *     and the scorecard makes no sense without one.
 *
 * The right rail is a fixed 320px column on `lg`+ screens. On
 * `md` it stacks beneath the editor. On `sm` the JD panel keeps
 * its collapse handle so the editor stays the dominant surface.
 *
 * Variant UX:
 *  - Master: shows the "Tailor this for a job" CTA (creates a variant).
 *  - Variant: shows a back-to-master link via parentResumeId.
 *
 * Future slices:
 *  - Plan B (JD Markdown) replaces the `description` line-clamp in
 *    JdPanel with a react-markdown render.
 *  - Plan C (ATS scoring) replaces the placeholder scores with real
 *    numbers from `lib/scoring/`.
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

  // Server-render the share status so the dialog opens with the right
  // state (no extra round-trip). We never expose the raw token in
  // the page - only the actions return that, and only after the user
  // explicitly enables / rotates.
  const shareStatus = await getShareStatus(resume.id, user.id);
  const shareStatusView = {
    enabled: shareStatus?.enabled ?? false,
    viewCount: shareStatus?.viewCount ?? 0,
    lastViewedAt: shareStatus?.lastViewedAt
      ? shareStatus.lastViewedAt.toISOString()
      : null,
    createdAt: shareStatus?.createdAt
      ? shareStatus.createdAt.toISOString()
      : null
  };

  const showRightRail = !resume.isMaster;

  // First-render scoring: when a variant has a JD attached, compute
  // the ATS score server-side and pass it to <AtsScorecard> so the
  // user sees real numbers on first paint (no extra round-trip).
  // Per plan §"Key design decisions" #6 and acceptance criterion #8.
  const breakdown =
    !resume.isMaster && data.jobContext
      ? scoreResumeFromEnvelope(data, data.jobContext)
      : null;

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
        <div className="flex items-center gap-2">
          <ShareButton resumeId={resume.id} initialStatus={shareStatusView} />
          <DownloadPdfButton resumeId={resume.id} />
          <OptimizeButton resumeId={resume.id} />
        </div>
      </header>

      <div
        className={
          showRightRail
            ? 'flex flex-col gap-6 lg:flex-row lg:items-start'
            : 'flex flex-col gap-6'
        }
      >
        <div className="min-w-0 flex-1">
          <EditableResume
            resumeId={resume.id}
            initialData={data}
            isMaster={resume.isMaster}
          />
        </div>

        {showRightRail && (
          <div className="flex w-full shrink-0 flex-col gap-4 lg:w-80 lg:sticky lg:top-4">
            <JdPanel resumeId={resume.id} jobContext={data.jobContext ?? null} />
            <ScorecardClient
              resumeId={resume.id}
              jobContext={data.jobContext ?? null}
              initialBreakdown={breakdown}
            />
          </div>
        )}
      </div>
    </section>
  );
}