/**
 * ClassicReadOnly — the server-renderable read-only view of the Classic
 * template. Used by the preview page, the PDF render path, and any
 * future non-editor context.
 *
 * Why this exists
 *   The full Classic template (`./classic.tsx`) is a `'use client'`
 *   component that calls `useFormContext()` and `useFieldArray()` at
 *   the top to wire its editor affordances (X-remove, +Add). Those
 *   hooks require a react-hook-form `FormProvider` in the tree. In
 *   the editor (`<EditableResume>` provides one), everything works.
 *   In the preview page (no form context), ClassicTemplate crashes
 *   with "Cannot destructure property 'control' of 'useFormContext()'
 *   as it is null".
 *
 *   The proper fix: split the template into two views. The full
 *   component stays in classic.tsx for the editor. This file holds
 *   the read-only view — same layout, no hooks, no editor
 *   affordances, no editor state.
 *
 * SOT note (important)
 *   The full `ClassicTemplate` in classic.tsx is the source of truth
 *   for layout. This file mirrors it intentionally, with each
 *   `editable ? X : Y` resolved to just the `Y` (read-only) path.
 *   Duplication is real; dedup is deferred to the "extract
 *   renderLayout(data, leafRenderer) function" refactor in a later
 *   slice. The current duplication is bounded by ~14 sections × ~30
 *   lines each = ~400 lines of mechanical translation; the layout
 *   is identical otherwise.
 *
 *   When editing: change BOTH files. The CR review workflow + the
 *   visual diff at the editor preview will catch one without the
 *   other (a missing section appears as a 500 in the preview route
 *   and a visual diff in the editor).
 */

import * as React from 'react';

import { cn } from '@/lib/utils';
import type { ResumeData } from '@/lib/resume-schema';
import { isSectionHiddenFromPrint } from '@/lib/resume-schema/resume-data';

import { DateRange } from './date-range';
import { read } from './field';

const isSet = (s: string | undefined | null): boolean => Boolean(s && s.trim());
const has = <T,>(arr: T[] | undefined): boolean => Boolean(arr && arr.length > 0);

function str(data: unknown, path: string): string {
  const v = read(data, path);
  return typeof v === 'string' ? v : '';
}

function arr(data: unknown, path: string): string[] {
  const v = read(data, path);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function Section({
  title,
  id,
  sectionSlug,
  data,
  children,
  className
}: {
  title: string;
  /**
   * Stable DOM id for the inline-issue surface's scroll-to +
   * pulse target. Optional — callers that don't pass it get
   * the legacy un-anchored header.
   */
  id?: string;
  /**
   * Print-hide slug from `SECTION_TABLE`. When provided AND
   * present in `data.print.hiddenSections`, the section gets
   * `print:hidden opacity-60`. The read-only path uses the
   * synchronous `isSectionHiddenFromPrint()` predicate (no
   * RHF — this template renders server-side without
   * `<FormProvider>`).
   */
  sectionSlug?: string;
  data: ResumeData;
  children: React.ReactNode;
  className?: string;
}) {
  const isHidden = sectionSlug
    ? isSectionHiddenFromPrint(data, sectionSlug)
    : false;
  return (
    <section
      id={id}
      className={cn(
        'mb-5 last:mb-0',
        className,
        sectionSlug && isHidden && 'print:hidden opacity-60'
      )}
    >
      <h2 className="mb-2 border-b border-zinc-300 pb-0.5 text-[10pt] font-semibold uppercase tracking-[0.12em] text-zinc-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

type Props = { data: ResumeData };

/**
 * Server-renderable read-only Classic view. No hooks. No editor
 * state. Renders directly from `data`.
 */
export function ClassicReadOnly({ data }: Props) {
  const { sections } = data;
  const b = sections.basics;

  const contactBits = [b.email, b.phone, b.url].filter(isSet);
  const locBits = [b.location.city, b.location.region, b.location.countryCode].filter(isSet);

  const showHeader =
    isSet(b.name) || isSet(b.label) || contactBits.length > 0 || locBits.length > 0 || has(b.profiles);
  const showSummary = isSet(b.summary);
  const showWork = has(sections.work);
  const showProjects = has(sections.projects);
  const showSkills = has(sections.skills);
  const showEducation = has(sections.education);
  const showVolunteer = has(sections.volunteer);
  const showAwards = has(sections.awards);
  const showCertificates = has(sections.certificates);
  const showPublications = has(sections.publications);
  const showLanguages = has(sections.languages);
  const showInterests = has(sections.interests);
  const showReferences = has(sections.references);

  return (
    <article
      className={cn(
        'mx-auto w-full max-w-[8.5in] bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0',
        'font-[Inter,sans-serif] text-[11pt] leading-[1.45] text-zinc-800'
      )}
      data-template="classic"
    >
      <div className="px-12 py-10 print:px-0 print:py-0">
        {showHeader && (
          <header className="mb-6 border-b border-zinc-300 pb-4">
            {isSet(b.name) && (
              <h1 className="text-[26pt] font-semibold leading-none tracking-tight text-zinc-900">
                {b.name}
              </h1>
            )}
            {isSet(b.label) && (
              <p className="mt-1 text-[12pt] font-medium text-zinc-600">{b.label}</p>
            )}

            {contactBits.length > 0 && (
              <div className="mt-2 text-[10pt] text-zinc-600">
                {contactBits.map((bit, i) => (
                  <span key={`${bit}-${i}`}>
                    {i > 0 && <span className="mx-2 text-zinc-400">·</span>}
                    {bit}
                  </span>
                ))}
              </div>
            )}

            {locBits.length > 0 && (
              <div className="mt-1 text-[10pt] text-zinc-500">
                {locBits.join(', ')}
              </div>
            )}

            {has(b.profiles) && (
              <p className="mt-1 text-[10pt] text-zinc-500">
                {b.profiles
                  .filter((p) => isSet(p.network))
                  .map((p, i, arr) => (
                    <span key={`${p.network}-${i}`}>
                      {i > 0 && <span className="mx-2 text-zinc-400">·</span>}
                      {p.network}
                      {isSet(p.username) ? `: ${p.username}` : ''}
                    </span>
                  ))}
              </p>
            )}
          </header>
        )}

        {showSummary && (
          <Section title="Summary" id="section-summary" sectionSlug="summary" data={data}>
            <p className="text-[11pt]">{b.summary}</p>
          </Section>
        )}

        {showWork && (
          <Section title="Experience" id="section-experience" sectionSlug="experience" data={data}>
            {sections.work.map((w, i) => (
              <div
                key={`work-${i}`}
                className="mb-4 last:mb-0 print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[12pt] font-semibold text-zinc-900">
                    {isSet(w.company) ? w.company : 'Company'}
                  </h3>
                  {isSet(w.location) && (
                    <span className="text-[10pt] text-zinc-500">{w.location}</span>
                  )}
                </div>
                {isSet(w.description) && (
                  <p className="mt-0.5 text-[10pt] italic text-zinc-600">{w.description}</p>
                )}
                {has(w.positions) && (
                  <div className="mt-2 space-y-3">
                    {w.positions.map((p, j) => (
                      <div key={`work-${i}-pos-${j}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[11pt] font-medium text-zinc-800">
                            {isSet(p.title) ? p.title : 'Position'}
                          </p>
                          <DateRange start={p.startDate} end={p.endDate} />
                        </div>
                        {has(p.highlights) && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400">
                            {p.highlights.map((h, k) => (
                              <li key={`work-${i}-pos-${j}-h-${k}`}>{h}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}

        {showProjects && (
          <Section title="Projects" id="section-projects" sectionSlug="projects" data={data}>
            {sections.projects.map((p, i) => (
              <div
                key={`proj-${i}`}
                className="mb-3 last:mb-0 print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[12pt] font-semibold text-zinc-900">
                    {isSet(p.name) ? p.name : 'Project'}
                  </h3>
                  <DateRange start={p.startDate} end={p.endDate} />
                </div>
                {isSet(p.description) && (
                  <p className="mt-0.5 text-[11pt] text-zinc-700">{p.description}</p>
                )}
                {has(p.highlights) && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400">
                    {p.highlights.map((h, k) => (
                      <li key={`proj-${i}-h-${k}`}>{h}</li>
                    ))}
                  </ul>
                )}
                {has(p.keywords) && (
                  <p className="mt-1 text-[10pt] text-zinc-500">
                    {p.keywords.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </Section>
        )}

        {showSkills && (
          <Section title="Skills" id="section-skills" sectionSlug="skills" data={data}>
            <div className="space-y-1">
              {sections.skills.map((s, i) => (
                <div key={`skill-${i}`} className="flex gap-2 text-[11pt]">
                  <span className="font-medium text-zinc-900">
                    {isSet(s.name) ? s.name : 'Category'}
                  </span>
                  {has(s.keywords) && (
                    <span className="text-zinc-700">— {s.keywords.join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {showEducation && (
          <Section title="Education" id="section-education" sectionSlug="education" data={data}>
            {sections.education.map((e, i) => (
              <div
                key={`edu-${i}`}
                className="mb-3 last:mb-0 print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[12pt] font-semibold text-zinc-900">
                    {isSet(e.institution) ? e.institution : 'Institution'}
                  </h3>
                  <DateRange start={e.startDate} end={e.endDate} />
                </div>
                <p className="mt-0.5 text-[11pt] text-zinc-700">
                  {[
                    e.degree.degreeLevel,
                    ...e.degree.majors,
                    ...e.degree.minors.map((m) => `Minor: ${m}`)
                  ]
                    .filter(isSet)
                    .join(', ')}
                  {isSet(e.location) && (
                    <span className="ml-2 text-zinc-500">— {e.location}</span>
                  )}
                </p>
                {isSet(e.gpa) && (
                  <p className="text-[10pt] text-zinc-500">GPA: {e.gpa}</p>
                )}
              </div>
            ))}
          </Section>
        )}

        {showVolunteer && (
          <Section title="Volunteer" id="section-volunteer" sectionSlug="volunteer" data={data}>
            {sections.volunteer.map((v, i) => (
              <div
                key={`vol-${i}`}
                className="mb-3 last:mb-0 print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[12pt] font-semibold text-zinc-900">
                    {isSet(v.organization) ? v.organization : 'Organization'}
                  </h3>
                  <DateRange start={v.startDate} end={v.endDate} />
                </div>
                {isSet(v.position) && (
                  <p className="mt-0.5 text-[11pt] text-zinc-700">{v.position}</p>
                )}
                {has(v.highlights) && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400">
                    {v.highlights.map((h, k) => (
                      <li key={`vol-${i}-h-${k}`}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}

        {showAwards && (
          <Section title="Awards" id="section-awards" sectionSlug="awards" data={data}>
            {sections.awards.map((a, i) => (
              <div
                key={`award-${i}`}
                className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-zinc-900">
                    {isSet(a.title) ? a.title : 'Award'}
                  </span>
                  {isSet(a.date) && (
                    <span className="text-[10pt] text-zinc-500">{a.date}</span>
                  )}
                </div>
                {isSet(a.awarder) && <p className="text-zinc-700">{a.awarder}</p>}
                {isSet(a.summary) && <p className="text-zinc-600">{a.summary}</p>}
              </div>
            ))}
          </Section>
        )}

        {showCertificates && (
          <Section title="Certificates" id="section-certificates" sectionSlug="certificates" data={data}>
            {sections.certificates.map((c, i) => (
              <div
                key={`cert-${i}`}
                className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-zinc-900">
                    {isSet(c.name) ? c.name : 'Certificate'}
                  </span>
                  {isSet(c.date) && (
                    <span className="text-[10pt] text-zinc-500">{c.date}</span>
                  )}
                </div>
                {isSet(c.issuer) && <p className="text-zinc-700">{c.issuer}</p>}
              </div>
            ))}
          </Section>
        )}

        {showPublications && (
          <Section title="Publications" id="section-publications" sectionSlug="publications" data={data}>
            {sections.publications.map((p, i) => (
              <div
                key={`pub-${i}`}
                className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-zinc-900">
                    {isSet(p.name) ? p.name : 'Publication'}
                  </span>
                  {isSet(p.releaseDate) && (
                    <span className="text-[10pt] text-zinc-500">{p.releaseDate}</span>
                  )}
                </div>
                {isSet(p.publisher) && <p className="italic text-zinc-700">{p.publisher}</p>}
                {isSet(p.summary) && <p className="text-zinc-600">{p.summary}</p>}
              </div>
            ))}
          </Section>
        )}

        {showLanguages && (
          <Section title="Languages" id="section-languages" sectionSlug="languages" data={data}>
            <div className="space-y-1">
              {sections.languages.map((l, i) => (
                <div
                  key={`lang-${i}`}
                  className="flex gap-2 text-[11pt] print:break-inside-avoid"
                >
                  <span className="font-medium text-zinc-900">
                    {isSet(l.language) ? l.language : 'Language'}
                  </span>
                  {isSet(l.fluency) && (
                    <span className="text-zinc-700">— {l.fluency}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {showInterests && (
          <Section title="Interests" id="section-interests" sectionSlug="interests" data={data}>
            <div className="space-y-1">
              {sections.interests.map((it, i) => (
                <div
                  key={`interest-${i}`}
                  className="flex gap-2 text-[11pt] print:break-inside-avoid"
                >
                  <span className="font-medium text-zinc-900">
                    {isSet(it.name) ? it.name : 'Category'}
                  </span>
                  {has(it.keywords) && (
                    <span className="text-zinc-700">— {it.keywords.join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {showReferences && (
          <Section title="References" id="section-references" sectionSlug="references" data={data}>
            {sections.references.map((r, i) => (
              <div
                key={`ref-${i}`}
                className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid"
              >
                {isSet(r.name) && (
                  <p className="font-semibold text-zinc-900">{r.name}</p>
                )}
                {isSet(r.reference) && (
                  <p className="italic text-zinc-700">"{r.reference}"</p>
                )}
              </div>
            ))}
          </Section>
        )}
      </div>
    </article>
  );
}
