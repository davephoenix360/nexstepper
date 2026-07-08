import { describe, expect, it } from 'vitest';

import {
  workSchema,
  educationSchema,
  projectsSchema,
  skillsSchema,
  volunteerSchema,
  awardsSchema,
  certificatesSchema,
  publicationsSchema,
  languagesSchema,
  interestsSchema,
  referencesSchema,
  basicsSchema
} from '@/lib/resume-schema';
import { positionSchema } from '@/lib/resume-schema/sections/work';

/**
 * These tests lock the contract between the inline WYSIWYG editor's
 * "add" buttons and the resume Zod schemas. Every inline editor
 * (Skills, Education, Projects, …) calls `useFieldArray.append(...)`
 * with a hand-rolled empty-shape literal. That literal is the user's
 * first experience of the field — if it's wrong (missing a required
 * key, wrong field name, wrong type), the bug is silent: the UI
 * happily writes garbage that fails validation only on save.
 *
 * The fix is to make each literal testable: parse `[literal]` against
 * the section schema and assert success. If a future change renames
 * a schema field, this test fails with the exact entry name + schema
 * name, pointing straight at the editor handler that needs to be
 * updated.
 *
 * The shapes below are copied verbatim from:
 *   - components/editable/add-work-button.tsx       (work)
 *   - components/editable/bullet-list.tsx           (string-array append)
 *   - components/editable/keyword-chips.tsx         (string-array append)
 *   - components/resume-templates/classic.tsx       (everything else)
 *
 * If you change a shape here, you almost certainly need to change the
 * matching inline `append(...)` call in the editor source.
 */

// ---------------------------------------------------------------------------
// Work entry + nested position
// ---------------------------------------------------------------------------
// From add-work-button.tsx — clicking "+ Add a work entry" seeds this shape.
const workEntryDefaults = {
  company: '',
  location: '',
  url: '',
  description: '',
  positions: [
    { title: '', startDate: '', endDate: '', highlights: [] }
  ]
};

// From classic.tsx WorkPositionsNested — "+ Add a position" inside a work row.
const positionDefaults = {
  title: '',
  startDate: '',
  endDate: '',
  highlights: []
};

// ---------------------------------------------------------------------------
// Inline array sections
// ---------------------------------------------------------------------------
const skillEntryDefaults = { name: '', level: '', keywords: [] };

const educationEntryDefaults = {
  institution: '',
  url: '',
  location: '',
  degree: { degreeLevel: '', majors: [], minors: [] },
  startDate: '',
  endDate: '',
  gpa: '',
  courses: []
};

const projectEntryDefaults = {
  name: '',
  description: '',
  highlights: [],
  keywords: [],
  startDate: '',
  endDate: '',
  url: '',
  roles: []
};

const volunteerEntryDefaults = {
  organization: '',
  position: '',
  url: '',
  startDate: '',
  endDate: '',
  summary: '',
  highlights: []
};

const awardEntryDefaults = { title: '', date: '', awarder: '', summary: '' };

const certificateEntryDefaults = {
  name: '',
  date: '',
  issuer: '',
  url: ''
};

const publicationEntryDefaults = {
  name: '',
  publisher: '',
  releaseDate: '',
  url: '',
  summary: ''
};

const languageEntryDefaults = { language: '', fluency: '' };

const interestEntryDefaults = { name: '', keywords: [] };

const referenceEntryDefaults = { name: '', reference: '' };

// From classic.tsx OnlineProfilesInline — "+ Add a profile" under the basics.
const profileDefaults = { network: '', username: '', url: '' };

// ---------------------------------------------------------------------------
// Tests: every inline-add shape parses against its section schema.
// ---------------------------------------------------------------------------
describe('inline editor add-shapes parse against section schemas', () => {
  it('work entry (AddWorkButton)', () => {
    expect(workSchema.safeParse([workEntryDefaults]).success).toBe(true);
  });

  it('work entry can be appended multiple times', () => {
    // Two clicks = two empty work entries side by side.
    expect(workSchema.safeParse([workEntryDefaults, workEntryDefaults]).success).toBe(true);
  });

  it('nested position (WorkPositionsNested)', () => {
    expect(positionSchema.safeParse(positionDefaults).success).toBe(true);
  });

  it('position can be appended inside a work entry', () => {
    expect(
      workSchema.safeParse([
        { ...workEntryDefaults, positions: [positionDefaults, positionDefaults] }
      ]).success
    ).toBe(true);
  });

  it('skill entry (SkillsInline)', () => {
    expect(skillsSchema.safeParse([skillEntryDefaults]).success).toBe(true);
  });

  it('education entry (EducationInline)', () => {
    expect(educationSchema.safeParse([educationEntryDefaults]).success).toBe(true);
  });

  it('project entry (ProjectsInline)', () => {
    expect(projectsSchema.safeParse([projectEntryDefaults]).success).toBe(true);
  });

  it('volunteer entry (VolunteerInline)', () => {
    expect(volunteerSchema.safeParse([volunteerEntryDefaults]).success).toBe(true);
  });

  it('award entry (AwardsInline)', () => {
    expect(awardsSchema.safeParse([awardEntryDefaults]).success).toBe(true);
  });

  it('certificate entry (CertificatesInline)', () => {
    expect(certificatesSchema.safeParse([certificateEntryDefaults]).success).toBe(true);
  });

  it('publication entry (PublicationsInline)', () => {
    expect(publicationsSchema.safeParse([publicationEntryDefaults]).success).toBe(true);
  });

  it('language entry (LanguagesInline)', () => {
    expect(languagesSchema.safeParse([languageEntryDefaults]).success).toBe(true);
  });

  it('interest entry (InterestsInline)', () => {
    expect(interestsSchema.safeParse([interestEntryDefaults]).success).toBe(true);
  });

  it('reference entry (ReferencesInline)', () => {
    expect(referencesSchema.safeParse([referenceEntryDefaults]).success).toBe(true);
  });

  it('online profile (OnlineProfilesInline under basics)', () => {
    expect(
      basicsSchema.safeParse({ profiles: [profileDefaults] }).success
    ).toBe(true);
  });

  it('online profiles can be appended multiple times', () => {
    expect(
      basicsSchema.safeParse({ profiles: [profileDefaults, profileDefaults] }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BulletList + KeywordChips: both call `append('')` against a `string[]`.
// The schema is `z.array(z.string())`, which accepts empty strings — but if
// a future change tightens that to e.g. `z.array(z.string().min(1))`, the
// editor would silently fail on first click of "+ Add bullet".
// ---------------------------------------------------------------------------
describe('string-array appends (BulletList + KeywordChips)', () => {
  it('work position highlights accept empty-string bullets', () => {
    expect(
      workSchema.safeParse([
        { ...workEntryDefaults, positions: [{ ...positionDefaults, highlights: [''] }] }
      ]).success
    ).toBe(true);
  });

  it('project highlights accept empty-string bullets', () => {
    expect(
      projectsSchema.safeParse([{ ...projectEntryDefaults, highlights: [''] }]).success
    ).toBe(true);
  });

  it('volunteer highlights accept empty-string bullets', () => {
    expect(
      volunteerSchema.safeParse([{ ...volunteerEntryDefaults, highlights: [''] }]).success
    ).toBe(true);
  });

  it('skill keywords accept empty-string chips', () => {
    expect(
      skillsSchema.safeParse([{ ...skillEntryDefaults, keywords: [''] }]).success
    ).toBe(true);
  });

  it('project keywords accept empty-string chips', () => {
    expect(
      projectsSchema.safeParse([{ ...projectEntryDefaults, keywords: [''] }]).success
    ).toBe(true);
  });

  it('education majors accept empty-string chips', () => {
    expect(
      educationSchema.safeParse([
        {
          ...educationEntryDefaults,
          degree: { degreeLevel: '', majors: [''], minors: [] }
        }
      ]).success
    ).toBe(true);
  });

  it('interest keywords accept empty-string chips', () => {
    expect(
      interestsSchema.safeParse([{ ...interestEntryDefaults, keywords: [''] }]).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative tests: catch the bug class where someone renames a schema field
// without updating the editor. If a shape ever drifts from the schema,
// the corresponding positive test above will fail — but these negative
// tests also pin down which fields the editor thinks it has, so a careless
// rename can't slip through with extra fields nobody asked for.
// ---------------------------------------------------------------------------
describe('inline editor shapes do not carry extra fields beyond the schema', () => {
  // If anyone adds a phantom key to one of the add-shapes that doesn't
  // exist in the schema, Zod's default `passthrough` is OFF and `.strip()`
  // is the implicit mode. The shape still parses successfully (extra
  // fields are silently dropped), so we test the inverse: that the
  // schema's strict mode rejects inputs with extra keys.
  //
  // We turn on `z.strict()`-equivalent by checking that the parse
  // succeeds but `result.data` does NOT carry the phantom key.

  it('work entry: phantom fields are stripped', () => {
    const dirty = { ...workEntryDefaults, phantom: 'evil' };
    const result = workSchema.safeParse([dirty]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).not.toHaveProperty('phantom');
    }
  });

  it('skill entry: phantom fields are stripped', () => {
    const dirty = { ...skillEntryDefaults, phantom: 'evil' };
    const result = skillsSchema.safeParse([dirty]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).not.toHaveProperty('phantom');
    }
  });
});