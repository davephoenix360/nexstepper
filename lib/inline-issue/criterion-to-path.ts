/**
 * Default path resolver — maps a sub-criterion to the most-relevant
 * EditableText path inside the editor.
 *
 * The remaining inline-issue surface is a **tip + scroll anchor**: a
 * scorecard click sends a `Tip` event through `apply-bridge`, and the
 * editor scrolls to the section and pulses it. The path must still name
 * a real leaf so the pulse lands on the right place. Flagged work
 * bullets now carry their own exact dotted path from
 * `buildBulletIssues()`; this resolver supplies the fallback anchor for
 * every other criterion.
 *
 * Heuristics (locked answers from the original plan):
 *   - ATS / Intent criteria → the skills block.
 *   - Role Fit → the headline.
 *   - Tailoring / Seniority Fit → the summary.
 *   - Structure / Length criteria → first work position title.
 *   - Content / similarity / soft-skill criteria → first work bullet.
 *
 * **Path-shape gotcha — work bullets are nested.** The resume
 * schema wraps bullets inside positions:
 *   `sections.work[0].positions[0].highlights[0]`
 * NOT `sections.work[0].highlights[0]` (which is what the JSON
 * Resume spec implies for a flat `work[].highlights` shape).
 * The `WorkPositionsNested` editor component + the
 * `workEntrySchema` (lib/resume-schema/sections/work.ts) both
 * confirm the nested shape. If the default path doesn't
 * include `.positions[0]`, the leaf doesn't exist in the DOM and
 * the anchor is silent.
 *
 * For multi-position resumes, we use `positions[0]` as the
 * default fallback. Exact bullet paths come from the measured issue.
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
 * The consequence was that the editor never rendered a matching
 * `data-testid`, so the old scorecard rewrite surface could not anchor
 * to the leaf it claimed to be fixing. That surface is retired; the
 * test below still renders a real template so the surviving tip/pulse
 * anchor cannot drift back to the bracketed spelling.
 *
 * The rule: **a path is only useful if the editor renders exactly
 * that testid.** `tests/unit/inline-issue/criterion-paths.test.tsx`
 * asserts that, against a real template render, so the two cannot
 * drift apart again.
 *
 * ## Which leaf — the one the criterion actually reads
 *
 * A second defect sat behind the first: the target was the first work
 * bullet for almost every criterion. So an "Experience match" click
 * (Tailoring — which measures the JD title's vocabulary in the
 * *summary*) pointed at a work bullet, and a "Role fit" click (which
 * compares the JD title against the candidate's *titles*) also pointed
 * at a work bullet — while the headline it never reached was the thing
 * the dimension reads.
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
    // project, there is nothing to anchor — and the tip says so:
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
 * Resolve a default path for a skill name from the MissList. The
 * first keyword slot in the skills section is a real leaf, so the
 * inline pulse + section scroll land consistently for MissList
 * clicks. Adding the skill itself is a separate editor affordance.
 *
 * Dotted, like every other path the editor renders — see
 * `defaultPathForCriterion`.
 */
export function defaultPathForSkill(): string {
  return 'sections.skills.0.keywords.0';
}