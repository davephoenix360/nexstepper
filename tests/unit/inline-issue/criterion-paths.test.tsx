/**
 * The paths the inline-issue surface hands to the editor must be
 * paths the editor RENDERS.
 *
 * ## The bug this pins
 *
 * `defaultPathForCriterion` used to return the **bracketed**
 * JSON-Resume spelling:
 *
 *   sections.work[0].positions[0].highlights[0]
 *
 * while every template binds its fields with **dotted** paths:
 *
 *   sections.work.0.positions.0.highlights.0
 *
 * The editor renders `data-testid="editable-{path}"`, so the lookup
 * `[data-testid="editable-sections.work[0].positions[0].highlights[0]"]`
 * found nothing. `readLeafText()` returned an empty string, the old
 * popover never opened, and the user was told:
 *
 *   "The bullet here is empty — add some content to this section
 *    first, then we can rewrite it."
 *
 * about a bullet that was full. That is the reported "clicking
 * Rewrite with AI does nothing" bug, and it affected every dimension
 * bar on the scorecard. That popover is retired; these tests keep the
 * surviving Tip/pulse anchor honest.
 *
 * ## The rule
 *
 * **A path is only useful if the editor renders exactly that testid.**
 * These tests render a real template and assert it — so the two cannot
 * drift apart again.
 *
 * They also pin the second defect: the target must be the leaf whose
 * text the criterion actually READS. Anchoring the first work bullet
 * does not explain a dimension that measures the summary.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { FormProvider, useForm, type FieldValues } from 'react-hook-form';

import { ClassicTemplate } from '@/components/resume-templates/classic';
import { JakeTemplate } from '@/components/resume-templates/jake';
import { defaultPathForCriterion, defaultPathForSkill } from '@/lib/inline-issue/criterion-to-path';
import { mapPathToSection } from '@/lib/inline-issue/map-path-to-section';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';
import type { ResumeData } from '@/lib/resume-schema';

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

function renderClassic(data: ResumeData): string {
  return renderToStaticMarkup(
    <FormHost data={data}>
      <ClassicTemplate data={data} editable />
    </FormHost>
  );
}

function renderJake(data: ResumeData): string {
  return renderToStaticMarkup(
    <FormHost data={data}>
      <JakeTemplate data={data} editable />
    </FormHost>
  );
}

/** Every criterion the scorecard can show. */
const CRITERIA = [
  'ATS Keyword Match',
  'ATS Similarity',
  'ATS Keyword Match',
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
] as const;

describe('the inline-issue paths exist in the editor', () => {
  it('every criterion resolves to a rendered editable field', () => {
    const data = gallerySampleResumeData;
    const jake = renderJake(data);

    for (const criterion of CRITERIA) {
      const path = defaultPathForCriterion(criterion);
      const testid = `data-testid="editable-${path}"`;
      expect(
        jake.includes(testid),
        `criterion "${criterion}" points at "${path}", which no template renders`
      ).toBe(true);
    }
  });

  it('the skill path resolves to a rendered editable field', () => {
    const path = defaultPathForSkill();
    const testid = `data-testid="editable-${path}"`;
    const jake = renderJake(gallerySampleResumeData);
    expect(
      jake.includes(testid),
      `the skill path "${path}" is not rendered by the editor`
    ).toBe(true);
  });

  it('uses dotted paths, the spelling the editor binds', () => {
    // A bracketed path is a valid JSON-Resume path and renders
    // nowhere. This is the exact shape that broke the original
    // inline surface.
    for (const criterion of CRITERIA) {
      expect(defaultPathForCriterion(criterion)).not.toMatch(/\[\d+\]/);
    }
    expect(defaultPathForSkill()).not.toMatch(/\[\d+\]/);
  });
});

describe('each criterion points at the leaf it reads', () => {
  it('Tailoring and Seniority Fit point at the summary', () => {
    // Tailoring measures the JD title's vocabulary IN THE SUMMARY.
    expect(defaultPathForCriterion('Tailoring')).toBe('sections.basics.summary');
    expect(defaultPathForCriterion('Seniority Fit')).toBe('sections.basics.summary');
  });

  it('Role Fit points at the headline', () => {
    // Role Fit compares the JD title against the candidate's titles —
    // and the headline is the one written for this application.
    expect(defaultPathForCriterion('Role Fit')).toBe('sections.basics.label');
  });

  it('the skill criteria point at the skills block', () => {
    expect(defaultPathForCriterion('ATS Keyword Match')).toBe('sections.skills.0.keywords.0');
    expect(defaultPathForCriterion('Intent Coverage')).toBe('sections.skills.0.keywords.0');
  });
});

describe('mapPathToSection reads dotted paths', () => {
  it('resolves a dotted bullet path to its section and bullet index', () => {
    const target = mapPathToSection(
      'sections.work.0.positions.0.highlights.0',
      'ATS Keyword Match'
    );
    expect(target).not.toBeNull();
    expect(target!.sectionSlug).toBe('experience');
    expect(target!.bulletIndex).toBe(0);
  });

  it('still resolves the bracketed spelling', () => {
    const target = mapPathToSection(
      'sections.work[0].positions[0].highlights[0]',
      'ATS Keyword Match'
    );
    expect(target).not.toBeNull();
    expect(target!.sectionSlug).toBe('experience');
    expect(target!.bulletIndex).toBe(0);
  });

  it('reports no bullet index for a non-bullet leaf', () => {
    const target = mapPathToSection('sections.basics.summary', 'Tailoring');
    expect(target).not.toBeNull();
    expect(target!.bulletIndex).toBeNull();
  });
});
