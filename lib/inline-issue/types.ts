/**
 * Public types for the inline-issue surface.
 *
 * The inline-issue surface (Plan: docs/plans/inline-issue-surface.md)
 * sits between the ATS scorecard (right rail) and the WYSIWYG editor
 * (left). It owns:
 *   1. A `subCriterion → resume path` map so the dim bars can hand
 *      the editor a scroll target when the user clicks.
 *   2. A `subCriterion → JD-derived dynamic tip` renderer that
 *      reuses the existing `buildDynamicTips()` infrastructure.
 *   3. A Pro-gated AI rewrite action that returns 3 suggestions for
 *      the bullet at the path the user clicked.
 *
 * These are the only types the rest of the app needs to import.
 * Anything not exported is an implementation detail.
 */

import type { JobPosting } from '@/lib/resume-schema';
import type { ScoreBreakdown } from '@/lib/scoring';

/**
 * The sub-criteria the ATS scorecard drills into. Mirrors
 * `ScoreBreakdown['criteriaScores']` keys (lib/scoring/score.ts).
 *
 * Imported as a string-literal union here (not as `keyof`) because
 * the inline-issue surface is allowed to be lenient — when a new
 * sub-criterion lands, the dim bar keeps working and the path
 * mapper returns `null` (degrades to the static CRITERIA_TIPS
 * fallback) until we extend this union + the path table.
 */
export type SubCriterionKey =
  | 'ATS Keyword Match'
  | 'ATS Similarity'
  | 'ATS Coverage'
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
 * What kind of issue the AI should be hinting at. The mapper
 * surfaces one of these per path so the prompt template can
 * pick a tone:
 *   - `gap`     — the resume has nothing where the JD wants signal.
 *                 Typical call: missing skills, missing keywords.
 *   - `rewrite` — the resume has something but it doesn't read
 *                 strong enough. Typical call: weak action verbs,
 *                 low accomplishment focus.
 *
 * `gap` and `rewrite` are NOT user-visible copy — they're routing
 * hints. The popover UI treats them identically (Apply / Regenerate
 * / Dismiss). They're only here so the prompt template can pick
 * the right framing for the LLM.
 */
export type TipKind = 'gap' | 'rewrite';

/**
 * The slim shape the popover needs to anchor + render. Returned by
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
  /** Routing hint for the prompt template. */
  tipKind: TipKind;
  /**
   * Bullet index inside the path, if applicable. Used so the popover
   * can label the row ("Bullet 2 of experience at Acme") and so the
   * prompt template can quote the right slice of context.
   *
   * `null` for paths that don't refer to a bullet (e.g. the
   * summary paragraph).
   */
  bulletIndex: number | null;
};

/**
 * Server-action result shape for `enrichBulletAction`. The action
 * is Pro-gated — Free callers always get the `ProRequired` error.
 *
 * `proRequired` is its own discriminator (vs. a generic `{ok:false,
 * error:'...'}`) so the client popover can distinguish "you need to
 * upgrade" from "the AI failed". The single-error-string rule from
 * the AGENTS.md §"Server Action results" still applies: each branch
 * is discriminated, not stringly-typed.
 */
export type EnrichBulletResult =
  | {
      ok: true;
      data: {
        /** Three distinct suggestions. Order is editor's preference. */
        rewrites: string[];
        /** Model id that produced the rewrites (e.g. "mistral/nemo"). */
        modelUsed: string;
      };
    }
  | { ok: false; error: string; proRequired?: boolean };

/**
 * Inputs the action accepts. Parsed via Zod at the action boundary.
 *
 * `path` is the EditableText path so the action can look up the
 * current bullet content from the saved resume snapshot. `criterion`
 * is the sub-criterion the user clicked; the prompt template uses
 * it to pick the right framing.
 */
export type EnrichBulletInput = {
  resumeId: string;
  path: string;
  criterion: SubCriterionKey;
  /** Snapshot of the current bullet text — the popover passes it
   *  so the action doesn't have to refetch the resume. */
  currentText: string;
};

/**
 * Cached props for the scorecard panel — passed in from the server
 * so the popover can render without an extra round-trip.
 */
export type InlineIssueContext = {
  resumeId: string;
  breakdown: ScoreBreakdown;
  job: JobPosting;
  planId: 'free' | 'pro';
};