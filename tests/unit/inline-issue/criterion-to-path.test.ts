import { describe, expect, it } from 'vitest';

import {
  defaultPathForCriterion,
  defaultPathForSkill
} from '@/lib/inline-issue/criterion-to-path';

/**
 * Pins the criterion-to-path mapping so a future refactor that
 * drops the `.positions[0]` segment (or any other nesting) gets
 * caught by CI before the regression hits the live editor.
 *
 * The path is consumed by:
 *   1. `useInlineIssueController.readLeafText` — looks up the
 *      EditableText leaf via `[data-testid="editable-{path}"]`.
 *   2. `dispatchInlineIssueApply({ path, text })` — the editor
 *      calls `form.setValue(path, text)` to write the chosen
 *      rewrite back into RHF state.
 *
 * If the path doesn't match a real EditableText (because the
 * nesting is wrong), both halves of the surface silently fail:
 * the popover never opens (no leaf found), and Apply is a no-op
 * even if it did (wrong key for setValue).
 *
 * The actual JSON Resume v1 schema has work entries wrapping a
 * nested `positions[]` array — see
 * `lib/resume-schema/sections/work.ts`. The Classic template's
 * `WorkPositionsNested` component confirms the path shape:
 * `sections.work.${i}.positions.${j}.highlights.${k}`.
 */

describe('defaultPathForCriterion', () => {
  it('ATS Coverage → first work bullet (with positions[0])', () => {
    expect(defaultPathForCriterion('ATS Coverage')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('ATS Keyword Match → first work bullet', () => {
    expect(defaultPathForCriterion('ATS Keyword Match')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('Intent Coverage → first work bullet', () => {
    expect(defaultPathForCriterion('Intent Coverage')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('Accomplishment Focus → first work bullet', () => {
    expect(defaultPathForCriterion('Accomplishment Focus')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('Action Verb Usage → first work bullet', () => {
    expect(defaultPathForCriterion('Action Verb Usage')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('Tailoring → first work bullet', () => {
    expect(defaultPathForCriterion('Tailoring')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('Soft Skills → first work bullet', () => {
    expect(defaultPathForCriterion('Soft Skills')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('Role Fit → first work bullet', () => {
    expect(defaultPathForCriterion('Role Fit')).toBe(
      'sections.work[0].positions[0].highlights[0]'
    );
  });

  it('Section Completeness → first work position title (non-bullet)', () => {
    expect(defaultPathForCriterion('Section Completeness')).toBe(
      'sections.work[0].positions[0].title'
    );
  });

  it('Optimal Length → first work position title (non-bullet)', () => {
    expect(defaultPathForCriterion('Optimal Length')).toBe(
      'sections.work[0].positions[0].title'
    );
  });

  it('Seniority Fit → first work position title (non-bullet)', () => {
    expect(defaultPathForCriterion('Seniority Fit')).toBe(
      'sections.work[0].positions[0].title'
    );
  });
});

describe('defaultPathForSkill', () => {
  it('points at the first keyword slot in the first skills entry', () => {
    expect(defaultPathForSkill()).toBe('sections.skills[0].keywords[0]');
  });
});