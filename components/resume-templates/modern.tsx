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
 *   - `meta` lives in this file as MODERN_TEMPLATE_META (data).
 *   - `Component` lives below (code). The picker / pricing / PDF
 *     cache pipeline reads only the meta; the renderer reads both.
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
 *       declarative RHF reads. The next refactor (when we have 4+
 *       templates) is to extract just the data-binding shape with
 *       a `style: 'classic' | 'modern'` variant, not full component
 *       extraction.
 *
 *   When a third template is added, this decision is revisited.
 */

import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  EditableText,
  EditableTextarea,
  BulletList,
  KeywordChips
} from "@/components/editable";

import { DateRange } from "./date-range";
import { ContactLineEditable, LocationLineEditable } from "./header-lines";
import { MODERN_TEMPLATE_META } from "./meta";
import type { ResumeData } from "@/lib/resume-schema";

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
  const template = data.template;
  const accent = (
    template && MODERN_TEMPLATE_META.id === template
      ? MODERN_TEMPLATE_META
      : MODERN_TEMPLATE_META
  ).accent;

  // In editable mode the parent (EditableResume) already provides the
  // form context. In read-only mode (preview, print, future PDF render)
  // we spin up a static FormProvider seeded from `data` so the
  // Editable* children below can keep reading their values via
  // useFormContext / useController without each call site needing to
  // be rewritten. The form is writeable but no consumers fire onChange
  // here, so it stays in sync with `data`.
  const readonlyForm = useForm({ defaultValues: data as never });
  const wrap = (children: React.ReactNode) =>
    editable ? (
      children
    ) : (
      <FormProvider {...readonlyForm}>{children}</FormProvider>
    );

  return wrap(
    <div
      data-template="modern"
      data-accent={accent}
      data-editable={editable || undefined}
      data-max-pages="auto"
      data-page-size="letter"
      className="mx-auto w-full max-w-[8.5in] bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0"
    >
      <div className="px-12 py-10 print:px-0 print:py-0">
        <ModernHeader data={data} editable={editable} accent={accent} />
        <ModernBody data={data} editable={editable} accent={accent} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                     */
/* -------------------------------------------------------------------------- */

function ModernHeader({
  data,
  editable,
  accent
}: {
  data: ResumeData;
  editable: boolean;
  accent: string;
}) {
  const b = data.sections.basics;
  return (
    <header className="mb-6 border-b-2 border-zinc-900 pb-4">
      {/* Name + label */}
      <div className="mb-3">
        <h1 className="text-[32pt] font-bold leading-none tracking-tight text-zinc-900">
          {editable ? (
            <EditableText
              path="sections.basics.name"
              className="inline"
              placeholder="Your name"
            />
          ) : isSet(b.name) ? (
            b.name
          ) : null}
        </h1>
        {editable ? (
          <p className="mt-1 text-[12pt] font-medium uppercase tracking-wider text-zinc-600">
            <EditableText
              path="sections.basics.label"
              className="inline"
              placeholder="Senior Software Engineer"
            />
          </p>
        ) : isSet(b.label) ? (
          <p className="mt-1 text-[12pt] font-medium uppercase tracking-wider text-zinc-600">
            {b.label}
          </p>
        ) : null}
      </div>

      {/* Contact + location (same EditableText-backed components as Classic) */}
      {editable ? (
        <>
          <ContactLineEditable contact={b} />
          <LocationLineEditable location={b.location} />
        </>
      ) : (
        <ModernContactReadonly basics={b} />
      )}

      {/* Accent line — the visual signature */}
      <div
        aria-hidden="true"
        className="mt-3 h-1 w-16 rounded-full"
        style={{ backgroundColor: "var(--modern-accent, #4f46e5)" }}
        data-accent-bar={accent}
      />
    </header>
  );
}

function isSet(s: string | undefined | null): boolean {
  return Boolean(s && s.trim());
}

function ModernContactReadonly({
  basics
}: {
  basics: ResumeData["sections"]["basics"];
}) {
  const contactBits = [basics.email, basics.phone, basics.url].filter(isSet);
  const locBits = [
    basics.location.city,
    basics.location.region,
    basics.location.countryCode
  ].filter(isSet);

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
        <div className="mt-1 text-zinc-500">{locBits.join(", ")}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body                                                                       */
/* -------------------------------------------------------------------------- */

function ModernBody({
  data,
  editable,
  accent: _accent
}: {
  data: ResumeData;
  editable: boolean;
  accent: string;
}) {
  return (
    <main className="space-y-5">
      {isSet(data.sections.basics.summary) && (
        <ModernSection title="Summary" editable={editable}>
          {editable ? (
            <EditableTextarea
              path="sections.basics.summary"
              className="block w-full text-[11pt] leading-relaxed"
              placeholder="A couple of lines summarizing who you are and what you're looking for."
            />
          ) : (
            <p className="text-[11pt] leading-relaxed text-zinc-700">
              {data.sections.basics.summary}
            </p>
          )}
        </ModernSection>
      )}

      <ModernExperience data={data} editable={editable} />
      <ModernProjects data={data} editable={editable} />
      <ModernEducation data={data} editable={editable} />
      <ModernSkills data={data} editable={editable} />
      <ModernVolunteer data={data} editable={editable} />
      <ModernAwards data={data} editable={editable} />
      <ModernCertificates data={data} editable={editable} />
      <ModernPublications data={data} editable={editable} />
      <ModernLanguages data={data} editable={editable} />
      <ModernInterests data={data} editable={editable} />
      <ModernReferences data={data} editable={editable} />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section chrome                                                             */
/* -------------------------------------------------------------------------- */

function ModernSection({
  title,
  editable: _editable,
  children
}: {
  title: string;
  editable: boolean;
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
/*  Per-section renderers (mirror classic's data flow, modern chrome)         */
/* -------------------------------------------------------------------------- */

function ModernExperience({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.work?.length) return null;
  return (
    <ModernSection title="Experience" editable={editable}>
      <div className="space-y-4">
        {data.sections.work.map((w, i) => (
          <ModernWorkEntry
            key={`w-${i}`}
            index={i}
            data={data}
            editable={editable}
          />
        ))}
      </div>
    </ModernSection>
  );
}

function ModernWorkEntry({
  index,
  data,
  editable
}: {
  index: number;
  data: ResumeData;
  editable: boolean;
}) {
  const w = data.sections.work[index];
  if (!w) return null;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[12pt] font-semibold text-zinc-900">
          <EditableText
            path={`sections.work.${index}.company`}
            className="inline"
            placeholder="Company"
          />
        </h3>
        <span className="text-[10pt] text-zinc-500">
          <EditableText
            path={`sections.work.${index}.location`}
            className="inline"
            placeholder="Remote"
          />
        </span>
      </div>
      {has(w.positions) ? (
        <div className="space-y-3 pl-3">
          {w.positions.map((p, j) => (
            <ModernWorkPosition
              key={`p-${j}`}
              workIndex={index}
              positionIndex={j}
              data={data}
              editable={editable}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModernWorkPosition({
  workIndex,
  positionIndex,
  data,
  editable
}: {
  workIndex: number;
  positionIndex: number;
  data: ResumeData;
  editable: boolean;
}) {
  const p = data.sections.work[workIndex]?.positions?.[positionIndex];
  if (!p) return null;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[11pt] font-medium text-zinc-800">
          <EditableText
            path={`sections.work.${workIndex}.positions.${positionIndex}.title`}
            className="inline"
            placeholder="Title"
          />
        </p>
        <DateRange
          editable={editable}
          start={p.startDate}
          end={p.endDate}
          startPath={`sections.work.${workIndex}.positions.${positionIndex}.startDate`}
          endPath={`sections.work.${workIndex}.positions.${positionIndex}.endDate`}
        />
      </div>
      {has(p.highlights) && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400">
          {p.highlights.map((h, k) => (
            <li key={`h-${k}`}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModernProjects({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.projects?.length) return null;
  return (
    <ModernSection title="Projects" editable={editable}>
      <div className="space-y-3">
        {data.sections.projects.map((p, i) => (
          <div key={`p-${i}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-[12pt] font-semibold text-zinc-900">
                <EditableText
                  path={`sections.projects.${i}.name`}
                  className="inline"
                  placeholder="Project name"
                />
              </h3>
              <DateRange
                editable={editable}
                start={p.startDate}
                end={p.endDate}
                startPath={`sections.projects.${i}.startDate`}
                endPath={`sections.projects.${i}.endDate`}
              />
            </div>
            {isSet(p.description) && (
              <p className="mt-0.5 text-[11pt] text-zinc-700">{p.description}</p>
            )}
            {has(p.highlights) && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400">
                {p.highlights.map((h, k) => (
                  <li key={`h-${k}`}>{h}</li>
                ))}
              </ul>
            )}
            {has(p.keywords) && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.keywords.map((k, idx) => (
                  <span
                    key={idx}
                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-[9pt] text-zinc-600"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ModernSection>
  );
}

function ModernEducation({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.education?.length) return null;
  return (
    <ModernSection title="Education" editable={editable}>
      <div className="space-y-3">
        {data.sections.education.map((e, i) => (
          <div key={`e-${i}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-[12pt] font-semibold text-zinc-900">
                <EditableText
                  path={`sections.education.${i}.institution`}
                  className="inline"
                  placeholder="Institution"
                />
              </h3>
              <DateRange
                editable={editable}
                start={e.startDate}
                end={e.endDate}
                startPath={`sections.education.${i}.startDate`}
                endPath={`sections.education.${i}.endDate`}
              />
            </div>
            <p className="text-[11pt] text-zinc-700">
              <EditableText
                path={`sections.education.${i}.degree.degreeLevel`}
                className="inline"
                placeholder="Degree"
              />
              {has(e.degree.majors) && (
                <span className="text-zinc-500">
                  {" "}
                  ·{" "}
                  <EditableText
                    path={`sections.education.${i}.degree.majors.0`}
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

function ModernSkills({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.skills?.length) return null;
  return (
    <ModernSection title="Skills" editable={editable}>
      <div className="space-y-2">
        {data.sections.skills.map((s, i) => (
          <div key={`s-${i}`} className="flex flex-wrap gap-x-3 text-[11pt]">
            <span className="min-w-[140px] font-semibold text-zinc-900">
              <EditableText
                path={`sections.skills.${i}.name`}
                className="inline"
                placeholder="Category"
              />
            </span>
            <span className="flex-1 text-zinc-700">
              <KeywordChips
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

function ModernVolunteer({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.volunteer?.length) return null;
  return (
    <ModernSection title="Volunteer" editable={editable}>
      <div className="space-y-3">
        {data.sections.volunteer.map((v, i) => (
          <div key={`v-${i}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-[12pt] font-semibold text-zinc-900">
                <EditableText
                  path={`sections.volunteer.${i}.organization`}
                  className="inline"
                  placeholder="Organization"
                />
              </h3>
              <DateRange
                editable={editable}
                start={v.startDate}
                end={v.endDate}
                startPath={`sections.volunteer.${i}.startDate`}
                endPath={`sections.volunteer.${i}.endDate`}
              />
            </div>
            <p className="text-[11pt] text-zinc-700">
              <EditableText
                path={`sections.volunteer.${i}.position`}
                className="inline"
                placeholder="Role"
              />
            </p>
          </div>
        ))}
      </div>
    </ModernSection>
  );
}

function ModernAwards({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.awards?.length) return null;
  return (
    <ModernSection title="Awards" editable={editable}>
      <div className="space-y-2">
        {data.sections.awards.map((a, i) => (
            <div key={`a-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <div>
              <h3 className="text-[11pt] font-semibold text-zinc-900">
                <EditableText
                  path={`sections.awards.${i}.title`}
                  className="inline"
                  placeholder="Award title"
                />
              </h3>
              {isSet(a.awarder) && (
                <p className="text-[10pt] text-zinc-500">{a.awarder}</p>
              )}
            </div>
            {isSet(a.date) && (
              <span className="text-[10pt] text-zinc-500">{a.date}</span>
            )}
          </div>
        ))}
      </div>
    </ModernSection>
  );
}

function ModernCertificates({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.certificates?.length) return null;
  return (
    <ModernSection title="Certificates" editable={editable}>
      <div className="space-y-2">
        {data.sections.certificates.map((c, i) => (
            <div key={`c-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <div>
              <h3 className="text-[11pt] font-semibold text-zinc-900">
                <EditableText
                  path={`sections.certificates.${i}.name`}
                  className="inline"
                  placeholder="Certificate name"
                />
              </h3>
              {isSet(c.issuer) && (
                <p className="text-[10pt] text-zinc-500">{c.issuer}</p>
              )}
            </div>
            {isSet(c.date) && (
              <span className="text-[10pt] text-zinc-500">{c.date}</span>
            )}
          </div>
        ))}
      </div>
    </ModernSection>
  );
}

function ModernPublications({
  data,
  editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.publications?.length) return null;
  return (
    <ModernSection title="Publications" editable={editable}>
      <div className="space-y-2">
        {data.sections.publications.map((p, i) => (
          <div key={`p-${i}`}>
            <h3 className="text-[11pt] font-semibold text-zinc-900">
              <EditableText
                path={`sections.publications.${i}.name`}
                className="inline"
                placeholder="Title"
              />
            </h3>
            {isSet(p.publisher) && (
              <p className="text-[10pt] text-zinc-500">
                {p.publisher}
                {isSet(p.releaseDate) && ` · ${p.releaseDate}`}
              </p>
            )}
          </div>
        ))}
      </div>
    </ModernSection>
  );
}

function ModernLanguages({
  data,
  editable: _editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.languages?.length) return null;
  return (
    <ModernSection title="Languages" editable={_editable}>
      <div className="flex flex-wrap gap-x-4 text-[11pt]">
        {data.sections.languages.map((l, i) => (
          <span key={`l-${i}`}>
            <span className="font-semibold text-zinc-900">{l.language}</span>
            {isSet(l.fluency) && (
              <span className="ml-1 text-zinc-500">· {l.fluency}</span>
            )}
          </span>
        ))}
      </div>
    </ModernSection>
  );
}

function ModernInterests({
  data,
  editable: _editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.interests?.length) return null;
  return (
    <ModernSection title="Interests" editable={_editable}>
      <p className="text-[11pt] text-zinc-700">
        {data.sections.interests
          .flatMap((i) => i.keywords ?? [])
          .filter(Boolean)
          .join(" · ")}
      </p>
    </ModernSection>
  );
}

function ModernReferences({
  data,
  editable: _editable
}: {
  data: ResumeData;
  editable: boolean;
}) {
  if (!data.sections.references?.length) return null;
  return (
    <ModernSection title="References" editable={_editable}>
      <div className="space-y-2">
        {data.sections.references.map((r, i) => (
          <div key={`r-${i}`}>
            <p className="text-[11pt] font-semibold text-zinc-900">
              {r.name}
            </p>
            {isSet(r.reference) && (
              <p className="text-[11pt] italic text-zinc-600">
                {r.reference}
              </p>
            )}
          </div>
        ))}
      </div>
    </ModernSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Registry export                                                            */
/* -------------------------------------------------------------------------- */

function has<T>(arr: T[] | undefined | null): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}
