import { describe, expect, it } from 'vitest';

import {
  resumeDataSchema,
  parseResumeData,
  blankResumeData,
  sampleResumeData,
  basicsSchema,
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
  referencesSchema
} from '@/lib/resume-schema';

/**
 * These tests lock the contract between the resume data shape the
 * editor mutates and the Zod schemas that validate it. The most
 * important property: every value the WYSIWYG editor can produce
 * must round-trip cleanly through `parseResumeData`. If a future
 * change adds a required field to a section without defaulting it,
 * `blankResumeData()` will fail to parse — and CI will surface that
 * before any user does.
 */

describe('parseResumeData', () => {
  it('accepts the blank resume envelope produced by blankResumeData()', () => {
    const result = parseResumeData(blankResumeData());
    expect(result.success).toBe(true);
  });

  it('accepts the demo resume envelope (sampleResumeData)', () => {
    const result = parseResumeData(sampleResumeData);
    expect(result.success).toBe(true);
  });

  it('fills in defaults when given a minimum-viable envelope', () => {
    // The whole point of the `.default(...)` chain is that callers
    // can hand in a partial shape and get a full one back. We rely
    // on this for the `defaultValues` we pass to react-hook-form
    // when the DB has never seen a revision yet.
    //
    // The minimum-viable input is `{ sections: { basics: {} } }`:
    // `sections` and `sections.basics` are both required (no
    // `.default()`), but every leaf under basics — and every other
    // section array — defaults to its empty shape.
    const result = parseResumeData({ sections: { basics: {} } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Untitled resume');
      expect(result.data.note).toBe('');
      expect(result.data.status).toBe('draft');
      expect(result.data.template).toBe('classic');
      expect(result.data.jobContext).toBeUndefined();
      expect(result.data.sections.work).toEqual([]);
      expect(result.data.sections.education).toEqual([]);
      expect(result.data.sections.skills).toEqual([]);
      expect(result.data.sections.basics.profiles).toEqual([]);
      expect(result.data.sections.basics.location).toEqual({
        address: '',
        postalCode: '',
        city: '',
        countryCode: '',
        region: ''
      });
    }
  });

  it('rejects an empty envelope (sections is required)', () => {
    // Pinning down the required-field contract: the `sections` block
    // is the resume body, no default — a top-level `{}` is invalid.
    // This catches the bug class where someone accidentally adds a
    // `.default({})` to `sections` and silently accepts malformed
    // inputs from the wire.
    expect(parseResumeData({}).success).toBe(false);
  });

  it('round-trips a minimally-populated basics block', () => {
    const result = resumeDataSchema.safeParse({
      sections: {
        basics: { name: 'A' }
      }
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections.basics.name).toBe('A');
      // All the basics children default to empty strings.
      expect(result.data.sections.basics.email).toBe('');
      expect(result.data.sections.basics.label).toBe('');
    }
  });

  it('rejects a non-URL value in basics.url', () => {
    const result = basicsSchema.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL value in work[*].url', () => {
    const result = workSchema.safeParse([{ url: 'still-not-a-url' }]);
    expect(result.success).toBe(false);
  });

  it('accepts an empty string as a URL (the editor uses "" as "not set")', () => {
    // The URL fields accept "" as the "not set" sentinel — the editor
    // writes an empty string when the user hasn't typed anything.
    expect(basicsSchema.safeParse({ url: '' }).success).toBe(true);
    expect(workSchema.safeParse([{ url: '' }]).success).toBe(true);
    expect(educationSchema.safeParse([{ url: '' }]).success).toBe(true);
    expect(projectsSchema.safeParse([{ url: '' }]).success).toBe(true);
    expect(certificatesSchema.safeParse([{ url: '' }]).success).toBe(true);
    expect(publicationsSchema.safeParse([{ url: '' }]).success).toBe(true);
    expect(volunteerSchema.safeParse([{ url: '' }]).success).toBe(true);
  });

  it('accepts a bare domain in basics.url (no scheme)', () => {
    // Users type `diepreyecd.dev` and expect it to work. The schema
    // accepts bare domains and the transform normalizes them to
    // `https://diepreyecd.dev` on the way in.
    const result = basicsSchema.safeParse({ url: 'diepreyecd.dev' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://diepreyecd.dev');
    }
  });

  it('accepts a www-prefixed bare domain and prepends https://', () => {
    const result = basicsSchema.safeParse({ url: 'www.diepreyecd.dev' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://www.diepreyecd.dev');
    }
  });

  it('accepts a full https:// URL and does not double-prefix', () => {
    const result = basicsSchema.safeParse({ url: 'https://diepreyecd.dev' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://diepreyecd.dev');
    }
  });

  it('accepts a full http:// URL', () => {
    const result = basicsSchema.safeParse({ url: 'http://example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('http://example.com');
    }
  });

  it('accepts a bare domain with a path', () => {
    const result = basicsSchema.safeParse({ url: 'example.com/about' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://example.com/about');
    }
  });

  it('rejects garbage that has no dot or TLD', () => {
    // `not-a-url`, `localhost`, `192.168.1.1` — all rejected because
    // there's no alphabetic 2+ char TLD.
    expect(basicsSchema.safeParse({ url: 'not-a-url' }).success).toBe(false);
    expect(basicsSchema.safeParse({ url: 'localhost' }).success).toBe(false);
    expect(basicsSchema.safeParse({ url: '192.168.1.1' }).success).toBe(false);
  });

  it('rejects a bare scheme like "https://" with no host', () => {
    expect(basicsSchema.safeParse({ url: 'https://' }).success).toBe(false);
  });

  it('bare-domain acceptance propagates to all section URL fields', () => {
    // The flexibleUrl helper is shared across every section — if the
    // acceptance contract drifts, this catches it.
    expect(workSchema.safeParse([{ url: 'example.com' }]).success).toBe(true);
    expect(educationSchema.safeParse([{ url: 'example.com' }]).success).toBe(true);
    expect(projectsSchema.safeParse([{ url: 'example.com' }]).success).toBe(true);
    expect(volunteerSchema.safeParse([{ url: 'example.com' }]).success).toBe(true);
    expect(certificatesSchema.safeParse([{ url: 'example.com' }]).success).toBe(true);
    expect(publicationsSchema.safeParse([{ url: 'example.com' }]).success).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = basicsSchema.safeParse({ email: 'no-at-sign' });
    expect(result.success).toBe(false);
  });

  it('accepts an empty string as an email', () => {
    // Empty email is valid — the user might not want to share one.
    expect(basicsSchema.safeParse({ email: '' }).success).toBe(true);
  });
});

describe('section schemas accept empty arrays', () => {
  // Every array-shaped section defaults to []. The editor relies on
  // this for the "+ Add" affordance: a fresh section starts empty,
  // the user clicks Add, we append one entry.
  const cases: Array<[string, (empty: never[]) => unknown]> = [
    ['work', (e) => workSchema.safeParse(e).success],
    ['education', (e) => educationSchema.safeParse(e).success],
    ['projects', (e) => projectsSchema.safeParse(e).success],
    ['skills', (e) => skillsSchema.safeParse(e).success],
    ['volunteer', (e) => volunteerSchema.safeParse(e).success],
    ['awards', (e) => awardsSchema.safeParse(e).success],
    ['certificates', (e) => certificatesSchema.safeParse(e).success],
    ['publications', (e) => publicationsSchema.safeParse(e).success],
    ['languages', (e) => languagesSchema.safeParse(e).success],
    ['interests', (e) => interestsSchema.safeParse(e).success],
    ['references', (e) => referencesSchema.safeParse(e).success]
  ];

  for (const [name, check] of cases) {
    it(`${name} accepts []`, () => {
      expect(check([] as never[])).toBe(true);
    });
  }
});

describe('section entry-level requirements', () => {
  // A handful of leaf fields are required (no `.default()`) on purpose:
  // they're the "primary key" of the entry. We pin them down here so
  // that adding a `.default('')` to a primary-key field would be a
  // visible test failure rather than a silent semantic change.

  it('skill entry requires a non-empty name', () => {
    // `name` is `z.string()` (no default). Empty string IS allowed —
    // an empty skill category is fine in the editor — but the field
    // must be present. The editor writes `{ name: '', ... }` and that
    // must parse.
    expect(skillsSchema.safeParse([{ name: '' }]).success).toBe(true);
    // Missing name entirely should fail.
    const result = skillsSchema.safeParse([{ level: 'Master' }]);
    expect(result.success).toBe(false);
  });

  it('language entry requires a non-empty language field', () => {
    expect(languagesSchema.safeParse([{ language: '' }]).success).toBe(true);
    expect(languagesSchema.safeParse([{ fluency: 'Native' }]).success).toBe(
      false
    );
  });

  it('interest entry requires a name', () => {
    expect(interestsSchema.safeParse([{ name: '' }]).success).toBe(true);
    expect(interestsSchema.safeParse([{ keywords: ['climbing'] }]).success).toBe(
      false
    );
  });

  it('profile entry requires a network', () => {
    // The basics profile schema: network has no default; username/url
    // default to ''. Empty network is allowed (the editor starts with
    // one) but missing network is not.
    expect(
      basicsSchema.safeParse({ profiles: [{ network: '' }] }).success
    ).toBe(true);
    expect(
      basicsSchema.safeParse({ profiles: [{ username: 'dave' }] }).success
    ).toBe(false);
  });
});