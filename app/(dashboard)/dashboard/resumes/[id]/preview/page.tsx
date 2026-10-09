import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getResume, getShareStatus, getUser } from '@/lib/db/queries';
import {
  coercePrintSettings,
  printSettingsToCssVars
} from '@/lib/print-settings';
import { getTemplate } from '@/components/resume-templates';

import { ShareButton } from '@/components/share/share-button';

/**
 * Local-only resume preview.
 *
 * Renders the current saved revision (NOT the in-flight editor state)
 * with the user's per-resume print settings applied, at print size
 * (8.5" wide), so they can verify the layout before printing.
 *
 * Oct 2026 (this branch): printing itself moved to the editor's
 * one-click "Print" button (which calls `window.print()` directly).
 * This page is now a pure "what does my resume look like at print
 * size" view — no Print button, no auto-print. The only action
 * exposed from the chrome bar is Share, which makes the same share
 * link as the editor's Share button.
 *
 * Auth: same shape as the editor — `getUser()` + ownership-checked
 * `getResume`. Non-owners hit notFound() so we don't leak resume
 * existence.
 */

type RouteParams = { id: string };

/**
 * Set the browser tab title to "Resume Name — Preview" so it's
 * identifiable in the user's tab list when they have several open.
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
  return { title: `${result.data.name} — Preview` };
}

export default async function ResumePreviewPage({
  params
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = await params;

  const user = await getUser();
  if (!user) redirect('/sign-in');

  const result = await getResume(id, user.id);
  if (!result) notFound();

  // Pick the right template from the envelope's `template` field.
  // Unknown ids fall back to classic (see `getTemplate`).
  const template = getTemplate(result.data.template);
  const Template = template.Component;

  // Pull the share status so the Share button can open with the
  // current state (matches the editor's button — no extra round trip).
  const shareStatus = await getShareStatus(result.resume.id, user.id);
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

  // Per-resume print formatting (Oct 2026). The four CSS custom
  // properties (margin / line-height / font-size / section-spacing)
  // are set inline on the .printable wrapper, then consumed by the
  // rules in app/globals.css (and the @page rule for the actual PDF
  // margin). coercePrintSettings validates the JSONB blob and falls
  // back to defaults on missing / corrupt / stale-migration values.
  const printSettings = coercePrintSettings(result.resume.printSettings);

  return (
    <div className="min-h-screen bg-zinc-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-[8.5in] px-4 print:max-w-none print:px-0">
        {/*
          Chrome bar — the only thing on screen that's NOT the
          resume itself. Hidden in print via `no-print`. The bar
          shows:
            - back to editor
            - share button (so the user can grab the public link
              from the preview context)
            - template badge (lets them confirm which template the
              preview is rendering with — useful when the editor's
              template gallery was used to switch)
        */}
        <div className="no-print mb-4 flex flex-col items-stretch gap-2 rounded-lg border bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/dashboard/resumes/${id}`}>
              <ArrowLeft className="mr-2 size-4" />
              Back to editor
            </Link>
          </Button>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Print preview — adjust{' '}
              <span className="font-medium text-foreground">
                Page settings
              </span>{' '}
              in the editor to change layout
            </span>
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
            <ShareButton
              resumeId={result.resume.id}
              initialStatus={shareStatusView}
            />
          </div>
        </div>

        {/*
          The actual resume at print size with the user's per-resume
          print settings applied. `.printable` is the marker for
          the global print isolation rules; without it the @page
          margin would not pick up the per-resume --resume-margin var.
        */}
        <div
          className="printable bg-white shadow-sm"
          style={printSettingsToCssVars(printSettings)}
        >
          <Template data={result.data} />
        </div>
      </div>
    </div>
  );
}
