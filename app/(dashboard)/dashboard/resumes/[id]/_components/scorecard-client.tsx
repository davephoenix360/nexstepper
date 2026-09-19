'use client';

import { useState, useTransition } from 'react';

import { ScorecardPanel } from '@/components/scorecard/scorecard';
import type { JobPosting } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';

import { recomputeScoreAction } from '../score-actions';
import { recomputeScoreSemanticAction } from '../score-semantic-actions';

/**
 * Client wrapper around <ScorecardPanel> that owns the "Recompute"
 * interaction.
 *
 * Plan: docs/plans/ats-scoring.md acceptance criterion #7:
 *   "Refresh score button calls recomputeScoreAction via
 *    useTransition, shows a spinner, and updates the bars in
 *    place."
 *
 * Phase 3 of the post-ship engine review
 * (`docs/drift/2026-09-19-ats-engine-review.md`) adds a second
 * opt-in action — `recomputeScoreSemanticAction` — that runs
 * the hybrid (BM25 + semantic embeddings) path. The default
 * `recomputeScoreAction` is unchanged (sync, BM25-only, fast).
 *
 * The page Server Component passes the first-render breakdown +
 * the variant's resumeId. This wrapper:
 *   1. Holds the breakdown in local state (initial = the server-
 *      rendered value).
 *   2. On Recompute click, calls the sync Server Action and
 *      swaps in the result.
 *   3. On "Try semantic" click, calls the hybrid Server Action
 *      and swaps in the result.
 *   4. Uses `useTransition` so each button can show a spinner
 *      without freezing the surrounding UI.
 *   5. Surfaces error messages inline below the panel (no toast —
 *      we keep the right rail self-contained).
 *
 * The Recompute / Try semantic buttons are hidden entirely when
 * there's no JD to score against — matches the visual contract
 * from slice 2 where the placeholder shows "Recompute" as a
 * disabled affordance.
 */
export function ScorecardClient({
  resumeId,
  jobContext,
  initialBreakdown
}: {
  resumeId: string;
  jobContext: JobPosting | null;
  initialBreakdown: ScoreBreakdown | null;
}) {
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(
    initialBreakdown
  );
  const [pending, startTransition] = useTransition();
  const [pendingHybrid, startHybridTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRecompute() {
    setError(null);
    startTransition(async () => {
      const result = await recomputeScoreAction({ resumeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBreakdown(result.data);
    });
  }

  function handleRecomputeHybrid() {
    setError(null);
    startHybridTransition(async () => {
      const result = await recomputeScoreSemanticAction({ resumeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBreakdown(result.data);
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
        onRecompute={handleRecompute}
        onRecomputeHybrid={handleRecomputeHybrid}
        computing={pending}
        computingHybrid={pendingHybrid}
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
