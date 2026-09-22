'use client';

import { useState, useTransition } from 'react';

import { ScorecardPanel } from '@/components/scorecard/scorecard';
import type { JobPosting } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';
import type { DynamicTips } from '@/lib/scoring/tips';
import type { MatchBreakdown } from '@/lib/db/queries';
import {
  InlineIssuePopover,
  useInlineIssueController,
  defaultPathForCriterion,
  defaultPathForSkill
} from '@/lib/inline-issue';
import type { SubCriterionKey } from '@/lib/inline-issue/types';
import type { PlanId } from '@/lib/billing';

import { recomputeScoreAction } from '../score-actions';
import { enrichBulletAction } from './enrich-bullet-action';

/**
 * Client wrapper around <ScorecardPanel> that owns:
 *   1. Recompute (BM25 + semantic hybrid).
 *   2. The inline-issue surface (Free vs Pro split).
 *
 * Plan: docs/plans/ats-scoring.md acceptance criterion #7 +
 * docs/plans/inline-issue-surface.md §"What you'll build" #7.
 *
 * Drift: Phase 3 post-ship engine review consolidated the two-button
 * UX into a single "Recompute" button. `recomputeScoreAction` now
 * calls the hybrid (BM25 + semantic) path internally, so there's no
 * longer a separate semantic action for the UI to call.
 *
 * Drift: Phase 3.5 ships the inline-issue surface. The page Server
 * Component passes:
 *   - the first-render breakdown + dynamic tips
 *   - the variant's resumeId
 *   - the user's plan (`planId: 'free' | 'pro'`)
 *
 * This wrapper:
 *   1. Holds the breakdown + dynamic tips in local state (initial =
 *      the server-rendered value).
 *   2. On Recompute click, calls the hybrid Server Action and
 *      swaps in both the result and the freshly computed tips.
 *   3. Uses `useTransition` so the button can show a spinner
 *      without freezing the surrounding UI.
 *   4. Surfaces error messages inline below the panel (no toast —
 *      we keep the right rail self-contained).
 *   5. Owns the Free/Pro split:
 *      - Free: dim-bar click → scroll + pulse + inline tip.
 *      - Pro:  same + "Rewrite with AI" CTA per dim bar + AI
 *              popover on click.
 *
 * The popover writes back to the editor via the
 * `dispatchInlineIssueApply` window event (see
 * `lib/inline-issue/apply-bridge.ts`). The editor subscribes in
 * its own `useEffect` and updates its own RHF form + triggers
 * its own save. The scorecard never touches the editor's form
 * directly — the bridge keeps the two components decoupled.
 *
 * Drift 2026-09-21: the inline tip itself is now rendered by the
 * editor (via `<InlineIssueTip />` mounted in `editable-resume.tsx`)
 * anchored to the section header — not at the bottom of the
 * scorecard. The scorecard fires `dispatchInlineIssueTip` on every
 * dim-bar click; the editor's component scrolls + pulses + renders
 * the tip in a portal. This split keeps the right rail clean and
 * the tip "at the point of interest" per the user's UX feedback.
 *
 * The Recompute button is hidden entirely when there's no JD to
 * score against — matches the visual contract from the earlier
 * slice where the placeholder shows "Recompute" as a disabled
 * affordance.
 */
export function ScorecardClient({
  resumeId,
  jobContext,
  initialBreakdown,
  initialDynamicTips = {},
  initialMatchBreakdown = [],
  planId
}: {
  resumeId: string;
  jobContext: JobPosting | null;
  initialBreakdown: ScoreBreakdown | null;
  /**
   * Server-rendered dynamic tips from `buildDynamicTips(breakdown, resume, job)`.
   * Optional — when omitted, the panel falls back to the static
   * `CRITERIA_TIPS` map at render time. The Server Action result
   * (post-Recompute) also returns a `tips` map that overrides this.
   */
  initialDynamicTips?: DynamicTips;
  /**
   * Server-rendered per-leaf breakdown for the inline-issue
   * surface. Optional — when omitted, the controller falls back
   * to the `defaultPathForCriterion` heuristic on every dim-bar
   * click. Threaded from the page RSC's recompute action so the
   * breakdown is computed once and reused.
   */
  initialMatchBreakdown?: MatchBreakdown;
  /**
   * Current user's plan (`free` | `pro`). Server-authoritative;
   * the server-side `requirePro()` re-checks at every action call.
   * This prop is cosmetic — drives whether the popover opens and
   * whether the "Rewrite with AI" CTAs render.
   */
  planId: PlanId;
}) {
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(
    initialBreakdown
  );
  const [dynamicTips, setDynamicTips] =
    useState<DynamicTips>(initialDynamicTips);
  const [matchBreakdown, setMatchBreakdown] = useState<MatchBreakdown>(
    initialMatchBreakdown
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPro = planId === 'pro';
  const controller = useInlineIssueController({
    enrichAction: enrichBulletAction,
    resumeId,
    isPro,
    dynamicTips,
    /**
     * When the server pre-computed a MatchBreakdown, look up the
     * path there; otherwise fall back to the heuristic. Pass the
     * whole array so the controller can also pick the
     * weight-aware "primary leaf" per criterion in a future
     * slice.
     */
    matchBreakdown
  });

  function handleRecompute() {
    setError(null);
    startTransition(async () => {
      const result = await recomputeScoreAction({ resumeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBreakdown(result.data.breakdown);
      setDynamicTips(result.data.tips);
      setMatchBreakdown(result.data.matchBreakdown);
    });
  }

  function handleIssueDimClick(input: { criterion: SubCriterionKey }) {
    controller.trigger({
      path: defaultPathForCriterion(input.criterion),
      criterion: input.criterion
    });
  }

  function handleIssueSkillClick(input: {
    skill: string;
    bucket: 'mustHave' | 'niceToHave' | 'implicit';
    criterion: 'Intent Coverage';
  }) {
    controller.trigger({
      path: defaultPathForSkill(),
      criterion: input.criterion
    });
  }

  // No JD attached → render the placeholder (delegates to
  // <ScorecardPanel>'s built-in empty state).
  if (!jobContext) {
    return <ScorecardPanel breakdown={null} />;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="scorecard-client">
      <ScorecardPanel
        breakdown={breakdown}
        dynamicTips={dynamicTips}
        onRecompute={handleRecompute}
        computing={pending}
        onIssueDimClick={handleIssueDimClick}
        onIssueSkillClick={handleIssueSkillClick}
        showProRewriteCta={isPro}
      />

      {/*
        Suppression notice — visible feedback when a dim-bar
        click did NOT open the popover (Free user / empty
        bullet / unknown path). The user otherwise sees the
        pulse + inline tip fire normally, which is a confusing
        "I clicked, something happened, but the AI feature
        didn't" UX. The notice names the reason so the user
        always sees a concrete result.

        Only renders when the controller's `notice` is non-null,
        which happens ~immediately after a suppressed click and
        auto-clears after 4s (see useInlineIssueController).
      */}
      {controller.notice && (
        <div
          role="status"
          aria-live="polite"
          data-testid="inline-issue-notice"
          data-tone={controller.notice.tone}
          data-sequence={controller.notice.sequence}
          className={
            controller.notice.tone === 'warn'
              ? 'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
              : 'rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs leading-snug text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
          }
        >
          {controller.notice.message}
        </div>
      )}

      {/*
        The popover — only for Pro. `controller.popoverProps` is
        `null` when nothing is active; the inner popover short-
        circuits to nothing in that case.

        The inline tip itself is no longer mounted here — the
        editor owns it via `<InlineIssueTip />` (mounted in
        `components/editable/editable-resume.tsx`). The scorecard
        publishes a `dispatchInlineIssueTip` event on every
        trigger; the editor subscribes and renders the tip portal
        anchored to the affected section header.
      */}
      {controller.popoverProps && (
        <InlineIssuePopover {...controller.popoverProps} />
      )}

      {error && (
        <p
          className="text-xs text-destructive"
          role="alert"
          data-testid="scorecard-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}