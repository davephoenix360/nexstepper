import { describe, expect, it } from 'vitest';

import {
  defaultPathForCriterion,
  defaultPathForSkill
} from '@/lib/inline-issue/criterion-to-path';

/**
 * Pins the criterion-to-path mapping so a future refactor that drops a
 * nesting segment — or switches to a spelling the editor does not
 * render — gets caught by CI before the regression hits the live
 * editor.
 *
 * The path is consumed by:
 *   1. `useInlineIssueController.readLeafText` — looks up the
 *      EditableText leaf via `[data-testid="editable-{path}"]`.
 *   2. `dispatchInlineIssueApply({ path, text })` — the editor
 *      calls `form.setValue(path, text)` to write the chosen
 *      rewrite back into RHF state.
 *
 * If the path doesn't match a real EditableText, both halves of the
 * surface silently fail: the popover never opens (no leaf found), and
 * Apply is a no-op even if it did (wrong key for setValue).
 *
 * ## Two defects this file was pinning
 *
 * **The spelling.** These paths used to be the BRACKETED JSON-Resume
 * spelling (`sections.work[0].positions[0].highlights[0]`), while every
 * template binds the DOTTED spelling the Classic template's
 * `WorkPositionsNested` component confirms:
 * `sections.work.${i}.positions.${j}.highlights.${k}`. The lookup found
 * nothing, the popover never opened, and the user was told "the bullet
 * here is empty" about a bullet that was full. That is the reported
 * "clicking Rewrite with AI does nothing" bug.
 *
 * **The target.** Almost every criterion pointed at the first work
 * bullet — including the ones that measure the summary (Tailoring),
 * the headline (Role Fit) and the skills block (Intent Coverage).
 * Rewriting a work bullet does not move those.
 *
 * `tests/unit/inline-issue/criterion-paths.test.tsx` proves the paths
 * resolve against a real template render.
 */

describe('defaultPathForCriterion', () => {
  it('ATS Coverage → first work bullet', () => {
    // The requirements you are not addressing yet belong in your
    // experience, so a work bullet is the right leaf.
    expect(defaultPathForCriterion('ATS Coverage')).toBe(
      'sections.work.0.positions.0.highlights.0'
    );
  });

  it('ATS Keyword Match → the skills block', () => {
    expect(defaultPathForCriterion('ATS Keyword Match')).toBe(
      'sections.skills.0.keywords.0'
    );
  });

  it('Intent Coverage → the skills block', () => {
    // A missing must-have skill is added to the skills section.
    expect(defaultPathForCriterion('Intent Coverage')).toBe(
      'sections.skills.0.keywords.0'
    );
  });

  it('Accomplishment Focus → first work bullet', () => {
    expect(defaultPathForCriterion('Accomplishment Focus')).toBe(
      'sections.work.0.positions.0.highlights.0'
    );
  });

  it('Action Verb Usage → first work bullet', () => {
    expect(defaultPathForCriterion('Action Verb Usage')).toBe(
      'sections.work.0.positions.0.highlights.0'
    );
  });

  it('Tailoring → the summary', () => {
    // Tailoring measures the JD title's vocabulary IN THE SUMMARY.
    expect(defaultPathForCriterion('Tailoring')).toBe('sections.basics.summary');
  });

  it('Soft Skills → first work bullet', () => {
    expect(defaultPathForCriterion('Soft Skills')).toBe(
      'sections.work.0.positions.0.highlights.0'
    );
  });

  it('Role Fit → the headline', () => {
    // Role Fit compares the JD title against the candidate's titles,
    // and the headline is the one written for THIS application.
    expect(defaultPathForCriterion('Role Fit')).toBe('sections.basics.label');
  });

  it('Section Completeness → first work position title (non-bullet)', () => {
    expect(defaultPathForCriterion('Section Completeness')).toBe(
      'sections.work.0.positions.0.title'
    );
  });

  it('Optimal Length → first work position title (non-bullet)', () => {
    expect(defaultPathForCriterion('Optimal Length')).toBe(
      'sections.work.0.positions.0.title'
    );
  });

  it('Seniority Fit → the summary', () => {
    // Seniority Fit's fix is to call out adjacent experience, which is
    // a summary's job — not a job title's.
    expect(defaultPathForCriterion('Seniority Fit')).toBe('sections.basics.summary');
  });

  it('Unique Value → the first project', () => {
    // Distinctive content lives in a project, an award or a
    // certificate. If the resume has no project, there is nothing to
    // rewrite — and the surface says so.
    expect(defaultPathForCriterion('Unique Value')).toBe(
      'sections.projects.0.description'
    );
  });

  it('never returns a bracketed path', () => {
    // The editor renders dotted paths. A bracketed path is a valid
    // JSON-Resume path and renders NOWHERE — which is what broke the
    // popover.
    for (const criterion of [
      'ATS Keyword Match',
      'ATS Similarity',
      'ATS Coverage',
      'Intent Coverage',
      'Section Completeness',
      'Optimal Length',
      'Accomplishment Focus',
      'Action Verb Usage',
      'Tailoring',
      'Unique Value',
      'Role Fit',
      'Seniority Fit',
      'Soft Skills'
    ] as const) {
      expect(defaultPathForCriterion(criterion)).not.toMatch(/\[\d+\]/);
    }
  });
});

describe('defaultPathForSkill', () => {
  it('points at the first keyword slot in the first skills entry', () => {
    expect(defaultPathForSkill()).toBe('sections.skills.0.keywords.0');
  });
});
