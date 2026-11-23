"use client";

import * as React from 'react';

import type { SubCriterionKey } from '@/lib/inline-issue/types';
import { mapPathToSection } from '@/lib/inline-issue/map-path-to-section';
import { dispatchInlineIssueTip } from './apply-bridge';
import type { MatchBreakdown } from '@/lib/db/queries';
import { resolveTargetPath } from '@/lib/inline-issue/resolve-target';

/**
 * Controller for the scorecard's inline-tip behaviour.
 *
 * A dimension-bar or skill-gap click is a request for EXPLANATION, not
 * for an AI rewrite. The old surface opened a Pro-only popover with
 * three rewrites; that path is retired in favour of the per-bullet
 * attention icons that hand off to Scout. What remains here is the
 * universal half: resolve the leaf the advice is about, then ask the
 * editor (via the tip bridge) to scroll, pulse and show the tip at
 * the point of interest.
 *
 * Visual work lives in `<InlineIssueTip>` on the editor side — the
 * scorecard and editor are sibling Client Components, so a window
 * event is the cheapest way to signal a cross-tree UI event without
 * lifting state or turning the page into a Client Component.
 *
 * Plan: docs/plans/inline-bullet-issues-to-scout.md.
 */

export type UseInlineIssueControllerOptions = {
  /**
   * Server-rendered per-leaf breakdown. When present, the criterion's
   * row decides which leaf the tip anchors to; otherwise the resolver
   * falls back to the criterion's default path.
   */
  matchBreakdown?: MatchBreakdown;
};

export type TriggerInput = {
  /** EditableText path when a specific leaf was clicked. Usually omitted. */
  path?: string;
  /** Sub-criterion the user clicked. */
  criterion: SubCriterionKey;
};

export function useInlineIssueController({
  matchBreakdown
}: UseInlineIssueControllerOptions) {
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const [pulseSequence, setPulseSequence] = React.useState(0);

  const trigger = React.useCallback(
    ({ path, criterion }: TriggerInput) => {
      // The server's `matchBreakdown` is the authority on WHICH leaf a
      // criterion targets. Passing a default path here used to land on
      // the first work bullet even when the advice named another one.
      const resolvedPath = resolveTargetPath(matchBreakdown, criterion, path);
      const target = mapPathToSection(resolvedPath, criterion);

      setActivePath(resolvedPath);
      setPulseSequence((n) => n + 1);

      if (!target) return;

      dispatchInlineIssueTip({
        sectionSlug: target.sectionSlug,
        sectionTitle: target.sectionTitle,
        criterion
      });
    },
    [matchBreakdown]
  );

  return { trigger, activePath, pulseSequence };
}
