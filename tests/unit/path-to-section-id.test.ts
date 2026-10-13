/**
 * Tests for `pathToSectionId` — the cheap path → section-id lookup
 * the editor's ValidationSummary uses for its "Go to field" button.
 *
 * Cheaper than `mapPathToSection` because it skips the criterion
 * and tip-kind resolution. Used wherever the caller already has a
 * form path and only wants the rendered `id="section-{slug}"` —
 * the editor scroll target. Returns `null` for paths that don't
 * have a formal section header (`sections.basics.*` and unknown
 * prefixes), which the caller uses to fall back to scrolling the
 * editor container to the top.
 */

import { describe, expect, it } from 'vitest';

import { pathToSectionId } from '@/lib/inline-issue';

describe('pathToSectionId', () => {
  describe('happy paths', () => {
    it('resolves a work path to the rendered experience section id', () => {
      expect(pathToSectionId('sections.work.0.company')).toBe(
        'section-experience'
      );
    });

    it('resolves a skills path', () => {
      expect(pathToSectionId('sections.skills.0.keywords')).toBe(
        'section-skills'
      );
    });

    it('resolves an education path', () => {
      expect(pathToSectionId('sections.education.0.school')).toBe(
        'section-education'
      );
    });

    it('accepts the array-index path variant (sections.work[0].company)', () => {
      // The Zod resolver uses `[N]` for array access; the prefix
      // matcher must accept it the same way it accepts the dotted
      // form, otherwise a path that survived the editor would
      // silently fail the scroll.
      expect(pathToSectionId('sections.work[0].company')).toBe(
        'section-experience'
      );
    });

    it('resolves a leaf that is exactly the section prefix', () => {
      expect(pathToSectionId('sections.projects')).toBe('section-projects');
    });
  });

  describe('null returns', () => {
    it('returns null for sections.basics.* (no formal section header)', () => {
      // The basics fields render inline above the section list
      // and there is no `id="section-basics"` element in any
      // template. The caller falls back to scrolling the editor
      // to the top when this returns null, which lands the user
      // on the basics form.
      expect(pathToSectionId('sections.basics.url')).toBeNull();
      expect(pathToSectionId('sections.basics.summary')).toBeNull();
      expect(pathToSectionId('sections.basics')).toBeNull();
    });

    it('returns null for unknown prefixes', () => {
      expect(pathToSectionId('sections.doesNotExist.foo')).toBeNull();
    });

    it('returns null for the empty string', () => {
      expect(pathToSectionId('')).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
      expect(pathToSectionId('   ')).toBeNull();
    });

    it('tolerates a leading slash without crashing', () => {
      // Defensive — the editor never produces these but a future
      // Zod issue path could.
      expect(pathToSectionId('/sections.work.0.company')).toBe(
        'section-experience'
      );
    });
  });

  describe('does not match across sections (no prefix-leak)', () => {
    it('does not return a `sections` prefix match for a different leaf', () => {
      // `sections.workx` (no dot, but the prefix would not match
      // because of the strict separator check). Guards against
      // a future contributor weakening the prefix matcher.
      expect(pathToSectionId('sections.workx.company')).toBeNull();
    });
  });
});
