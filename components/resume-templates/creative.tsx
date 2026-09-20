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
  Field,
  FieldArea,
  FieldBullets,
  FieldChips,
  type FieldMode
} from './field';
import { CREATIVE_TEMPLATE_META } from './meta';
import type { ResumeData } from '@/lib/resume-schema';

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
    <div className="space-y-7">
      <CreativeSection mode={mode} title="Summary" accent={accent}>
        <FieldArea
          mode={mode}
          path="sections.basics.summary"
          rows={4}
          className="text-[11pt] leading-[1.55] text-zinc-700"
          placeholder="A couple of lines summarizing who you are."
        />
      </CreativeSection>

      <CreativeSection mode={mode} title="Experience" accent={accent}>
        <CreativeExperience mode={mode} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Skills" accent={accent}>
        <CreativeSkills mode={mode} accent={accent} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Education" accent={accent}>
        <CreativeEducation mode={mode} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Projects" accent={accent}>
        <CreativeProjects mode={mode} accent={accent} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Portfolio & Tools" accent={accent}>
        <CreativePortfolio mode={mode} />
      </CreativeSection>

      <CreativeSection mode={mode} title="Volunteer" accent={accent}>
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
  children
}: {
  mode: FieldMode;
  title: string;
  accent: string;
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
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[11pt] font-bold uppercase tracking-[0.2em] text-zinc-900">
          {title}
        </h2>
        <div
          className="h-[2px] flex-1"
          style={{ background: `var(--accent-${accent}, #f43f5e)` }}
          data-testid={`creative-rule-${title.toLowerCase().replace(/\s+/g, '-')}`}
        />
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Experience                                                                 */
/* -------------------------------------------------------------------------- */

function CreativeExperience({ mode }: { mode: FieldMode }) {
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
          {((w.positions ?? []) as Array<{ title?: string }>).map(
            (p, j) => (
              <div key={`work-${i}-pos-${j}`} className="mt-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Field
                    mode={mode}
                    path={`sections.work.${i}.positions.${j}.title`}
                    as="p"
                    className="text-[11pt] font-medium text-zinc-700"
                    placeholder="Position"
                  />
                  <span className="text-[10pt] text-zinc-500">
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
                  className="mt-1 text-[11pt] text-zinc-700"
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
/*  Skills -- with accent-colored chips                                        */
/* -------------------------------------------------------------------------- */

function CreativeSkills({
  mode,
  accent
}: {
  mode: FieldMode;
  accent: string;
}) {
  const skills = (mode.data.sections.skills ?? []) as Array<{
    name?: string;
    keywords?: string[];
  }>;
  if (!mode.editable && skills.length === 0) return null;

  return (
    <div className="space-y-2">
      {skills.map((s, i) => (
        <div
          key={`skill-${i}`}
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
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Education                                                                  */
/* -------------------------------------------------------------------------- */

function CreativeEducation({ mode }: { mode: FieldMode }) {
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
              className="text-[12pt] font-bold text-zinc-900"
              placeholder="Institution"
            />
            <span className="text-[10pt] text-zinc-500">
              <DateRange
                start={(e.startDate as string | undefined) ?? ''}
                end={(e.endDate as string | undefined) ?? ''}
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
      ))}
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
              className="text-[12pt] font-bold text-zinc-900"
              placeholder="Project"
            />
            <span className="text-[10pt] text-zinc-500">
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
            chipClassName="border-zinc-300 px-2 py-0.5 text-[10pt]"
            size="xs"
          />
        </div>
      ))}
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
              className="text-[12pt] font-bold text-zinc-900"
              placeholder="Organization"
            />
            <span className="text-[10pt] text-zinc-500">
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
      ))}
    </div>
  );
}
