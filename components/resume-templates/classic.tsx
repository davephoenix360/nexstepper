import type { ResumeData } from '@/lib/resume-schema';
import { cn } from '@/lib/utils';

import type { ResumeTemplate } from './types';

/**
 * The "Classic" resume template.
 *
 * Single-column, generous whitespace, thin horizontal rules between sections.
 * Reads cleanly on screen and prints one-page (or multi-page for long
 * histories) via the global `@page` rules in `app/globals.css`.
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
 * Sections with no content are skipped entirely so a near-empty resume
 * doesn't show eight "no X to show" headings.
 *
 * This is a server component — no hooks, no client-only APIs. Phase 2's
 * Playwright PDF step will `renderToString` it the same way.
 */
export function ClassicTemplate({ data }: { data: ResumeData }) {
  const { sections } = data;

  // Light helpers — kept local so the template stays self-contained.
  const isSet = (s: string | undefined | null) => Boolean(s && s.trim());
  const has = <T,>(arr: T[] | undefined) => Boolean(arr && arr.length > 0);

  const b = sections.basics;
  const contactBits = [b.email, b.phone, b.url].filter(isSet);
  const locBits = [b.location.city, b.location.region, b.location.countryCode]
    .filter(isSet);

  const showHeader =
    isSet(b.name) || isSet(b.label) || contactBits.length > 0 || locBits.length > 0;
  const showSummary = isSet(b.summary);
  const showWork = has(sections.work);
  const showProjects = has(sections.projects);
  const showSkills = has(sections.skills);
  const showEducation = has(sections.education);
  const showVolunteer = has(sections.volunteer);
  const showAwards = has(sections.awards);

  return (
    <article
      className={cn(
        // Page-sized container, scaled via Tailwind's `[8.5in]` arbitrary
        // value so it matches US Letter without hard-coded px. The shadow
        // sells "paper" on screen; we strip it for print.
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
              <p className="mt-1 text-[12pt] font-medium text-zinc-600">
                {b.label}
              </p>
            )}
            {contactBits.length > 0 && (
              <p className="mt-2 text-[10pt] text-zinc-600">
                {contactBits.map((bit, i) => (
                  <span key={`${bit}-${i}`}>
                    {i > 0 && <span className="mx-2 text-zinc-400">·</span>}
                    {bit}
                  </span>
                ))}
              </p>
            )}
            {locBits.length > 0 && (
              <p className="mt-1 text-[10pt] text-zinc-500">{locBits.join(', ')}</p>
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
          <Section title="Summary">
            <p className="text-[11pt]">{b.summary}</p>
          </Section>
        )}

        {showWork && (
          <Section title="Experience">
            {sections.work.map((w, i) => (
              <div key={`${w.company}-${i}`} className="mb-4 last:mb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[12pt] font-semibold text-zinc-900">
                    {isSet(w.company) ? w.company : 'Company'}
                  </h3>
                  {isSet(w.location) && (
                    <span className="text-[10pt] text-zinc-500">
                      {w.location}
                    </span>
                  )}
                </div>
                {isSet(w.description) && (
                  <p className="mt-0.5 text-[10pt] italic text-zinc-600">
                    {w.description}
                  </p>
                )}
                {has(w.positions) && (
                  <div className="mt-2 space-y-3">
                    {w.positions.map((p, j) => (
                      <div key={`${w.company}-pos-${j}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[11pt] font-medium text-zinc-800">
                            {isSet(p.title) ? p.title : 'Position'}
                          </p>
                          <DateRange start={p.startDate} end={p.endDate} />
                        </div>
                        {has(p.highlights) && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11pt] marker:text-zinc-400">
                            {p.highlights.map((h, k) => (
                              <li key={`${w.company}-pos-${j}-h-${k}`}>{h}</li>
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
          <Section title="Projects">
            {sections.projects.map((p, i) => (
              <div key={`proj-${i}`} className="mb-3 last:mb-0">
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

        {showEducation && (
          <Section title="Education">
            {sections.education.map((e, i) => (
              <div key={`edu-${i}`} className="mb-3 last:mb-0">
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
          <Section title="Volunteer">
            {sections.volunteer.map((v, i) => (
              <div key={`vol-${i}`} className="mb-3 last:mb-0">
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
          <Section title="Awards">
            {sections.awards.map((a, i) => (
              <div key={`award-${i}`} className="mb-2 last:mb-0 text-[11pt]">
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
 */
function DateRange({ start, end }: { start?: string; end?: string }) {
  const fmt = (d: string | undefined) => {
    if (!isSet_(d)) return '';
    // Grab just the year when the schema gives us ISO date.
    const m = /^(\d{4})/.exec(d!.trim());
    return m ? m[1] : d;
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s && !e) return null;
  return (
    <span className="text-[10pt] whitespace-nowrap text-zinc-500">
      {s || '—'} – {e || 'Present'}
    </span>
  );
}

// Local isSet so we don't shadow the outer one in case I want to refactor.
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
