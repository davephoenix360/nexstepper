'use client';

/**
 * ExecutiveTemplate — serif, dignified, right-justified header.
 *
 * Visual identity (vs Classic / Modern / Minimal):
 *   - Serif body (Source Serif Pro / Georgia fallback). Readers
 *     associate serif with academic / legal / authority. This
 *     template targets C-suite, VP, Director-track candidates
 *     where the visual signal IS the authority.
 *   - Right-justified header (name + label + contact strip on the
 *     right, summary on the left below). Distinct from the
 *     center-stacked Classic + left-stacked Modern/Minimal.
 *   - Section headers are small caps with a thin underline rule
 *     (1px solid in the template accent color). More weight than
 *     Minimal's letter-spacing; less weight than Modern's accent
 *     bar. Reads as "academic CV".
 *   - Body text 11pt, line-height 1.5 (more generous than
 *     Modern/Minimal's 1.45) for the serif read.
 *   - Same single-column ATS-friendly layout. atsSafe: true.
 *   - maxPages: '2' — executive resumes commonly run 2 pages;
 *     forcing it via meta keeps the picker from accidentally
 *     truncating long histories.
 *
 * Architecture (per the meta + code split in ./meta.ts):
 *   - `meta` lives in `./meta.ts` as EXECUTIVE_TEMPLATE_META.
 *   - `Component` (this file) is the render code.
 *   - Uses the Field abstraction so the same JSX handles both
 *     editor + read-only / preview / PDF paths.
 */

import * as React from 'react';

import { DateRange } from './date-range';
import {
  Field,
  FieldArea,
  FieldBullets,
  FieldChips,
  type FieldMode
} from './field';
import { SmartSection } from './section';
import { EXECUTIVE_TEMPLATE_META } from './meta';
import type { ResumeData } from '@/lib/resume-schema';

/* -------------------------------------------------------------------------- */
/*  Root                                                                       */
/* -------------------------------------------------------------------------- */

export function ExecutiveTemplate({
  data,
  editable = false
}: {
  data: ResumeData;
  editable?: boolean;
}) {
  const accent = EXECUTIVE_TEMPLATE_META.accent;
  const mode: FieldMode = { editable, data };

  return (
    <div
      data-template="executive"
      data-accent={accent}
      data-editable={editable || undefined}
      data-max-pages={EXECUTIVE_TEMPLATE_META.maxPages}
      data-page-size={EXECUTIVE_TEMPLATE_META.pageSize}
      className="mx-auto w-full max-w-[8.5in] bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0"
    >
      <div className="px-12 py-10 print:px-0 print:py-0">
        <ExecutiveHeader mode={mode} accent={accent} />
        <ExecutiveSummary mode={mode} />
        <ExecutiveBody mode={mode} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header — right-justified name + label + contact strip                      */
/* -------------------------------------------------------------------------- */

function ExecutiveHeader({
  mode,
  accent
}: {
  mode: FieldMode;
  accent: string;
}) {
  return (
    <header className="mb-6 border-b border-zinc-300 pb-4">
      <div className="flex items-baseline justify-between gap-4">
        {/* Left: label (the role the candidate is targeting). */}
        <Field
          mode={mode}
          path="sections.basics.label"
          as="p"
          className="text-[10pt] font-medium uppercase tracking-[0.2em] text-zinc-600"
          placeholder="Senior Software Engineer"
        />
        {/* Right: name (h1) — the visual anchor. */}
        <Field
          mode={mode}
          path="sections.basics.name"
          as="h1"
          className="text-right text-[24pt] font-serif font-semibold leading-none tracking-tight text-zinc-900"
          placeholder="Your name"
        />
      </div>
      {/* Contact strip — single line, right-aligned, small caps. */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[9.5pt] uppercase tracking-[0.12em] text-zinc-600">
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
          path="sections.basics.location.city"
          placeholder="City"
        />
      </div>
      {/* Accent rule under the contact strip. */}
      <div
        className="mt-3 h-[1px] w-full"
        style={{ background: `var(--accent-${accent}, #64748b)` }}
        data-testid="executive-header-rule"
      />
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Summary — under the header, full width                                     */
/* -------------------------------------------------------------------------- */

function ExecutiveSummary({ mode }: { mode: FieldMode }) {
  const summary = (mode.data.sections.basics as { summary?: string })?.summary;
  if (!mode.editable && !summary) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[10pt] font-serif font-medium uppercase tracking-[0.18em] text-zinc-700">
        Summary
      </h2>
      <FieldArea
        mode={mode}
        path="sections.basics.summary"
        rows={4}
        className="font-serif text-[11pt] leading-[1.55] text-zinc-800"
        placeholder="A couple of lines summarizing who you are."
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body                                                                       */
/* -------------------------------------------------------------------------- */

function ExecutiveBody({ mode }: { mode: FieldMode }) {
  return (
    <div className="space-y-6">
      <ExecutiveSection mode={mode} title="Experience">
        <ExecutiveExperience mode={mode} />
      </ExecutiveSection>

      <ExecutiveSection mode={mode} title="Education">
        <ExecutiveEducation mode={mode} />
      </ExecutiveSection>

      <ExecutiveSection mode={mode} title="Skills">
        <ExecutiveSkills mode={mode} />
      </ExecutiveSection>

      <ExecutiveSection mode={mode} title="Projects">
        <ExecutiveProjects mode={mode} />
      </ExecutiveSection>

      <ExecutiveSection mode={mode} title="Publications & Speaking">
        <ExecutivePublications mode={mode} />
      </ExecutiveSection>

      <ExecutiveSection mode={mode} title="Board & Advisory Roles">
        <ExecutiveVolunteer mode={mode} />
      </ExecutiveSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section wrapper — small caps + accent rule                                */
/* -------------------------------------------------------------------------- */

function ExecutiveSection({
  mode,
  title,
  children
}: {
  mode: FieldMode;
  title: string;
  children: React.ReactNode;
}) {
  // Suppress the entire section (header + content) when the child
  // rendered null in read-only mode. Without this guard, "Publications
  // & Speaking" or "Board & Advisory Roles" would appear in the PDF
  // as a header band with no body underneath. Same null-detection
  // convention as SmartSection; child renderers MUST return null
  // (not an empty fragment) when they have no data in read-only.
  if (!mode.editable && (children === null || children === undefined)) {
    return null;
  }
  return (
    <section>
      <h2 className="mb-2 border-b border-zinc-300 pb-1 text-[10pt] font-serif font-semibold uppercase tracking-[0.18em] text-zinc-800">
        {title}
      </h2>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Experience                                                                 */
/* -------------------------------------------------------------------------- */

function ExecutiveExperience({ mode }: { mode: FieldMode }) {
  const work = (mode.data.sections.work ?? []) as Array<{
    company?: string;
    location?: string;
    positions?: Array<{
      title?: string;
      startDate?: string;
      endDate?: string;
      highlights?: string[];
    }>;
  }>;
  if (!mode.editable && work.length === 0) return null;

  return (
    <div className="space-y-5">
      {work.map((w, i) => (
        <div
          key={`work-${i}`}
          className="print:break-inside-avoid"
          data-testid={`work-entry-${i}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <Field
              mode={mode}
              path={`sections.work.${i}.company`}
              as="h3"
              className="font-serif text-[12pt] font-semibold text-zinc-900"
              placeholder="Company"
            />
            <Field
              mode={mode}
              path={`sections.work.${i}.location`}
              className="text-[9.5pt] uppercase tracking-[0.1em] text-zinc-500"
              placeholder="Location"
            />
          </div>
          {((w.positions ?? []) as Array<{ title?: string }>).map(
            (p, j) => (
              <div key={`work-${i}-pos-${j}`} className="mt-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Field
                    mode={mode}
                    path={`sections.work.${i}.positions.${j}.title`}
                    as="p"
                    className="font-serif text-[11pt] italic text-zinc-700"
                    placeholder="Position"
                  />
                  <span className="text-[9.5pt] uppercase tracking-[0.1em] text-zinc-500">
                    <DateRange
                      start={
                        (w.positions?.[j]?.startDate as string | undefined) ??
                        ''
                      }
                      end={
                        (w.positions?.[j]?.endDate as string | undefined) ?? ''
                      }
                    />
                  </span>
                </div>
                <FieldBullets
                  mode={mode}
                  path={`sections.work.${i}.positions.${j}.highlights`}
                  className="mt-1 font-serif text-[11pt] text-zinc-800"
                  itemClassName="leading-[1.55]"
                />
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Education                                                                  */
/* -------------------------------------------------------------------------- */

function ExecutiveEducation({ mode }: { mode: FieldMode }) {
  const edu = (mode.data.sections.education ?? []) as Array<{
    institution?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    degree?: { degreeLevel?: string; majors?: string[]; minors?: string[] };
  }>;
  if (!mode.editable && edu.length === 0) return null;

  return (
    <div className="space-y-3">
      {edu.map((e, i) => (
        <div
          key={`edu-${i}`}
          className="print:break-inside-avoid"
          data-testid={`edu-entry-${i}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <Field
              mode={mode}
              path={`sections.education.${i}.institution`}
              as="h3"
              className="font-serif text-[12pt] font-semibold text-zinc-900"
              placeholder="Institution"
            />
            <span className="text-[9.5pt] uppercase tracking-[0.1em] text-zinc-500">
              <DateRange
                start={(e.startDate as string | undefined) ?? ''}
                end={(e.endDate as string | undefined) ?? ''}
              />
            </span>
          </div>
          <p className="mt-0.5 font-serif text-[11pt] text-zinc-800">
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
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skills                                                                     */
/* -------------------------------------------------------------------------- */

function ExecutiveSkills({ mode }: { mode: FieldMode }) {
  const skills = (mode.data.sections.skills ?? []) as Array<{
    name?: string;
    keywords?: string[];
  }>;
  if (!mode.editable && skills.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {skills.map((s, i) => (
        <div
          key={`skill-${i}`}
          className="flex items-baseline gap-2 font-serif text-[11pt]"
          data-testid={`skill-entry-${i}`}
        >
          <Field
            mode={mode}
            path={`sections.skills.${i}.name`}
            as="span"
            className="font-semibold text-zinc-900"
            placeholder="Category"
          />
          <FieldChips
            mode={mode}
            path={`sections.skills.${i}.keywords`}
            chipClassName="bg-transparent border-zinc-300 px-2 py-0.5 font-serif text-[10.5pt]"
            size="xs"
          />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Projects                                                                   */
/* -------------------------------------------------------------------------- */

function ExecutiveProjects({ mode }: { mode: FieldMode }) {
  const projects = (mode.data.sections.projects ?? []) as Array<{
    name?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    highlights?: string[];
    keywords?: string[];
  }>;
  if (!mode.editable && projects.length === 0) return null;

  return (
    <div className="space-y-4">
      {projects.map((p, i) => (
        <div
          key={`proj-${i}`}
          className="print:break-inside-avoid"
          data-testid={`proj-entry-${i}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <Field
              mode={mode}
              path={`sections.projects.${i}.name`}
              as="h3"
              className="font-serif text-[12pt] font-semibold text-zinc-900"
              placeholder="Project"
            />
            <span className="text-[9.5pt] uppercase tracking-[0.1em] text-zinc-500">
              <DateRange
                start={(p.startDate as string | undefined) ?? ''}
                end={(p.endDate as string | undefined) ?? ''}
              />
            </span>
          </div>
          <FieldArea
            mode={mode}
            path={`sections.projects.${i}.description`}
            rows={2}
            className="mt-0.5 font-serif text-[11pt] text-zinc-800"
            placeholder="Short description"
            readOnlyAs="p"
          />
          <FieldBullets
            mode={mode}
            path={`sections.projects.${i}.highlights`}
            className="mt-1 font-serif text-[11pt] text-zinc-800"
          />
          <FieldChips
            mode={mode}
            path={`sections.projects.${i}.keywords`}
            chipClassName="bg-transparent border-zinc-300 px-2 py-0.5 font-serif text-[10.5pt]"
            size="xs"
          />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Publications & Speaking (mapped from sections.publications)                */
/* -------------------------------------------------------------------------- */

function ExecutivePublications({ mode }: { mode: FieldMode }) {
  const pubs = (mode.data.sections.publications ?? []) as Array<{
    name?: string;
    publisher?: string;
    releaseDate?: string;
  }>;
  if (!mode.editable && pubs.length === 0) return null;

  return (
    <ul className="space-y-1.5 font-serif text-[11pt] leading-[1.5] text-zinc-800">
      {pubs.map((p, i) => (
        <li
          key={`pub-${i}`}
          className="print:break-inside-avoid"
          data-testid={`pub-entry-${i}`}
        >
          <Field
            mode={mode}
            path={`sections.publications.${i}.name`}
            as="span"
            className="font-semibold text-zinc-900"
            placeholder="Title"
          />
          <Field
            mode={mode}
            path={`sections.publications.${i}.publisher`}
            as="span"
            className="ml-1 italic"
            placeholder="Publisher"
          />
          <Field
            mode={mode}
            path={`sections.publications.${i}.releaseDate`}
            as="span"
            className="ml-2 text-[9.5pt] uppercase tracking-[0.1em] text-zinc-500"
            placeholder="Year"
          />
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Board & Advisory Roles (mapped from sections.volunteer)                    */
/* -------------------------------------------------------------------------- */

function ExecutiveVolunteer({ mode }: { mode: FieldMode }) {
  const vol = (mode.data.sections.volunteer ?? []) as Array<{
    organization?: string;
    position?: string;
    startDate?: string;
    endDate?: string;
    summary?: string;
  }>;
  if (!mode.editable && vol.length === 0) return null;

  return (
    <div className="space-y-3">
      {vol.map((v, i) => (
        <div key={`vol-${i}`} className="print:break-inside-avoid">
          <div className="flex items-baseline justify-between gap-3">
            <Field
              mode={mode}
              path={`sections.volunteer.${i}.organization`}
              as="h3"
              className="font-serif text-[12pt] font-semibold text-zinc-900"
              placeholder="Organization"
            />
            <span className="text-[9.5pt] uppercase tracking-[0.1em] text-zinc-500">
              <DateRange
                start={(v.startDate as string | undefined) ?? ''}
                end={(v.endDate as string | undefined) ?? ''}
              />
            </span>
          </div>
          <Field
            mode={mode}
            path={`sections.volunteer.${i}.position`}
            as="p"
            className="mt-0.5 font-serif text-[11pt] italic text-zinc-700"
            placeholder="Role"
          />
          <FieldArea
            mode={mode}
            path={`sections.volunteer.${i}.summary`}
            rows={2}
            className="mt-1 font-serif text-[11pt] text-zinc-800"
            placeholder="Summary"
            readOnlyAs="p"
          />
        </div>
      ))}
    </div>
  );
}
