'use client';

/**
 * ModernTemplate — the second template in the registry.
 *
 * Visual identity (vs Classic):
 *   - Sans-serif throughout (Inter). Classic uses the system stack
 *     with serif accents; Modern is flat sans for a contemporary
 *     look.
 *   - Bold uppercase section headers with a 3px accent bar on the
 *     left. Classic uses small caps with a hairline border-bottom.
 *   - Slightly more vertical breathing room between sections
 *     (1.75rem vs 1.5rem).
 *   - Same single-column ATS-friendly layout. atsSafe: true.
 *
 * Architecture (per the meta + code split in ./meta.ts):
 *   - `meta` lives in `./meta.ts` as MODERN_TEMPLATE_META (data).
 *   - `Component` (this file) is the render code. The picker /
 *     pricing / PDF cache pipeline reads only the meta.
 *
 * Read-only / print / PDF render:
 *   Every section renderer uses `<Field>` (and FieldArea, FieldChips,
 *   FieldBullets) instead of `EditableText` etc. In the editor
 *   (editable=true) Field forwards to the RHF-bound editor primitive,
 *   which renders the click-to-edit affordances the WYSIWYG editor
 *   expects. Outside the editor (editable=false), Field renders
 *   plain `<span>` / `<p>` / `<ul>` from `data` directly — no form
 *   context needed, no `X` / `+ Add` affordances leaking into print.
 *   See `./field.tsx` for the contract.
 *
 * Why we copy the section renderers instead of extracting them:
 *   We considered pulling `SkillsInline` / `EducationInline` etc. out
 *   of `classic.tsx` into a shared `section-renderers.tsx` module
 *   that both templates would consume. We didn't, because:
 *     - The two templates' section chrome differs enough (bold
 *       uppercase vs small caps, accent bar vs border-bottom) that
 *       extracting a primitive with a `variant` prop would be more
 *       config surface than the section renderers themselves.
 *     - The duplication is bounded — about 600 lines of mostly
 *       declarative data reads. The next refactor (when we have 4+
 *       templates) is to extract just the data-binding shape with
 *       a `style: 'classic' | 'modern'` variant, not full component
 *       extraction.
 *
 *   When a third template is added, this decision is revisited.
 */

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ContactLineEditable, LocationLineEditable } from './header-lines';
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
import { MODERN_TEMPLATE_META } from './meta';
import {
  EMPTY_EDUCATION,
  EMPTY_INTEREST,
  EMPTY_LANGUAGE,
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

export function ModernTemplate({
  data,
  editable = false
}: {
  data: ResumeData;
  editable?: boolean;
}) {
  const accent = MODERN_TEMPLATE_META.accent;
  const mode: FieldMode = { editable, data };

  return (
    <div
      data-template="modern"
      data-accent={accent}
      data-editable={editable || undefined}
      data-max-pages={MODERN_TEMPLATE_META.maxPages}
      data-page-size={MODERN_TEMPLATE_META.pageSize}
      className="mx-auto w-full max-w-[8.5in] bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0"
    >
      <div className="px-12 py-10 print:px-0 print:py-0">
        <ModernHeader mode={mode} accent={accent} />
        <ModernBody mode={mode} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                     */
/* -------------------------------------------------------------------------- */

function ModernHeader({
  mode,
  accent
}: {
  mode: FieldMode;
  accent: string;
}) {
  return (
    <header className="mb-6 border-b-2 border-zinc-900 pb-4">
      {/* Name + label */}
      <div className="mb-3">
        <h1 className="text-[32pt] font-bold leading-none tracking-tight text-zinc-900">
          <Field
            mode={mode}
            path="sections.basics.name"
            as="span"
            className="inline"
            placeholder="Your name"
          />
        </h1>
        <p className="mt-1 text-[12pt] font-medium uppercase tracking-wider text-zinc-600">
          <Field
            mode={mode}
            path="sections.basics.label"
            as="span"
            className="inline"
            placeholder="Senior Software Engineer"
          />
        </p>
      </div>

      {/* Contact + location. In editable mode the editor-specific
          components give us hover/focus affordances + per-field
          path binding; in read-only mode we read directly from data
          via our own component, no editor chrome. */}
      {mode.editable ? (
        <ContactLineScope mode={mode} />
      ) : (
        <ReadonlyContactScope mode={mode} />
      )}

      {/* Accent line — the visual signature */}
      <div
        aria-hidden="true"
        className="mt-3 h-1 w-16 rounded-full"
        style={{ backgroundColor: 'var(--modern-accent, #4f46e5)' }}
        data-accent-bar={accent}
      />
    </header>
  );
}

/**
 * Thin adapters so the header stays a single element. The editor's
 * `<ContactLineEditable>` / `<LocationLineEditable>` already pull
 * values via useController from the form context — we only use them
 * inside the editor's FormProvider.
 */
function ContactLineScope({ mode }: { mode: FieldMode }) {
  const basics = mode.data.sections.basics;
  return (
    <>
      <ContactLineEditable contact={basics} />
      <LocationLineEditable location={basics.location} />
    </>
  );
}

function ReadonlyContactScope({ mode }: { mode: FieldMode }) {
  const b = mode.data.sections.basics;
  const isSet = (s: string | undefined | null) => Boolean(s && s.trim());
  const contactBits = [b.email, b.phone, b.url].filter(isSet);
  const locBits = [b.location.city, b.location.region, b.location.countryCode].filter(
    isSet
  );

  if (!contactBits.length && !locBits.length) return null;

  return (
    <div className="text-[10pt] text-zinc-600">
      {contactBits.length > 0 && (
        <div className="flex flex-wrap gap-x-3">
          {contactBits.map((bit, i) => (
            <span key={`${bit}-${i}`}>
              {i > 0 && <span className="text-zinc-300">·</span>}
              <span className="ml-3 first:ml-0">{bit}</span>
            </span>
          ))}
        </div>
      )}
      {locBits.length > 0 && (
        <div className="mt-1 text-zinc-500">{locBits.join(', ')}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body                                                                       */
/* -------------------------------------------------------------------------- */

function ModernBody({ mode }: { mode: FieldMode }) {
  const summary = mode.data.sections.basics.summary;
  const hasSummary = Boolean(summary && summary.trim());
  return (
    <main className="space-y-[var(--resume-section-spacing)]">
      {hasSummary && (
        <ModernSection mode={mode} title="Summary" id="section-summary" sectionSlug="summary">
          <FieldArea
            mode={mode}
            path="sections.basics.summary"
            className="block w-full text-[11pt] leading-relaxed"
            placeholder="A couple of lines summarizing who you are and what you're looking for."
            readOnlyAs="p"
          />
        </ModernSection>
      )}

      <ModernExperience mode={mode} />
      <ModernProjects mode={mode} />
      <ModernEducation mode={mode} />
      <ModernSkills mode={mode} />
      <ModernVolunteer mode={mode} />
      <ModernAwards mode={mode} />
      <ModernCertificates mode={mode} />
      <ModernPublications mode={mode} />
      <ModernLanguages mode={mode} />
      <ModernInterests mode={mode} />
      <ModernReferences mode={mode} />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section chrome                                                             */
/* -------------------------------------------------------------------------- */

function ModernSection({
  mode,
  title,
  id,
  sectionSlug,
  children
}: {
  mode: FieldMode;
  title: string;
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
  const { hidden } = useSectionPrint(sectionSlug ?? '__no_section__', mode);
  const sectionClassName = cn(
    // No `break-inside-avoid` on the section itself. The earlier
    // `break-inside-avoid print:break-inside-avoid` looked safe but
    // pushed the entire Experience section onto a new page whenever
    // it couldn't fit at the bottom of the previous one — leaving
    // ~half a page of blank space (verified Oct 2026 — see AGENTS.md
    // "Recently shipped" for the print-page-break-quality fix).
    // The `break-after-avoid` on the <h2> below + the per-entry
    // `break-inside-avoid` on each work / edu / project wrapper is
    // the right combination: it keeps the header glued to its body
    // AND lets the browser split the section between entries when
    // it must, without the giant-blank-page artifact.
    sectionSlug && hidden && 'print:hidden opacity-60'
  );
  return (
    <section className={sectionClassName}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2
          id={id}
          className="flex items-center gap-2 text-[11pt] font-bold uppercase tracking-[0.12em] text-zinc-900 print:break-after-avoid"
        >
          <span
            aria-hidden="true"
            className="inline-block h-3 w-1 rounded-sm bg-zinc-900"
          />
          {title}
        </h2>
        {sectionSlug && mode.editable && (
          <PrintPrefsBar
            sectionSlug={sectionSlug}
            mode={mode}
            className="no-print"
          />
        )}
      </div>
      <div className="text-zinc-800">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Per-section renderers — all drive off `mode` (editable + data).            */
/* -------------------------------------------------------------------------- */

function has<T>(arr: T[] | undefined | null): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

function ModernExperience({ mode }: { mode: FieldMode }) {
  // In editable mode the section stays visible even when empty so the
  // "+ Add experience" button is reachable; the read-only branch
  // hides it instead, matching the pre-existing behaviour.
  if (!has(mode.data.sections.work) && !mode.editable) return null;
  return (
    <ModernSection mode={mode} title="Experience" id="section-experience" sectionSlug="experience">
      {mode.editable ? (
        <EditableSection
          path="sections.work"
          addLabel="Add experience"
          testIdPrefix="work-entry"
          defaultRow={EMPTY_WORK}
        >
          {(i) => <ModernWorkEntry mode={mode} index={i} />}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap-wide)]">
          {mode.data.sections.work.map((_, i) => (
            <ModernWorkEntry key={`w-${i}`} mode={mode} index={i} />
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernWorkEntry({
  mode,
  index
}: {
  mode: FieldMode;
  index: number;
}) {
  // An appended row has no entry in `mode.data` yet, so the `??`
  // fallback to EMPTY_WORK is what lets a fresh "+ Add experience" row
  // render placeholders instead of crashing. Field/FieldBullets/
  // DateRange all bind to dotted paths, so the actual values they
  // show come from the form, not from this fallback.
  const w = mode.data.sections.work[index] ?? EMPTY_WORK;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[12pt] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.work.${index}.company`}
            as="span"
            className="inline"
            placeholder="Company"
          />
        </h3>
        <span className="text-[10pt] text-zinc-500">
          <Field
            mode={mode}
            path={`sections.work.${index}.location`}
            as="span"
            className="inline"
            placeholder="Remote"
          />
        </span>
      </div>
      {mode.editable ? (
        <EditableNestedSection
          path={`sections.work.${index}.positions`}
          addLabel="Add a position"
          testIdPrefix={`work-${index}-position`}
          defaultRow={EMPTY_POSITION}
        >
          {(j) => (
            <ModernWorkPosition
              mode={mode}
              workIndex={index}
              positionIndex={j}
            />
          )}
        </EditableNestedSection>
      ) : has(w.positions) ? (
        <div className="space-y-[var(--resume-item-gap)] pl-3">
          {w.positions.map((_, j) => (
            <ModernWorkPosition
              key={`p-${j}`}
              mode={mode}
              workIndex={index}
              positionIndex={j}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModernWorkPosition({
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
  const start = p.startDate;
  const end = p.endDate;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-medium text-zinc-800">
          <Field
            mode={mode}
            path={`sections.work.${workIndex}.positions.${positionIndex}.title`}
            as="span"
            className="inline"
            placeholder="Title"
          />
        </p>
        <DateRange
          editable={mode.editable}
          start={start}
          end={end}
          startPath={`sections.work.${workIndex}.positions.${positionIndex}.startDate`}
          endPath={`sections.work.${workIndex}.positions.${positionIndex}.endDate`}
        />
      </div>
      <FieldBullets
        mode={mode}
        path={`sections.work.${workIndex}.positions.${positionIndex}.highlights`}
        placeholder="A concrete, quantified accomplishment."
        itemClassName="marker:text-zinc-400"
        className="mt-1 list-disc space-y-0.5 pl-5"
      />
    </div>
  );
}

function ModernProjects({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.projects) && !mode.editable) return null;
  const renderRow = (i: number) => {
    const p = mode.data.sections.projects[i] ?? EMPTY_PROJECT;
    const hasKeywords = has(p.keywords);
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-[12pt] font-semibold text-zinc-900">
            <Field
              mode={mode}
              path={`sections.projects.${i}.name`}
              as="span"
              className="inline"
              placeholder="Project name"
            />
          </h3>
          <DateRange
            editable={mode.editable}
            start={p.startDate}
            end={p.endDate}
            startPath={`sections.projects.${i}.startDate`}
            endPath={`sections.projects.${i}.endDate`}
          />
        </div>
        <Field
          mode={mode}
          path={`sections.projects.${i}.description`}
          as="p"
          className="mt-0.5 text-zinc-700"
          placeholder=""
        />
        <FieldBullets
          mode={mode}
          path={`sections.projects.${i}.highlights`}
          itemClassName="marker:text-zinc-400"
          className="mt-1 list-disc space-y-0.5 pl-5"
        />
        {hasKeywords && (
          <FieldChips
            mode={mode}
            path={`sections.projects.${i}.keywords`}
            className="mt-1"
            chipClassName="text-[9pt]"
          />
        )}
      </div>
    );
  };
  return (
    <ModernSection mode={mode} title="Projects" id="section-projects" sectionSlug="projects">
      {mode.editable ? (
        <EditableSection
          path="sections.projects"
          addLabel="Add project"
          testIdPrefix="project-entry"
          defaultRow={EMPTY_PROJECT}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap)]">
          {mode.data.sections.projects.map((_, i) => (
            <div key={`p-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernEducation({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.education) && !mode.editable) return null;
  const renderRow = (i: number) => {
    const e = mode.data.sections.education[i] ?? EMPTY_EDUCATION;
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-[12pt] font-semibold text-zinc-900">
            <Field
              mode={mode}
              path={`sections.education.${i}.institution`}
              as="span"
              className="inline"
              placeholder="Institution"
            />
          </h3>
          <DateRange
            editable={mode.editable}
            start={e.startDate}
            end={e.endDate}
            startPath={`sections.education.${i}.startDate`}
            endPath={`sections.education.${i}.endDate`}
          />
        </div>
        <p className="text-zinc-700">
          <Field
            mode={mode}
            path={`sections.education.${i}.degree.degreeLevel`}
            as="span"
            className="inline"
            placeholder="Degree"
          />
          {has(e.degree.majors) && (
            <span className="text-zinc-500">
              {' · '}
              <Field
                mode={mode}
                path={`sections.education.${i}.degree.majors.0`}
                as="span"
                className="inline"
                placeholder="major"
              />
            </span>
          )}
        </p>
      </div>
    );
  };
  return (
    <ModernSection mode={mode} title="Education" id="section-education" sectionSlug="education">
      {mode.editable ? (
        <EditableSection
          path="sections.education"
          addLabel="Add education"
          testIdPrefix="education-entry"
          defaultRow={EMPTY_EDUCATION}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap)]">
          {mode.data.sections.education.map((_, i) => (
            <div key={`e-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernSkills({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.skills) && !mode.editable) return null;
  const renderRow = (i: number) => {
    return (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11pt]"
      >
        <span className="min-w-[140px] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.skills.${i}.name`}
            as="span"
            className="inline"
            placeholder="Category"
          />
        </span>
        <span className="flex-1 text-zinc-700">
          <FieldChips
            mode={mode}
            path={`sections.skills.${i}.keywords`}
            placeholder="keyword"
          />
        </span>
      </div>
    );
  };
  return (
    <ModernSection mode={mode} title="Skills" id="section-skills" sectionSlug="skills">
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
        <div className="space-y-[var(--resume-item-gap-tight)]">
          {mode.data.sections.skills.map((_, i) => (
            <div key={`s-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernVolunteer({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.volunteer) && !mode.editable) return null;
  const renderRow = (i: number) => {
    const v = mode.data.sections.volunteer[i] ?? EMPTY_VOLUNTEER;
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-[12pt] font-semibold text-zinc-900">
            <Field
              mode={mode}
              path={`sections.volunteer.${i}.organization`}
              as="span"
              className="inline"
              placeholder="Organization"
            />
          </h3>
          <DateRange
            editable={mode.editable}
            start={v.startDate}
            end={v.endDate}
            startPath={`sections.volunteer.${i}.startDate`}
            endPath={`sections.volunteer.${i}.endDate`}
          />
        </div>
        <Field
          mode={mode}
          path={`sections.volunteer.${i}.position`}
          as="p"
          className="text-[11pt] text-zinc-700"
          placeholder="Role"
        />
        <FieldBullets
          mode={mode}
          path={`sections.volunteer.${i}.highlights`}
          itemClassName="marker:text-zinc-400"
          className="mt-1 list-disc space-y-0.5 pl-5"
        />
      </div>
    );
  };
  return (
    <ModernSection mode={mode} title="Volunteer" id="section-volunteer" sectionSlug="volunteer">
      {mode.editable ? (
        <EditableSection
          path="sections.volunteer"
          addLabel="Add volunteer role"
          testIdPrefix="volunteer-entry"
          defaultRow={EMPTY_VOLUNTEER}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap)]">
          {mode.data.sections.volunteer.map((_, i) => (
            <div key={`v-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernAwards({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.awards) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div
      className="flex flex-wrap items-baseline justify-between gap-x-3"
    >
      <div>
        <h3 className="text-[11pt] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.awards.${i}.title`}
            as="span"
            className="inline"
            placeholder="Award title"
          />
        </h3>
        <Field
          mode={mode}
          path={`sections.awards.${i}.awarder`}
          as="p"
          className="text-[10pt] text-zinc-500"
          placeholder=""
        />
      </div>
      <Field
        mode={mode}
        path={`sections.awards.${i}.date`}
        as="span"
        className="text-[10pt] text-zinc-500"
        placeholder=""
      />
    </div>
  );
  return (
    <ModernSection mode={mode} title="Awards" id="section-awards" sectionSlug="awards">
      {mode.editable ? (
        <EditableSection
          path="sections.awards"
          addLabel="Add award"
          testIdPrefix="award-entry"
          defaultRow={{ title: '', date: '', awarder: '', summary: '' }}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap-tight)]">
          {mode.data.sections.awards.map((_, i) => (
            <div key={`a-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernCertificates({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.certificates) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div
      className="flex flex-wrap items-baseline justify-between gap-x-3"
    >
      <div>
        <h3 className="text-[11pt] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.certificates.${i}.name`}
            as="span"
            className="inline"
            placeholder="Certificate name"
          />
        </h3>
        <Field
          mode={mode}
          path={`sections.certificates.${i}.issuer`}
          as="p"
          className="text-[10pt] text-zinc-500"
          placeholder=""
        />
      </div>
      <Field
        mode={mode}
        path={`sections.certificates.${i}.date`}
        as="span"
        className="text-[10pt] text-zinc-500"
        placeholder=""
      />
    </div>
  );
  return (
    <ModernSection mode={mode} title="Certificates" id="section-certificates" sectionSlug="certificates">
      {mode.editable ? (
        <EditableSection
          path="sections.certificates"
          addLabel="Add certificate"
          testIdPrefix="certificate-entry"
          defaultRow={{ name: '', date: '', issuer: '', url: '' }}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap-tight)]">
          {mode.data.sections.certificates.map((_, i) => (
            <div key={`c-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernPublications({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.publications) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div>
      <h3 className="text-[11pt] font-semibold text-zinc-900">
        <Field
          mode={mode}
          path={`sections.publications.${i}.name`}
          as="span"
          className="inline"
          placeholder="Title"
        />
      </h3>
      <Field
        mode={mode}
        path={`sections.publications.${i}.publisher`}
        as="span"
        className="text-[10pt] text-zinc-500"
        placeholder=""
      />
    </div>
  );
  return (
    <ModernSection mode={mode} title="Publications" id="section-publications" sectionSlug="publications">
      {mode.editable ? (
        <EditableSection
          path="sections.publications"
          addLabel="Add publication"
          testIdPrefix="publication-entry"
          defaultRow={{ name: '', publisher: '', releaseDate: '', url: '', summary: '' }}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap-tight)]">
          {mode.data.sections.publications.map((_, i) => (
            <div key={`p-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernLanguages({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.languages) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <span className="flex items-center gap-1">
      <Field
        mode={mode}
        path={`sections.languages.${i}.language`}
        as="span"
        className="font-semibold text-zinc-900"
        placeholder="Language"
      />
      <Field
        mode={mode}
        path={`sections.languages.${i}.fluency`}
        as="span"
        className="text-zinc-500"
        placeholder=""
      />
    </span>
  );
  return (
    <ModernSection mode={mode} title="Languages" id="section-languages" sectionSlug="languages">
      {mode.editable ? (
        <EditableSection
          path="sections.languages"
          addLabel="Add language"
          testIdPrefix="language-entry"
          defaultRow={EMPTY_LANGUAGE}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11pt]">
          {mode.data.sections.languages.map((_, i) => (
            <span key={`l-${i}`}>{renderRow(i)}</span>
          ))}
        </div>
      )}
    </ModernSection>
  );
}

function ModernInterests({ mode }: { mode: FieldMode }) {
  // Read-only renders a flat preview of all interest keywords. The
  // editor needs per-entry editing (name + chips), so the two modes
  // diverge deliberately — the read-only shape is the "I just want to
  // skim this" view, the editor shape is the "I want to add Climbing
  // under Outdoors" view.
  if (!has(mode.data.sections.interests) && !mode.editable) return null;
  const renderRow = (i: number) => {
    const it = mode.data.sections.interests[i] ?? EMPTY_INTEREST;
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11pt]">
        <span className="min-w-[140px] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.interests.${i}.name`}
            as="span"
            className="inline"
            placeholder="Interest"
          />
        </span>
        <span className="flex-1 text-zinc-700">
          <FieldChips
            mode={mode}
            path={`sections.interests.${i}.keywords`}
            placeholder="keyword"
          />
        </span>
      </div>
    );
  };
  return (
    <ModernSection mode={mode} title="Interests" id="section-interests" sectionSlug="interests">
      {mode.editable ? (
        <EditableSection
          path="sections.interests"
          addLabel="Add interest"
          testIdPrefix="interest-entry"
          defaultRow={EMPTY_INTEREST}
        >
          {renderRow}
        </EditableSection>
      ) : (() => {
        const keywords = mode.data.sections.interests
          .flatMap((it) => it.keywords ?? [])
          .filter(Boolean);
        const preview = keywords.join(' · ');
        return preview ? (
          <p className="text-zinc-700">{preview}</p>
        ) : (
          <p className="text-[11pt] italic text-zinc-400">
            No interests added yet.
          </p>
        );
      })()}
    </ModernSection>
  );
}

function ModernReferences({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.references) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div>
      <Field
        mode={mode}
        path={`sections.references.${i}.name`}
        as="p"
        className="text-[11pt] font-semibold text-zinc-900"
        placeholder="Reference name"
      />
      <Field
        mode={mode}
        path={`sections.references.${i}.reference`}
        as="p"
        className="text-[11pt] italic text-zinc-600"
        placeholder=""
      />
    </div>
  );
  return (
    <ModernSection mode={mode} title="References" id="section-references" sectionSlug="references">
      {mode.editable ? (
        <EditableSection
          path="sections.references"
          addLabel="Add reference"
          testIdPrefix="reference-entry"
          defaultRow={{ name: '', reference: '' }}
        >
          {renderRow}
        </EditableSection>
      ) : (
        <div className="space-y-[var(--resume-item-gap-tight)]">
          {mode.data.sections.references.map((_, i) => (
            <div key={`r-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </ModernSection>
  );
}
