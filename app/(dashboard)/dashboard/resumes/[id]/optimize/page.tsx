import { redirect, notFound } from 'next/navigation';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getResume } from '@/lib/db/queries';

import { extractSummaryFromResumeData } from '@/lib/optimize/optimize-resume';

import { OptimizeSummaryClient } from './optimize-client';

/**
 * Optimize tool - rewrite a resume section against a target JD.
 *
 * V0 scope: `basics.summary` only. The plumbing (server actions,
 * fallback chain, save-on-accept) is section-type-agnostic so the
 * next section type is one PR away.
 *
 * Server component. Owns:
 *   - Auth check (redirect to sign-in if no session)
 *   - Ownership check (404 if the resume doesn't belong to the user)
 *   - Loading the current revision data (so the client component
 *     can render the "current summary" without a separate round-trip)
 *
 * The interactive form lives in `optimize-client.tsx` (it needs
 * useTransition for the staged progress + accept/dismiss UX).
 */
type RouteParams = { id: string };

export default async function OptimizePage({
  params
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/sign-in');
  }

  const loaded = await getResume(id, session.user.id);
  if (!loaded) {
    notFound();
  }

  const { value: currentSummary } = extractSummaryFromResumeData(loaded.data);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Optimize your summary
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste the job description. We will rewrite your summary so it
          surfaces the strongest fit for that role - without inventing
          experience you do not have.
        </p>
      </header>

      <OptimizeSummaryClient resumeId={id} currentSummary={currentSummary} />
    </div>
  );
}