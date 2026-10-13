import { Suspense } from 'react';
import { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { FeedbackForm } from '@/components/feedback/feedback-form';
import { MarketingFooter } from '@/components/marketing/footer';

/**
 * `/feedback` — full-page form, served by the (marketing) layout so it
 * inherits the marketing chrome (header, nav, footer, theme toggle).
 *
 * Reachable from:
 *   - The footer "Feedback" link on every marketing page.
 *   - The dashboard user menu's "Send feedback" item.
 *
 * The form component is the same one the floating dashboard pill
 * uses in a Dialog, so copy/UX changes are 1-edit.
 */

export const metadata: Metadata = {
  title: 'Send feedback \u2014 Nexstepper',
  description:
    'Tell us what\u2019s on your mind. Bug, idea, or anything in between \u2014 we read every note.'
};

// Server component — just renders the form. The form does the
// client-side work (useTransition + Server Action call).
export default function FeedbackPage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link href="/">
            <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
            Back
          </Link>
        </Button>

        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Send us feedback
          </h1>
          <p className="text-sm text-muted-foreground">
            Bug, idea, or anything in between — we read every note.
            Submissions become a public GitHub issue on{' '}
            <span className="font-mono text-xs">davephoenix360/nexstepper</span>
            , so please don’t include anything you wouldn’t want linked to
            your account.
          </p>
        </header>

        <Suspense fallback={null}>
          <FeedbackForm variant="page" />
        </Suspense>
      </div>
      <MarketingFooter />
    </main>
  );
}
