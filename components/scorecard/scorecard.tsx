'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ScoreBreakdown } from '@/lib/scoring';
import { CRITERIA_TIPS, type DynamicTips } from '@/lib/scoring/tips';

import {
  DimensionBar,
  tierFor,
  tierLabelFor,
  TIER_BADGE
} from './dimension-bar';
import { EmptyScorecardState } from './empty-state';
import { MissList } from './miss-list';
import { AtsRadar } from './radar';
import { cn } from '@/lib/utils';

/**
 * Right-rail ATS scorecard.
 *
 * **Plan:** docs/plans/ats-scoring-v2.md. Sits below the `<JdPanel>`
 * in the variant editor and shows the overall score + 7 dimension
 * bars + tier badge + radar + per-skill miss list when a
 * `ScoreBreakdown` is provided.
 *
 * **Phase 3 additions (v2):**
 *   - 5-tier score badge (Strong / Good / Partial / Limited / Needs
 *     work — Greenhouse-aligned).
 *   - 7-dimension bars: keywords + format + impact + experience match
 *     + intent coverage + role fit + seniority fit. The v2 dimensions
 *     fall back to a neutral 50 when their signal isn't available
 *     (legacy JDs, failed extractions, no resume work history).
 *   - 7-axis radar chart (`<AtsRadar>`) for shape-based comparison.
 *   - Per-skill miss list (`<MissList>`) grouped by priority.
 *
 * **Phase 3.5 polish:** the v1 "Show details + tips" expandable
 * sub-criteria grid (13 sub-criteria with hover tips) was removed
 * in this session — the new headline UI (radar + 7-dim bars +
 * miss list) carries the signal that drill-down used to, and the
 * sub-criteria hover tips remain available on each dim bar via
 * `CRITERIA_TIPS`.
 */

export function ScorecardPanel({
  breakdown,
  dynamicTips = {},
  onRecompute,
  computing = false
}: {
  breakdown?: ScoreBreakdown | null;
  /**
   * Per-sub-criterion dynamic improvement tips keyed by the
   * canonical `SubCriterionKey`. Computed server-side from the
   * resume + JD envelopes. Merged on top of the static
   * `CRITERIA_TIPS` map at render time — any key present here
   * takes precedence over the static fallback.
   */
  dynamicTips?: DynamicTips;
  /** Triggers the hybrid (BM25 + semantic) recompute. */
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

  const tier = tierFor(breakdown.overallScore);
  // Phase 3 v2 — surface whether v2 Intent Coverage produced usable
  // output. The dimension always renders (neutral 50), but the
  // breakdown's `fallback` flag tells us to either show the miss
  // list or hide it.
  const hasIntentSignals = !breakdown.intentCoverageBreakdown.fallback;

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

      {/* Phase 3 — 7-axis radar (recharts). Sits between the badge
          and the dimension bars so the "shape" is the first thing
          the user scans after the headline number. */}
      <AtsRadar breakdown={breakdown} />

      <ul className="mt-4 space-y-1">
        <DimensionBar
          label="Keywords"
          score={breakdown.dimensionScores.atsMatching}
          testId="score-dim-keywords"
          tip={dynamicTips['ATS Keyword Match'] ?? CRITERIA_TIPS['ATS Keyword Match']}
        />
        <DimensionBar
          label="Format"
          score={breakdown.dimensionScores.structure}
          testId="score-dim-format"
          tip={dynamicTips['Section Completeness'] ?? CRITERIA_TIPS['Section Completeness']}
        />
        <DimensionBar
          label="Impact"
          score={breakdown.dimensionScores.contentQuality}
          testId="score-dim-impact"
          tip={dynamicTips['Accomplishment Focus'] ?? CRITERIA_TIPS['Accomplishment Focus']}
        />
        <DimensionBar
          label="Experience match"
          score={breakdown.dimensionScores.alignment}
          testId="score-dim-experience-match"
          tip={dynamicTips['Tailoring'] ?? CRITERIA_TIPS['Tailoring']}
        />
        {/* v2 dimensions — always rendered; fall back to neutral 50
            when no signal is available (legacy rows, failed extractions,
            no resume work history). */}
        <DimensionBar
          label="Intent coverage"
          score={breakdown.dimensionScores.intentCoverage}
          testId="score-dim-intent-coverage"
          tip={dynamicTips['Intent Coverage'] ?? CRITERIA_TIPS['Intent Coverage']}
        />
        <DimensionBar
          label="Role fit"
          score={breakdown.dimensionScores.roleFit}
          testId="score-dim-role-fit"
          tip={dynamicTips['Role Fit'] ?? CRITERIA_TIPS['Role Fit']}
        />
        <DimensionBar
          label="Seniority fit"
          score={breakdown.dimensionScores.seniorityFit}
          testId="score-dim-seniority-fit"
          tip={dynamicTips['Seniority Fit'] ?? CRITERIA_TIPS['Seniority Fit']}
        />
      </ul>

      {/* Phase 3 — per-skill miss list, grouped by priority bucket.
          Hidden when the v2 intent extractor produced no signal
          (legacy JDs / failed extractions) so we don't show an
          empty-state UI for every user that hasn't run v2 yet. */}
      {hasIntentSignals && <MissList breakdown={breakdown.intentCoverageBreakdown} />}

      <p className="mt-4 text-xs text-muted-foreground">
        Computed in {breakdown.computedInMs} ms.
      </p>

      <div className="mt-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={onRecompute}
          disabled={!onRecompute || computing}
          data-testid="scorecard-recompute"
        >
          {computing ? 'Scoring…' : 'Recompute'}
        </Button>
      </div>
    </aside>
  );
}

function Header({ overall }: { overall: number }) {
  const tier = tierFor(overall);
  return (
    <div className="mt-2 flex items-center justify-between">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        ATS score
      </p>
      <Badge
        variant="outline"
        className={cn(
          'px-1.5 py-0 text-[10px]',
          TIER_BADGE[tier]
        )}
        data-testid="scorecard-tier"
        data-tier={tier}
      >
        {tierLabelFor(overall)}
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

// Re-export the tier helpers so future consumers can read them
// without having to also import from `dimension-bar`.
export { tierFor, tierLabelFor } from './dimension-bar';
// Keep the legacy `SCORE_GREEN_THRESHOLD` re-export for any caller
// still using the v1 name — new code should use SCORE_STRONG_THRESHOLD.
export { SCORE_STRONG_THRESHOLD as SCORE_GREEN_THRESHOLD } from './dimension-bar';
