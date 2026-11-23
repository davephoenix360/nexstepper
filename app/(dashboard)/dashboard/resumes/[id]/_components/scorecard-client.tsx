'use client';

import { useEffect, useState, useTransition } from 'react';

import { ScorecardPanel } from '@/components/scorecard/scorecard';
import type { JobPosting } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';
import type { DynamicTips } from '@/lib/scoring/tips';
import type { MatchBreakdown } from '@/lib/db/queries';
import { useInlineIssueController } from '@/lib/inline-issue';
import type { SubCriterionKey } from '@/lib/inline-issue/types';

import { recomputeScoreAction } from '../score-actions';

/**
 * Client wrapper around <ScorecardPanel> that owns:
 *   1. Recompute (BM25 + semantic hybrid).
 *   2. The inline explanation surface: a dim-bar or skill-gap click
 *      scrolls to the measured leaf, pulses its section header and
 *      renders the scorecard's tip at the point of interest.
 *
 * AI rewrites no longer live here. Flagged work bullets carry their
 * own attention icon in the editor and hand off directly to Scout —
 * see docs/plans/inline-bullet-issues-to-scout.md. Keeping the
 * explanation path here means every user, on every plan, gets a
 * useful result from a dim-bar click without a paywall notice.
 *
 * The Recompute button is hidden entirely when there's no JD to
 * score against — matches the visual contract from the earlier
 * slice where the placeholder showed a disabled affordance.
 */
export function ScorecardClient({
  resumeId,
  jobContext,
  initialBreakdown,
  initialDynamicTips = {},
  initialMatchBreakdown = []
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
   * Server-rendered per-leaf breakdown. The controller uses it to pick
   * the leaf the advice actually NAMES instead of always landing on
   * the first work bullet.
   */
  initialMatchBreakdown?: MatchBreakdown;
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

  /**
   * Re-sync the scorecard's local mirror state when the server-rendered
   * initial props change. Without this, a freshly-attached job
   * description (where `data.jobContext` flips from null to truthy and
   * `initialBreakdown` flips from null to a real breakdown) would not
   * appear until the user hard-refreshes the page: `useState(prop)`
   * only reads the prop on mount.
   *
   * Same trap as `form.reset(initialData)` in
   * `components/editable/editable-resume.tsx` and documented in
   * `AGENTS.md` "Recurring traps" #1.
   */
  useEffect(() => {
    setBreakdown(initialBreakdown);
  }, [initialBreakdown]);
  useEffect(() => {
    setDynamicTips(initialDynamicTips);
  }, [initialDynamicTips]);
  useEffect(() => {
    setMatchBreakdown(initialMatchBreakdown);
  }, [initialMatchBreakdown]);

  const controller = useInlineIssueController({ matchBreakdown });

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
    // No explicit path. The server's `matchBreakdown` is the authority
    // on WHICH leaf a criterion targets — it was built with the resume
    // in hand, so it points at the bullet the advice NAMES. Passing a
    // default path here always landed on the first work bullet.
    controller.trigger({ criterion: input.criterion });
  }

  function handleIssueSkillClick(input: {
    skill: string;
    bucket: 'mustHave' | 'niceToHave' | 'implicit';
    criterion: 'Intent Coverage';
  }) {
    // Also no explicit path: the breakdown carries a skill-gap row for
    // Intent Coverage pointing at the skills block.
    controller.trigger({ criterion: input.criterion });
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
      />

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
