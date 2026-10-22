/**
 * The Jev-derived requirement evaluation, and the pure arithmetic that
 * turns it into a score.
 *
 * ## Why there is a Jev signal at all
 *
 * The ATS Keyword Match sub-criterion used to count every non-stop-word
 * token in the JD — including the description and the benefits — and
 * ask what fraction the resume contains. For a realistic JD that is 49
 * tokens of which **33 are missing (67%)** for a candidate who has every
 * required skill, and the missing ones include `insurance`, `budget`,
 * `remote`, `friendly`, `company`.
 *
 * That is measuring how much a resume echoes a job posting's prose. What
 * an employer actually checks is narrower: does the resume cover the
 * JD's GENUINE requirements, and how strongly?
 *
 * Jev answers both questions with calibrated probabilities:
 *
 *   - "is this JD line a specific skill, tool or technique?" → the
 *     genuine requirement set (AUC 0.926 against the validation
 *     corpus's hand-authored skill lists)
 *   - "how strongly does the resume demonstrate this?" → a
 *     probability-weighted position on a 0–3 evidence rubric
 *
 * ## The arithmetic
 *
 *     coverage = fraction of genuine requirements with any evidence (≥1)
 *     depth    = mean evidence / 3
 *     keyword  = 100 x (0.5 x coverage + 0.5 x depth)
 *
 * The keyword sub-criterion is then weighted with the ATS dimension's
 * other two sub-criteria exactly as before, so the scorecard's criteria
 * still decompose the dimension.
 *
 * Measured against the 50-JD validation corpus: Pearson r 0.910 → 0.934,
 * mean absolute error 13.40 → 12.12.
 *
 * Pure and sync — no IO, no clock, no model. The evaluation is computed
 * elsewhere (`lib/scoring-async/jev-requirements.ts`) and passed in.
 */

/** Which intent-coverage priority list an entry came from. */
export type JevPriorityBucket = 'must' | 'nice' | 'implicit';

/** One JD requirement entry, classified and (if applicable) scored. */
export interface JevRequirementLine {
  /** The JD's own wording. */
  text: string;
  /** Which priority list it came from. */
  bucket: JevPriorityBucket;
  /**
   * Probability that this entry names a specific skill, tool or technique
   * the candidate would use on the job. 0–1.
   */
  pSkill: number;
  /**
   * Probability that this entry is an eligibility GATE — a degree, a
   * certification, work authorisation, or a years-of-experience
   * threshold the candidate cannot satisfy by adding content. 0–1.
   *
   * Gates are excluded from the Intent Coverage penalty. Everything else
   * stays scored: a duty or a soft skill is something the candidate CAN
   * show evidence of, so "demonstrated" is decided by the evidence score
   * rather than by dropping the entry.
   */
  pGate: number;
  /**
   * Evidence depth, 0–3. The probability-weighted position on the
   * rubric, so it is fractional. Null when it was not computed.
   */
  evidence: number | null;
}

/** The result of one Jev evaluation pass over a JD and a resume. */
export interface JevRequirementEvaluation {
  /** Every requirement entry, classified. */
  lines: JevRequirementLine[];
  /**
   * The genuine skill requirements, with their evidence depth.
   *
   * This is the vocabulary the ATS Keyword Match sub-score is measured
   * against.
   */
  requirements: Array<{ text: string; evidence: number }>;
  /** The eligibility gates, in the JD's wording. */
  gates: string[];
  /**
   * Per priority bucket, the entries that are NOT gates — the ones the
   * Intent Coverage dimension scores.
   */
  scorable: Record<JevPriorityBucket, string[]>;
  /** Whether the evaluation is usable at all. */
  ok: boolean;
}

/** The score derived from an evaluation. */
export interface JevRequirementFit {
  /** Fraction of genuine requirements with any evidence at all, 0–1. */
  coverage: number;
  /** Mean evidence depth normalised to 0–1. */
  depth: number;
  /** The ATS Keyword Match sub-score, 0–100. */
  keywordScore: number;
  /** The genuine requirements the resume does not evidence at all. */
  missing: string[];
}

/** The rubric the evidence question is asked on. */
export const EVIDENCE_RUBRIC = [
  'No mention at all',
  'Listed as a skill or keyword only',
  'Mentioned in a bullet or sentence',
  'Demonstrated with a concrete outcome or result'
] as const;

/** The weight of coverage against depth inside the keyword sub-score. */
export const COVERAGE_WEIGHT = 0.5;
export const DEPTH_WEIGHT = 0.5;

/**
 * The evidence depth at which a requirement counts as COVERED.
 *
 * The evidence score is a probability-weighted position on the 0–3
 * rubric, so a resume that simply LISTS a skill does not land on 1.0 —
 * it lands on about 0.99, because the model puts a little mass on the
 * other levels. A threshold of 1.0 therefore reported skills the
 * candidate plainly has as missing.
 *
 * The rubric's own structure gives the right cut: position 0 is "no
 * mention at all" and position 1 is "listed as a skill or keyword
 * only". Anything at or above the midpoint between them means the
 * resume says the skill somewhere.
 */
export const EVIDENCE_COVERED_THRESHOLD = 0.5;

/**
 * Turn an evaluation into the ATS Keyword Match sub-score.
 *
 * Returns null when the evaluation is not usable — an empty requirement
 * set means there is nothing to measure, and inventing a number there
 * would be a guess dressed as a measurement.
 */
export function scoreJevRequirementFit(
  evaluation: JevRequirementEvaluation | null | undefined
): JevRequirementFit | null {
  if (!evaluation || !evaluation.ok) return null;
  if (evaluation.requirements.length === 0) return null;

  const evidences = evaluation.requirements.map((r) => r.evidence);
  const covered = evidences.filter((e) => e >= 1).length;
  const coverage = covered / evidences.length;
  const depth =
    evidences.reduce((a, b) => a + b, 0) / (evidences.length * 3);

  return {
    coverage,
    depth,
    keywordScore:
      100 * (COVERAGE_WEIGHT * coverage + DEPTH_WEIGHT * depth),
    missing: evaluation.requirements
      .filter((r) => r.evidence < 1)
      .map((r) => r.text)
  };
}
