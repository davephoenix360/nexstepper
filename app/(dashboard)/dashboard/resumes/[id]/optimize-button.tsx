'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

/**
 * "Optimize" button on the editor header. Links to the Optimize
 * page for this resume. The Optimize page itself owns the
 * interactive flow (paste JD → AI → side-by-side → accept).
 *
 * Server component parent passes `resumeId`; we just render the
 * link. Keeping it as a tiny client component so we can use the
 * `Sparkles` icon from lucide (the rest of the header is server).
 */
export function OptimizeButton({ resumeId }: { resumeId: string }) {
  return (
    <Link
      href={`/dashboard/resumes/${resumeId}/optimize`}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
    >
      <Sparkles className="h-4 w-4" />
      Optimize
    </Link>
  );
}
