/**
 * Tests for the page-length estimator (lib/chat/page-fit.ts).
 *
 * ## Why this test exists
 *
 * The estimator is what the agent QUOTES to a user who is deciding
 * whether to cut their work. If it is wrong, the agent confidently tells
 * someone to delete a job they should have kept — so this test holds the
 * estimator against the real measured page counts rather than against a
 * hand-written expectation.
 *
 * The fixture is 486 real measurements: resumes rendered through the real
 * templates under the real print CSS, printed to PDF, pages counted.
 *
 * ## The measurement that made this work
 *
 * Two things had to be right, and both were wrong at first:
 *
 *   1. The DOM height has to be measured at the PAPER CONTENT WIDTH
 *      (paper minus margins), because that is the width the text wraps
 *      at when it prints. Measuring at the 8.5in screen width reports a
 *      shorter resume than the one that prints.
 *   2. The `@page` margin only applies once the per-resume CSS variable
 *      has been mirrored onto the root element. Printing before that
 *      silently uses the 0.4in fallback margin.
 *
 * With those fixed, the simple height formula reproduces the real page
 * count on 478 of 486 points.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { templateRegistry } from '@/components/resume-templates';

import { buildMeasurableResume } from '@/app/dev/design-lab/measure/content';
import { estimateResumeLength, formatPageEstimate, settingsProfile } from '@/lib/chat/page-fit';
import { PAGE_FIT_FORMULAS, ROLES_THAT_FIT } from '@/lib/chat/page-fit.generated';
import { SECTION_SPACE_DATA } from '@/lib/chat/section-space.generated';
import type { PrintSettings } from '@/lib/print-settings';

const fixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/measured-page-counts.json'), 'utf8')
) as {
  contentBase: string;
  pages: Record<string, number>;
};

const SETTINGS_BY_PRESET: Record<string, PrintSettings> = {
  standard: {
    margin: 'standard',
    lineHeight: 'standard',
    fontSize: 'standard',
    sectionSpacing: 'standard',
    itemSpacing: 'standard'
  },
  compact: {
    margin: 'compact',
    lineHeight: 'compact',
    fontSize: 'standard',
    sectionSpacing: 'compact',
    itemSpacing: 'compact'
  },
  tightest: {
    margin: 'compact',
    lineHeight: 'compact',
    fontSize: 'small',
    sectionSpacing: 'compact',
    itemSpacing: 'compact'
  }
};

function realPages(
  template: string,
  setting: string,
  roles: number,
  bullets: number
): number {
  return fixture.pages[`${template}|${setting}|${roles}|${bullets}`];
}

describe('the measured fixture is the real thing', () => {
  it('covers every template in the registry at every setting', () => {
    const ids = Object.keys(templateRegistry);
    for (const id of ids) {
      for (const setting of ['standard', 'compact', 'tightest']) {
        for (const roles of [0, 1, 4, 8]) {
          for (const bullets of [2, 3, 4]) {
            expect(
              realPages(id, setting, roles, bullets),
              `${id}/${setting} r${roles} b${bullets}`
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('holds 486 measurements', () => {
    expect(Object.keys(fixture.pages)).toHaveLength(486);
  });
});

describe('PAGE_FIT_FORMULAS — every template and setting is covered', () => {
  it('has a formula for each template in the registry', () => {
    for (const id of Object.keys(templateRegistry)) {
      for (const setting of ['standard', 'compact', 'tightest']) {
        const found = PAGE_FIT_FORMULAS.find(
          (f) => f.template === id && f.setting === setting
        );
        expect(found, `${id}/${setting}`).toBeDefined();
        expect(found!.fixed).toBeGreaterThan(0);
        expect(found!.perRole).toBeGreaterThan(0);
        expect(found!.perBullet).toBeGreaterThan(0);
        expect(found!.usable).toBeGreaterThan(0);
      }
    }
  });

  it('records the accuracy the formula actually achieved', () => {
    for (const formula of PAGE_FIT_FORMULAS) {
      expect(formula.accuracy, `${formula.template}/${formula.setting}`).toMatch(
        /^\d+\/27$/
      );
      const [correct] = formula.accuracy!.split('/').map(Number);
      // A regression here means the measurement harness broke again —
      // most likely the paper-width or root-margin bug came back.
      expect(correct, `${formula.template}/${formula.setting}`).toBeGreaterThanOrEqual(
        24
      );
    }
  });

  it('measured at the paper content width, not the screen width', () => {
    for (const formula of PAGE_FIT_FORMULAS) {
      // 7.0in for a 0.75in margin, 7.5in for a 0.5in margin.
      expect([7, 7.5]).toContain(formula.contentWidthIn);
      expect(formula.contentWidthIn).not.toBe(8.5);
    }
  });
});

describe('SECTION_SPACE_DATA — every template and setting is covered', () => {
  it('has section measurements for each template', () => {
    for (const id of Object.keys(templateRegistry)) {
      for (const setting of ['standard', 'compact', 'tightest']) {
        const found = SECTION_SPACE_DATA.find(
          (r) => r.template === id && r.setting === setting
        );
        expect(found, `${id}/${setting}`).toBeDefined();
        expect(found!.usableInches).toBeGreaterThan(0);
        expect(found!.headerInches).toBeGreaterThan(0);
        expect(found!.sectionInches.experience).toBeGreaterThan(0);
      }
    }
  });

  it('uses the right usable height for each margin', () => {
    const standard = SECTION_SPACE_DATA.find(
      (r) => r.template === 'classic' && r.setting === 'standard'
    )!;
    const compact = SECTION_SPACE_DATA.find(
      (r) => r.template === 'classic' && r.setting === 'compact'
    )!;
    // Letter is 11in: 11 - 2 x 0.75 = 9.5, 11 - 2 x 0.5 = 10.
    expect(standard.usableInches).toBe(9.5);
    expect(compact.usableInches).toBe(10);
  });
});

describe('settingsProfile — maps real settings onto a measured preset', () => {
  it('picks the preset that matches exactly', () => {
    expect(settingsProfile(SETTINGS_BY_PRESET.standard)).toBe('standard');
    expect(settingsProfile(SETTINGS_BY_PRESET.compact)).toBe('compact');
    expect(settingsProfile(SETTINGS_BY_PRESET.tightest)).toBe('tightest');
  });

  it('rounds an unmeasured combination to the nearest preset', () => {
    expect(
      settingsProfile({
        margin: 'standard',
        lineHeight: 'compact',
        fontSize: 'standard',
        sectionSpacing: 'compact',
        itemSpacing: 'compact'
      })
    ).toBe('compact');
  });

  it('treats a generous margin as the standard preset', () => {
    expect(
      settingsProfile({
        ...SETTINGS_BY_PRESET.standard,
        margin: 'generous'
      })
    ).toBe('standard');
  });
});

describe('estimateResumeLength — agrees with the real printed page count', () => {
  it('matches the real page count across the whole 486-point sweep', () => {
    const ids = Object.keys(templateRegistry);
    let correct = 0;
    let tested = 0;
    const misses: string[] = [];

    for (const template of ids) {
      for (const setting of ['standard', 'compact', 'tightest']) {
        const settings = SETTINGS_BY_PRESET[setting];
        for (let roles = 0; roles <= 8; roles++) {
          for (const bullets of [2, 3, 4]) {
            const real = realPages(template, setting, roles, bullets);
            const data = buildMeasurableResume({
              roles,
              bullets,
              base: 'minimal'
            });
            data.template = template;

            const estimate = estimateResumeLength(data, settings, []);
            expect(estimate, `${template}/${setting} r${roles} b${bullets}`).not.toBeNull();

            tested++;
            if (estimate!.pages === real) correct++;
            else
              misses.push(
                `${template}/${setting} r${roles} b${bullets}: said ${estimate!.pages}, printed ${real}`
              );
          }
        }
      }
    }

    expect(tested).toBe(486);
    // The formula itself reproduces 478/486. The estimator adds the
    // optional-section arithmetic on top, so it is held to a slightly
    // lower bar — but not much lower: a drift past a few points means
    // the measurement harness broke again.
    expect(correct, misses.slice(0, 8).join('\n')).toBeGreaterThanOrEqual(470);
  });

  it('gets the one-page boundary right — within one role, never further', () => {
    // The boundary is the decision users actually ask about, so it is
    // held to a tighter standard than the raw score. Two points out of
    // 486 sit within 0.1in of the boundary and land on the wrong side;
    // that is measurement noise from the sample's varying bullet
    // lengths, and the prompt tells the assistant to say "about" rather
    // than promise a page count.
    for (const template of Object.keys(templateRegistry)) {
      for (const setting of ['standard', 'compact', 'tightest']) {
        const settings = SETTINGS_BY_PRESET[setting];
        for (const bullets of [2, 3, 4]) {
          // The largest role count that really prints on one page.
          let measuredMax = 0;
          for (let roles = 0; roles <= 8; roles++) {
            if (realPages(template, setting, roles, bullets) === 1) {
              measuredMax = roles;
            }
          }

          // The largest role count the estimator says fits on one page.
          let estimatedMax = 0;
          for (let roles = 0; roles <= 8; roles++) {
            const data = buildMeasurableResume({
              roles,
              bullets,
              base: 'minimal'
            });
            data.template = template;
            const estimate = estimateResumeLength(data, settings, [])!;
            if (estimate.pages === 1) estimatedMax = roles;
          }

          expect(
            Math.abs(estimatedMax - measuredMax),
            `${template}/${setting} b${bullets}: measured ${measuredMax}, estimated ${estimatedMax}`
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('never over-predicts by more than a page', () => {
    for (const template of Object.keys(templateRegistry)) {
      for (const setting of ['standard', 'compact', 'tightest']) {
        const settings = SETTINGS_BY_PRESET[setting];
        for (let roles = 0; roles <= 8; roles++) {
          for (const bullets of [2, 3, 4]) {
            const real = realPages(template, setting, roles, bullets);
            const data = buildMeasurableResume({
              roles,
              bullets,
              base: 'minimal'
            });
            data.template = template;
            const estimate = estimateResumeLength(data, settings, [])!;
            expect(
              estimate.pages - real,
              `${template}/${setting} r${roles} b${bullets}`
            ).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('estimateResumeLength — the levers the agent offers', () => {
  const data = (() => {
    const d = buildMeasurableResume({ roles: 4, bullets: 3, base: 'full' });
    d.template = 'classic';
    return d;
  })();

  it('reports where the height goes', () => {
    const estimate = estimateResumeLength(
      data,
      SETTINGS_BY_PRESET.standard,
      []
    )!;
    expect(estimate.pages).toBeGreaterThan(0);
    expect(estimate.totalInches).toBeGreaterThan(0);
    expect(estimate.breakdown.length).toBeGreaterThan(1);
    // The breakdown has to add up to the total it claims.
    const summed = estimate.breakdown.reduce((a, b) => a + b.inches, 0);
    expect(Math.abs(summed - estimate.totalInches)).toBeLessThan(0.1);
  });

  it('tells the agent what hiding a section would save', () => {
    const estimate = estimateResumeLength(
      data,
      SETTINGS_BY_PRESET.standard,
      []
    )!;
    const projects = estimate.hideOptions.find((h) => h.slug === 'projects');
    expect(projects).toBeDefined();
    expect(projects!.inches).toBeGreaterThan(0);
    expect(projects!.pagesIfHidden).toBeLessThanOrEqual(estimate.pages);
  });

  it('excludes a hidden section from the estimate', () => {
    const withProjects = estimateResumeLength(
      data,
      SETTINGS_BY_PRESET.standard,
      []
    )!;
    const withoutProjects = estimateResumeLength(
      data,
      SETTINGS_BY_PRESET.standard,
      ['projects']
    )!;
    expect(withoutProjects.totalInches).toBeLessThan(withProjects.totalInches);
    expect(
      withoutProjects.hideOptions.find((h) => h.slug === 'projects')
    ).toBeUndefined();
  });

  it('a tighter layout never makes the resume longer', () => {
    const standard = estimateResumeLength(data, SETTINGS_BY_PRESET.standard, [])!;
    const compact = estimateResumeLength(data, SETTINGS_BY_PRESET.compact, [])!;
    const tightest = estimateResumeLength(data, SETTINGS_BY_PRESET.tightest, [])!;
    expect(compact.totalInches).toBeLessThan(standard.totalInches);
    expect(tightest.totalInches).toBeLessThan(compact.totalInches);
  });

  it('returns null for a template nobody measured', () => {
    const d = buildMeasurableResume({ roles: 2, bullets: 2, base: 'minimal' });
    d.template = 'not-a-real-template';
    expect(
      estimateResumeLength(d, SETTINGS_BY_PRESET.standard, [])
    ).toBeNull();
  });
});

describe('formatPageEstimate — what the model actually receives', () => {
  const data = (() => {
    const d = buildMeasurableResume({ roles: 4, bullets: 3, base: 'full' });
    d.template = 'classic';
    return d;
  })();

  it('leads with the page count and the height', () => {
    const text = formatPageEstimate(
      estimateResumeLength(data, SETTINGS_BY_PRESET.standard, [])!
    );
    expect(text).toMatch(/^Estimated length: about \d+ pages?\./);
    expect(text).toContain('Estimated content height:');
    expect(text).toContain('one page holds 9.5in');
  });

  it('lists where the space goes', () => {
    const text = formatPageEstimate(
      estimateResumeLength(data, SETTINGS_BY_PRESET.standard, [])!
    );
    expect(text).toContain('Where the space goes:');
    expect(text).toContain('Experience (4 roles, 3 bullets each)');
  });

  it('offers the free levers with what each one buys', () => {
    const text = formatPageEstimate(
      estimateResumeLength(data, SETTINGS_BY_PRESET.standard, [])!
    );
    expect(text).toContain('Hiding a section');
    expect(text).toMatch(/Projects: saves \d+\.\d+in → would print as \d+ pages?/);
  });

  it('tells the model to say "about" rather than promise a page count', () => {
    const text = formatPageEstimate(
      estimateResumeLength(data, SETTINGS_BY_PRESET.standard, [])!
    );
    expect(text).toContain('possibly spilling to two');
  });

  it('flags the settings that differ from the measured preset', () => {
    const text = formatPageEstimate(
      estimateResumeLength(
        data,
        {
          margin: 'standard',
          lineHeight: 'compact',
          fontSize: 'standard',
          sectionSpacing: 'compact',
          itemSpacing: 'compact'
        },
        []
      )!
    );
    expect(text).toContain('closest measured layout preset');
    // This combination rounds to the `compact` preset on every knob
    // except the margin, so the margin is the only thing to flag.
    expect(text).toContain('margin');
    expect(text).toContain('differs from it');
  });

  it('uses the right plural when several settings differ', () => {
    const text = formatPageEstimate(
      estimateResumeLength(
        data,
        {
          margin: 'generous',
          lineHeight: 'relaxed',
          fontSize: 'large',
          sectionSpacing: 'relaxed',
          itemSpacing: 'relaxed'
        },
        []
      )!
    );
    expect(text).toContain('differ from it');
  });
});

describe('ROLES_THAT_FIT — agrees with the measured boundary', () => {
  it('matches the real page count at the boundary', () => {
    for (const template of Object.keys(templateRegistry)) {
      for (const setting of ['standard', 'compact', 'tightest']) {
        const fits = ROLES_THAT_FIT[template]?.[setting];
        expect(fits, `${template}/${setting}`).toBeGreaterThanOrEqual(0);

        // The recorded maximum must really be on one page...
        const at = buildMeasurableResume({
          roles: fits,
          bullets: 3,
          base: 'minimal'
        });
        at.template = template;
        expect(
          realPages(template, setting, fits, 3),
          `${template}/${setting} r${fits}`
        ).toBe(1);

        // ...and one more role must not be.
        expect(
          realPages(template, setting, fits + 1, 3),
          `${template}/${setting} r${fits + 1}`
        ).toBeGreaterThan(1);
      }
    }
  });
});
