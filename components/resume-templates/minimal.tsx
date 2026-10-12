'use client';

/**
 * MinimalTemplate — ultra-clean, single-column, generous whitespace.
 *
 * Visual identity (vs Classic / Modern):
 *   - No section borders. No accent bars. No horizontal rules.
 *     Section headers are small-caps text with extra letter-spacing,
 *     2rem gap above each section.
 *   - Tighter name (h1) typography: 24pt instead of 26pt, with a 4px
 *     underline accent (very thin) that reads as a "designer's
 *     hairlines" choice rather than a corporate accent bar.
 *   - Smaller font density on body text (10.5pt) for a more
 *     editorial / magazine feel.
 *   - All sans-serif (Inter). Same font stack as Modern; the
 *     minimal feel comes from chrome, not typography.
 *   - Same single-column ATS-friendly layout. atsSafe: true.
 *
 * Architecture (per the meta + code split in ./meta.ts):
 *   - `meta` lives in `./meta.ts` as MINIMAL_TEMPLATE_META (data).
 *   - `Component` (this file) is the render code.
 *   - Uses the Field abstraction (./field.tsx) so the same JSX
 *     handles both the editor (editable=true) and the read-only /
 *     preview / PDF paths (editable=false).
 *
 * ATS safety note
 *   Single-column, no graphics, no tables, no icon-as-text.
 *   Section headings use standard English ("Experience",
 *   "Education") so parsers map cleanly. The 4px underline below
 *   the name is a `border-b` with a single solid color -- it
 *   shows up in PDF as a thin line, which most ATS parsers
 *   ignore (they treat it as a single decorative rule, not a
 *   multi-column layout).
 */

import * as React from 'react';

import { DateRange } from './date-range';
import {
  EditableNestedSection,
  EditableSection
} from './editable-section';
import {
  Field,
  FieldArea,
  FieldBullets,
  FieldChips,
  type FieldMode
} from './field';
import { SmartSection } from './section';
import { MINIMAL_TEMPLATE_META } from './meta';
import {
  EMPTY_EDUCATION,
  EMPTY_POSITION,
  EMPTY_PROJECT,
  EMPTY_SKILL,
  EMPTY_VOLUNTEER,
  EMPTY_WORK
} from '@/lib/resume-schema/defaults';
import type { ResumeData } from '@/lib/resume-schema';

/* -------------------------------------------------------------------------- */
/*  Root                                                                       */
/* -------------------------------------------------------------------------- */

export function MinimalTemplate({
  data,
  editable = false
}: {
  data: ResumeData;
  editable?: boolean;
}) {
  const accent = MINIMAL_TEMPLATE_META.accent;
  const mode: FieldMode = { editable, data };

  return (
    <div
      data-template="minimal"
      data-accent={accent}
      data-editable={editable || undefined}
      data-max-pages={MINIMAL_TEMPLATE_META.maxPages}
      data-page-size={MINIMAL_TEMPLATE_META.pageSize}
      className="mx-auto w-full max-w-[8.5in] bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0"
    >
      <div className="px-14 py-12 print:px-0 print:py-0">
        <MinimalHeader mode={mode} accent={accent} />
        <MinimalBody mode={mode} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                     */
/* -------------------------------------------------------------------------- */

function MinimalHeader({ mode, accent }: { mode: FieldMode; accent: string }) {
  return (
    <header className="mb-8">
      <Field
        mode={mode}
        path="sections.basics.name"
        as="h1"
        className="text-[24pt] font-light leading-tight tracking-tight text-zinc-900"
        placeholder="Your name"
      />
      {/* Hairline accent below the name -- 1px solid, narrow, reads as
          a designer's touch. Uses the template accent color via a CSS
          variable on the wrapper so the picker can override per-template. */}
      <div
        className="mt-2 h-[2px] w-12"
        style={{ background: `var(--accent-${accent}, #6366f1)` }}
        data-testid="minimal-name-accent"
      />
      <Field
        mode={mode}
        path="sections.basics.label"
        as="p"
        className="mt-3 text-[11pt] font-normal text-zinc-500"
        placeholder="Senior Software Engineer"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10pt] text-zinc-500">
        <Field
          mode={mode}
          path="sections.basics.email"
          placeholder="email@example.com"
        />
        <Field
          mode={mode}
          path="sections.basics.phone"
          placeholder="(555) 123-4567"
        />
        <Field
          mode={mode}
          path="sections.basics.url"
          placeholder="example.com"
        />
        <Field
          mode={mode}
          path="sections.basics.location.city"
          placeholder="City"
        />
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body                                                                       */
/* -------------------------------------------------------------------------- */

function MinimalBody({ mode }: { mode: FieldMode }) {
  return (
    <div className="space-y-[var(--resume-section-spacing)]">
      <SmartSection mode={mode} title="Summary" id="section-summary" sectionSlug="summary">
        <FieldArea
          mode={mode}
          path="sections.basics.summary"
          rows={4}
          className="text-[10.5pt] leading-relaxed text-zinc-700"
          placeholder="A couple of lines summarizing who you are."
        />
      </SmartSection>

      <SmartSection mode={mode} title="Experience" id="section-experience" sectionSlug="experience">
        <MinimalExperience mode={mode} />
      </SmartSection>

      <SmartSection mode={mode} title="Skills" id="section-skills" sectionSlug="skills">
        <MinimalSkills mode={mode} />
      </SmartSection>

      <SmartSection mode={mode} title="Education" id="section-education" sectionSlug="education">
        <MinimalEducation mode={mode} />
      </SmartSection>

      <SmartSection mode={mode} title="Projects" id="section-projects" sectionSlug="projects">
        <MinimalProjects mode={mode} />
      </SmartSection>

      <SmartSection mode={mode} title="Volunteer" id="section-volunteer" sectionSlug="volunteer">
        <MinimalVolunteer mode={mode} />
      </SmartSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Experience                                                                 */
/* -------------------------------------------------------------------------- */

function MinimalExperience({ mode }: { mode: FieldMode }) {
  if (!mode.editable && (mode.data.sections.work ?? []).length === 0)
    return null;
  const renderRow = (i: number) => {
    const w = mode.data.sections.work[i] ?? EMPTY_WORK;
    return (
      <div
        className="print:break-inside-avoid"
        data-testid={`work-entry-${i}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <Field
            mode={mode}
            path={`sections.work.${i}.company`}
            as="h3"
            className="text-[11pt] font-medium text-zinc-900"
            placeholder="Company"
          />
          <Field
            mode={mode}
            path={`sections.work.${i}.location`}
            className="text-[9.5pt] text-zinc-500"
            placeholder="Remote"
          />
        </div>
        {mode.editable ? (
          <EditableNestedSection
            path={`sections.work.${i}.positions`}
            addLabel="Add a position"
            testIdPrefix={`work-${i}-position`}
            defaultRow={EMPTY_POSITION}
          >
            {(j) => (
              <MinimalPositionRow
                mode={mode}
                workIndex={i}
                positionIndex={j}
              />
            )}
          </EditableNestedSection>
        ) : (
          ((w.positions ?? []) as Array<{ title?: string }>).map((p, j) => (
            <div key={`work-${i}-pos-${j}`} className="mt-1.5">
              <MinimalPositionRow
                mode={mode}
                workIndex={i}
                positionIndex={j}
              />
            </div>
          ))
        )}
      </div>
    );
  };
  return (
    <div className="space-y-5">
      {mode.editable ? (
        <EditableSection
          path="sections.work"
          addLabel="Add experience"
          testIdPrefix="work-entry"
          defaultRow={EMPTY_WORK}
        >
          {renderRow}
        </EditableSection>
      ) : (
        (mode.data.sections.work ?? []).map((_, i) => (
          <div key={`work-${i}`}>{renderRow(i)}</div>
        ))
      )}
    </div>
  );
}

function MinimalPositionRow({
  mode,
  workIndex,
  positionIndex
}: {
  mode: FieldMode;
  workIndex: number;
  positionIndex: number;
}) {
  const p =
    mode.data.sections.work[workIndex]?.positions?.[positionIndex] ??
    EMPTY_POSITION;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Field
          mode={mode}
          path={`sections.work.${workIndex}.positions.${positionIndex}.title`}
          as="p"
          className="text-[10.5pt] italic text-zinc-700"
          placeholder="Position"
        />
        <span className="text-[9.5pt] text-zinc-500">
          <DateRange
            editable={mode.editable}
            start={p.startDate ?? ''}
            end={p.endDate ?? ''}
            startPath={`sections.work.${workIndex}.positions.${positionIndex}.startDate`}
            endPath={`sections.work.${workIndex}.positions.${positionIndex}.endDate`}
          />
        </span>
      </div>
      <FieldBullets
        mode={mode}
        path={`sections.work.${workIndex}.positions.${positionIndex}.highlights`}
        className="mt-1 text-[10.5pt] text-zinc-700"
        itemClassName="leading-snug"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skills                                                                     */
/* -------------------------------------------------------------------------- */

function MinimalSkills({ mode }: { mode: FieldMode }) {
  if (!mode.editable && (mode.data.sections.skills ?? []).length === 0)
    return null;
  const renderRow = (i: number) => (
    <div
      className="flex items-baseline gap-2 text-[10.5pt]"
      data-testid={`skill-entry-${i}`}
    >
      <Field
        mode={mode}
        path={`sections.skills.${i}.name`}
        as="span"
        className="font-medium text-zinc-900"
        placeholder="Category"
      />
      <FieldChips
        mode={mode}
        path={`sections.skills.${i}.keywords`}
        chipClassName="bg-transparent border-zinc-200 px-2 py-0.5 text-[10pt]"
        size="xs"
      />
    </div>
  );
  return (
    <div className="space-y-1.5">
      {mode.editable ? (
        <EditableSection
          path="sections.skills"
          addLabel="Add skill category"
          testIdPrefix="skill-entry"
          defaultRow={EMPTY_SKILL}
        >
          {renderRow}
        </EditableSection>
      ) : (
        (mode.data.sections.skills ?? []).map((_, i) => (
          <div key={`skill-${i}`}>{renderRow(i)}</div>
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Education                                                                  */
/* -------------------------------------------------------------------------- */

function MinimalEducation({ mode }: { mode: FieldMode }) {
  if (!mode.editable && (mode.data.sections.education ?? []).length === 0)
    return null;
  const renderRow = (i: number) => {
    const e = mode.data.sections.education[i] ?? EMPTY_EDUCATION;
    return (
      <div
        className="print:break-inside-avoid"
        data-testid={`edu-entry-${i}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <Field
            mode={mode}
            path={`sections.education.${i}.institution`}
            as="h3"
            className="text-[11pt] font-medium text-zinc-900"
            placeholder="Institution"
          />
          <span className="text-[9.5pt] text-zinc-500">
            <DateRange
              editable={mode.editable}
              start={e.startDate ?? ''}
              end={e.endDate ?? ''}
              startPath={`sections.education.${i}.startDate`}
              endPath={`sections.education.${i}.endDate`}
            />
          </span>
        </div>
        <p className="mt-0.5 text-[10.5pt] text-zinc-700">
          <Field
            mode={mode}
            path={`sections.education.${i}.degree.degreeLevel`}
            placeholder="Degree"
          />
          <Field
            mode={mode}
            path={`sections.education.${i}.location`}
            className="ml-2 text-zinc-500"
            placeholder="Location"
          />
        </p>
        {/* Majors + minors -- joined inline. */}
        <Field
          mode={mode}
          path={`sections.education.${i}.degree.majors.0`}
          className="text-[10pt] text-zinc-600"
          placeholder="Major"
        />
      </div>
    );
  };
  return (
    <div className="space-y-3">
      {mode.editable ? (
        <EditableSection
          path="sections.education"
          addLabel="Add education"
          testIdPrefix="edu-entry"
          defaultRow={EMPTY_EDUCATION}
        >
          {renderRow}
        </EditableSection>
      ) : (
        (mode.data.sections.education ?? []).map((_, i) => (
          <div key={`edu-${i}`}>{renderRow(i)}</div>
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Projects                                                                   */
/* -------------------------------------------------------------------------- */

function MinimalProjects({ mode }: { mode: FieldMode }) {
  if (!mode.editable && (mode.data.sections.projects ?? []).length === 0)
    return null;
  const renderRow = (i: number) => {
    const p = mode.data.sections.projects[i] ?? EMPTY_PROJECT;
    return (
      <div
        className="print:break-inside-avoid"
        data-testid={`proj-entry-${i}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <Field
            mode={mode}
            path={`sections.projects.${i}.name`}
            as="h3"
            className="text-[11pt] font-medium text-zinc-900"
            placeholder="Project"
          />
          <span className="text-[9.5pt] text-zinc-500">
            <DateRange
              editable={mode.editable}
              start={p.startDate ?? ''}
              end={p.endDate ?? ''}
              startPath={`sections.projects.${i}.startDate`}
              endPath={`sections.projects.${i}.endDate`}
            />
          </span>
        </div>
        <FieldArea
          mode={mode}
          path={`sections.projects.${i}.description`}
          rows={2}
          className="mt-0.5 text-[10.5pt] text-zinc-700"
          placeholder="Short description"
          readOnlyAs="p"
        />
        <FieldBullets
          mode={mode}
          path={`sections.projects.${i}.highlights`}
          className="mt-1 text-[10.5pt] text-zinc-700"
        />
        <FieldChips
          mode={mode}
          path={`sections.projects.${i}.keywords`}
          chipClassName="bg-transparent border-zinc-200 px-2 py-0.5 text-[10pt]"
          size="xs"
        />
      </div>
    );
  };
  return (
    <div className="space-y-4">
      {mode.editable ? (
        <EditableSection
          path="sections.projects"
          addLabel="Add project"
          testIdPrefix="proj-entry"
          defaultRow={EMPTY_PROJECT}
        >
          {renderRow}
        </EditableSection>
      ) : (
        (mode.data.sections.projects ?? []).map((_, i) => (
          <div key={`proj-${i}`}>{renderRow(i)}</div>
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Volunteer                                                                  */
/* -------------------------------------------------------------------------- */

function MinimalVolunteer({ mode }: { mode: FieldMode }) {
  if (!mode.editable && (mode.data.sections.volunteer ?? []).length === 0)
    return null;
  const renderRow = (i: number) => {
    const v = mode.data.sections.volunteer[i] ?? EMPTY_VOLUNTEER;
    return (
      <div className="print:break-inside-avoid">
        <div className="flex items-baseline justify-between gap-3">
          <Field
            mode={mode}
            path={`sections.volunteer.${i}.organization`}
            as="h3"
            className="text-[11pt] font-medium text-zinc-900"
            placeholder="Organization"
          />
          <span className="text-[9.5pt] text-zinc-500">
            <DateRange
              editable={mode.editable}
              start={v.startDate ?? ''}
              end={v.endDate ?? ''}
              startPath={`sections.volunteer.${i}.startDate`}
              endPath={`sections.volunteer.${i}.endDate`}
            />
          </span>
        </div>
        <Field
          mode={mode}
          path={`sections.volunteer.${i}.position`}
          as="p"
          className="mt-0.5 text-[10.5pt] italic text-zinc-700"
          placeholder="Role"
        />
        <FieldArea
          mode={mode}
          path={`sections.volunteer.${i}.summary`}
          rows={2}
          className="mt-1 text-[10.5pt] text-zinc-700"
          placeholder="Summary"
          readOnlyAs="p"
        />
      </div>
    );
  };
  return (
    <div className="space-y-3">
      {mode.editable ? (
        <EditableSection
          path="sections.volunteer"
          addLabel="Add volunteer role"
          testIdPrefix="vol-entry"
          defaultRow={EMPTY_VOLUNTEER}
        >
          {renderRow}
        </EditableSection>
      ) : (
        (mode.data.sections.volunteer ?? []).map((_, i) => (
          <div key={`vol-${i}`}>{renderRow(i)}</div>
        ))
      )}
    </div>
  );
}
