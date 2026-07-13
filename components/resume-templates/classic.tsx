"use client";

import type { ResumeData } from "@/lib/resume-schema";
import { cn } from "@/lib/utils";

import * as React from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Plus, X } from "lucide-react";

import { ClassicReadOnly } from "./classic-readonly";

import { Button } from "@/components/ui/button";
import {
  EditableText,
  EditableTextarea,
  AddWorkButton,
  BulletList,
  KeywordChips,
} from "@/components/editable";
import { DateRange } from "./date-range";
import { ContactLineEditable, LocationLineEditable } from "./header-lines";

/**
 * The "Classic" resume template.
 *
 * Single-column, generous whitespace, thin horizontal rules between sections.
 * Reads cleanly on screen and prints one-page (or multi-page for long
 * histories) via the global `@page` rules in `app/globals.css`.
 *
 * Editable mode
 * ------------
 * When the `editable` prop is true, the basics header + each work
 * entry (company, location, dates, title), the Skills section, the
 * Education section, the Projects section, the Volunteer section, and
 * the Awards section render via the project's inline-editing
 * primitives (<EditableText>, <KeywordChips>, <BulletList>,
 * <DateRangeField>, etc.) instead of plain text. Hover/cursor states
 * advertise the edit affordance on screen; both vanish in print so the
 * PDF looks identical to the read-only render. Section add/remove
 * buttons let the user grow the resume from inside the rendered view.
 *
 * Sections:
 *  - Header (name, label, contact strip, location)
 *  - Summary
 *  - Work experience (company → positions → highlights) — inline-editable
 *  - Skills (category → keywords) — inline-editable (chips)
 *  - Education (institution, dates, degree, majors) — inline-editable
 *  - Projects (name, dates, description, bullets, tech chips) — inline-editable
 *  - Volunteer (org, position, dates, summary, bullets) — inline-editable
 *  - Awards (title, awarder, date, summary) — inline-editable
 *
 * Sections still surfaced by the section-edit dialogs further down the
 * page (Certificates, Publications, Languages, Interests, References)
 * are read-only in this template and lift to inline in subsequent
 * slices — each is its own small chunk so the format-step stays
 * low-risk.
 *
 * Server-component purity note: this file IS itself a client
 * component (see the `"use client"` directive at the top of the
 * file). It uses `useFieldArray` / `useFormContext` for the inline
 * section add/remove controls in editable mode, which forces the
 * `use client` boundary. Print/PDF fidelity is preserved by
 * rendering `<ClassicTemplate>` with `editable={false}` for the
 * Phase 2.5 `renderToString` path — the inline editor primitives
 * are wrapped behind that prop and collapse to plain DOM at the
 * server boundary, so the PDF still reads as a one-column
 * print-clean resume.
 */
export function ClassicTemplate({
  data,
  editable = false,
}: {
  data: ResumeData;
  editable?: boolean;
}) {
  // Dispatch: editor → form-bound view, anywhere else → server-renderable
  // read-only view. The split is necessary because ClassicWithForm
  // calls useFormContext / useFieldArray at the top, which throw when
  // no FormProvider is in the tree. The preview page, the future PDF
  // render path, and any other non-editor context get ClassicReadOnly.
  if (editable) {
    return <ClassicWithForm data={data} editable={true} />;
  }
  return <ClassicReadOnly data={data} />;
}

/**
 * Editor view — the same code that used to be ClassicTemplate's body.
 * Calls useFormContext / useFieldArray at the top, requires a
 * FormProvider in the tree. Rendered by the editor's
 * <EditableResume>; never render this directly in a non-editor
 * context — use the dispatcher above.
 */
function ClassicWithForm({
  data,
  editable,
}: {
  data: ResumeData;
  editable: boolean;
}) {
  const { sections } = data;

  // We need useFieldArray on sections.work so a per-row ✕ button can
  // delete an entire work entry. (Positions handle their own delete
  // inside <WorkPositionsNested>.) Other section arrays manage their
  // own row ✕ inside their own <Inline> component, so this is the
  // only useFieldArray we need at the template body.
  const { control: rootControl } = useFormContext() as never;
  const { remove: removeWork } = useFieldArray({
    control: rootControl,
    name: "sections.work",
  }) as unknown as { remove: (i: number) => void };

  // Light helpers — kept local so the template stays self-contained.
  const isSet = (s: string | undefined | null) => Boolean(s && s.trim());
  const has = <T,>(arr: T[] | undefined) => Boolean(arr && arr.length > 0);

  /**
   * `print:hidden` if the section is empty AND we're in editable mode.
   *
   * Why "editable" matters: in editable mode we always render the section
   * (even empty) so the "Add …" affordance is reachable on screen. In
   * read-only mode empty sections aren't rendered at all, so print never
   * sees them. But in editable mode the section IS rendered, so we need
   * to suppress it for print or the PDF would show an empty "Projects"
   * header band on the page.
   *
   * Tailwind v4 ships a `print:` variant — `print:hidden` applies only
   * inside `@media print`, so the on-screen view is unaffected.
   */
  const printHiddenIf = (empty: boolean): string | undefined =>
    editable && empty ? "print:hidden" : undefined;

  const b = sections.basics;
  const contactBits = [b.email, b.phone, b.url].filter(isSet);
  const locBits = [
    b.location.city,
    b.location.region,
    b.location.countryCode,
  ].filter(isSet);

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
  const showProjects = editable || has(sections.projects);
  // Skills + Education are ALWAYS visible when editable — even with no
  // entries yet — so the "+ Add" affordance is reachable. In read-only
  // mode we hide them when there's nothing to show (mimic the previous
  // behavior).
  const showSkills = editable || has(sections.skills);
  const showEducation = editable || has(sections.education);
  const showVolunteer = editable || has(sections.volunteer);
  const showAwards = editable || has(sections.awards);
  const showCertificates = editable || has(sections.certificates);
  const showPublications = editable || has(sections.publications);
  const showLanguages = editable || has(sections.languages);
  const showInterests = editable || has(sections.interests);
  const showReferences = editable || has(sections.references);

  return (
    <article
      className={cn(
        "mx-auto w-full max-w-[8.5in] bg-white text-zinc-900 shadow-lg ring-1 ring-zinc-200/60 print:max-w-none print:shadow-none print:ring-0",
        "font-[Inter,sans-serif] text-[11pt] leading-[1.45] text-zinc-800",
      )}
      data-template="classic"
    >
      <div className="px-12 py-10 print:px-0 print:py-0">
        {showHeader && (
          <header
            className={cn(
              "mb-6 border-b border-zinc-300 pb-4",
              printHiddenIf(
                !isSet(b.name) &&
                  !isSet(b.label) &&
                  contactBits.length === 0 &&
                  locBits.length === 0,
              ),
            )}
          >
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

            {/* Contact line (email · phone · url) — the editable
                component owns its own wrapper + print:hidden, so it
                can suppress the "· ·" separator row entirely from
                the PDF when all three fields are empty. Read-only
                still returns null on empty (no need to render the
                wrapper at all). */}
            {editable ? (
              <ContactLineEditable contact={b} />
            ) : contactBits.length > 0 ? (
              <div className="mt-2 text-[10pt] text-zinc-600">
                {contactBits.map((bit, i) => (
                  <span key={`${bit}-${i}`}>
                    {i > 0 && <span className="mx-2 text-zinc-400">·</span>}
                    {bit}
                  </span>
                ))}
              </div>
            ) : null}

            {/* Location — same pattern as the contact line. */}
            {editable ? (
              <LocationLineEditable location={b.location} />
            ) : locBits.length > 0 ? (
              <div className="mt-1 text-[10pt] text-zinc-500">
                {locBits.join(", ")}
              </div>
            ) : null}

            {/* Online profiles — line of "LinkedIn: dave · GitHub:
                davephoenix360 · …". Read-only stays a flat paragraph
                (matches the static Classic rendering). In editable
                mode we render an inline-managed list so the user can
                add/remove networks without leaving the editor. */}
            {editable ? (
              <div className="mt-1">
                <OnlineProfilesInline />
              </div>
            ) : (
              has(b.profiles) && (
                <p className="mt-1 text-[10pt] text-zinc-500">
                  {b.profiles
                    .filter((p) => isSet(p.network))
                    .map((p, i, arr) => (
                      <span key={`${p.network}-${i}`}>
                        {i > 0 && <span className="mx-2 text-zinc-400">·</span>}
                        {p.network}
                        {isSet(p.username) ? `: ${p.username}` : ""}
                      </span>
                    ))}
                </p>
              )
            )}
          </header>
        )}

        {/* Summary */}
        {showSummary && (
          <Section title="Summary" className={printHiddenIf(!isSet(b.summary))}>
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
          <Section
            title="Experience"
            className={printHiddenIf(!has(sections.work))}
          >
            {sections.work.map((w, i) => (
              <div
                key={`work-${i}`}
                className="group/work-entry mb-4 last:mb-0 print:break-inside-avoid"
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
                      {isSet(w.company) ? w.company : "Company"}
                    </h3>
                  )}
                  {editable ? (
                    <>
                      <EditableText
                        path={`sections.work.${i}.location`}
                        className="text-[10pt] text-zinc-500 w-40 text-right"
                        placeholder="Remote"
                      />
                      {/*
                        Work entry remove. Sits in the top-right corner of
                        the row so the user can delete an entire employer
                        without removing each position individually.
                      */}
                      <button
                        type="button"
                        aria-label={`Remove work entry ${i + 1}`}
                        onClick={() => removeWork(i)}
                        className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover/work-entry:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        data-testid={`remove-work-${i}`}
                      >
                        <X className="size-3" />
                      </button>
                    </>
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
                {editable ? (
                  <div className="mt-2">
                    <WorkPositionsNested workIndex={i} />
                  </div>
                ) : (
                  has(w.positions) && (
                    <div className="mt-2 space-y-3">
                      {w.positions.map((p, j) => (
                        <div key={`work-${i}-pos-${j}`}>
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[11pt] font-medium text-zinc-800">
                              {isSet(p.title) ? p.title : "Position"}
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
                  )
                )}
              </div>
            ))}
            {editable && <AddWorkButton path="sections.work" />}
          </Section>
        )}

        {/* Projects */}
        {showProjects && (
          <Section
            title="Projects"
            className={printHiddenIf(!has(sections.projects))}
          >
            {editable ? (
              <ProjectsInline />
            ) : (
              <div>
                {sections.projects.map((p, i) => (
                  <div
                    key={`proj-${i}`}
                    className="mb-3 last:mb-0 print:break-inside-avoid"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-[12pt] font-semibold text-zinc-900">
                        {isSet(p.name) ? p.name : "Project"}
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
                        {p.keywords.join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Skills */}
        {showSkills && (
          <Section
            title="Skills"
            className={printHiddenIf(!has(sections.skills))}
          >
            {editable ? (
              <SkillsInline />
            ) : (
              <div className="space-y-1">
                {sections.skills.map((s, i) => (
                  <div key={`skill-${i}`} className="flex gap-2 text-[11pt]">
                    <span className="font-medium text-zinc-900">
                      {isSet(s.name) ? s.name : "Category"}
                    </span>
                    {has(s.keywords) && (
                      <span className="text-zinc-700">
                        — {s.keywords.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Education */}
        {showEducation && (
          <Section
            title="Education"
            className={printHiddenIf(!has(sections.education))}
          >
            {editable ? (
              <EducationInline />
            ) : (
              <>
                {sections.education.map((e, i) => (
                  <div
                    key={`edu-${i}`}
                    className="mb-3 last:mb-0 print:break-inside-avoid"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-[12pt] font-semibold text-zinc-900">
                        {isSet(e.institution) ? e.institution : "Institution"}
                      </h3>
                      <DateRange start={e.startDate} end={e.endDate} />
                    </div>
                    <p className="mt-0.5 text-[11pt] text-zinc-700">
                      {[
                        e.degree.degreeLevel,
                        ...e.degree.majors,
                        ...e.degree.minors.map((m) => `Minor: ${m}`),
                      ]
                        .filter(isSet)
                        .join(", ")}
                      {isSet(e.location) && (
                        <span className="ml-2 text-zinc-500">
                          — {e.location}
                        </span>
                      )}
                    </p>
                    {isSet(e.gpa) && (
                      <p className="text-[10pt] text-zinc-500">GPA: {e.gpa}</p>
                    )}
                  </div>
                ))}
              </>
            )}
          </Section>
        )}

        {/* Volunteer */}
        {showVolunteer && (
          <Section
            title="Volunteer"
            className={printHiddenIf(!has(sections.volunteer))}
          >
            {editable ? (
              <VolunteerInline />
            ) : (
              <div>
                {sections.volunteer.map((v, i) => (
                  <div
                    key={`vol-${i}`}
                    className="mb-3 last:mb-0 print:break-inside-avoid"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-[12pt] font-semibold text-zinc-900">
                        {isSet(v.organization)
                          ? v.organization
                          : "Organization"}
                      </h3>
                      <DateRange start={v.startDate} end={v.endDate} />
                    </div>
                    {isSet(v.position) && (
                      <p className="mt-0.5 text-[11pt] text-zinc-700">
                        {v.position}
                      </p>
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
              </div>
            )}
          </Section>
        )}

        {/* Awards */}
        {showAwards && (
          <Section
            title="Awards"
            className={printHiddenIf(!has(sections.awards))}
          >
            {editable ? (
              <AwardsInline />
            ) : (
              <div>
                {sections.awards.map((a, i) => (
                  <div
                    key={`award-${i}`}
                    className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-zinc-900">
                        {isSet(a.title) ? a.title : "Award"}
                      </span>
                      {isSet(a.date) && (
                        <span className="text-[10pt] text-zinc-500">
                          {a.date}
                        </span>
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
              </div>
            )}
          </Section>
        )}

        {/* Certificates */}
        {showCertificates && (
          <Section
            title="Certificates"
            className={printHiddenIf(!has(sections.certificates))}
          >
            {editable ? (
              <CertificatesInline />
            ) : (
              <div>
                {sections.certificates.map((c, i) => (
                  <div
                    key={`cert-${i}`}
                    className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-zinc-900">
                        {isSet(c.name) ? c.name : "Certificate"}
                      </span>
                      {isSet(c.date) && (
                        <span className="text-[10pt] text-zinc-500">
                          {c.date}
                        </span>
                      )}
                    </div>
                    {isSet(c.issuer) && (
                      <p className="text-zinc-700">{c.issuer}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Publications */}
        {showPublications && (
          <Section
            title="Publications"
            className={printHiddenIf(!has(sections.publications))}
          >
            {editable ? (
              <PublicationsInline />
            ) : (
              <div>
                {sections.publications.map((p, i) => (
                  <div
                    key={`pub-${i}`}
                    className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-zinc-900">
                        {isSet(p.name) ? p.name : "Publication"}
                      </span>
                      {isSet(p.releaseDate) && (
                        <span className="text-[10pt] text-zinc-500">
                          {p.releaseDate}
                        </span>
                      )}
                    </div>
                    {isSet(p.publisher) && (
                      <p className="italic text-zinc-700">{p.publisher}</p>
                    )}
                    {isSet(p.summary) && (
                      <p className="text-zinc-600">{p.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Languages */}
        {showLanguages && (
          <Section
            title="Languages"
            className={printHiddenIf(!has(sections.languages))}
          >
            {editable ? (
              <LanguagesInline />
            ) : (
              <div className="space-y-1">
                {sections.languages.map((l, i) => (
                  <div
                    key={`lang-${i}`}
                    className="flex gap-2 text-[11pt] print:break-inside-avoid"
                  >
                    <span className="font-medium text-zinc-900">
                      {isSet(l.language) ? l.language : "Language"}
                    </span>
                    {isSet(l.fluency) && (
                      <span className="text-zinc-700">— {l.fluency}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Interests */}
        {showInterests && (
          <Section
            title="Interests"
            className={printHiddenIf(!has(sections.interests))}
          >
            {editable ? (
              <InterestsInline />
            ) : (
              <div className="space-y-1">
                {sections.interests.map((it, i) => (
                  <div
                    key={`interest-${i}`}
                    className="flex gap-2 text-[11pt] print:break-inside-avoid"
                  >
                    <span className="font-medium text-zinc-900">
                      {isSet(it.name) ? it.name : "Category"}
                    </span>
                    {has(it.keywords) && (
                      <span className="text-zinc-700">
                        — {it.keywords.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* References */}
        {showReferences && (
          <Section
            title="References"
            className={printHiddenIf(!has(sections.references))}
          >
            {editable ? (
              <ReferencesInline />
            ) : (
              <div>
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
              </div>
            )}
          </Section>
        )}
      </div>
    </article>
  );
}

/**
 * ContactLineEditable + LocationLineEditable moved to
 * ./header-lines.tsx so they could be unit-tested in isolation.
 * The print-hide-when-all-empty logic lives there too.

/**
 * Section wrapper — small uppercase tracking-wide title with a thin rule
 * underneath. Using a custom helper (vs. a raw `<section>`) keeps the look
 * locked across the template.
 *
 * `className` lets callers push utilities like `print:hidden` (we use
 * that to suppress empty sections in PDF — empty in print looks like a
 * stray header band on the page).
 */
function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-5 last:mb-0", className)}>
      <h2 className="mb-2 border-b border-zinc-300 pb-0.5 text-[10pt] font-semibold uppercase tracking-[0.12em] text-zinc-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * DateRange was moved to ./date-range.tsx so it could be unit-tested
 * and so classic.tsx would stop being 1900+ lines. See that file
 * for the full contract.
 */

/**
 * Inline-editable Skills section. Renders one row per skill category
 * with the category name as an <EditableText> and the keywords as
 * <KeywordChips>. Includes a "+ Add a skill" button. All buttons are
 * .no-print so the PDF reads the underlying array only.
 *
 * Returns nothing on render — children attach directly under the
 * enclosing <Section title="Skills"> wrapper.
 *
 * Requires FormProvider context (comes from <EditableResume>).
 */
function SkillsInline() {
  const { control } = useFormContext() as never;
  // Cast through unknown — RHF's generic-inference leaves useFormContext
  // typed as `UseFormReturn<FieldValues>`; we accept the loose shape
  // because we never read `form` directly here.
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.skills",
  });

  function handleAdd() {
    append({ name: "", level: "", keywords: [] });
    // Focus the new category-name chip after paint.
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.skills.' + fields.length + '.name"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="skills-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`skill-row-${i}`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/* Category name — the bold label of the skill line. */}
            <EditableText
              path={`sections.skills.${i}.name`}
              className="text-[11pt] font-semibold text-zinc-900"
              placeholder="Category"
            />
            {/* Level — small optional "Level: Master" suffix inline. */}
            <span className="text-[10pt] text-zinc-500">
              <EditableText
                path={`sections.skills.${i}.level`}
                className="inline w-fit"
                placeholder="Level"
              />
            </span>
            <button
              type="button"
              aria-label={`Remove skill ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-skill-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="mt-2">
            <KeywordChips
              path={`sections.skills.${i}.keywords`}
              placeholder="keyword"
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-skill"
      >
        <Plus className="mr-1 size-3" />
        Add a skill
      </Button>
    </div>
  );
}

/**
 * Inline-editable Education section. Renders one row per school with:
 *   - Institution (the bold heading)
 *   - Location + dates as small inline labels
 *   - Degree level as a small editable label
 *   - Majors as <KeywordChips>
 *   - A ✕ button to remove the entry
 *
 * Minors and courses are deferred to a follow-up — they're rarely
 * used in v1 resumes.
 *
 * Requires FormProvider context.
 */
function EducationInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.education",
  });

  function handleAdd() {
    append({
      institution: "",
      url: "",
      location: "",
      degree: { degreeLevel: "", majors: [], minors: [] },
      startDate: "",
      endDate: "",
      gpa: "",
      courses: [],
    });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.education.' +
          fields.length +
          '.institution"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="education-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`edu-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {/* Institution + (location) on the line. */}
            <h3 className="text-[12pt] font-semibold text-zinc-900">
              <EditableText
                path={`sections.education.${i}.institution`}
                className="inline"
                placeholder="Institution"
              />
              <EditableText
                path={`sections.education.${i}.location`}
                className="ml-2 inline text-[10pt] font-normal text-zinc-500"
                placeholder="Location"
              />
            </h3>
            <DateRange
              editable
              // `field` is the useFieldArray row — typed as
              // Record<"id", string>, no section-specific fields. The
              // shape is locked in by the Zod schema; the cast keeps
              // the call site readable. (See the work-positions block
              // for the full reasoning.)
              start={(field as { startDate?: string }).startDate}
              end={(field as { endDate?: string }).endDate}
              startPath={`sections.education.${i}.startDate`}
              endPath={`sections.education.${i}.endDate`}
            />
            <button
              type="button"
              aria-label={`Remove education ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-edu-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="mt-1 text-[11pt] text-zinc-700">
            <EditableText
              path={`sections.education.${i}.degree.degreeLevel`}
              className="inline"
              placeholder="Degree"
            />
            <KeywordChips
              path={`sections.education.${i}.degree.majors`}
              placeholder="major"
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-education"
      >
        <Plus className="mr-1 size-3" />
        Add education
      </Button>
    </div>
  );
}

/**
 * Inline-editable Projects section. Mirrors {@link SkillsInline} /
 * {@link EducationInline} for projects: one row per project with
 *   - Name (bold heading)
 *   - Description (italic small blurb — uses EditableText single-line)
 *   - Highlights (BulletList — `string[]`)
 *   - Keywords (KeywordChips — tech stack)
 *   - DateRange
 *   - A ✕ remove button (no-print)
 *
 * Requires FormProvider context.
 */
function ProjectsInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.projects",
  });

  function handleAdd() {
    append({
      name: "",
      description: "",
      highlights: [],
      keywords: [],
      startDate: "",
      endDate: "",
      url: "",
      roles: [],
    });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.projects.' + fields.length + '.name"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="projects-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`proj-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[12pt] font-semibold text-zinc-900">
              <EditableText
                path={`sections.projects.${i}.name`}
                className="inline"
                placeholder="Project name"
              />
            </h3>
            <DateRange
              editable
              start={(field as { startDate?: string }).startDate}
              end={(field as { endDate?: string }).endDate}
              startPath={`sections.projects.${i}.startDate`}
              endPath={`sections.projects.${i}.endDate`}
            />
            <button
              type="button"
              aria-label={`Remove project ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-proj-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <EditableText
            path={`sections.projects.${i}.description`}
            className="mt-0.5 block text-[11pt] italic text-zinc-600"
            placeholder="Short project blurb (1 sentence)."
          />
          <div className="mt-2">
            <BulletList
              path={`sections.projects.${i}.highlights`}
              placeholder="Highlight (1–2 lines)"
              emptyText="Add achievements, scope, what you shipped"
            />
          </div>
          <div className="mt-2">
            <KeywordChips
              path={`sections.projects.${i}.keywords`}
              placeholder="tech"
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-project"
      >
        <Plus className="mr-1 size-3" />
        Add a project
      </Button>
    </div>
  );
}

/**
 * Inline-editable Volunteer section. One row per organization:
 *   - Organization (bold heading) + position (italic, inline)
 *   - Summary (italic small blurb)
 *   - Highlights (BulletList — `string[]`)
 *   - DateRange
 *   - A ✕ remove button (no-print)
 *
 * Requires FormProvider context.
 */
function VolunteerInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.volunteer",
  });

  function handleAdd() {
    append({
      organization: "",
      position: "",
      url: "",
      startDate: "",
      endDate: "",
      summary: "",
      highlights: [],
    });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.volunteer.' +
          fields.length +
          '.organization"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="volunteer-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`vol-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[12pt] font-semibold text-zinc-900">
              <EditableText
                path={`sections.volunteer.${i}.organization`}
                className="inline"
                placeholder="Organization"
              />
              <EditableText
                path={`sections.volunteer.${i}.position`}
                className="ml-2 inline text-[11pt] font-normal italic text-zinc-700"
                placeholder="Role"
              />
            </h3>
            <DateRange
              editable
              start={(field as { startDate?: string }).startDate}
              end={(field as { endDate?: string }).endDate}
              startPath={`sections.volunteer.${i}.startDate`}
              endPath={`sections.volunteer.${i}.endDate`}
            />
            <button
              type="button"
              aria-label={`Remove volunteer ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-vol-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <EditableText
            path={`sections.volunteer.${i}.summary`}
            className="mt-0.5 block text-[11pt] italic text-zinc-600"
            placeholder="Short summary (1 sentence)."
          />
          <div className="mt-2">
            <BulletList
              path={`sections.volunteer.${i}.highlights`}
              placeholder="What you did"
              emptyText="Add impact, scope, outcomes"
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-volunteer"
      >
        <Plus className="mr-1 size-3" />
        Add a volunteer role
      </Button>
    </div>
  );
}

/**
 * Inline-editable Awards section. One row per award:
 *   - Title (bold heading)
 *   - Awarder (italic small)
 *   - Date (DateRange — fields are start-only enums; we still feed both
 *     paths but only `date` is used by the schema. Simpler: render the
 *     date as a single EditableText instead, since awards usually have
 *     one year/month and no end date.)
 *   - Summary (small italic blurb)
 *   - A ✕ remove button (no-print)
 *
 * Requires FormProvider context.
 */
function AwardsInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.awards",
  });

  function handleAdd() {
    append({ title: "", date: "", awarder: "", summary: "" });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.awards.' + fields.length + '.title"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="awards-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`award-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <EditableText
              path={`sections.awards.${i}.title`}
              className="text-[12pt] font-semibold text-zinc-900"
              placeholder="Award title"
            />
            {/* Award dates are single strings ("May 2026", "2024"), not
                a range — render as a regular EditableText right-aligned. */}
            <EditableText
              path={`sections.awards.${i}.date`}
              className="ml-auto inline w-fit text-right text-[10pt] text-zinc-500"
              placeholder="Date"
            />
            <button
              type="button"
              aria-label={`Remove award ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-award-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <EditableText
            path={`sections.awards.${i}.awarder`}
            className="mt-0.5 block text-[11pt] text-zinc-700"
            placeholder="Granted by"
          />
          <EditableText
            path={`sections.awards.${i}.summary`}
            className="mt-0.5 block text-[11pt] italic text-zinc-600"
            placeholder="Short summary (e.g. recognition scope)."
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-award"
      >
        <Plus className="mr-1 size-3" />
        Add an award
      </Button>
    </div>
  );
}

/**
 * Inline-editable Certificates section. One row per certificate:
 *   - Name (bold heading)
 *   - Issuer (italic small)
 *   - URL (italic small)
 *   - Date (right-aligned small grey)
 *   - A ✕ remove button (no-print)
 *
 * Print: the entire section hides when empty (handled by the Section
 * wrapper's `printHiddenIf`); individual rows live inside the wrapper.
 *
 * Requires FormProvider context.
 */
function CertificatesInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.certificates",
  });

  function handleAdd() {
    append({ name: "", date: "", issuer: "", url: "" });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.certificates.' +
          fields.length +
          '.name"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="certificates-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`cert-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <EditableText
              path={`sections.certificates.${i}.name`}
              className="text-[12pt] font-semibold text-zinc-900"
              placeholder="Certificate name"
            />
            <EditableText
              path={`sections.certificates.${i}.date`}
              className="ml-auto inline w-fit text-right text-[10pt] text-zinc-500"
              placeholder="Date"
            />
            <button
              type="button"
              aria-label={`Remove certificate ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-cert-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <EditableText
            path={`sections.certificates.${i}.issuer`}
            className="mt-0.5 block text-[11pt] text-zinc-700"
            placeholder="Issuer"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-certificate"
      >
        <Plus className="mr-1 size-3" />
        Add a certificate
      </Button>
    </div>
  );
}

/**
 * Inline-editable Publications section. One row per publication:
 *   - Name (bold heading)
 *   - Publisher (italic small)
 *   - Release date (right-aligned small grey)
 *   - URL (italic small, with `no-print` styling only the row?)
 *   - Summary (small italic blurb)
 *   - A ✕ remove button (no-print)
 *
 * Requires FormProvider context.
 */
function PublicationsInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.publications",
  });

  function handleAdd() {
    append({
      name: "",
      publisher: "",
      releaseDate: "",
      url: "",
      summary: "",
    });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.publications.' +
          fields.length +
          '.name"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="publications-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`pub-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <EditableText
              path={`sections.publications.${i}.name`}
              className="text-[12pt] font-semibold text-zinc-900"
              placeholder="Title"
            />
            <EditableText
              path={`sections.publications.${i}.releaseDate`}
              className="ml-auto inline w-fit text-right text-[10pt] text-zinc-500"
              placeholder="Date"
            />
            <button
              type="button"
              aria-label={`Remove publication ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-pub-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <EditableText
            path={`sections.publications.${i}.publisher`}
            className="mt-0.5 block text-[11pt] italic text-zinc-700"
            placeholder="Publisher / venue"
          />
          <EditableText
            path={`sections.publications.${i}.summary`}
            className="mt-1 block text-[11pt] text-zinc-600"
            placeholder="One-line summary or abstract."
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-publication"
      >
        <Plus className="mr-1 size-3" />
        Add a publication
      </Button>
    </div>
  );
}

/**
 * Inline-editable Languages section. Each entry is two fields:
 *   - Language (bold heading)
 *   - Fluency (italic small, e.g. "Native", "Fluent")
 * Two-field layout — much simpler than the other array sections.
 *
 * Requires FormProvider context.
 */
function LanguagesInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.languages",
  });

  function handleAdd() {
    append({ language: "", fluency: "" });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.languages.' +
          fields.length +
          '.language"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="languages-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`lang-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <EditableText
              path={`sections.languages.${i}.language`}
              className="text-[12pt] font-semibold text-zinc-900"
              placeholder="Language"
            />
            <EditableText
              path={`sections.languages.${i}.fluency`}
              className="ml-2 inline text-[11pt] italic text-zinc-700"
              placeholder="Fluency (e.g. Native)"
            />
            <button
              type="button"
              aria-label={`Remove language ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-lang-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-language"
      >
        <Plus className="mr-1 size-3" />
        Add a language
      </Button>
    </div>
  );
}

/**
 * Inline-editable Interests section. Each entry is a category + chips:
 *   - Name (bold heading, e.g. "Open Source")
 *   - Keywords (KeywordChips — the actual interest keywords)
 *
 * In read-only we render name + comma-separated keywords. (We could
 * have used the same SkillsInline shape with a `level` field, but
 * Interests have no level equivalent — just a name + tags.)
 *
 * Requires FormProvider context.
 */
function InterestsInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.interests",
  });

  function handleAdd() {
    append({ name: "", keywords: [] });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.interests.' +
          fields.length +
          '.name"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="interests-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`interest-row-${i}`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <EditableText
              path={`sections.interests.${i}.name`}
              className="text-[11pt] font-semibold text-zinc-900"
              placeholder="Category"
            />
            <button
              type="button"
              aria-label={`Remove interest ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-interest-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="mt-2">
            <KeywordChips
              path={`sections.interests.${i}.keywords`}
              placeholder="keyword"
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-interest"
      >
        <Plus className="mr-1 size-3" />
        Add an interest
      </Button>
    </div>
  );
}

/**
 * Inline-editable References section. Each entry is just two text fields:
 *   - Name (bold heading, e.g. "Jane Doe — Director of Engineering, Acme")
 *   - Reference (the actual quote / text)
 *
 * No DateRange / chips / bullets — simplest of the array sections.
 *
 * Requires FormProvider context.
 */
function ReferencesInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.references",
  });

  function handleAdd() {
    append({ name: "", reference: "" });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.references.' +
          fields.length +
          '.name"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid="references-inline">
      {fields.map((field, i) => (
        <div
          key={field.id}
          className="group rounded-md border border-zinc-200 bg-white/60 p-3 print:border-transparent print:bg-transparent print:p-0"
          data-testid={`ref-row-${i}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <EditableText
              path={`sections.references.${i}.name`}
              className="text-[11pt] font-semibold text-zinc-900"
              placeholder="Reference name + title"
            />
            <button
              type="button"
              aria-label={`Remove reference ${i + 1}`}
              onClick={() => remove(i)}
              className="no-print ml-auto inline-flex size-6 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-ref-${i}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <EditableTextarea
            path={`sections.references.${i}.reference`}
            rows={3}
            className="mt-1 text-[11pt] italic text-zinc-600"
            placeholder="The reference text or quote."
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-reference"
      >
        <Plus className="mr-1 size-3" />
        Add a reference
      </Button>
    </div>
  );
}

/**
 * Inline-editable Online Profiles list. Renders a `network · username`
 * line for each profile (LinkedIn, GitHub, Twitter, etc.) directly
 * under the basics header. The read-only render of the same data is
 * a flat paragraph; in editable mode we swap to a row of inline
 * inputs so the user can add/remove networks without leaving the
 * editor surface.
 *
 * Visual shape: each profile renders inline with a · separator from
 * its neighbor. ✕ remove button shows on hover. Empty list shows
 * just "+ Add a profile".
 *
 * Print: the no-print buttons + ghost-style add button are stripped
 * from the PDF, leaving the same `network: username · …` text the
 * read-only path renders.
 *
 * Requires FormProvider context.
 */
function OnlineProfilesInline() {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: "sections.basics.profiles",
  });

  function handleAdd() {
    append({ network: "", username: "", url: "" });
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="editable-sections.basics.profiles.' +
          fields.length +
          '.network"]',
      );
      (el as HTMLElement | null)?.click();
    });
  }

  if (fields.length === 0) {
    return (
      <div className="mt-1" data-testid="online-profiles-inline">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAdd}
          className="no-print text-[10pt] text-zinc-500"
          data-testid="add-profile"
        >
          <Plus className="mr-1 size-3" />
          Add a profile (LinkedIn, GitHub, ...)
        </Button>
      </div>
    );
  }

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10pt] text-zinc-500"
      data-testid="online-profiles-inline"
    >
      {fields.map((field, i, arr) => (
        <span
          key={field.id}
          className="group inline-flex items-center gap-1"
          data-testid={`profile-row-${i}`}
        >
          {i > 0 && <span className="text-zinc-400">·</span>}
          <EditableText
            path={`sections.basics.profiles.${i}.network`}
            className="font-medium text-zinc-700"
            placeholder="Network"
          />
          <EditableText
            path={`sections.basics.profiles.${i}.username`}
            className="text-zinc-500"
            placeholder="username"
          />
          <button
            type="button"
            aria-label={`Remove profile ${i + 1}`}
            onClick={() => remove(i)}
            className="no-print ml-1 inline-flex size-4 items-center justify-center rounded text-zinc-400 opacity-40 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            data-testid={`remove-profile-${i}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid="add-profile"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

/**
 * Inline-editable per-work-entry positions list. Each `work` row
 * owns its own `positions[]` array (a user can list multiple roles at
 * one company, e.g. "Nextep: Founder → CTO → Coach"), so this
 * component takes a `workIndex` and runs its own `useFieldArray`
 * against `sections.work.${workIndex}.positions`.
 *
 * Renders, per position:
 *   - Title (medium-weight editable text)
 *   - DateRange
 *   - ✕ remove button (no-print, hover-revealed)
 *   - BulletList(highlights) for role achievements
 *
 * Plus a "+ Add a position" affordance at the end so users can grow
 * the role list — fixes the earlier bug where clicking "Add a work
 * entry" landed a work row with `positions: []` and no UI to add
 * positions (and therefore no path to highlights).
 *
 * Requires FormProvider context.
 */
function WorkPositionsNested({ workIndex }: { workIndex: number }) {
  const { control } = useFormContext() as never;
  const { fields, append, remove } = useFieldArray({
    control: control as never,
    name: `sections.work.${workIndex}.positions`,
  });

  function handleAdd() {
    append({ title: "", startDate: "", endDate: "", highlights: [] });
    requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-testid="editable-sections.work.${workIndex}.positions.${fields.length}.title"]`,
      );
      (node as HTMLElement | null)?.click();
    });
  }

  return (
    <div className="space-y-3" data-testid={`work-${workIndex}-positions`}>
      {fields.map((p, j) => (
        <div
          key={p.id}
          className="group/work-position relative"
          data-testid={`work-${workIndex}-position-${j}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <EditableText
              path={`sections.work.${workIndex}.positions.${j}.title`}
              as="p"
              className="text-[11pt] font-medium text-zinc-800"
              placeholder="Title"
            />
            <DateRange
              editable
              // `p` is the useFieldArray row — typed as Record<"id",
              // string> & { disabled? }, no Position fields. The
              // shape is locked in by the Zod schema at the form's
              // root, so this cast is safe; if the schema ever drifts
              // the work-section tests will catch the mismatch before
              // it reaches here.
              start={(p as { startDate?: string }).startDate}
              end={(p as { endDate?: string }).endDate}
              startPath={`sections.work.${workIndex}.positions.${j}.startDate`}
              endPath={`sections.work.${workIndex}.positions.${j}.endDate`}
            />
            <button
              type="button"
              aria-label={`Remove position ${j + 1}`}
              onClick={() => remove(j)}
              className="no-print ml-auto inline-flex size-5 items-center justify-center rounded text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover/work-position:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              data-testid={`remove-position-${workIndex}-${j}`}
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="mt-1">
            <BulletList
              path={`sections.work.${workIndex}.positions.${j}.highlights`}
              placeholder="Highlight (1–2 lines)"
              emptyText="Add achievements for this role"
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="no-print"
        data-testid={`add-position-${workIndex}`}
      >
        <Plus className="mr-1 size-3" />
        Add a position
      </Button>
    </div>
  );
}
