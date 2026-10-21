import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FormProvider,
  useForm,
  type FieldValues
} from 'react-hook-form';
import React from 'react';

import { JakeTemplate, JakeReadOnly } from '@/components/resume-templates/jake';
import { sampleResumeData } from '@/lib/resume-schema';
import type { Position, ResumeData } from '@/lib/resume-schema';

/**
 * Wraps children in a real `<FormProvider>` so the editor path can be
 * rendered. Same pattern as date-range.test.tsx / editable-text.test.tsx:
 * `<EditableText>` reads through `useController`, which throws without a
 * provider in scope.
 */
function FormHost({
  data,
  children
}: {
  data: ResumeData;
  children: React.ReactNode;
}) {
  const form = useForm<FieldValues>({ defaultValues: data });
  return <FormProvider {...form}>{children}</FormProvider>;
}

/**
 * Jake-template-specific tests. The shared template-meta / gallery /
 * print-hide tests cover the registry, picker, and print-hide UX;
 * the tests here pin the *visual identity* that makes Jake
 * recognisable on first glance.
 *
 *   - Centered small-caps NAME in the header (font-variant: small-caps)
 *   - Single-line contact row with inline icons (phone, email, web,
 *     linkedin, github)
 *   - 4-column coursework grid (the academic touch)
 *   - Section title with hairline rule UNDER it
 *   - "Leadership / Extracurricular" title (not the schema's
 *     default "Volunteer")
 *   - "Technical Skills" title (not the schema's default "Skills")
 *   - Project rows render with " | tech-stack" after the name
 *   - Each registered section is rendered at least once when the
 *     sample data has content (no Jake regression where one of the
 *     sections silently disappears)
 *
 * Render path: every test uses the read-only path (editable={false}
 * or JakeReadOnly) so the tests do not need a FormProvider. The
 * read-only path is the PDF / preview / print path; if the
 * template breaks visually there, the user sees it in the most
 * important surface.
 */

const JAKE_SAMPLE: ResumeData = {
  ...sampleResumeData,
  sections: {
    ...sampleResumeData.sections,
    basics: {
      ...sampleResumeData.sections.basics,
      profiles: [
        {
          network: 'GitHub',
          username: 'jake-g',
          url: 'https://github.com/jake-g'
        },
        {
          network: 'LinkedIn',
          username: 'jake-gutierrez',
          url: 'https://linkedin.com/in/jake-gutierrez'
        }
      ]
    },
    education: [
      {
        ...sampleResumeData.sections.education[0],
        // 8 courses — the 4-col grid expects this shape to
        // exercise all four columns.
        courses: [
          'Data Structures',
          'Algorithms',
          'Artificial Intelligence',
          'Systems Programming',
          'Software Methodology',
          'Database Management',
          'Internet Technology',
          'Computer Architecture'
        ]
      }
    ],
    volunteer: [
      {
        organization: 'Fraternity',
        position: 'President',
        url: '',
        startDate: '2020-01-01',
        endDate: '',
        summary: '',
        highlights: [
          'Achieved a 4 star fraternity ranking (highest possible).',
          'Managed executive board of 5 members and ran weekly meetings.'
        ]
      }
    ]
  }
};

function renderJake(data: ResumeData = JAKE_SAMPLE): string {
  return renderToStaticMarkup(
    React.createElement(JakeTemplate, { data, editable: false })
  );
}

describe('JakeTemplate — header identity', () => {
  it('renders the name in small caps (font-variant: small-caps)', () => {
    // The h1 has `[font-variant:small-caps]` — the brackets are
    // because it's an arbitrary-value Tailwind class. We slice
    // the className off the h1 and assert it contains the
    // small-caps fragment regardless of the surrounding arbitrary-
    // value syntax.
    const html = renderJake();
    const h1 = html.match(/<h1[^>]*data-testid="jake-name"[^>]*>/)?.[0];
    expect(h1).toBeTruthy();
    expect(h1).toContain('font-variant:small-caps');
    expect(h1).toContain('uppercase');
  });

  it('centers the header block (text-center)', () => {
    const html = renderJake();
    // The <header> wrapping the name + contact row has the
    // text-center class — a future contributor reverting to
    // left-align breaks the Jake look immediately.
    const header = html.match(/<header[^>]*>/)?.[0];
    expect(header).toBeTruthy();
    expect(header).toContain('text-center');
  });

  it('renders every contact channel in the inline contact row', () => {
    const html = renderJake();
    expect(html).toContain('rhendriks@mail.com');
    expect(html).toContain('(912) 555-4321');
    expect(html).toContain('jake-gutierrez'); // LinkedIn username
    expect(html).toContain('jake-g'); // GitHub username
  });

  it('strips the scheme prefix from the website URL', () => {
    // The "Globe" icon row shows the bare host (no http://) — the
    // LaTeX template prints it that way.
    const html = renderJake();
    expect(html).toContain('richardhendricks.example.com');
    // The "http://" prefix should NOT appear next to the website.
    expect(html).not.toContain('http://richardhendricks.example.com');
  });
});

describe('JakeTemplate — section chrome', () => {
  it('renders a hairline horizontal rule UNDER each section title', () => {
    // The section header has a `border-b` rule on the wrapping
    // <div> (we don't pin the entire markup — just the rule).
    // We check for `border-b` and `border-zinc-700` on the section
    // title wrapper, which is the Jake signature.
    const html = renderJake();
    expect(html).toMatch(/border-b\s+border-zinc-700/);
  });

  it('renames "Volunteer" to "Leadership / Extracurricular" in the header', () => {
    const html = renderJake();
    // The volunteer section's <h2> carries the Jake title.
    expect(html).toContain('Leadership / Extracurricular');
    expect(html).not.toMatch(/<h2[^>]*>\s*Volunteer\s*<\/h2>/);
  });

  it('renames "Skills" to "Technical Skills" in the header', () => {
    const html = renderJake();
    expect(html).toContain('Technical Skills');
    // The bare "Skills" title would appear as a standalone <h2>;
    // we don't expect that for Jake.
    expect(html).not.toMatch(/<h2[^>]*>\s*Skills\s*<\/h2>/);
  });
});

describe('JakeTemplate — coursework 4-column grid', () => {
  it('renders a 4-column grid for the education coursework', () => {
    const html = renderJake();
    // The grid container has the jake-coursework-grid testid.
    const grid = html.match(
      /<ul[^>]*data-testid="jake-coursework-grid"[^>]*>/
    )?.[0];
    expect(grid).toBeTruthy();
    expect(grid).toContain('grid-cols-4');
  });

  it('renders every course from education.courses in the grid', () => {
    const html = renderJake();
    for (const course of [
      'Data Structures',
      'Algorithms',
      'Artificial Intelligence',
      'Systems Programming',
      'Software Methodology',
      'Database Management',
      'Internet Technology',
      'Computer Architecture'
    ]) {
      expect(html).toContain(course);
    }
  });

  it('renders a "Relevant Coursework" sub-header above the grid', () => {
    const html = renderJake();
    expect(html).toContain('Relevant Coursework');
  });
});

describe('JakeTemplate — project rows', () => {
  it('renders the project name + tech stack joined with " | "', () => {
    // The Jake LaTeX template prints "Project Name | Python, Selenium"
    // on a single line. The comma-separated form is the literal
    // Jake signature.
    const html = renderToStaticMarkup(
      React.createElement(JakeTemplate, {
        data: {
          ...JAKE_SAMPLE,
          sections: {
            ...JAKE_SAMPLE.sections,
            projects: [
              {
                name: 'Gym Reservation Bot',
                description: '',
                highlights: [],
                keywords: ['Python', 'Selenium', 'Google Cloud Console'],
                startDate: '2021-01-01',
                endDate: '',
                url: '',
                roles: []
              }
            ]
          }
        },
        editable: false
      })
    );
    // The " | " separator is the visual signature. The test
    // asserts the full joined string is rendered.
    expect(html).toContain('Gym Reservation Bot');
    expect(html).toContain('Python, Selenium, Google Cloud Console');
    // We don't pin a single literal " | " because the markup may
    // split it across spans; the project name + keywords
    // appearing together is the proof.
  });
});

describe('JakeTemplate — read-only alias', () => {
  it('JakeReadOnly renders the same Jake-specific chrome', () => {
    const html = renderToStaticMarkup(
      React.createElement(JakeReadOnly, { data: JAKE_SAMPLE })
    );
    expect(html).toContain('data-testid="jake-name"');
    expect(html).toContain('font-variant:small-caps');
    expect(html).toContain('Relevant Coursework');
    expect(html).toContain('Technical Skills');
  });
});

/**
 * Regression: the date range (and the company location) used to render
 * TWICE on a work entry.
 *
 * The schema stores dates on positions, not on the work entry, so the
 * company row can only show a range by borrowing positions[0]'s. The
 * first implementation rendered a DateRange on the company row *and*
 * another on position 0's row, both bound to positions[0] — so every
 * single-position entry printed "2022 – Present" twice, stacked. The
 * user caught this in a design-lab screenshot.
 *
 * Each rendered DateRange emits exactly one `daterange-dash-readonly`
 * testid, so counting those is a direct assertion on "how many date
 * ranges did we print" — no fragile class-name or DOM-order checks.
 */
describe('JakeTemplate — work entries render each fact once', () => {
  // Scope to the Experience section ONLY, bounded by the next
  // `<section` that follows it. A document-wide count also picks up
  // the Education / Volunteer date ranges and makes these assertions
  // lie about what they measure; hard-coding "…up to section-projects"
  // breaks the moment a fixture empties projects.
  const experienceOf = (html: string) => {
    const start = html.indexOf('id="section-experience"');
    const nextSection = html.indexOf('<section ', start + 1);
    return html.slice(start, nextSection === -1 ? html.length : nextSection);
  };

  const countDashes = (html: string) =>
    (html.match(/data-testid="daterange-dash-readonly"/g) ?? []).length;

  const workWith = (positions: Position[]) =>
    renderToStaticMarkup(
      React.createElement(JakeTemplate, {
        data: {
          ...JAKE_SAMPLE,
          sections: {
            ...JAKE_SAMPLE.sections,
            projects: [],
            work: [
              {
                company: 'Solo Co',
                location: 'Austin, TX',
                url: '',
                description: '',
                positions
              }
            ]
          }
        },
        editable: false
      })
    );

  it('renders the date range exactly once for a single-position entry', () => {
    const html = workWith([
      {
        title: 'Engineer',
        startDate: '2021-03-01',
        endDate: '2024-08-01',
        highlights: ['Did the thing.']
      }
    ]);
    const exp = experienceOf(html);
    // Exactly one date range for one position. Before the fix the
    // company row AND position 0 both rendered a DateRange bound to
    // positions[0], so this was 2.
    expect(countDashes(exp)).toBe(1);
    // The range itself still renders — a count of 0 would satisfy the
    // assertion above while silently dropping the dates.
    expect(exp).toContain('2021');
    expect(exp).toContain('2024');
  });

  it('renders one date range per position for a multi-position entry', () => {
    const html = workWith([
      {
        title: 'Senior',
        startDate: '2022-03-01',
        endDate: '',
        highlights: []
      },
      {
        title: 'Junior',
        startDate: '2019-08-01',
        endDate: '2022-02-28',
        highlights: []
      }
    ]);
    // Two positions -> two ranges, and NOT a third borrowed range on
    // the company row.
    expect(countDashes(experienceOf(html))).toBe(2);
  });

  it('renders the company location once, not once per position', () => {
    const html = workWith([
      {
        title: 'Senior',
        startDate: '2022-03-01',
        endDate: '',
        highlights: []
      },
      {
        title: 'Junior',
        startDate: '2019-08-01',
        endDate: '2022-02-28',
        highlights: []
      }
    ]);
    // `location` is a company-level field. Two positions must not
    // print "Austin, TX" twice.
    const exp = experienceOf(html);
    expect((exp.match(/Austin, TX/g) ?? []).length).toBe(1);
  });

  it('places the location inline on the single-position row (original Jake)', () => {
    // The source PDF puts the city on the SAME line as the position
    // title, right-aligned: "Software Engineer Intern   City, State".
    // Assert that no </div> closes between the title and the location
    // — i.e. they are siblings inside one flex row, not stacked rows.
    const exp = experienceOf(
      workWith([
        {
          title: 'Engineer',
          startDate: '2021-03-01',
          endDate: '2024-08-01',
          highlights: []
        }
      ])
    );
    const titleAt = exp.indexOf('Engineer');
    const locAt = exp.indexOf('Austin, TX');
    expect(titleAt).toBeGreaterThan(-1);
    expect(locAt).toBeGreaterThan(titleAt);
    expect(exp.slice(titleAt, locAt)).not.toContain('</div>');
  });
});

/**
 * Regression: fields that rendered as literal text and were therefore
 * NOT editable in the WYSIWYG editor.
 *
 * The user reported being unable to edit things in the Jake template.
 * Auditing every `basics` / `work` / `education` field against the
 * schema turned up five fields that were printed as plain strings:
 *
 *   basics.phone / email / url       -> {phone}, {email}, {website}
 *   basics.location.address / city   -> joined into one address string
 *     / region / postalCode
 *   basics.profiles[].username       -> `linkedin.com/in/${username}`
 *   work[].location                  -> {w.location}
 *   education[].degree.minors        -> read-only only ("Minor: X"),
 *                                       no editor control at all
 *
 * Classic / Creative / Executive / Minimal bind all of these through
 * `header-lines.tsx` + `Field`, so Jake was the only template where
 * clicking your own phone number did nothing.
 *
 * These tests assert on the EDITOR render (`editable: true`) inside a
 * real `<FormProvider>`, because that is the surface the user
 * complained about. `EditableText` renders a `contenteditable` host
 * carrying `data-editable-path`, which is exactly the "you can click
 * this" contract — asserting on it directly is stronger than counting
 * strings.
 */
describe('JakeTemplate — editor exposes every field it renders', () => {
  const renderEditable = (data: ResumeData) =>
    renderToStaticMarkup(
      <FormHost data={data}>
        <JakeTemplate data={data} editable />
      </FormHost>
    );

  /** Is `path` reachable by clicking in the editor?
   *
   *  Three primitives bind values, and each tags its host differently:
   *    - `Field` (scalars)     -> data-testid="editable-<path>"
   *    - `FieldChips` (arrays) -> data-testid="keyword-chips-<path, dots→dashes>"
   *    - `DateRange`           -> data-testid="daterange-dash-<startPath>"
   *
   *  Asserting on the testids rather than on rendered strings is what
   *  makes this an editability test instead of a text test: a value
   *  can appear in the output and still be unclickable (that was the
   *  bug), and only a bound field carries one of these attributes. */
  const hasField = (html: string, path: string) =>
    html.includes(`data-testid="editable-${path}"`) ||
    html.includes(`data-testid="keyword-chips-${path.replace(/\./g, '-')}"`) ||
    html.includes(`data-testid="add-chip-${path.replace(/\./g, '-')}"`);

  const EDITABLE_FIXTURE: ResumeData = {
    ...sampleResumeData,
    sections: {
      ...sampleResumeData.sections,
      basics: {
        ...sampleResumeData.sections.basics,
        profiles: [
          { network: 'LinkedIn', username: 'ada', url: '' },
          { network: 'GitHub', username: 'ada-codes', url: '' }
        ]
      },
      work: [
        {
          company: 'Loom Systems',
          location: 'San Francisco, CA',
          url: '',
          description: '',
          positions: [
            {
              title: 'Senior Product Engineer',
              startDate: '2022-03-01',
              endDate: '',
              highlights: ['Shipped the thing.']
            }
          ]
        }
      ]
    }
  };

  it('binds every header contact field to an editable field', () => {
    const html = renderEditable(EDITABLE_FIXTURE);
    for (const p of [
      'sections.basics.name',
      'sections.basics.label',
      'sections.basics.phone',
      'sections.basics.email',
      'sections.basics.url'
    ]) {
      expect(hasField(html, p)).toBe(true);
    }
  });

  it('binds every address part to an editable field', () => {
    const html = renderEditable(EDITABLE_FIXTURE);
    for (const p of [
      'sections.basics.location.address',
      'sections.basics.location.city',
      'sections.basics.location.region',
      'sections.basics.location.postalCode'
    ]) {
      expect(hasField(html, p)).toBe(true);
    }
  });

  it('binds the LinkedIn and GitHub usernames to editable fields', () => {
    const html = renderEditable(EDITABLE_FIXTURE);
    // profiles[0] is LinkedIn, profiles[1] is GitHub.
    expect(hasField(html, 'sections.basics.profiles.0.username')).toBe(true);
    expect(hasField(html, 'sections.basics.profiles.1.username')).toBe(true);
  });

  it('binds the company location to an editable field', () => {
    const html = renderEditable(EDITABLE_FIXTURE);
    expect(hasField(html, 'sections.work.0.location')).toBe(true);
  });

  it('binds education degree level, majors AND minors', () => {
    const html = renderEditable(EDITABLE_FIXTURE);
    expect(hasField(html, 'sections.education.0.degree.degreeLevel')).toBe(
      true
    );
    expect(hasField(html, 'sections.education.0.degree.majors')).toBe(true);
    // minors rendered in read-only ("Minor: Mathematics") but had no
    // editor control — you could see a minor and not change it.
    expect(hasField(html, 'sections.education.0.degree.minors')).toBe(true);
  });

  it('still renders placeholders for EMPTY header fields (clickable targets)', () => {
    // The other half of the bug: even where a slot existed, it was
    // gated on `isSet(...)`, so a blank resume showed nothing to
    // click and the field could never be filled from the editor.
    const empty: ResumeData = {
      ...sampleResumeData,
      sections: {
        ...sampleResumeData.sections,
        basics: {
          name: '',
          label: '',
          email: '',
          phone: '',
          url: '',
          summary: '',
          location: {
            address: '',
            postalCode: '',
            city: '',
            countryCode: '',
            region: ''
          },
          profiles: []
        }
      }
    };
    const html = renderEditable(empty);
    expect(hasField(html, 'sections.basics.phone')).toBe(true);
    expect(hasField(html, 'sections.basics.email')).toBe(true);
    expect(hasField(html, 'sections.basics.location.city')).toBe(true);
    expect(hasField(html, 'sections.basics.label')).toBe(true);
  });

  it('does NOT bind a profile-username path when no profile exists', () => {
    // Nothing to bind to — there are no rows, and the escape hatch
    // to create one is the "+ Profile" button.
    const noProfiles: ResumeData = {
      ...sampleResumeData,
      sections: {
        ...sampleResumeData.sections,
        basics: { ...sampleResumeData.sections.basics, profiles: [] }
      }
    };
    const html = renderEditable(noProfiles);
    expect(html).not.toContain(
      'data-testid="editable-sections.basics.profiles.0.username"'
    );
    expect(html).toContain('data-testid="add-profile-0"');
  });

  /**
   * Regression: "+ Profile" appended a row that rendered nowhere.
   *
   * The header used to hardcode a LinkedIn slot and a GitHub slot and
   * look each up by matching `network` against the array. A newly
   * appended row is `{ network: '', username: '' }`, which matched
   * neither — so the click appended data (it would have saved) but put
   * no field on screen. The button looked broken.
   *
   * The contract being pinned: EVERY profile in the array gets a
   * visible, editable row. A blank-network row in particular must
   * expose BOTH `network` and `username`, because `network` is what
   * turns it into a usable LinkedIn / GitHub entry.
   */
  it('renders an editable row for EVERY profile, including blank ones', () => {
    const withBlank: ResumeData = {
      ...sampleResumeData,
      sections: {
        ...sampleResumeData.sections,
        basics: {
          ...sampleResumeData.sections.basics,
          profiles: [
            { network: 'LinkedIn', username: 'ada', url: '' },
            { network: '', username: '', url: '' },
            { network: 'GitHub', username: 'ada-codes', url: '' }
          ]
        }
      }
    };
    const html = renderEditable(withBlank);
    // A row exists for each index…
    for (const i of [0, 1, 2]) {
      expect(html).toContain(`data-testid="jake-profile-row-${i}"`);
      expect(html).toContain(
        `data-testid="editable-sections.basics.profiles.${i}.username"`
      );
    }
    // …and the blank row exposes its `network` too, otherwise the
    // user has no way to say "LinkedIn" and nothing to type into.
    expect(html).toContain(
      'data-testid="editable-sections.basics.profiles.1.network"'
    );
    // Recognised rows keep the clean URL-prefix form and hide the
    // redundant network field.
    expect(html).toContain('linkedin.com/in/');
    expect(html).not.toContain(
      'data-testid="editable-sections.basics.profiles.0.network"'
    );
    // Each row is individually removable.
    for (const i of [0, 1, 2]) {
      expect(html).toContain(`data-testid="remove-profile-${i}"`);
    }
  });

  it('flips a blank-network row to the pretty form once network is set', () => {
    // The user types "LinkedIn" into the network field; because
    // `mode.data` is `form.watch()`, the row re-renders as
    // icon + `linkedin.com/in/` + username and the network field goes
    // away. Verified here by rendering the post-typing state.
    const set: ResumeData = {
      ...sampleResumeData,
      sections: {
        ...sampleResumeData.sections,
        basics: {
          ...sampleResumeData.sections.basics,
          profiles: [{ network: 'LinkedIn', username: 'ada', url: '' }]
        }
      }
    };
    const html = renderEditable(set);
    expect(html).toContain('linkedin.com/in/');
    expect(html).not.toContain(
      'data-testid="editable-sections.basics.profiles.0.network"'
    );
  });

  /**
   * Regression: the per-row remove button didn't remove the row.
   *
   * `RemoveProfileButton` used to call `useFieldArray` for itself, so
   * N buttons meant N competing subscriptions on the same field name.
   * Each overwrote RHF's internal `_fields` state for
   * `sections.basics.profiles`, and `remove(i)` ran against clobbered
   * state: the row's values were unset but the array didn't shrink.
   * The user saw "the handle cleared but the field stayed", or
   * nothing at all.
   *
   * NOTE ON WHAT THIS TEST CAN AND CANNOT DO. `renderToStaticMarkup`
   * never dispatches a click, so no unit test in this file can prove
   * that clicking the button removes a row — that needs a real DOM.
   * It was verified by hand in a browser (add a profile, fill it,
   * click remove, assert the row and its fields are gone; and the
   * same for the last remaining profile).
   *
   * What this test *can* pin is the structural invariant that caused
   * it: exactly one `useFieldArray` for the whole list, and no
   * component other than `JakeProfilesEditor` touching the profile
   * field array. The editor/read-only split also keeps the read-only
   * path free of `useFormContext` — the existing read-only renders
   * below would throw outright if hooks leaked into that path.
   */
  it('declares exactly ONE useFieldArray for the profiles list', () => {
    // Source-level check, deliberately: the failure mode is *where*
    // the hook is declared, and no rendered-markup assertion can see
    // that. Two declarations on the same name is the bug.
    const src = readFileSync(
      join(process.cwd(), 'components/resume-templates/jake.tsx'),
      'utf8'
    );
    const declarations = src.match(/useFieldArray\(\{/g) ?? [];
    expect(declarations).toHaveLength(1);
    // …and the read-only half must not reach for form context.
    const readOnly = src.slice(
      src.indexOf('function JakeProfilesReadOnly'),
      src.indexOf('function JakeProfilesReadOnly') + 1200
    );
    expect(readOnly).not.toContain('useFieldArray');
    expect(readOnly).not.toContain('useFormContext');
  });

  it('renders one remove control per profile row', () => {
    const withThree: ResumeData = {
      ...sampleResumeData,
      sections: {
        ...sampleResumeData.sections,
        basics: {
          ...sampleResumeData.sections.basics,
          profiles: [
            { network: 'LinkedIn', username: 'a', url: '' },
            { network: 'GitHub', username: 'b', url: '' },
            { network: 'Mastodon', username: 'c', url: '' }
          ]
        }
      }
    };
    const html = renderEditable(withThree);
    for (const i of [0, 1, 2]) {
      expect(html).toContain(`data-testid="remove-profile-${i}"`);
    }
    // The add button indexes off the live row count.
    expect(html).toContain('data-testid="add-profile-3"');
  });

  it('keeps read-only output free of editor affordances', () => {
    const html = renderToStaticMarkup(
      React.createElement(JakeTemplate, {
        data: EDITABLE_FIXTURE,
        editable: false
      })
    );
    expect(html).not.toContain('data-testid="editable-');
    expect(html).not.toContain('keyword-chips-');
    expect(html).not.toContain('add-profile');
    // …while still printing the values. The prefix and the username
    // are separate spans by design (the prefix is static decoration,
    // the username is a Field), so assert each half rather than the
    // concatenated string.
    expect(html).toContain('linkedin.com/in/');
    expect(html).toContain('ada');
    expect(html).toContain('San Francisco, CA');
  });
});

describe('JakeTemplate — section coverage', () => {
  it('renders every section that has content (no silent dropouts)', () => {
    // Each of these section ids must appear in the rendered HTML
    // when the sample data has content for it. A future
    // contributor who forgets to render a section (e.g. drops the
    // <JakeSection> wrapper around Awards) would be caught here.
    // (Note: `projects` is empty in the sample so it's
    // intentionally NOT in this list — see the next test for the
    // empty-section-suppression assertion.)
    const html = renderJake();
    const expectedIds = [
      'section-summary',
      'section-education',
      'section-experience',
      'section-skills',
      'section-volunteer',
      'section-languages'
    ];
    for (const id of expectedIds) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('skips empty sections in the read-only path (no phantom headers)', () => {
    // `projects` is empty in the sample. The read-only path
    // suppresses the whole section (per the SmartSection
    // contract) — the section-* id should NOT appear.
    const html = renderJake();
    expect(html).not.toContain('id="section-projects"');
  });
});

describe('JakeTemplate — font wiring', () => {
  it('applies the serif font class to the article wrapper', () => {
    // We use Tailwind's `font-serif` rather than next/font/google
    // so the template renders correctly in vitest (which can't
    // load Google Fonts at test time) and in any browser without
    // a font-load delay. The class itself is the contract.
    const html = renderJake();
    const articleOpen = html.match(/<article[^>]*data-template="jake"[^>]*>/)?.[0];
    expect(articleOpen).toBeTruthy();
    expect(articleOpen).toContain('font-serif');
  });
});
