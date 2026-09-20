'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ScoreBreakdown } from '@/lib/scoring';
import { CRITERIA_TIPS, type DynamicTips } from '@/lib/scoring/tips';

import {
  DimensionBar,
  tierFor,
  SCORE_GREEN_THRESHOLD,
  SCORE_AMBER_THRESHOLD
} from './dimension-bar';
import { EmptyScorecardState } from './empty-state';

/**
 * Right-rail ATS scorecard.
 *
 * Plan: docs/plans/ats-scoring.md. Sits below the `<JdPanel>` in
 * the variant editor and shows the overall score + 4 dimension bars
 * when a `ScoreBreakdown` is provided.
 *
 * UX decision (this session): the "Recompute" button uses the hybrid
 * (BM25 + semantic embeddings) scoring path as the default. The
 * prior two-button design (separate "Recompute" / "Try semantic")
 * was replaced with a single button because hybrid scoring is
 * strictly better signal than BM25-only and there is no reason to
 * present the user with two numbers.
 *
 * An expandable "Details" section below the dimension bars shows all
 * 10 sub-criteria with hover tooltips containing specific,
 * actionable improvement tips for each criterion.
 */

/** The 10 sub-criteria in display order, with the dimension they
 *  belong to for layout grouping. */
const SUB_CRITERIA = [
  // ATS Matching
  { key: 'ATS Keyword Match', dimension: 'ATS Matching' },
  { key: 'ATS Similarity', dimension: 'ATS Matching' },
  { key: 'ATS Coverage', dimension: 'ATS Matching' },
  // Structure
  { key: 'Section Completeness', dimension: 'Format' },
  { key: 'Optimal Length', dimension: 'Format' },
  // Content Quality
  { key: 'Accomplishment Focus', dimension: 'Impact' },
  { key: 'Action Verb Usage', dimension: 'Impact' },
  // Alignment
  { key: 'Tailoring', dimension: 'Experience match' },
  { key: 'Unique Value', dimension: 'Experience match' },
  { key: 'Soft Skills', dimension: 'Experience match' }
] as const;

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
  const [detailsOpen, setDetailsOpen] = useState(false);

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
      </ul>

      {/* Expandable sub-criteria breakdown with improvement tips. */}
      <button
        type="button"
        onClick={() => setDetailsOpen((v) => !v)}
        className="mt-3 flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={detailsOpen}
        data-testid="scorecard-details-toggle"
      >
        <ChevronDown
          className="h-3 w-3 transition-transform duration-200"
          style={{ transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
        {detailsOpen ? 'Hide details' : 'Show details + tips'}
      </button>

      {detailsOpen && (
        <div className="mt-4 rounded-md border bg-muted/30 p-3">
          {/* Two-column grid for the 10 sub-criteria. */}
          <ul
            className="grid grid-cols-2 gap-x-4 gap-y-3"
            data-testid="scorecard-sub-criteria"
          >
            {SUB_CRITERIA.map(({ key }) => (
              <DimensionBar
                key={key}
                label={key}
                score={breakdown.criteriaScores[key as keyof typeof breakdown.criteriaScores]}
                testId={`score-sub-${key.toLowerCase().replace(/\s+/g, '-')}`}
                tip={dynamicTips[key] ?? CRITERIA_TIPS[key]}
              />
            ))}
          </ul>
        </div>
      )}

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
