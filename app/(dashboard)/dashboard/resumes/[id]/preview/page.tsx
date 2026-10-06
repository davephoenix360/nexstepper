import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getResume, getUser } from '@/lib/db/queries';
import {
  coercePrintSettings,
  printSettingsToCssVars
} from '@/lib/print-settings';
import { getTemplate } from '@/components/resume-templates';

import { AutoPrintOnLoad } from './auto-print';
import { PrintButton } from './print-button';

/**
 * Local-only resume preview.
 *
 * Renders the current saved revision (NOT the in-flight editor state).
 * Save in the editor, then open this preview to see your last save.
 *
 * The "Save as PDF" button triggers the browser's native print dialog
 * — the user picks "Save as PDF" in the destination dropdown to get
 * a real PDF. The @page rules + @media print styles in globals.css
 * make the PDF output match the on-screen preview. No third-party
 * renderer, no API key, $0 cost.
 *
 * Auth: same shape as the editor — `getUser()` + ownership-checked
 * `getResume`. Non-owners hit notFound() so we don't leak resume
 * existence.
 */

type RouteParams = { id: string };
type RouteSearchParams = { print?: string };

/**
 * Set the browser tab title to "Resume Name — Resume" so the user's
 * PDF save dialog pre-fills a sensible filename instead of the app's
 * generic title. The tab title is also what most browsers use as
 * the default `Content-Disposition: filename` in the print→save
 * dialog.
 */
export async function generateMetadata({
  params
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser();
  if (!user) return { title: 'Resume' };
  const result = await getResume(id, user.id);
  if (!result) return { title: 'Resume' };
  return { title: `${result.data.name} — Resume` };
}

export default async function ResumePreviewPage({
  params,
  searchParams
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearchParams>;
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

  // Per-resume print formatting (Oct 2026). The four CSS custom
  // properties (margin / line-height / font-size / section-spacing)
  // are set inline on the .printable wrapper, then consumed by the
  // rules in app/globals.css (and the @page rule for the actual PDF
  // margin). coercePrintSettings validates the JSONB blob and falls
  // back to defaults on missing / corrupt / stale-migration values.
  const printSettings = coercePrintSettings(result.resume.printSettings);
  const Template = template.Component;

  return (
    <>
      {/* Client component that triggers window.print() once on mount
          when the URL has `?print=1`. Renders nothing — it's a side
          effect only. See auto-print.tsx for the guard. */}
      <AutoPrintOnLoad enabled={autoPrint} />
      {/*
        Phase 1g: opt into print isolation by adding `.printable-root`
        to the outermost wrapper. Inside this subtree, the
        `@media print` rules in globals.css flip the default — only
        `.printable` subtrees (the resume template, below) survive
        in the PDF. Everything else (the chrome bar, the dashboard
        sidebar, the Pro-launching-soon banner, etc.) is hidden.

        Forgetting a `no-print` class on a banner / button / sidebar
        used to silently leak UI chrome into the user's PDF (see
        the Phase 1g bug report). With `.printable-root`, forgetting
        a class is safe — the element is hidden by default and only
        the explicitly-marked resume content shows up.
      */}
      <div className="printable-root min-h-screen bg-zinc-100 py-8 print:bg-white print:py-0">
        <div className="mx-auto max-w-[8.5in] px-4 print:max-w-none print:px-0">
          {/* Chrome bar — hidden in print via @media print (`no-print`).
              Defense in depth: the `.printable-root` parent already
              hides this, but the explicit class makes the intent
              clear and survives a future refactor that moves the
              preview route outside the .printable-root wrapper. */}
          <div className="no-print mb-4 flex flex-col items-stretch gap-2 rounded-lg border bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/dashboard/resumes/${id}`}>
                <ArrowLeft className="mr-2 size-4" />
                Back to editor
              </Link>
            </Button>
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="hidden flex-col items-end text-xs text-muted-foreground sm:flex">
                <span>
                  Destination:{' '}
                  <span className="font-medium text-foreground">Save as PDF</span>{' '}
                  in the print dialog
                </span>
              </div>
              <span className="text-sm">
                <span className="text-muted-foreground">
                  Template:{' '}
                  <span className="font-medium text-foreground">
                    {template.meta.name}
                  </span>{' '}
                  <span className="text-xs text-muted-foreground">
                    v{template.meta.version}
                  </span>
                </span>
              </span>
              <PrintButton />
            </div>
          </div>

          {/* The actual resume — the only subtree marked `.printable`
              so it's the only thing that survives print isolation. */}
          <div className="printable">
            <Template data={result.data} />
          </div>
        </div>
      </div>
    </>
  );
}
