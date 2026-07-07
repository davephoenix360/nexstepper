import type { ResumeData } from '@/lib/resume-schema';
import { cn } from '@/lib/utils';

import type { ResumeTemplate } from './types';
import {
  EditableText,
  EditableTextarea,
  AddWorkButton
} from '@/components/editable';

/**
 * The "Classic" resume template.
 *
 * Single-column, generous whitespace, thin horizontal rules between sections.
 * Reads cleanly on screen and prints one-page (or multi-page for long
 * histories) via the global `@page` rules in `app/globals.css`.
 *
 * Editable mode
 * ------------
 * When the `editable` prop is true, the basics header + each work entry
 * (company, location, dates, title) render via the project's <EditableText>
 * primitive instead of plain text. Hover/cursor states advertise the
 * edit affordance on screen; both vanish in print so the PDF looks
 * identical to the read-only render. The "Add a work entry" button is
 * added inside the Experience section so the user can grow their resume
 * from inside the rendered view.
 *
 * Sections:
 *  - Header (name, label, contact strip, location)
 *  - Summary
 *  - Work experience (company → positions → highlights)
 *  - Projects (name, description, highlights, tech keywords)
 *  - Skills (category → keywords)
 *  - Education
 *  - Volunteer (optional)
 *  - Awards (optional)
 *
 * Other-side concerns (sections we don't inline-edit in v1 — Skills,
 * Projects, Education, etc.) render as static reads of `data`. They'll
 * be lifted into inline-editable in subsequent slices.
 *
 * Server-component purity: this file itself stays a server component
 * (no hooks, no event handlers), so Phase 2's `renderToString` PDF
 * step keeps working without changes. The EditableText children are
 * client components, which Next.js handles transparently at the
 * server/client boundary.
 */
export function ClassicTemplate({
  data,
  editable = false
}: {
  data: ResumeData;
  editable?: boolean;
}) {
  const { sections } = data;

  // Light helpers — kept local so the template stays self-contained.
  const isSet = (s: string | undefined | null) => Boolean(s && s.trim());
  const has = <T,>(arr: T[] | undefined) => Boolean(arr && arr.length > 0);

  const b = sections.basics;
  const contactBits = [b.email, b.phone, b.url].filter(isSet);
  const locBits = [b.location.city, b.location.region, b.location.countryCode]
    .filter(isSet);

  // Section visibility. In editable mode, the Experience section is
  // always rendered — even with zero entries — so the "+ Add a work
  // entry" affordance is reachable. The Add button itself has `.no-print`
  // and renders nothing in PDF.
  const showHeader =
    editable ||
    isSet(b.name) ||
    isSet(b.label) ||
    contactBits.length > 0 ||
    locBits.length > 0;
  const showSummary = editable || isSet(b.summary);
  const showWork = editable || has(sections.work);
  const showProjects = has(sections.projects);
  const showSkills = has(sections.skills);
  const showEducation = has(sections.education);
  const showVolunteer = has(sections.volunteer);
  const showAwards = has(sections.awards);

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
            {/* Name (h1) */}
            {editable ? (
              <EditableText
                path="sections.basics.name"
                as="h1"
                className="text-[26pt] font-semibold leading-none tracking-tight text-zinc-900"
                placeholder="Your name"
              />
            ) : (
              isSet(b.name) && (
                <h1 className="text-[26pt] font-semibold leading-none tracking-tight text-zinc-900">
                  {b.name}
                </h1>
              )
            )}

            {/* Label */}
            {editable ? (
              <EditableText
                path="sections.basics.label"
                as="p"
                className="mt-1 text-[12pt] font-medium text-zinc-600"
                placeholder="Senior Software Engineer"
              />
            ) : (
              isSet(b.label) && (
                <p className="mt-1 text-[12pt] font-medium text-zinc-600">
                  {b.label}
                </p>
              )
            )}

            {/* Contact line (email · phone · url) */}
            <div className="mt-2 text-[10pt] text-zinc-600">
              {editable ? (
                <ContactLineEditable contact={b} />
              ) : contactBits.length > 0 ? (
                contactBits.map((bit, i) => (
                  <span key={`${bit}-${i}`}>
                    {i > 0 && <span className="mx-2 text-zinc-400">·</span>}
                    {bit}
                  </span>
                ))
              ) : null}
            </div>

            {/* Location */}
            <div className="mt-1 text-[10pt] text-zinc-500">
              {editable ? (
                <LocationLineEditable location={b.location} />
              ) : locBits.length > 0 ? (
                locBits.join(', ')
              ) : null}
            </div>

            {/* Online profiles — single concatenated line, never editable
                in v1 (chip input is a separate slice). */}
            {!editable && has(b.profiles) && (
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

        {/* Summary */}
        {showSummary && (
          <Section title="Summary">
            {editable ? (
              <EditableTextarea
                path="sections.basics.summary"
                rows={4}
                className="text-[11pt]"
                placeholder="A couple of lines summarizing who you are and what you're looking for."
              />
            ) : (
              <p className="text-[11pt]">{b.summary}</p>
            )}
          </Section>
        )}

        {/* Experience */}
        {showWork && (
          <Section title="Experience">
            {sections.work.map((w, i) => (
              <div
                key={`work-${i}`}
                className="mb-4 last:mb-0 print:break-inside-avoid"
              >
                <div className="flex items-baseline justify-between gap-3">
                  {editable ? (
                    <EditableText
                      path={`sections.work.${i}.company`}
                      as="h3"
                      className="text-[12pt] font-semibold text-zinc-900"
                      placeholder="Company"
                    />
                  ) : (
                    <h3 className="text-[12pt] font-semibold text-zinc-900">
                      {isSet(w.company) ? w.company : 'Company'}
                    </h3>
                  )}
                  {editable ? (
                    <EditableText
                      path={`sections.work.${i}.location`}
                      className="text-[10pt] text-zinc-500 w-40 text-right"
                      placeholder="Remote"
                    />
                  ) : (
                    isSet(w.location) && (
                      <span className="text-[10pt] text-zinc-500">
                        {w.location}
                      </span>
                    )
                  )}
                </div>
                {editable ? (
                  <EditableText
                    path={`sections.work.${i}.description`}
                    className="mt-0.5 text-[10pt] italic text-zinc-600 block"
                    placeholder="Short company blurb (1 sentence)."
                  />
                ) : (
                  isSet(w.description) && (
                    <p className="mt-0.5 text-[10pt] italic text-zinc-600">
                      {w.description}
                    </p>
                  )
                )}
                {(has(w.positions) || editable) && (
                  <div className="mt-2 space-y-3">
                    {w.positions.map((p, j) => (
                      <div key={`work-${i}-pos-${j}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          {editable ? (
                            <EditableText
                              path={`sections.work.${i}.positions.${j}.title`}
                              as="p"
                              className="text-[11pt] font-medium text-zinc-800"
                              placeholder="Title"
                            />
                          ) : (
                            <p className="text-[11pt] font-medium text-zinc-800">
                              {isSet(p.title) ? p.title : 'Position'}
                            </p>
                          )}
                          <DateRange
                            start={p.startDate}
                            end={p.endDate}
                            editable={editable}
                            startPath={`sections.work.${i}.positions.${j}.startDate`}
                            endPath={`sections.work.${i}.positions.${j}.endDate`}
                          />
                        </div>
                        {has(p.highlights) && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400">
                            {p.highlights.map((h, k) => (
                              <li key={`work-${i}-pos-${j}-h-${k}`}>{h}</li>
                            ))}
                          </ul>
                        )}
                        {/* In editable mode we could expose highlights
                            as EditableText list items, but they're a
                            stretch goal; the static bullets render
                            acceptably and the user can use the dialog
                            (section edit) for full editing. */}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {editable && <AddWorkButton path="sections.work" />}
          </Section>
        )}

        {/* Projects — always static in v1 */}
        {showProjects && (
          <Section title="Projects">
            {sections.projects.map((p, i) => (
              <div key={`proj-${i}`} className="mb-3 last:mb-0 print:break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[12pt] font-semibold text-zinc-900">
                    {isSet(p.name) ? p.name : 'Project'}
                  </h3>
                  <DateRange start={p.startDate} end={p.endDate} />
                </div>
                {isSet(p.description) && (
                  <p className="mt-0.5 text-[11pt] text-zinc-700">
                    {p.description}
                  </p>
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

        {/* Skills — static in v1 */}
        {showSkills && (
          <Section title="Skills">
            <div className="space-y-1">
              {sections.skills.map((s, i) => (
                <div key={`skill-${i}`} className="flex gap-2 text-[11pt]">
                  <span className="font-medium text-zinc-900">
                    {isSet(s.name) ? s.name : 'Category'}
                  </span>
                  {has(s.keywords) && (
                    <span className="text-zinc-700">
                      — {s.keywords.join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Education — static in v1 */}
        {showEducation && (
          <Section title="Education">
            {sections.education.map((e, i) => (
              <div key={`edu-${i}`} className="mb-3 last:mb-0 print:break-inside-avoid">
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

        {/* Volunteer — static in v1 */}
        {showVolunteer && (
          <Section title="Volunteer">
            {sections.volunteer.map((v, i) => (
              <div key={`vol-${i}`} className="mb-3 last:mb-0 print:break-inside-avoid">
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

        {/* Awards — static in v1 */}
        {showAwards && (
          <Section title="Awards">
            {sections.awards.map((a, i) => (
              <div key={`award-${i}`} className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-zinc-900">
                    {isSet(a.title) ? a.title : 'Award'}
                  </span>
                  {isSet(a.date) && (
                    <span className="text-[10pt] text-zinc-500">{a.date}</span>
                  )}
                </div>
                {isSet(a.awarder) && (
                  <p className="text-zinc-700">{a.awarder}</p>
                )}
                {isSet(a.summary) && (
                  <p className="text-zinc-600">{a.summary}</p>
                )}
              </div>
            ))}
          </Section>
        )}
      </div>
    </article>
  );
}

/**
 * Editable contact line — three EditableTexts separated by " · ".
 * Renders the contact line inline so it stays one tag in the DOM (good
 * for PDF copy/paste and screen-reader a11y).
 */
function ContactLineEditable({
  contact
}: {
  contact: ResumeData['sections']['basics'];
}) {
  const items: Array<{ path: string; placeholder: string }> = [
    { path: 'sections.basics.email', placeholder: 'email@example.com' },
    { path: 'sections.basics.phone', placeholder: '+1 (555) 123-4567' },
    { path: 'sections.basics.url', placeholder: 'website.com' }
  ];
  return (
    <>
      {items.map((item, i) => (
        <span key={item.path}>
          {i > 0 && <span className="mx-2 text-zinc-400">·</span>}
          <EditableText
            path={item.path}
            className="inline"
            placeholder={item.placeholder}
          />
        </span>
      ))}
    </>
  );
}

/**
 * Editable location — three EditableTexts in the canonical "city, region,
 * country" order. Empty fields collapse visually because each EditableText
 * shows muted placeholder when empty (e.g. "City").
 */
function LocationLineEditable({
  location
}: {
  location: ResumeData['sections']['basics']['location'];
}) {
  return (
    <>
      <EditableText
        path="sections.basics.location.city"
        className="inline"
        placeholder="City"
      />
      <EditableText
        path="sections.basics.location.region"
        className="inline before:content-[',_'] ml-1"
        placeholder="Region"
      />
      <EditableText
        path="sections.basics.location.countryCode"
        className="inline before:content-[',_'] ml-1"
        placeholder="Country"
      />
    </>
  );
}

/**
 * Section wrapper — small uppercase tracking-wide title with a thin rule
 * underneath. Using a custom helper (vs. a raw `<section>`) keeps the look
 * locked across the template.
 */
function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h2 className="mb-2 border-b border-zinc-300 pb-0.5 text-[10pt] font-semibold uppercase tracking-[0.12em] text-zinc-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Compact date range — handles "Present" / empty trailing endDates cleanly.
 * Shows just the year part for ISO 8601 dates (`2020-01-15` → `2020`)
 * because resumes almost never care about month precision.
 *
 * Editable variant
 * ---------------
 * When `editable` is true, the start and end become two EditableTexts
 * with a separator. Empty end renders as "Present" (ResumeData
 * convention). Both fields use the same typography as the static view
 * so the on-screen + print rendering stays aligned.
 */
function DateRange({
  start,
  end,
  editable = false,
  startPath,
  endPath
}: {
  start?: string;
  end?: string;
  editable?: boolean;
  startPath?: string;
  endPath?: string;
}) {
  const fmt = (d: string | undefined) => {
    if (!isSet_(d)) return '';
    const m = /^(\d{4})/.exec(d!.trim());
    return m ? m[1] : d;
  };
  const s = fmt(start);
  const e = fmt(end);

  if (editable && startPath && endPath) {
    return (
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[10pt] text-zinc-500">
        <EditableText
          path={startPath}
          className="inline w-12 text-right"
          placeholder="YYYY"
        />
        <span>–</span>
        <EditableText
          path={endPath}
          className="inline w-12"
          placeholder="Present"
        />
      </span>
    );
  }

  if (!s && !e) return null;
  return (
    <span className="text-[10pt] whitespace-nowrap text-zinc-500">
      {s || '—'} – {e || 'Present'}
    </span>
  );
}

function isSet_(s: string | undefined | null) {
  return Boolean(s && s.trim());
}

export const classicTemplate = {
  meta: {
    id: 'classic',
    name: 'Classic',
    version: '1.0.0',
    description: 'Single-column, generous whitespace, ATS-friendly.'
  },
  Component: ClassicTemplate
} as const satisfies ResumeTemplate;
