/**
 * Public types for the inline-issue surface.
 *
 * The surface sits between the ATS scorecard (right rail) and the
 * WYSIWYG editor (left). It owns:
 *   1. A `subCriterion → resume path` map so dim bars can hand the
 *      editor a scroll target when the user clicks.
 *   2. A `subCriterion → JD-derived dynamic tip` renderer that
 *      reuses the existing `buildDynamicTips()` infrastructure.
 *
 * AI rewrites are deliberately NOT part of this module any more.
 * Flagged work bullets render an attention icon in the editor and
 * hand off to Scout through the chat handoff provider.
 *
 * These are the only types the rest of the app needs to import.
 * Anything not exported is an implementation detail.
 */

/**
 * The sub-criteria the ATS scorecard drills into. Mirrors
 * `ScoreBreakdown['criteriaScores']` keys (lib/scoring/score.ts).
 *
 * Imported as a string-literal union here (not as `keyof`) because
 * the inline-issue surface is allowed to be lenient — when a new
 * sub-criterion lands, the dim bar keeps working and the path mapper
 * returns `null` (degrades to the static CRITERIA_TIPS fallback)
 * until we extend this union + the path table.
 */
export type SubCriterionKey =
  | 'ATS Keyword Match'
  | 'ATS Similarity'
  | 'Intent Coverage'
  | 'Section Completeness'
  | 'Optimal Length'
  | 'Accomplishment Focus'
  | 'Action Verb Usage'
  | 'Tailoring'
  | 'Unique Value'
  | 'Soft Skills'
  | 'Role Fit'
  | 'Seniority Fit';

/**
 * What kind of measured issue a leaf carries. Not user-facing copy —
 * a routing hint used to pick the right framing for the editor's
 * inline tip:
 *   - `gap`     — the resume has nothing where the JD wants signal.
 *   - `rewrite` — the resume has something but it doesn't read
 *                 strongly enough.
 */
export type TipKind = 'gap' | 'rewrite';

/**
 * The slim shape the tip bridge needs to anchor. Returned by
 * `mapPathToSection()` so the scorecard can hand the editor a target
 * without caring about the editor's internal section id scheme.
 */
export type InlineIssueTarget = {
  /** Path of the EditableText leaf inside `data-testid="editable-{path}"`. */
  path: string;
  /** Section slug (kebab-case) — used to derive `id="section-{slug}"`. */
  sectionSlug: string;
  /** Pretty section title for the pulse overlay (e.g. "Experience"). */
  sectionTitle: string;
  /** Framing hint for the inline tip. */
  tipKind: TipKind;
  /**
   * Bullet index inside the path, if applicable. `null` for paths that
   * don't refer to a bullet (e.g. the summary paragraph).
   */
  bulletIndex: number | null;
};
