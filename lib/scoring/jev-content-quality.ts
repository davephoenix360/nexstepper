/**
 * The semantic Content Quality score.
 *
 * Pure, sync, no IO — the evaluation is computed elsewhere and passed
 * in, exactly like the requirement evaluation.
 *
 * ## How the rubric becomes a 0-100 score
 *
 * Each bullet lands on a probability-weighted position on a 0–3 rubric.
 * The sub-criterion is the mean position, normalised so a bullet at the
 * top of the scale counts as fully accomplished and one at the bottom
 * counts as none.
 *
 * ## Why the bullets are matched by text and not by position
 *
 * The evaluation and the dimension must be talking about the same
 * bullets. The caller passes the same bullet list the dimension
 * collected, and the texts are compared, so a mismatch (a different
 * resume, a re-ordered list) degrades to "no evaluation" rather than to
 * a score computed over the wrong bullets.
 */

/** One bullet, judged. */
export interface JevBulletEvaluation {
  /** The bullet's text, so the caller can align it with its own list. */
  text: string;
  /**
   * Probability-weighted position on the impact rubric, 0–3.
   */
  impact: number;
  /**
   * Probability-weighted position on the opening rubric, 0–3.
   */
  opening: number;
}

/** The result of one Jev pass over a resume's work bullets. */
export interface JevContentQualityEvaluation {
  bullets: JevBulletEvaluation[];
  ok: boolean;
}

export interface JevContentQualityScore {
  /** 0-100. Same weighting as the lexical dimension. */
  value: number;
  breakdown: {
    /** 0-100. % of impact claimed by the bullets, 0-3 normalised. */
    accomplishmentRatio: number;
    /** 0-100. % of strength in the bullet openings, 0-3 normalised. */
    actionVerbUsage: number;
  };
}

/** The same weighting the lexical dimension uses. */
const WEIGHTS = { accomplishment: 0.4, actionVerb: 0.3 } as const;
const WEIGHT_SUM = WEIGHTS.accomplishment + WEIGHTS.actionVerb;

/** The top of the rubric, used to normalise a 0–3 position onto 0–100. */
const RUBRIC_MAX = 3;

/**
 * Score the bullets semantically.
 *
 * Returns null when there is no usable evaluation — the caller then
 * keeps the lexical score rather than a fabricated one.
 *
 * @param bullets The work bullets, in the order the dimension collected
 *   them.
 * @param evaluation Jev's judgement of those bullets.
 */
export function scoreJevContentQuality(
  bullets: string[],
  evaluation: JevContentQualityEvaluation | null | undefined
): JevContentQualityScore | null {
  if (!evaluation || !evaluation.ok) return null;
  if (bullets.length === 0) return null;
  if (evaluation.bullets.length !== bullets.length) return null;

  // The two lists must be the same bullets. A mismatch means the
  // evaluation was computed for a different resume.
  for (let i = 0; i < bullets.length; i++) {
    if (evaluation.bullets[i]!.text !== bullets[i]) return null;
  }

  let impact = 0;
  let opening = 0;
  for (const bullet of evaluation.bullets) {
    impact += Math.max(0, Math.min(RUBRIC_MAX, bullet.impact));
    opening += Math.max(0, Math.min(RUBRIC_MAX, bullet.opening));
  }

  const accomplishmentRatio = (impact / (bullets.length * RUBRIC_MAX)) * 100;
  const actionVerbUsage = (opening / (bullets.length * RUBRIC_MAX)) * 100;

  return {
    value:
      (WEIGHTS.accomplishment * accomplishmentRatio +
        WEIGHTS.actionVerb * actionVerbUsage) /
      WEIGHT_SUM,
    breakdown: { accomplishmentRatio, actionVerbUsage }
  };
}
