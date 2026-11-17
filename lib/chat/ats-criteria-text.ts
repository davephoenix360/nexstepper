/**
 * The criteria block for the chat agent — the sub-criterion scores,
 * rendered as plain text.
 *
 * ## Why this is a separate module
 *
 * TWO surfaces put the score in front of the model:
 *
 *   1. the system prompt (`buildAtsContext`), on every turn, and
 *   2. the `getAtsScore` tool's output, which the agent calls to
 *      measure its own edits.
 *
 * When the advice block was added to the system prompt, it was NOT
 * added to the tool — and the two surfaces drifted. The repo's rule
 * is one helper, both surfaces, so both call this.
 *
 * ## What the block says
 *
 * The dimension numbers tell the candidate which BAR is weak. They do
 * not tell them which PART of the bar is weak: "Impact 77" could be
 * accomplishment focus, action verbs, or both. The sub-criterion
 * scores answer that, and they are what the advice ("What to fix") is
 * keyed by — so with both in the prompt the agent can name the exact
 * thing to change.
 *
 * ## The rule about unmeasured criteria
 *
 * Criteria that could not be measured are listed SEPARATELY and
 * explicitly marked. A criterion reading 50 because there was no
 * title to compare against is not a mediocre score — it is a
 * non-measurement, and reporting it as the weakest thing to fix would
 * send the candidate after something that is not broken.
 */
import type { ScoreBreakdown } from '@/lib/scoring/score';
import {
  criterionRows,
  weakestMeasuredCriterion,
  type CriterionRow
} from '@/lib/scoring/criteria';

/** Render one criterion row as a prompt line. */
function rowLine(row: CriterionRow): string {
  return `  ${row.criterion} ${Math.round(row.score)} (${row.dimension})`;
}

/**
 * The criteria block, ready to drop into a prompt.
 *
 * Returns an empty string when the breakdown carries no criteria (an
 * old snapshot), so the caller can omit the section rather than emit
 * a header with nothing under it.
 */
export function criteriaTextForModel(breakdown: ScoreBreakdown): string {
  const rows = criterionRows(breakdown);
  if (rows.length === 0) return '';

  // Weakest first — the model should not have to hunt for it, and the
  // explicit "Weakest sub-criterion" line below agrees with the order
  // of the list.
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const measured = sorted.filter((r) => r.measurement === 'measured');
  const notMeasured = sorted.filter((r) => r.measurement !== 'measured');

  const lines: string[] = [];
  lines.push(
    'Sub-criterion scores (0–100) — the fine-grained parts behind each dimension, weakest first:'
  );
  for (const row of measured) lines.push(rowLine(row));

  if (notMeasured.length > 0) {
    lines.push('');
    lines.push(
      'Could NOT be measured (the engine default — NOT a weakness to fix):'
    );
    for (const row of notMeasured) {
      lines.push(`${rowLine(row)} — ${row.note ?? 'no signal available'}`);
    }
  }

  const weakest = weakestMeasuredCriterion(rows);
  if (weakest) {
    lines.push('');
    lines.push(
      `Weakest sub-criterion: ${weakest.criterion} (${Math.round(
        weakest.score
      )}/100), part of the ${weakest.dimension} dimension. This is the lowest-scoring part of the score that was actually measured.`
    );
  }

  return lines.join('\n');
}
