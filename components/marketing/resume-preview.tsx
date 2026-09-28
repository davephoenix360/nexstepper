import { TrendingUp } from 'lucide-react';

import { ClassicReadOnly } from '@/components/resume-templates/classic-readonly';

import { SAMPLE_RESUME } from './sample-resume';

/**
 * ResumePreview — the faux browser-chrome preview card on the marketing
 * landing page. Renders a real Classic template (`ClassicReadOnly`)
 * with the placeholder `SAMPLE_RESUME` fixture so the page shows actual
 * template output, not hand-rolled fakery.
 *
 * The ATS score pill is a static "what a strong variant might look like"
 * hint, not a real scored result — the underlying scoring engine needs
 * a parsed job description to produce a number. Pick a believable, not-
 * flattering value: 88 sits in the realistic-strong range for a
 * well-tailored resume, without claiming a perfect 99 that would mislead
 * users (or Stripe reviewers) about the engine's output.
 *
 * This component is intentionally server-rendered — `ClassicReadOnly`
 * has no client hooks, and removing `'use client'` lets the template
 * markup ship as static HTML, which is faster + avoids hydration cost.
 */
export function ResumePreview() {
  return (
    <div className="mt-16">
      <div className="relative mx-auto max-w-4xl rounded-xl border bg-card p-2 shadow-lg ring-1 ring-foreground/5">
        {/* Faux browser chrome — traffic lights + URL bar + score chip */}
        <div className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-full bg-red-400/70" aria-hidden />
          <span className="size-2.5 rounded-full bg-amber-400/70" aria-hidden />
          <span className="size-2.5 rounded-full bg-emerald-400/70" aria-hidden />
          <span className="ml-3 font-mono">nexstepper.app/preview</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600">
            <TrendingUp className="size-3" aria-hidden />
            ATS&nbsp;88&nbsp;/&nbsp;100
          </span>
        </div>

        {/* Real Classic template, rendered read-only against SAMPLE_RESUME */}
        <div className="rounded-lg bg-background p-2 sm:p-4">
          <div className="overflow-hidden rounded-md">
            <ClassicReadOnly data={SAMPLE_RESUME} />
          </div>
        </div>
      </div>
    </div>
  );
}