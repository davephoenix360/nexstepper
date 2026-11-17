'use client';

import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ScoreBreakdown } from '@/lib/scoring';
import { CRITERIA_TIPS, type DynamicTips } from '@/lib/scoring/tips';
import { biggestRecoverableWin } from '@/lib/scoring/priority';
import type { SubCriterionKey } from '@/lib/inline-issue/types';

import {
  DimensionBar,
  tierFor,
  tierLabelFor,
  TIER_BADGE
} from './dimension-bar';
import { EmptyScorecardState } from './empty-state';
import { EligibilityList } from './eligibility-list';
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

/**
 * The tip for the Keywords bar.
 *
 * The coverage tip ("you're addressing 3 of 5 required
 * responsibilities") only fires when the JD envelope carries a
 * requirements LIST — and no attach path writes one, so in production it
 * never fires and this bar fell back to the generic static advice ("if
 * the JD asks for five things and you only address three…").
 *
 * The keyword tip names the actual missing tokens and DOES work in
 * production, so it is the fallback.
 *
 * Same defect class as the missing JD title: a field the engine and the
 * UI read that nothing writes.
 *
 * Extracted so the selection is testable — the tip itself renders inside
 * a Radix tooltip, which does not appear in static markup.
 */
export function keywordsBarTip(dynamicTips: DynamicTips): ReactNode {
  return (
    dynamicTips['ATS Coverage'] ??
    dynamicTips['ATS Keyword Match'] ??
    CRITERIA_TIPS['ATS Keyword Match']
  );
}

export function ScorecardPanel({
  breakdown,
  dynamicTips = {},
  onRecompute,
  computing = false,
  /**
   * Inline-issue surface integration — passed straight through to
   * each <DimensionBar>. When provided, each dim bar becomes a
   * button that triggers `onIssueDimClick({ criterion, path })`.
   * The parent (ScorecardClient) decides what to do (Free: pulse
   * + inline tip. Pro: pulse + inline tip + AI popover).
   *
   * Plan: docs/plans/inline-issue-surface.md §"User-visible behavior".
   */
  onIssueDimClick,
  onIssueSkillClick,
  /**
   * Whether to show the "Rewrite with AI" CTA next to each dim
   * bar. The CTAs themselves live in the bar; this just toggles
   * visibility. Server-side `requirePro()` is the authoritative
   * gate — this is cosmetic.
   */
  showProRewriteCta = false
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
  onIssueDimClick?: (input: { criterion: SubCriterionKey }) => void;
  onIssueSkillClick?: (input: {
    skill: string;
    bucket: 'mustHave' | 'niceToHave' | 'implicit';
    criterion: 'Intent Coverage';
  }) => void;
  showProRewriteCta?: boolean;
}) {
  if (!breakdown) {
    return (
      <aside
        aria-label="ATS scorecard"
        data-testid="scorecard-empty-wrapper"
        className="no-print rounded-lg border bg-card p-4"
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

  // Inline click factory — only creates the handler when the parent
  // provided `onIssueDimClick`. Keeps the JSX terse and the
  // `interactive` decision in one place per bar.
  const dimHandler =
    onIssueDimClick &&
    ((criterion: SubCriterionKey) => () =>
      onIssueDimClick({ criterion }));

  /**
   * "Start here" — the dimension with the most recoverable points.
   *
   * The seven bars are in a fixed order, which tells the candidate
   * nothing about where to spend their time. A candidate looking at
   * "Keywords 54, Impact 62, Role fit 92" cannot tell which bar is
   * worth their afternoon.
   *
   * The measure is `weight × (100 − score)`: how many points of the
   * OVERALL score this dimension is leaving on the table. The weight
   * matters — a dimension at 50 that carries 21% of the score is worth
   * more than one at 50 that carries 10%.
   *
   * It says "up to N points" because that is the honest ceiling: it
   * assumes the dimension could be made perfect, which it may not be.
   */
  const topWin = biggestRecoverableWin(breakdown.dimensionScores, {
    useV2Weights: !breakdown.intentCoverageBreakdown?.fallback
  });
  /** The criterion each dimension bar opens, so "start here" can open one too. */
  const CRITERION_FOR_DIMENSION: Record<string, SubCriterionKey> = {
    Keywords: 'ATS Coverage',
    Format: 'Section Completeness',
    Impact: 'Accomplishment Focus',
    'Experience match': 'Tailoring',
    'Intent coverage': 'Intent Coverage',
    'Role fit': 'Role Fit',
    'Seniority fit': 'Seniority Fit'
  };
  const topWinCriterion = topWin ? CRITERION_FOR_DIMENSION[topWin.label] : undefined;

  /** The "start here" line. Shared by the button and the plain-text form. */
  const startHereText = (win: NonNullable<typeof topWin>) => (
    <>
      <span className="font-medium">Start here: {win.label}</span>{' '}
      <span className="text-muted-foreground">
        is at {Math.round(win.score)}/100 and carries{' '}
        {Math.round(win.weight * 100)}% of your score — worth up to{' '}
        {win.points.toFixed(1)} points.
      </span>
    </>
  );

  return (
    <aside
      aria-label="ATS scorecard"
      data-testid="scorecard"
      className="no-print rounded-lg border bg-card p-4"
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

      {/* Recompute button — moved up here (was at the bottom of the
          panel) so it sits close to the overall score + tier badge.
          Hybrid recompute is the primary action a user takes when
          the score feels stale; placing it near the score reduces
          the eye-travel cost. */}
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

      {/* Phase 3 — 7-axis radar (recharts). Sits between the badge
          and the dimension bars so the "shape" is the first thing
          the user scans after the headline number. */}
      <AtsRadar breakdown={breakdown} />

      {/* "Start here" — the biggest single win available. Sits directly
          under the radar, above the bars, so it is read BEFORE the
          candidate starts reading seven numbers. Clicking it opens the
          same surface as clicking that dimension's bar, so "here is
          where to start" and "here is how to start" are one click
          apart.

          The advice renders whether or not the parent wired a click
          handler — the information is useful on its own (the server
          mirror renders this panel without one). Only the CLICK
          depends on the handler. */}
      {topWin ? (
        topWinCriterion && dimHandler ? (
          <button
            type="button"
            onClick={dimHandler(topWinCriterion)}
            data-testid="scorecard-start-here"
            className="mt-3 w-full rounded-md border border-dashed px-3 py-2 text-left text-xs hover:bg-accent/50"
          >
            {startHereText(topWin)}
          </button>
        ) : (
          <p
            data-testid="scorecard-start-here"
            className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs"
          >
            {startHereText(topWin)}
          </p>
        )
      ) : null}

      <ul className="mt-4 space-y-1">
        <DimensionBar
          label="Keywords"
          score={breakdown.dimensionScores.atsMatching}
          testId="score-dim-keywords"
          // The coverage tip only fires when the JD envelope carries a
          // requirements LIST — which no attach path writes, so it never
          // fires in production. The keyword tip names the actual
          // missing tokens and does work, so it is the fallback.
          tip={keywordsBarTip(dynamicTips)}
          onIssueClick={dimHandler?.('ATS Coverage')}
          showProRewriteCta={showProRewriteCta}
        />
        <DimensionBar
          label="Format"
          score={breakdown.dimensionScores.structure}
          testId="score-dim-format"
          tip={dynamicTips['Section Completeness'] ?? CRITERIA_TIPS['Section Completeness']}
          onIssueClick={dimHandler?.('Section Completeness')}
          showProRewriteCta={showProRewriteCta}
        />
        <DimensionBar
          label="Impact"
          score={breakdown.dimensionScores.contentQuality}
          testId="score-dim-impact"
          tip={dynamicTips['Accomplishment Focus'] ?? CRITERIA_TIPS['Accomplishment Focus']}
          onIssueClick={dimHandler?.('Accomplishment Focus')}
          showProRewriteCta={showProRewriteCta}
        />
        <DimensionBar
          label="Experience match"
          score={breakdown.dimensionScores.alignment}
          testId="score-dim-experience-match"
          tip={dynamicTips['Tailoring'] ?? CRITERIA_TIPS['Tailoring']}
          onIssueClick={dimHandler?.('Tailoring')}
          showProRewriteCta={showProRewriteCta}
        />
        {/* v2 dimensions — always rendered; fall back to neutral 50
            when no signal is available (legacy rows, failed extractions,
            no resume work history). */}
        <DimensionBar
          label="Intent coverage"
          score={breakdown.dimensionScores.intentCoverage}
          testId="score-dim-intent-coverage"
          tip={dynamicTips['Intent Coverage'] ?? CRITERIA_TIPS['Intent Coverage']}
          onIssueClick={dimHandler?.('Intent Coverage')}
          showProRewriteCta={showProRewriteCta}
        />
        <DimensionBar
          label="Role fit"
          score={breakdown.dimensionScores.roleFit}
          testId="score-dim-role-fit"
          tip={dynamicTips['Role Fit'] ?? CRITERIA_TIPS['Role Fit']}
          onIssueClick={dimHandler?.('Role Fit')}
          showProRewriteCta={showProRewriteCta}
        />
        <DimensionBar
          label="Seniority fit"
          score={breakdown.dimensionScores.seniorityFit}
          testId="score-dim-seniority-fit"
          tip={dynamicTips['Seniority Fit'] ?? CRITERIA_TIPS['Seniority Fit']}
          onIssueClick={dimHandler?.('Seniority Fit')}
          showProRewriteCta={showProRewriteCta}
        />
      </ul>

      {/* Phase 3 — per-skill miss list, grouped by priority bucket.
          Hidden when the v2 intent extractor produced no signal
          (legacy JDs / failed extractions) so we don't show an
          empty-state UI for every user that hasn't run v2 yet. */}
      {hasIntentSignals && (
        <MissList
          breakdown={breakdown.intentCoverageBreakdown}
          onIssueClick={onIssueSkillClick}
        />
      )}

      {/* Eligibility requirements — a degree, a certification, work
          authorisation. Kept OUT of the miss list on purpose: a degree
          you are three months from finishing is not a skill gap, and
          "add bachelor's degree to your resume" is not advice. */}
      <EligibilityList notes={breakdown.eligibility} />

      {/* The scorer degraded — say so.
          The enhanced scorer is 0.4 × BM25 + 0.6 × semantic. If the
          embedding model can't load, the semantic term contributes
          nothing and the score quietly becomes keyword-based. That
          happened in production for every score, silently. A number
          the user can't trust the provenance of is worse than a
          number with a caveat attached. */}
      {breakdown.degraded?.semantic && (
        <p
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          data-testid="scorecard-degraded-notice"
        >
          <strong>Keyword-only score.</strong> The semantic matching
          engine was unavailable for this run, so this score is based on
          keyword matching alone.
        </p>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Computed in {breakdown.computedInMs} ms.
      </p>
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
