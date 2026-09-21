import type { ReactNode } from 'react';
import { Info, Wand2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * One horizontal dimension bar — label, filled fraction, numeric
 * score, color-coded by tier.
 *
 * **Tier taxonomy (Phase 3, v2):** five Greenhouse-aligned tiers
 * via `tierFor(score)`:
 *   - strong:     ≥ 80  (emerald)
 *   - good:       65-79 (lime)
 *   - partial:    50-64 (amber)
 *   - limited:    35-49 (orange)
 *   - needs-work: < 35  (rose)
 *
 * Thresholds exported as constants so a future calibration pass can
 * shift the bands without touching the component.
 */

export const SCORE_STRONG_THRESHOLD = 80;
export const SCORE_GOOD_THRESHOLD = 65;
export const SCORE_PARTIAL_THRESHOLD = 50;
export const SCORE_LIMITED_THRESHOLD = 35;

export type ScoreTier =
  | 'strong'
  | 'good'
  | 'partial'
  | 'limited'
  | 'needs-work';

export function tierFor(score: number): ScoreTier {
  if (score >= SCORE_STRONG_THRESHOLD) return 'strong';
  if (score >= SCORE_GOOD_THRESHOLD) return 'good';
  if (score >= SCORE_PARTIAL_THRESHOLD) return 'partial';
  if (score >= SCORE_LIMITED_THRESHOLD) return 'limited';
  return 'needs-work';
}

/** Human-readable label for the tier badge in the scorecard header. */
export function tierLabelFor(score: number): string {
  switch (tierFor(score)) {
    case 'strong':
      return 'Strong';
    case 'good':
      return 'Good';
    case 'partial':
      return 'Partial';
    case 'limited':
      return 'Limited';
    case 'needs-work':
      return 'Needs work';
  }
}

const TIER_BAR_BG: Record<ScoreTier, string> = {
  strong: 'bg-emerald-500',
  good: 'bg-lime-500',
  partial: 'bg-amber-500',
  limited: 'bg-orange-500',
  'needs-work': 'bg-rose-500'
};

const TIER_TEXT: Record<ScoreTier, string> = {
  strong: 'text-emerald-700 dark:text-emerald-400',
  good: 'text-lime-700 dark:text-lime-400',
  partial: 'text-amber-700 dark:text-amber-400',
  limited: 'text-orange-700 dark:text-orange-400',
  'needs-work': 'text-rose-700 dark:text-rose-400'
};

/**
 * Tier-specific Tailwind classes for the scorecard header badge.
 * Uses subtle background tints (not the full bar colors) so a 5-tier
 * badge stays readable when collapsed next to the headline number.
 */
export const TIER_BADGE: Record<ScoreTier, string> = {
  strong:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  good: 'bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-950 dark:text-lime-300 dark:border-lime-800',
  partial:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  limited:
    'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  'needs-work':
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
};

export function DimensionBar({
  label,
  score,
  testId,
  /**
   * Optional improvement tip shown as a tooltip on hover. When
   * provided, an Info icon appears next to the label and clicking
   * / hovering it reveals the tip.
   */
  tip,
  /**
   * Inline-issue surface integration. When provided, the bar row
   * becomes a clickable button that triggers `onIssueClick()` —
   * the parent (ScorecardClient) decides what to do (Free: pulse
   * + inline tip. Pro: pulse + inline tip + open the AI popover).
   *
   * `showProRewriteCta` is the upgrade-gated "Rewrite with AI"
   * button. When true, a small Wand icon appears next to the
   * score number and the click bubbles up to `onIssueClick`.
   *
   * Plan: docs/plans/inline-issue-surface.md §"User-visible
   * behavior (Free + Pro)".
   */
  onIssueClick,
  showProRewriteCta = false
}: {
  label: string;
  score: number;
  testId?: string;
  /**
   * Optional improvement tip shown as a tooltip on hover. When
   * provided, an Info icon appears next to the label and clicking /
   * hovering it reveals the tip. Accepts a ReactNode so callers
   * can pass plain strings (the static `CRITERIA_TIPS` map) or
   * rich JSX with `<strong>` keyword emphasis (the dynamic
   * `buildDynamicTips` helper).
   */
  tip?: ReactNode;
  /** Click handler for the inline-issue surface (Free + Pro). */
  onIssueClick?: () => void;
  /** Show the Pro "Rewrite with AI" CTA next to the score. */
  showProRewriteCta?: boolean;
}) {
  const safeScore = Math.max(0, Math.min(100, score));
  const tier = tierFor(safeScore);

  const labelContent = (
    <span className="flex items-center gap-1">
      <span>{label}</span>
      {tip && (
        <Tooltip>
          <TooltipTrigger
            asChild
            className="cursor-default text-muted-foreground hover:text-foreground"
            // Stop click propagation so the tooltip trigger doesn't
            // interfere with any parent click handlers on the bar row.
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Info className="h-3 w-3 shrink-0" aria-hidden />
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-xs"
            data-testid={testId ? `${testId}-tip` : undefined}
          >
            {tip}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );

  const interactive = !!onIssueClick;

  // When `onIssueClick` is provided, the entire row is a button.
  // Otherwise it's a static <li>. The interactive variant keeps
  // a hover affordance (`hover:bg-muted/40`) so the user can see
  // the row is clickable.
  const rowClassName = cn(
    'flex items-center gap-3 py-1',
    interactive && 'cursor-pointer rounded-md transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'
  );

  const content = (
    <>
      <span className="w-28 shrink-0 text-xs text-muted-foreground">
        {labelContent}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width]',
            TIER_BAR_BG[tier]
          )}
          style={{ width: `${safeScore}%` }}
          aria-hidden
        />
      </div>
      <span
        data-testid={`${testId ?? label}-score`}
        className={cn(
          'w-9 shrink-0 text-right font-mono text-xs tabular-nums',
          TIER_TEXT[tier]
        )}
      >
        {Math.round(safeScore)}
      </span>
      {showProRewriteCta && (
        <span
          className="flex shrink-0 items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
          data-testid={testId ? `${testId}-rewrite-cta` : 'score-dim-rewrite-cta'}
        >
          <Wand2 className="h-3 w-3" aria-hidden />
          Rewrite with AI
        </span>
      )}
    </>
  );

  if (interactive) {
    return (
      <li
        data-testid={testId ?? `score-dim-${label.toLowerCase().replace(/\s+/g, '-')}`}
        className="list-none"
      >
        <button
          type="button"
          className={cn(rowClassName, 'w-full')}
          onClick={onIssueClick}
          aria-label={`${label}: show me how to improve this dimension`}
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li
      data-testid={testId ?? `score-dim-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={rowClassName}
    >
      {content}
    </li>
  );
}
