import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { JobPosting } from '@/lib/resume-schema';

/**
 * Right-rail slot for the future ATS scorecard (plan:
 * docs/plans/ats-scoring.md). Slice 2 of the variant-first UX
 * ships the placeholder only — no scoring happens until Plan C
 * lands.
 *
 * Why a stub and not just an empty space:
 *   - Tells the user "this slot exists and is coming" instead of
 *     leaving them wondering what the right rail is for.
 *   - Locks the visual contract: every variant editor renders
 *     the same panel structure regardless of plan / JD presence.
 *
 * Visibility rules:
 *   - Always rendered (so the layout doesn't shift when scoring
 *     lands).
 *   - When there's no JD, the panel shows a "score will appear
 *     here once you attach a JD" hint.
 *   - When a JD is attached, it shows the four-dimension preview
 *     placeholders ("Keywords", "Format", "Impact", "Experience")
 *     so the user can see what's coming.
 */
export function AtsScorecard({
  jobContext
}: {
  jobContext: JobPosting | null;
}) {
  const hasJd = jobContext !== null;

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
          Coming soon
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
        {hasJd
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