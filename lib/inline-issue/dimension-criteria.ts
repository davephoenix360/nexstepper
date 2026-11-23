/**
 * Which criteria belong to which dimension.
 *
 * ## Why this exists
 *
 * The scorecard renders SEVEN dimension bars, and each bar showed ONE
 * criterion's advice. The other criteria had nowhere to live:
 *
 *   Keywords          → ATS Keyword Match            (ATS Similarity: orphan)
 *   Format            → Section Completeness          (Optimal Length: orphan)
 *   Impact            → Accomplishment Focus         (Action Verb Usage: orphan)
 *   Experience match  → Tailoring                     (Unique Value, Soft Skills: orphans)
 *   Intent coverage   → Intent Coverage
 *   Role fit          → Role Fit
 *   Seniority fit     → Seniority Fit
 *
 * Those orphans were not orphan DATA — each one is advice about the
 * same dimension the bar represents. The Impact bar talked about
 * bullets that "describe a task rather than an outcome" but never about
 * the bullets that "open weakly or passively" — both are about the same
 * bullets.
 *
 * So the full advice for a dimension covers **every** criterion in it.
 * A single scorecard click still anchors to the clicked criterion, but
 * consumers that need the whole picture (the chat context and the
 * attention-icon copy) must not reduce the dimension to one tip.
 *
 * ## One map, two surfaces
 *
 * The chat agent needs the same mapping ("which sub-criterion of
 * which dimension is the weakest?"), so the map itself now lives in
 * `lib/scoring/criteria.ts` — the scoring domain — and this file
 * re-exports it. Two hand-written maps would drift, and a drifted map
 * means the chat agent answers "your weakest thing is in the Impact
 * dimension" while the scorecard opens a different bar.
 */
import { CRITERION_DIMENSIONS } from '@/lib/scoring/criteria';
import type { SubCriterionKey } from './types';

/**
 * The dimension each criterion belongs to.
 *
 * The dimension labels are the scorecard's own — the same strings the
 * bars carry.
 */
export const CRITERION_TO_DIMENSION: Record<SubCriterionKey, string> =
  CRITERION_DIMENSIONS;

/**
 * Every criterion in the dimension the clicked one belongs to.
 *
 * The clicked criterion comes FIRST — it is the one the user asked
 * about and the one the Tip anchor should name.
 */
export function siblingCriteria(criterion: SubCriterionKey): SubCriterionKey[] {
  const dimension = CRITERION_TO_DIMENSION[criterion];
  const siblings = (Object.entries(CRITERION_TO_DIMENSION) as Array<
    [SubCriterionKey, string]
  >)
    .filter(([, d]) => d === dimension)
    .map(([c]) => c);
  return [
    criterion,
    ...siblings.filter((c) => c !== criterion)
  ];
}
