/**
 * Default path resolver — maps a sub-criterion to the most-relevant
 * EditableText path inside the editor.
 *
 * The inline-issue surface is anchored to specific leaves. When the
 * user clicks a dim bar, we don't ask them to pick a bullet — we
 * pick a "high-leverage" one for them and let the popover's
 * inline `<strong>{currentText}</strong>` preview tell them which
 * one we're targeting. If they don't like the choice, they can
 * dismiss the popover and pick a different bullet by editing it
 * (or by clicking another dim bar that points elsewhere).
 *
 * Heuristics (locked answers from the plan):
 *   - ATS / Content / Tailoring criteria → first work bullet. The
 *     summary is too high-leverage to risk; we edit a single
 *     bullet, the user gets the most-likely-helpful candidate.
 *   - Structure / Length criteria → first work entry's position
 *     title (a non-bullet path; popover handles these cleanly).
 *   - Seniority Fit → first work position title (job titles
 *     carry the seniority signal).
 *   - Intent / Role Fit / Soft Skills → first work bullet
 *     (we can't rewrite role framing in a single bullet, but we
 *     CAN strengthen the action verbs so the bullet reads as
 *     more senior / more aligned).
 *
 * **Path-shape gotcha — work bullets are nested.** The resume
 * schema wraps bullets inside positions:
 *   `sections.work[0].positions[0].highlights[0]`
 * NOT `sections.work[0].highlights[0]` (which is what the JSON
 * Resume spec implies for a flat `work[].highlights` shape).
 * The `WorkPositionsNested` editor component + the
 * `workEntrySchema` (lib/resume-schema/sections/work.ts) both
 * confirm the nested shape. If the default path doesn't
 * include `.positions[0]`, the leaf doesn't exist in the DOM
 * and the popover never opens.
 *
 * For multi-position resumes, we use `positions[0]` as the
 * default. A future slice could walk all entries and pick the
 * lowest-scoring bullet; v1 is best-effort.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Pulse target".
 */

import type { SubCriterionKey } from './types';

/**
 * Resolve a default path for a criterion. Returns a path string
 * suitable for `[data-testid="editable-{path}"]` lookup.
 *
 * ## The path format — DOT notation, and it has to match the editor
 *
 * The editor binds every field with a **dotted** path:
 * `sections.work.0.positions.0.highlights.0`. This function used to
 * return the **bracketed** JSON-Resume spelling
 * (`sections.work[0].positions[0].highlights[0]`), which no template
 * ever renders.
 *
 * The consequence was that `readLeafText()` found nothing, the popover
 * never opened, and the user was told *"The bullet here is empty — add
 * some content to this section first"* — about a bullet that was full.
 * That is the "clicking Rewrite with AI does nothing" report.
 *
 * The rule: **a path is only useful if the editor renders exactly
 * that testid.** `tests/unit/inline-issue/criterion-paths.test.tsx`
 * asserts that, against a real template render, so the two cannot
 * drift apart again.
 *
 * ## Which leaf — the one the criterion actually reads
 *
 * A second defect sat behind the first: the target was the first work
 * bullet for almost every criterion. So clicking "Rewrite with AI"
 * beside **Experience match** (Tailoring — which measures the JD
 * title's vocabulary in the *summary*) opened a popover on a work
 * bullet, and beside **Role fit** (which compares the JD title against
 * the candidate's *titles*) it also opened a work bullet — while the
 * headline it never opened was the thing the dimension reads.
 *
 * Each criterion now points at the leaf whose text moves it.
 */
export function defaultPathForCriterion(criterion: SubCriterionKey): string {
  switch (criterion) {
    // Missing keywords / missing must-have skills → the SKILLS block.
    // A keyword belongs in the skills section, and that is where the
    // editor's chip editor lives.
    case 'ATS Keyword Match':
    case 'Intent Coverage':
      return 'sections.skills.0.keywords.0';

    // Title alignment → the HEADLINE. Role Fit compares the JD's title
    // against the candidate's titles, and the headline is the one they
    // write for THIS application.
    case 'Role Fit':
      return 'sections.basics.label';

    // The summary's wording → the SUMMARY. Tailoring measures the JD
    // title's vocabulary in the summary; Seniority Fit's fix is to call
    // out adjacent experience, which is a summary's job.
    case 'Tailoring':
    case 'Seniority Fit':
      return 'sections.basics.summary';

    // Distinctive content → the first project. If the resume has no
    // project, there is nothing to rewrite — and the surface says so
    // ("the resume may not have content here yet"), which is the truth:
    // improving Unique Value means ADDING a project.
    case 'Unique Value':
      return 'sections.projects.0.description';

    // Structure & length → the position title.
    //
    // Both of these are structural criteria: the fix for a missing
    // section is to ADD one, and the fix for a long resume is to trim
    // it. Neither is a single leaf's text. The title is the closest
    // real leaf, and the tip carries the actual instruction.
    case 'Section Completeness':
    case 'Optimal Length':
      return 'sections.work.0.positions.0.title';

    // Content quality, coverage, similarity, soft skills → a work
    // bullet. These are all "this bullet should say more / say it
    // differently".
    default:
      return 'sections.work.0.positions.0.highlights.0';
  }
}

/**
 * Resolve a default path for a skill name from the MissList. We
 * point at the first keyword slot in the skills section so the
 * popover anchors to a real leaf and the Free pulse can scroll
 * to the Skills section header.
 *
 * v1 doesn't let users add a missing skill via this surface
 * (that's a separate "Add skill" affordance already on the
 * editor). The path is here so the inline pulse + section
 * scroll work consistently for MissList clicks.
 *
 * Dotted, like every other path the editor renders — see
 * `defaultPathForCriterion`.
 */
export function defaultPathForSkill(): string {
  return 'sections.skills.0.keywords.0';
}