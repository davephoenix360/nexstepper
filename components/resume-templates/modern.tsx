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
  Field,
  FieldArea,
  FieldBullets,
  FieldChips,
  type FieldMode
} from './field';
import { MODERN_TEMPLATE_META } from './meta';
import type { ResumeData } from '@/lib/resume-schema';

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
      data-max-pages="auto"
      data-page-size="letter"
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
    <main className="space-y-5">
      {hasSummary && (
        <ModernSection title="Summary">
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
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid print:break-inside-avoid">
      <h2 className="mb-2 flex items-center gap-2 text-[11pt] font-bold uppercase tracking-[0.12em] text-zinc-900">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-1 rounded-sm bg-zinc-900"
        />
        {title}
      </h2>
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
  if (!has(mode.data.sections.work)) return null;
  return (
    <ModernSection title="Experience">
      <div className="space-y-4">
        {mode.data.sections.work.map((_, i) => (
          <ModernWorkEntry key={`w-${i}`} mode={mode} index={i} />
        ))}
      </div>
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
  const w = mode.data.sections.work[index];
  if (!w) return null;
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
      {has(w.positions) ? (
        <div className="space-y-3 pl-3">
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
  const p = mode.data.sections.work[workIndex]?.positions?.[positionIndex];
  if (!p) return null;
  const start = p.startDate;
  const end = p.endDate;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[11pt] font-medium text-zinc-800">
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
        itemClassName="text-[11pt] marker:text-zinc-400"
        className="mt-1 list-disc space-y-0.5 pl-5"
      />
    </div>
  );
}

function ModernProjects({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.projects)) return null;
  return (
    <ModernSection title="Projects">
      <div className="space-y-3">
        {mode.data.sections.projects.map((p, i) => {
          const hasKeywords = has(p.keywords);
          return (
            <div key={`p-${i}`}>
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
                className="mt-0.5 text-[11pt] text-zinc-700"
                placeholder=""
              />
              <FieldBullets
                mode={mode}
                path={`sections.projects.${i}.highlights`}
                itemClassName="text-[11pt] marker:text-zinc-400"
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
        })}
      </div>
    </ModernSection>
  );
}

function ModernEducation({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.education)) return null;
  return (
    <ModernSection title="Education">
      <div className="space-y-3">
        {mode.data.sections.education.map((e, i) => (
          <div key={`e-${i}`}>
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
            <p className="text-[11pt] text-zinc-700">
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
        ))}
      </div>
    </ModernSection>
  );
}

function ModernSkills({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.skills)) return null;
  return (
    <ModernSection title="Skills">
      <div className="space-y-2">
        {mode.data.sections.skills.map((_, i) => (
          <div
            key={`s-${i}`}
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
        ))}
      </div>
    </ModernSection>
  );
}

function ModernVolunteer({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.volunteer)) return null;
  return (
    <ModernSection title="Volunteer">
      <div className="space-y-3">
        {mode.data.sections.volunteer.map((v, i) => (
          <div key={`v-${i}`}>
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
              itemClassName="text-[11pt] marker:text-zinc-400"
              className="mt-1 list-disc space-y-0.5 pl-5"
            />
          </div>
        ))}
      </div>
    </ModernSection>
  );
}

function ModernAwards({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.awards)) return null;
  return (
    <ModernSection title="Awards">
      <div className="space-y-2">
        {mode.data.sections.awards.map((a, i) => (
          <div
            key={`a-${i}`}
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
        ))}
      </div>
    </ModernSection>
  );
}

function ModernCertificates({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.certificates)) return null;
  return (
    <ModernSection title="Certificates">
      <div className="space-y-2">
        {mode.data.sections.certificates.map((c, i) => (
          <div
            key={`c-${i}`}
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
        ))}
      </div>
    </ModernSection>
  );
}

function ModernPublications({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.publications)) return null;
  return (
    <ModernSection title="Publications">
      <div className="space-y-2">
        {mode.data.sections.publications.map((_, i) => (
          <div key={`p-${i}`}>
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
        ))}
      </div>
    </ModernSection>
  );
}

function ModernLanguages({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.languages)) return null;
  return (
    <ModernSection title="Languages">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11pt]">
        {mode.data.sections.languages.map((_, i) => (
          <span key={`l-${i}`} className="flex items-center gap-1">
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
        ))}
      </div>
    </ModernSection>
  );
}

function ModernInterests({ mode }: { mode: FieldMode }) {
  // Interests are stored as `[{ name, keywords?: string[] }, ...]`.
  // We render the joined keywords as a single line — same shape
  // classic uses — and use Field at the entry boundary so the data
  // contract stays one place.
  if (!has(mode.data.sections.interests)) return null;
  const keywords = mode.data.sections.interests
    .flatMap((it) => it.keywords ?? [])
    .filter(Boolean);
  const preview = keywords.join(' · ');
  return (
    <ModernSection title="Interests">
      {preview ? (
        <p className="text-[11pt] text-zinc-700">{preview}</p>
      ) : (
        <p className="text-[11pt] italic text-zinc-400">
          No interests added yet.
        </p>
      )}
    </ModernSection>
  );
}

function ModernReferences({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.references)) return null;
  return (
    <ModernSection title="References">
      <div className="space-y-2">
        {mode.data.sections.references.map((r, i) => (
          <div key={`r-${i}`}>
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
        ))}
      </div>
    </ModernSection>
  );
}
