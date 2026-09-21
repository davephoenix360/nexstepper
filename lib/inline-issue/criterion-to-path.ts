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
 * Falls back to the first work bullet
 * (`sections.work[0].positions[0].highlights[0]`) when no
 * heuristic matches — every criterion has at least one
 * reasonable default.
 */
export function defaultPathForCriterion(criterion: SubCriterionKey): string {
  switch (criterion) {
    // Structure & length — point at the entry's position title,
    // not a bullet. The popover's currentText will be the title
    // and Apply writes back to the title. Users don't usually
    // expect this UX, but it's still useful (and the inline
    // preview shows exactly which leaf we're targeting).
    case 'Section Completeness':
    case 'Optimal Length':
      return 'sections.work[0].positions[0].title';

    // Seniority fit — same target as structure: position title.
    case 'Seniority Fit':
      return 'sections.work[0].positions[0].title';

    // Everything else — first work bullet. This covers ATS,
    // content, alignment, intent, role, soft skills. The bullet
    // is the highest-leverage thing we can rewrite without
    // re-shaping the resume structure. NB: the `.positions[0]`
    // segment is mandatory — work bullets live inside the
    // positions array, not directly under the work entry.
    default:
      return 'sections.work[0].positions[0].highlights[0]';
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
 */
export function defaultPathForSkill(): string {
  return 'sections.skills[0].keywords[0]';
}