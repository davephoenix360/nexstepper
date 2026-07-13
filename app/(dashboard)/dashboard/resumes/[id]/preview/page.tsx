import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getResume, getUser } from '@/lib/db/queries';
import { getTemplate } from '@/components/resume-templates';

import { AutoPrintOnLoad } from './auto-print';
import { PrintButton } from './print-button';

/**
 * Local-only resume preview.
 *
 * Phase 1 scope:
 *  - Renders the current saved revision (NOT the in-flight editor state).
 *    Save in the editor, then open this preview to see your last save.
 *  - Server-rendered. The template is a plain React component, so the same
 *    code path will be reused by Phase 2's Playwright PDF step via
 *    `renderToString`.
 *  - "Download" uses the browser's Print → Save as PDF flow. `@page` rules
 *    in `app/globals.css` make that PDF look right out of the box.
 *
 * Auth: same shape as the editor — `getUser()` + ownership-checked `getResume`.
 * Non-owners hit notFound() so we don't leak resume existence.
 */
export default async function ResumePreviewPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const autoPrint = print === '1';

  const user = await getUser();
  if (!user) redirect('/sign-in');

  const result = await getResume(id, user.id);
  if (!result) notFound();

  // Pick the right template from the envelope's `template` field. Unknown
  // ids fall back to classic (see `getTemplate`).
  const template = getTemplate(result.data.template);
  const Template = template.Component;

  return (
    <>
      {/* Client component that triggers window.print() once on mount
          when the URL has `?print=1`. Renders nothing — it's a side
          effect only. See auto-print.tsx for the guard. */}
      <AutoPrintOnLoad enabled={autoPrint} />
      <div className="min-h-screen bg-zinc-100 py-8 print:bg-white print:py-0">
        <div className="mx-auto max-w-[8.5in] px-4 print:max-w-none print:px-0">
          {/* Chrome bar — hidden in print via @media print (`no-print`). */}
          <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-2 shadow-sm">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/dashboard/resumes/${id}`}>
                <ArrowLeft className="mr-2 size-4" />
                Back to editor
              </Link>
            </Button>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                Template:{' '}
                <span className="font-medium text-foreground">
                  {template.meta.name}
                </span>{' '}
                <span className="text-xs text-muted-foreground">
                  v{template.meta.version}
                </span>
              </span>
              <PrintButton />
            </div>
          </div>

          {/* The actual resume. */}
          <Template data={result.data} />
        </div>
      </div>
    </>
  );
}
