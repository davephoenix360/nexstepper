/**
 * Public API for the ATS scoring engine.
 *
 * Other modules import from here, not from the implementation files
 * directly. Lets us reorganize the internals (split into more
 * dimensions, swap a tokenization strategy) without breaking callers.
 *
 * Plan: docs/plans/ats-scoring.md.
 */

// Top-level composition
export {
  composeOverallScore,
  scoreResume,
  scoreResumeFromEnvelope,
  WEIGHTS
} from './score';
export type {
  ScoreBreakdown,
  DimensionKey,
  ScoreableResume,
  ScoreableJob
} from './score';

// Pure helpers (re-exported for tests + advanced callers)
export {
  flattenResumeText,
  flattenJobText,
  tokenize,
  jaccard,
  wordCount
} from './similarity';
export type { ResumeTextSource, JobTextSource, TokenSet } from './similarity';

// The sub-criteria behind each dimension — one canonical map, shared by
// the scorecard drill-down and the chat agent.
export {
  CRITERION_DIMENSIONS,
  criterionRows,
  weakestCriterionOf,
  weakestMeasuredCriterion
} from './criteria';
export type {
  CriterionName,
  CriterionDimension,
  CriterionMeasurement,
  CriterionRow
} from './criteria';

// Dictionaries (re-exported for tests that need to assert dictionary
// contents + for future features that want to extend them).
export {
  ACTION_VERBS,
  WEAK_VERBS,
  SOFT_SKILLS,
  STOP_WORDS
} from './dictionaries';
