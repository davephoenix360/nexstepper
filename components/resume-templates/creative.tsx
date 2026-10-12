'use client';

/**
 * CreativeTemplate — color-forward, single-column, accent section rules.
 *
 * Visual identity (vs Classic / Modern / Minimal / Executive):
 *   - Rose accent color throughout (the accent CSS variable). The
 *     name gets a small colored square next to it; section headers
 *     have a thin colored rule; contact strip is in accent color.
 *   - Slightly more space around section breaks (2.5rem gap) for
 *     the breathing room designers expect.
 *   - Sans-serif body (Inter). Same font stack as Modern/Minimal;
 *     the creative feel comes from the color use + spacing, not
 *     typography.
 *   - Section headings are bold + uppercase + colored rule (heavier
 *     than Modern's accent bar) so the color is the dominant
 *     visual signal.
 *   - Same single-column ATS-friendly layout. atsSafe: true -- the
 *     color is just typography (no icon-as-text, no tables, no
 *     graphics). Workday / Greenhouse / Lever / Taleo ignore
 *     font color and treat a colored horizontal rule as a single
 *     decorative separator.
 *
 * Architecture (per the meta + code split in ./meta.ts):
 *   - `meta` lives in `./meta.ts` as CREATIVE_TEMPLATE_META.
 *   - `Component` (this file) is the render code.
 *   - Uses the Field abstraction so the same JSX handles both
 *     editor + read-only / preview / PDF paths.
 *
 * Color discipline: every accent use goes through the
 * `var(--accent-${accent}, fallback)` CSS variable so the
 * picker can override the accent per-template (and per-user, in
 * a future Pro feature). The fallback is the rose hex literal so
 * the template renders correctly without a parent CSS context.
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
import { CREATIVE_TEMPLATE_META } from './meta';
import {
  EMPTY_EDUCATION,
  EMPTY_POSITION,
  EMPTY_PROJECT,
  EMPTY_SKILL,
  EMPTY_VOLUNTEER,
  EMPTY_WORK
} from '@/lib/resume-schema/defaults';
import type { ResumeData } from '@/lib/resume-schema';
import { useSectionPrint } from '@/components/editable/use-section-print';
import { PrintPrefsBar } from '@/components/editable/print-prefs-bar';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Root                                                                       */
/* -------------------------------------------------------------------------- */

export function CreativeTemplate({
  data,
  editable = false
}: {
  data: ResumeData;
  editable?: boolean;
}) {
  const accent = CREATIVE_TEMPLATE_META.accent;
  const mode: FieldMode = { editable, data };

  return (
    <div
      data-template="creative"
      data-accent={accent}
      data-editable={editable || undefined}
      data-max-pages={CREATIVE_TEMPLATE_META.maxPages}
      data-page-size={CREATIVE_TEMPLATE_META.pageSize}
      className="mx-auto w-full max-w-[8.5in] bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0"
    >
      <div className="px-12 py-10 print:px-0 print:py-0">
        <CreativeHeader mode={mode} accent={accent} />
        <CreativeBody mode={mode} accent={accent} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                     */
/* -------------------------------------------------------------------------- */

function CreativeHeader({
  mode,
  accent
}: {
  mode: FieldMode;
  accent: string;
}) {
  return (
    <header className="mb-7">
      {/* Name with a colored square next to it -- the visual signature. */}
      <div className="flex items-center gap-3">
        <div
          className="size-3 shrink-0"
          style={{ background: `var(--accent-${accent}, #f43f5e)` }}
          data-testid="creative-name-square"
        />
        <Field
          mode={mode}
          path="sections.basics.name"
          as="h1"
          className="text-[28pt] font-bold leading-none tracking-tight text-zinc-900"
          placeholder="Your name"
        />
      </div>
      <Field
        mode={mode}
        path="sections.basics.label"
        as="p"
        className="mt-2 text-[12pt] font-medium uppercase tracking-[0.18em] text-zinc-700"
        placeholder="Senior Software Engineer"
      />
      {/* Contact strip in accent color. */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10pt] font-medium"
        style={{ color: `var(--accent-${accent}, #f43f5e)` }}
      >
        <Field
          mode={mode}
          path="sections.basics.email"
          placeholder="email@example.com"
        />
        <span className="text-zinc-400">·</span>
        <Field
          mode={mode}
          path="sections.basics.phone"
          placeholder="(555) 123-4567"
        />
        <span className="text-zinc-400">·</span>
        <Field
          mode={mode}
          path="sections.basics.url"
          placeholder="example.com"
        />
        <span className="text-zinc-400">·</span>
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

function CreativeBody({
  mode,
  accent
}: {
  mode: FieldMode;
  accent: string;
}) {
  return (
    <div className="space-y-[var(--resume-section-spacing)]">
      <CreativeSection mode={mode} title="Summary" accent={accent} id="section-summary" sectionSlug="summary">
        <FieldArea
          mode={mode}
          path="sections.basics.summary"
          rows={4}
          className="text-[11pt] leading-[1.55] text-zinc-700"
          placeholder="A couple of lines summarizing who you are."
        />
      </CreativeSection>

      <CreativeSection mode={mode} title="Experience" accent={accent} id="section-experience" sectionSlug="experience">
        <CreativeExperience mode={mode} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Skills" accent={accent} id="section-skills" sectionSlug="skills">
        <CreativeSkills mode={mode} accent={accent} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Education" accent={accent} id="section-education" sectionSlug="education">
        <CreativeEducation mode={mode} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Projects" accent={accent} id="section-projects" sectionSlug="projects">
        <CreativeProjects mode={mode} accent={accent} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Portfolio & Tools" accent={accent} id="section-projects" sectionSlug="projects">
        <CreativePortfolio mode={mode} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Volunteer" accent={accent} id="section-volunteer" sectionSlug="volunteer">
        <CreativeVolunteer mode={mode} />
      </CreativeSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section wrapper — bold uppercase + colored rule                            */
/* -------------------------------------------------------------------------- */

function CreativeSection({
  mode,
  title,
  accent,
  id,
  sectionSlug,
  children
}: {
  mode: FieldMode;
  title: string;
  accent: string;
  /**
   * Stable DOM id for the inline-issue surface (e.g.
   * "section-experience"). Optional — callers that don't pass
   * it get the legacy un-anchored header.
   */
  id?: string;
  /**
   * Print-hide slug from `SECTION_TABLE`. When provided, the
   * section gets `print:hidden opacity-60` when the slug is
   * in `data.print.hiddenSections`, and the editor's view
   * renders a `<PrintPrefsBar>` next to the title.
   */
  sectionSlug?: string;
  children: React.ReactNode;
}) {
  // Suppress the entire section (header + colored rule + content)
  // when the child rendered null in read-only mode. Without this
  // guard, "Portfolio & Tools" would appear in the PDF as a header
  // band with the colored accent rule but no body underneath.
  // Same null-detection convention as SmartSection.
  if (!mode.editable && (children === null || children === undefined)) {
    return null;
  }
  const { hidden } = useSectionPrint(sectionSlug ?? '__no_section__', mode);
  const sectionClassName = cn(
    sectionSlug && hidden && 'print:hidden opacity-60'
  );
  return (
    <section className={sectionClassName}>
      <div className="mb-3 flex items-center gap-3">
        <h2
          id={id}
          className="text-[11pt] font-bold uppercase tracking-[0.2em] text-zinc-900 print:break-after-avoid"
        >
          {title}
        </h2>
        <div
          className="h-[2px] flex-1"
          style={{ background: `var(--accent-${accent}, #f43f5e)` }}
          data-testid={`creative-rule-${title.toLowerCase().replace(/\s+/g, '-')}`}
        />
        {sectionSlug && mode.editable && (
          <PrintPrefsBar
            sectionSlug={sectionSlug}
            mode={mode}
            className="no-print"
          />
        )}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Experience                                                                 */
/* -------------------------------------------------------------------------- */

function CreativeExperience({ mode }: { mode: FieldMode }) {
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
            className="text-[12pt] font-bold text-zinc-900"
            placeholder="Company"
          />
          <Field
            mode={mode}
            path={`sections.work.${i}.location`}
            className="text-[10pt] text-zinc-500"
            placeholder="Location"
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
              <CreativePositionRow
                mode={mode}
                workIndex={i}
                positionIndex={j}
              />
            )}
          </EditableNestedSection>
        ) : (
          ((w.positions ?? []) as Array<{ title?: string }>).map((p, j) => (
            <div key={`work-${i}-pos-${j}`} className="mt-1.5">
              <CreativePositionRow
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

function CreativePositionRow({
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
          className="text-[11pt] font-medium text-zinc-700"
          placeholder="Position"
        />
        <span className="text-[10pt] text-zinc-500">
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
        className="mt-1 text-[11pt] text-zinc-700"
        itemClassName="leading-[1.55]"
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skills -- with accent-colored chips                                        */
/* -------------------------------------------------------------------------- */

function CreativeSkills({
  mode,
  accent
}: {
  mode: FieldMode;
  accent: string;
}) {
  if (!mode.editable && (mode.data.sections.skills ?? []).length === 0)
    return null;
  const renderRow = (i: number) => (
    <div
      className="flex items-baseline gap-2 text-[11pt]"
      data-testid={`skill-entry-${i}`}
    >
      <Field
        mode={mode}
        path={`sections.skills.${i}.name`}
        as="span"
        className="font-bold text-zinc-900"
        placeholder="Category"
      />
      <FieldChips
        mode={mode}
        path={`sections.skills.${i}.keywords`}
        // Creative's accent pills are part of the template's
        // identity, so it opts back in to the boxed rendering.
        variant="chips"
        chipClassName="px-2 py-0.5 text-[10pt] font-medium text-white"
        size="xs"
        // Inline style for the chip background -- uses the accent CSS
        // variable. Inline styles are necessary because FieldChips
        // composes its own chip className; we can't override the
        // background via className alone without changing the chip
        // primitive.
        chipStyle={{
          backgroundColor: `var(--accent-${accent}, #f43f5e)`,
          borderColor: `var(--accent-${accent}, #f43f5e)`
        }}
      />
    </div>
  );
  return (
    <div className="space-y-2">
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

function CreativeEducation({ mode }: { mode: FieldMode }) {
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
            className="text-[12pt] font-bold text-zinc-900"
            placeholder="Institution"
          />
          <span className="text-[10pt] text-zinc-500">
            <DateRange
              editable={mode.editable}
              start={e.startDate ?? ''}
              end={e.endDate ?? ''}
              startPath={`sections.education.${i}.startDate`}
              endPath={`sections.education.${i}.endDate`}
            />
          </span>
        </div>
        <p className="mt-0.5 text-[11pt] text-zinc-700">
          <Field
            mode={mode}
            path={`sections.education.${i}.degree.degreeLevel`}
            placeholder="Degree"
          />
          <Field
            mode={mode}
            path={`sections.education.${i}.degree.majors.0`}
            className="ml-1"
            placeholder="Major"
          />
          <Field
            mode={mode}
            path={`sections.education.${i}.location`}
            className="ml-2 text-zinc-500"
            placeholder="Location"
          />
        </p>
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

function CreativeProjects({
  mode,
  accent
}: {
  mode: FieldMode;
  accent: string;
}) {
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
            className="text-[12pt] font-bold text-zinc-900"
            placeholder="Project"
          />
          <span className="text-[10pt] text-zinc-500">
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
          className="mt-0.5 text-[11pt] text-zinc-700"
          placeholder="Short description"
          readOnlyAs="p"
        />
        <FieldBullets
          mode={mode}
          path={`sections.projects.${i}.highlights`}
          className="mt-1 text-[11pt] text-zinc-700"
        />
        <FieldChips
          mode={mode}
          path={`sections.projects.${i}.keywords`}
          variant="chips"
          chipClassName="border-zinc-300 px-2 py-0.5 text-[10pt]"
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
/*  Portfolio & Tools (mapped from sections.projects when description          */
/*  mentions portfolio URL; we reuse projects with a "Portfolio" framing for   */
/*  the visual section name. Kept simple -- reads the same shape.              */
/* -------------------------------------------------------------------------- */

function CreativePortfolio({ mode }: { mode: FieldMode }) {
  // Portfolio section reuses projects; if the user has 0 projects we
  // already render an empty Projects section above so this stays empty
  // too. Keeping the dispatch explicit so future changes to projects
  // don't accidentally duplicate content.
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Volunteer                                                                  */
/* -------------------------------------------------------------------------- */

function CreativeVolunteer({ mode }: { mode: FieldMode }) {
  if (!mode.editable && (mode.data.sections.volunteer ?? []).length === 0)
    return null;
  const renderRow = (i: number) => {
    const v = mode.data.sections.volunteer[i] ?? EMPTY_VOLUNTEER;
    return (
      <div key={`vol-${i}`} className="print:break-inside-avoid">
        <div className="flex items-baseline justify-between gap-3">
          <Field
            mode={mode}
            path={`sections.volunteer.${i}.organization`}
            as="h3"
            className="text-[12pt] font-bold text-zinc-900"
            placeholder="Organization"
          />
          <span className="text-[10pt] text-zinc-500">
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
          className="mt-0.5 text-[11pt] font-medium text-zinc-700"
          placeholder="Role"
        />
        <FieldArea
          mode={mode}
          path={`sections.volunteer.${i}.summary`}
          rows={2}
          className="mt-1 text-[11pt] text-zinc-700"
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
