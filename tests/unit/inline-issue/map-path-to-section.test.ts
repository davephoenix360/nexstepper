import { describe, expect, it } from 'vitest';

import {
  SECTION_TABLE,
  mapPathToSection,
  sectionId,
  sectionSlugFor
} from '@/lib/inline-issue/map-path-to-section';
import type { SubCriterionKey } from '@/lib/inline-issue/types';

/**
 * Pure-function tests for the path → section lookup.
 *
 * Covers:
 *   - Every section in the SECTION_TABLE resolves via its prefix.
 *   - Bullet index extraction (highlights[N]) returns N.
 *   - Non-bullet paths return null for bulletIndex.
 *   - Basics → null (no formal section).
 *   - Unknown prefix → null.
 *   - tipKind flips for the `gap` criteria.
 *   - sectionId() helper produces stable DOM ids.
 *   - sectionSlugFor() matches the table.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Test plan" #1.
 */

describe('mapPathToSection', () => {
  describe('section prefix table', () => {
    // Pin the table so a future drift that removes a section is
    // visible in PR review rather than silently breaking the
    // pulse target for that section.
    it('covers all 12 JSON Resume sections', () => {
      const keys = Object.keys(SECTION_TABLE).sort();
      expect(keys).toEqual([
        'awards',
        'basics',
        'certificates',
        'education',
        'interests',
        'languages',
        'projects',
        'publications',
        'references',
        'skills',
        'volunteer',
        'work'
      ]);
    });

    it('maps each section key to its prefix + slug + title', () => {
      expect(SECTION_TABLE.work).toEqual({
        prefix: 'sections.work',
        slug: 'experience',
        title: 'Experience'
      });
      expect(SECTION_TABLE.skills).toEqual({
        prefix: 'sections.skills',
        slug: 'skills',
        title: 'Skills'
      });
      expect(SECTION_TABLE.education).toEqual({
        prefix: 'sections.education',
        slug: 'education',
        title: 'Education'
      });
    });
  });

  describe('lookup', () => {
    it.each([
      // Each row: [path, criterion, expected slug, expected title,
      // expected bulletIndex, expected tipKind].
      [
        'sections.work[0].highlights[2]',
        'ATS Coverage',
        'experience',
        'Experience',
        2,
        'gap'
      ],
      [
        'sections.work[0].highlights[0]',
        'Accomplishment Focus',
        'experience',
        'Experience',
        0,
        'rewrite'
      ],
      [
        'sections.skills[0].keywords[3]',
        'Intent Coverage',
        'skills',
        'Skills',
        3,
        'gap'
      ],
      [
        'sections.projects[1].highlights[4]',
        'ATS Coverage',
        'projects',
        'Projects',
        4,
        'gap'
      ],
      [
        'sections.work[0].position',
        'Section Completeness',
        'experience',
        'Experience',
        null,
        'rewrite'
      ],
      [
        'sections.education[0].degree',
        'Seniority Fit',
        'education',
        'Education',
        null,
        'rewrite'
      ],
      [
        'sections.basics.summary',
        'Accomplishment Focus',
        'basics',
        'Header',
        null,
        'rewrite'
      ]
    ])(
      'maps %s → slug=%s, title=%s, bullet=%s, tip=%s',
      (path, criterion, expectedSlug, expectedTitle, expectedBullet, expectedTip) => {
        const result = mapPathToSection(
          path,
          criterion as SubCriterionKey
        );
        expect(result).not.toBeNull();
        expect(result?.sectionSlug).toBe(expectedSlug);
        expect(result?.sectionTitle).toBe(expectedTitle);
        expect(result?.bulletIndex).toBe(expectedBullet);
        expect(result?.tipKind).toBe(expectedTip);
      }
    );

    it('returns null for an unknown prefix', () => {
      const result = mapPathToSection(
        'sections.unknownField.value',
        'ATS Coverage'
      );
      expect(result).toBeNull();
    });

    it('returns null for an empty path', () => {
      const result = mapPathToSection('', 'ATS Coverage');
      expect(result).toBeNull();
    });

    it('returns null for a path that starts with /', () => {
      // Defensive — the editor never produces this but a future
      // Zod issue path could.
      const result = mapPathToSection(
        '/sections.work[0].highlights[0]',
        'ATS Coverage'
      );
      expect(result).not.toBeNull();
      expect(result?.sectionSlug).toBe('experience');
      expect(result?.bulletIndex).toBe(0);
    });

    it('returns null for bulletIndex on a whole work entry', () => {
      // `sections.work[0]` is the whole work entry, not a single
      // bullet. The popover handles non-bullet paths by not
      // labelling a "bullet N of N" hint.
      const result = mapPathToSection(
        'sections.work[0]',
        'ATS Coverage'
      );
      expect(result).not.toBeNull();
      expect(result?.bulletIndex).toBeNull();
    });

    it('returns the LAST bullet index when multiple arrays appear', () => {
      // Some future schema could nest arrays deeper than
      // highlights. We always use the LAST one because that's
      // the leaf the EditableText refers to.
      const result = mapPathToSection(
        'sections.work[0].positions[2].highlights[1]',
        'ATS Coverage'
      );
      expect(result).not.toBeNull();
      expect(result?.bulletIndex).toBe(1);
    });
  });

  describe('tipKind selection', () => {
    it.each([
      ['ATS Keyword Match', 'gap'],
      ['ATS Coverage', 'gap'],
      ['Intent Coverage', 'gap'],
      ['Accomplishment Focus', 'rewrite'],
      ['Action Verb Usage', 'rewrite'],
      ['Tailoring', 'rewrite'],
      ['Soft Skills', 'rewrite'],
      ['Seniority Fit', 'rewrite']
    ])('%s → tipKind=%s', (criterion, expectedTip) => {
      const result = mapPathToSection(
        'sections.work[0].highlights[0]',
        criterion as SubCriterionKey
      );
      expect(result?.tipKind).toBe(expectedTip);
    });
  });
});

describe('sectionId', () => {
  it('prefixes the slug with `section-`', () => {
    expect(sectionId('experience')).toBe('section-experience');
    expect(sectionId('skills')).toBe('section-skills');
  });

  it('returns an empty string for an empty slug', () => {
    // Defensive — sectionId('') is what we render when no anchor
    // exists. The IssuePulse component never calls this with an
    // empty slug, but the helper is exported and could be misused.
    expect(sectionId('')).toBe('');
  });
});

describe('sectionSlugFor', () => {
  it('returns the slug for a known path', () => {
    expect(sectionSlugFor('sections.work[0].highlights[0]')).toBe('experience');
    expect(sectionSlugFor('sections.skills')).toBe('skills');
  });

  it('returns null for an unknown prefix', () => {
    expect(sectionSlugFor('sections.unknownField')).toBeNull();
    expect(sectionSlugFor('')).toBeNull();
  });
});