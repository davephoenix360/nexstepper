import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ScoreBreakdown } from '@/lib/scoring';

import { DimensionBar, tierFor, SCORE_GREEN_THRESHOLD, SCORE_AMBER_THRESHOLD } from './dimension-bar';
import { EmptyScorecardState } from './empty-state';

/**
 * Right-rail ATS scorecard.
 *
 * Plan: docs/plans/ats-scoring.md. Sits below the `<JdPanel>` in
 * the variant editor and shows the overall score + 4 dimension bars
 * when a `ScoreBreakdown` is provided.
 *
 *   - When `breakdown` is `null` or `undefined`: renders the
 *     placeholder ("attach a JD" hint + disabled Recompute button).
 *   - When `breakdown` is provided: renders the scorecard — overall
 *     number, 4 dimension bars (color-coded by tier), a "Computed
 *     in N ms" hint, and the Recompute button.
 *
 * Slice 2 ships this with the Recompute button DISABLED. Slice 3
 * wires it to `recomputeScoreAction` via `useTransition`. We keep
 * the visual contract locked here so the wiring PR is small.
 *
 * The component is a Server Component (no hooks, no event handlers
 * beyond the disabled button). The Recompute handler is wired by
 * the page-level client wrapper that owns the action call.
 */

export function ScorecardPanel({
  breakdown,
  onRecompute,
  computing = false
}: {
  breakdown?: ScoreBreakdown | null;
  onRecompute?: () => void;
  computing?: boolean;
}) {
  if (!breakdown) {
    return (
      <aside
        aria-label="ATS scorecard"
        data-testid="scorecard-empty-wrapper"
        className="rounded-lg border bg-card p-4"
      >
        <HeaderPlaceholder />
        <EmptyScorecardState />
      </aside>
    );
  }

  return (
    <aside
      aria-label="ATS scorecard"
      data-testid="scorecard"
      className="rounded-lg border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          data-testid="scorecard-overall"
          className="text-3xl font-semibold tabular-nums"
        >
          {breakdown.overallScore}
        </p>
        <p className="text-xs text-muted-foreground">/ 100</p>
      </div>

      <Header overall={breakdown.overallScore} />

      <ul className="mt-4 space-y-2">
        <DimensionBar
          label="Keywords"
          score={breakdown.dimensionScores.atsMatching}
          testId="score-dim-keywords"
        />
        <DimensionBar
          label="Format"
          score={breakdown.dimensionScores.structure}
          testId="score-dim-format"
        />
        <DimensionBar
          label="Impact"
          score={breakdown.dimensionScores.contentQuality}
          testId="score-dim-impact"
        />
        <DimensionBar
          label="Experience match"
          score={breakdown.dimensionScores.alignment}
          testId="score-dim-experience-match"
        />
      </ul>

      <p className="mt-4 text-xs text-muted-foreground">
        Computed in {breakdown.computedInMs} ms.
      </p>

      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 mt-2 h-7 px-2 text-xs text-muted-foreground"
        onClick={onRecompute}
        disabled={!onRecompute || computing}
        data-testid="scorecard-recompute"
      >
        <Sparkles className="mr-1 h-3 w-3" />
        {computing ? 'Recomputing…' : 'Recompute'}
      </Button>
    </aside>
  );
}

function Header({ overall }: { overall: number }) {
  return (
    <div className="mt-2 flex items-center justify-between">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        ATS score
      </p>
      <Badge
        variant="outline"
        className="px-1.5 py-0 text-[10px]"
        data-testid="scorecard-tier"
      >
        {overall >= SCORE_GREEN_THRESHOLD
          ? 'Strong'
          : overall >= SCORE_AMBER_THRESHOLD
            ? 'Decent'
            : 'Needs work'}
      </Badge>
    </div>
  );
}

function HeaderPlaceholder() {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        ATS score
      </p>
      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
        Awaiting JD
      </Badge>
    </div>
  );
}

// Keep tierFor imported so future consumers can read it without
// having to also import from `dimension-bar`.
export { tierFor } from './dimension-bar';
