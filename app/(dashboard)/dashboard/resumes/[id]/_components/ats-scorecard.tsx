import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { JobPosting } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';

import { ScorecardPanel } from '@/components/scorecard/scorecard';

/**
 * Right-rail slot for the ATS scorecard (plan:
 * docs/plans/ats-scoring.md).
 *
 * This file used to ship only the placeholder. Slice 2 of the
 * scoring plan adds the `breakdown?: ScoreBreakdown | null` prop:
 *   - When `breakdown` is null/undefined: render the placeholder
 *     (the "attach a JD" hint that has been there since variant-
 *     first UX shipped).
 *   - When `breakdown` is provided: render the real scorecard
 *     with the overall number + 4 dimension bars + Recompute button.
 *
 * The component intentionally renders BOTH states the same way
 * (same right-rail slot, same height) so the layout doesn't shift
 * when the user attaches a JD and the score materializes.
 *
 * Slice 2 keeps the Recompute button DISABLED — slice 3 wires it
 * to `recomputeScoreAction` via `useTransition`. The slot exists
 * now so the wiring PR is small and reviewable.
 *
 * Visibility rules (unchanged from the placeholder):
 *   - Always rendered (so the right rail has a consistent shape).
 *   - When no JD, the panel shows the placeholder.
 *   - When a JD is attached AND `breakdown` is provided, the real
 *     scorecard renders.
 *   - When a JD is attached but `breakdown` is null (e.g. the user
 *     just attached one and we haven't computed yet), the panel
 *     shows the placeholder + a "computing…" hint.
 */
export function AtsScorecard({
  jobContext,
  breakdown
}: {
  jobContext: JobPosting | null;
  breakdown?: ScoreBreakdown | null;
}) {
  if (!breakdown) {
    return (
      <aside
        aria-label="ATS scorecard"
        data-testid="ats-scorecard"
        className="rounded-lg border bg-card p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            ATS score
          </p>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {jobContext ? 'Awaiting first compute' : 'Coming soon'}
          </Badge>
        </div>

        <div className="flex items-end gap-2">
          <p
            className="text-3xl font-semibold tabular-nums text-muted-foreground"
            aria-hidden
          >
            —
          </p>
          <p className="pb-1 text-xs text-muted-foreground">/ 100</p>
        </div>

        <ul className="mt-4 space-y-2 text-xs">
          {[
            'Keywords',
            'Format',
            'Impact',
            'Experience match'
          ].map((label) => (
            <li
              key={label}
              className="flex items-center justify-between text-muted-foreground"
              data-testid={`ats-dim-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span>{label}</span>
              <span className="font-mono">—</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-muted-foreground">
          {jobContext
            ? 'Scoring lands in the next slice. The four dimensions weigh keyword coverage, format, impact verbs, and experience match.'
            : 'Attach a job description to score this variant against it.'}
        </p>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 -ml-2 h-7 px-2 text-xs text-muted-foreground"
          disabled
        >
          <Sparkles className="mr-1 h-3 w-3" />
          Recompute
        </Button>
      </aside>
    );
  }

  // Real scorecard path — delegate to the proper component.
  return <ScorecardPanel breakdown={breakdown} />;
}
