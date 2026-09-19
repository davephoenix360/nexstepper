/**
 * Empty state for the scorecard — shown when no JD is attached.
 * Mirrors the placeholder behavior of the legacy `<AtsScorecard>`
 * slot but is a dedicated, testable component. The right rail
 * composes this with `<ScorecardPanel>` (see `scorecard.tsx`).
 */

import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function EmptyScorecardState() {
  return (
    <div
      data-testid="scorecard-empty"
      className="space-y-3"
    >
      <p className="text-xs text-muted-foreground">
        Attach a job description to score this variant against it.
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-7 px-2 text-xs text-muted-foreground"
        disabled
      >
        <Sparkles className="mr-1 h-3 w-3" />
        Recompute
      </Button>
    </div>
  );
}
