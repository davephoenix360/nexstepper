"use client";

import * as React from 'react';

import { CRITERIA_TIPS, type DynamicTips } from '@/lib/scoring/tips';
import type { SubCriterionKey } from './types';

/**
 * Inline dynamic tip — the small prose snippet that hangs off a
 * dim-bar click on the scorecard and (Free tier) below the section
 * header after the pulse finishes.
 *
 * Rendering rules:
 *   1. Prefer `dynamicTips[criterion]` (the server-rendered
 *      `buildDynamicTips()` output) — it knows the specific
 *      missed keywords / skills and renders them as `<strong>`.
 *   2. Fall back to the static `CRITERIA_TIPS[criterion]` when no
 *      dynamic tip is available (no JD, no v2 signals, etc.).
 *   3. Render `null` when neither exists — the scorecard then
 *      shows a generic "(no tip available)" placeholder.
 *
 * The component is intentionally a one-liner around the data
 * lookup — the heavy lifting lives in `buildDynamicTips()` in
 * `lib/scoring/tips.tsx`. This wrapper exists so the
 * inline-issue surface can mount the tip in TWO different
 * contexts (scorecard + post-pulse inline) without re-implementing
 * the precedence rules.
 */

export interface DynamicTipInlineProps {
  criterion: SubCriterionKey;
  /** Server-rendered dynamic tips (may be empty — fall back to static). */
  dynamicTips: DynamicTips;
  /** Optional className for the wrapping <p>. */
  className?: string;
}

export function DynamicTipInline({
  criterion,
  dynamicTips,
  className
}: DynamicTipInlineProps) {
  const tip = dynamicTips[criterion] ?? CRITERIA_TIPS[criterion];

  if (!tip) {
    return (
      <p
        data-testid={`inline-tip-${criterionSlug(criterion)}-fallback`}
        className={className}
      >
        No specific tip is available for this criterion yet. Recompute the
        scorecard to refresh the dynamic tips.
      </p>
    );
  }

  return (
    <p
      data-testid={`inline-tip-${criterionSlug(criterion)}`}
      className={className}
    >
      {tip}
    </p>
  );
}

/**
 * Stable slug for the criterion — kebab-cased. Used for
 * data-testid so tests can target specific rows without depending
 * on the human-readable label.
 */
function criterionSlug(criterion: SubCriterionKey): string {
  return criterion
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}