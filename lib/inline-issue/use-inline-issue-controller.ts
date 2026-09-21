"use client";

import * as React from 'react';

import type { EnrichBulletResult } from '@/lib/inline-issue/types';
import type { SubCriterionKey, InlineIssueTarget } from '@/lib/inline-issue/types';
import { mapPathToSection, sectionSlugFor } from '@/lib/inline-issue/map-path-to-section';
import { sectionId } from '@/lib/inline-issue/map-path-to-section';
import {
  dispatchInlineIssueApply,
  dispatchInlineIssueTip
} from './apply-bridge';
import type { DynamicTips } from '@/lib/scoring/tips';
import type { MatchBreakdown } from '@/lib/db/queries';
import { defaultPathForCriterion } from '@/lib/inline-issue/criterion-to-path';

/**
 * Controller hook — owns the open/close state of the popover
 * AND publishes the inline-tip bridge event when the user clicks.
 *
 * Visual responsibilities (scroll + pulse + render the inline
 * tip portal) live in `<InlineIssueTip>` on the EDITOR side, not
 * here. The scorecard and editor are sibling Client Components;
 * a window bridge is the cheapest way to signal a cross-tree
 * UI event without lifting state.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Architecture".
 */

export type UseInlineIssueControllerOptions = {
  /** Server action for Pro-tier AI rewrites. */
  enrichAction: (input: {
    resumeId: string;
    path: string;
    criterion: SubCriterionKey;
    currentText: string;
  }) => Promise<EnrichBulletResult>;
  /** Resume id. */
  resumeId: string;
  /**
   * Whether the current user is Pro. Cosmetic on the client —
   * the action does the authoritative check. Drives whether the
   * popover opens (Pro) or just the pulse + inline tip (Free).
   */
  isPro: boolean;
  /**
   * Dynamic tips map — forwarded to the inline-tip event so the
   * editor renders the rich JSX tip (with <strong> keyword
   * emphasis). Optional — the editor falls back to the static
   * `CRITERIA_TIPS` map when the criterion isn't in the dynamic
   * map.
   */
  dynamicTips: DynamicTips;
  /**
   * Server-rendered per-leaf breakdown. When provided, the
   * controller resolves the path for each criterion by looking
   * up the MatchBreakdown row whose `criterion` matches. When
   * not provided (first-load before the recompute finishes, or
   * legacy rows), the controller falls back to the
   * `defaultPathForCriterion` heuristic so the surface still
   * works.
   */
  matchBreakdown?: MatchBreakdown;
};

export type TriggerInput = {
  /** EditableText path the user clicked from. */
  path: string;
  /** Sub-criterion the user clicked. */
  criterion: SubCriterionKey;
};

export function useInlineIssueController({
  enrichAction,
  resumeId,
  isPro,
  dynamicTips: _dynamicTips,
  matchBreakdown
}: UseInlineIssueControllerOptions) {
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [active, setActive] = React.useState<{
    path: string;
    criterion: SubCriterionKey;
    currentText: string;
    target: InlineIssueTarget | null;
  } | null>(null);
  // Sequence counter — bumped on every trigger. Exposed via the
  // returned `pulseSequence` so callers can correlate logs/tests.
  const [pulseSequence, setPulseSequence] = React.useState(0);

  const trigger = React.useCallback(
    ({ path, criterion }: TriggerInput) => {
      // Path resolution precedence:
      //   1. Use the `path` arg if provided (caller chose).
      //   2. Else look up `matchBreakdown` for this criterion.
      //   3. Else fall back to `defaultPathForCriterion(criterion)`.
      const resolvedPath =
        path ??
        resolvePathFromBreakdown(matchBreakdown, criterion) ??
        defaultPathForCriterion(criterion);
      const text = readLeafText(resolvedPath);
      const target = mapPathToSection(resolvedPath, criterion);
      setActive({
        path: resolvedPath,
        criterion,
        currentText: text,
        target: target
          ? {
              path: resolvedPath,
              sectionSlug: target.sectionSlug,
              sectionTitle: target.sectionTitle,
              tipKind: target.tipKind,
              bulletIndex: target.bulletIndex
            }
          : null
      });

      // Fire the bridge event so the editor can scroll + pulse +
      // render the inline tip portal. Always fires (Free + Pro)
      // — this is the universal half of the surface.
      if (target) {
        dispatchInlineIssueTip({
          sectionSlug: target.sectionSlug,
          sectionTitle: target.sectionTitle,
          criterion
        });
      }
      setPulseSequence((n) => n + 1);

      // Empty-bullet guard — don't open the popover if there's
      // nothing to rewrite. The pulse + tip still fire so the
      // user gets visual feedback that the click registered.
      if (isPro && text.trim().length > 0) {
        setPopoverOpen(true);
      }
    },
    [isPro, matchBreakdown]
  );

  const popoverProps = React.useMemo(() => {
    if (!active) {
      return null;
    }
    return {
      path: active.path,
      criterion: active.criterion,
      currentText: active.currentText,
      open: popoverOpen,
      onOpenChange: setPopoverOpen,
      enrichAction,
      resumeId,
      onApply: (text: string) => {
        // Publish through the bridge — the editor subscribes and
        // applies the rewrite via its own RHF form. The popover
        // closes immediately (handled by InlineIssuePopover) and
        // the editor's save + recompute path fires downstream.
        dispatchInlineIssueApply({ path: active.path, text });
        // Null out `active` so a subsequent click starts from a
        // clean slate. The editor's setValue already triggered
        // the form re-render; we don't need to track the bullet
        // state here.
        setActive(null);
      }
    };
  }, [active, popoverOpen, enrichAction, resumeId]);

  return {
    trigger,
    popoverProps,
    isPro,
    /**
     * The path of the currently-active leaf, or `null`. Useful for
     * tests + the popover anchor lookup.
     */
    activePath: active?.path ?? null,
    /**
     * Monotonic counter that ticks on every `trigger()` call.
     * Exposed so tests + debug tooling can correlate events.
     * The actual scroll / pulse / tip rendering is now driven
     * by the bridge event, not this number.
     */
    pulseSequence
  };
}

/**
 * Read the current text from a leaf by `data-testid`. Returns the
 * empty string when the leaf is missing (e.g. the section is
 * collapsed or the path is stale) — the popover still opens with
 * an empty currentText field so the user can see the AI didn't see
 * anything to work with.
 *
 * RHF keeps the canonical state, but reading from the DOM is good
 * enough for the snapshot (the user is always looking at the
 * current rendered text) and avoids an extra `form.watch(path)`
 * subscription that would re-render the scorecard on every
 * keystroke.
 */
function readLeafText(path: string): string {
  if (typeof document === 'undefined') return '';
  const node = document.querySelector<HTMLElement>(
    `[data-testid="editable-${path}"]`
  );
  if (!node) return '';
  // EditableText renders the text content directly (no child
  // wrapper that swallows it). `textContent` includes any inline
  // children, which is fine for the snapshot — the popover
  // truncates to 140 chars in the display anyway.
  return (node.textContent ?? '').trim();
}

// Re-export the slug helper so consumers don't need a separate
// import. Keeps the controller's public API a one-stop shop.
export { sectionId, sectionSlugFor };

/**
 * Resolve a path for a criterion from the server-rendered
 * MatchBreakdown. Returns the FIRST row whose `criterion`
 * matches — the rows are sorted by weight DESC server-side, so
 * the "primary" leaf is picked first. Future slices could pick
 * a different row per dim (e.g. lowest-scoring bullet) by
 * walking the array differently.
 *
 * Returns `null` when no row matches (caller falls back to the
 * heuristic).
 */
function resolvePathFromBreakdown(
  breakdown: MatchBreakdown | undefined,
  criterion: SubCriterionKey
): string | null {
  if (!breakdown || breakdown.length === 0) return null;
  const hit = breakdown.find((row) => row.criterion === criterion);
  return hit?.path ?? null;
}