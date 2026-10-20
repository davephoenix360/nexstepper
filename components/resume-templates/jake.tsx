'use client';

/**
 * JakeTemplate — the Jake's Resume template, the sixth entry in the
 * registry. Modelled on Jake Gutierrez's famous LaTeX/Overleaf
 * resume template.
 *
 * Visual identity (vs the other 5 templates)
 * ------------------------------------------
 * The other templates are all sans-serif; Jake is the only fully
 * SERIF template. Lora is loaded once via next/font/google and
 * applied to the <article> wrapper, so every child inherits the
 * same font. See the meta.ts doc for the full rationale and the
 * user-facing picker tags.
 *
 * Other Jake-specific touches:
 *   - Centered NAME in small caps via `font-variant: small-caps` +
 *     `uppercase` (the "FIRST LAST" look from the LaTeX template).
 *   - Centered address line + single-line contact row with inline
 *     icons (phone, mail, LinkedIn, GitHub). Icons are lucide-react,
 *     already in the bundle.
 *   - Hairline horizontal rule UNDER each section title (not the
 *     accent-bar-to-the-left of the modern templates). The rule is
 *     a `border-b border-zinc-700` on the <h2>, full column width.
 *   - Two-column name/date rows on every Education / Experience /
 *     Projects / Volunteer entry — name (bold) on the left, dates
 *     (bold, smaller) on the right. Below: italic role/degree
 *     line in the same two-column shape.
 *   - Coursework is a 4-column grid (the academic touch — no
 *     other template does this).
 *   - Technical Skills render as bold "Category:" + comma-
 *     separated values, no chips, no background, no border. Same
 *     pattern for Languages and Interests.
 *
 * Architecture (per the meta + code split in ./meta.ts)
 * ----------------------------------------------------
 *   - `meta` lives in `./meta.ts` as JAKE_TEMPLATE_META (data).
 *   - `Component` (this file) is the render code. The picker /
 *     pricing / PDF cache pipeline reads only the meta.
 *
 * Read-only / print / PDF render
 *   Every section renderer uses `<Field>` (and FieldBullets,
 *   FieldChips) instead of `EditableText` etc. In the editor
 *   (editable=true) Field forwards to the RHF-bound editor
 *   primitive, which renders the click-to-edit affordances the
 *   WYSIWYG editor expects. Outside the editor (editable=false),
 *   Field renders plain `<span>` / `<p>` / `<ul>` from `data`
 *   directly — no form context needed, no `X` / `+ Add`
 *   affordances leaking into print. See `./field.tsx` for the
 *   contract.
 *
 *   This is the modern pattern, not the classic two-file split.
 *   The classic pattern duplicates the read-only rendering
 *   because classic's editor pulls useFieldArray / useFormContext
 *   at the top, which can't be conditionally skipped. Jake, like
 *   modern, uses the Field primitive so the same component
 *   handles both paths cleanly. Less duplication, single source
 *   of truth.
 *
 *   The `JakeReadOnly` export is a thin alias
 *   (`<JakeTemplate data editable={false} />`) so the print-hide
 *   tests can target the read-only path explicitly without
 *   having to know the dispatcher signature. Mirrors
 *   classic-readonly.tsx's role.
 */

import * as React from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Globe
} from 'lucide-react';

import { useSectionPrint } from '@/components/editable/use-section-print';
import { PrintPrefsBar } from '@/components/editable/print-prefs-bar';
import { BulletList } from '@/components/editable/bullet-list';

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
  read,
  type FieldMode
} from './field';
import {
  EMPTY_AWARD,
  EMPTY_CERTIFICATE,
  EMPTY_EDUCATION,
  EMPTY_INTEREST,
  EMPTY_LANGUAGE,
  EMPTY_POSITION,
  EMPTY_PROJECT,
  EMPTY_PUBLICATION,
  EMPTY_REFERENCE,
  EMPTY_SKILL,
  EMPTY_VOLUNTEER,
  EMPTY_WORK
} from '@/lib/resume-schema/defaults';
import { isSectionHiddenFromPrint } from '@/lib/resume-schema/resume-data';
import type { ResumeData } from '@/lib/resume-schema';
import { cn } from '@/lib/utils';
import { JAKE_TEMPLATE_META } from './meta';

const isSet = (s: string | undefined | null): boolean => Boolean(s && s.trim());
const has = <T,>(arr: T[] | undefined | null): arr is T[] =>
  Boolean(arr && arr.length > 0);

/* -------------------------------------------------------------------------- */
/*  Root                                                                       */
/* -------------------------------------------------------------------------- */

export function JakeTemplate({
  data,
  editable = false
}: {
  data: ResumeData;
  editable?: boolean;
}) {
  const mode: FieldMode = { editable, data };
  return (
    <article
      className={cn(
        // font-serif → Tailwind's serif stack (Lora / Crimson Pro /
        // EB Garamond / Georgia, depending on what the platform
        // has installed). We pick `font-serif` over `next/font/google`
        // so the template renders correctly in vitest (which
        // can't load Google Fonts at test time) AND in any browser
        // without a font-load delay. The visual difference between
        // Lora and a system serif is small at print resolution.
        'font-serif',
        'mx-auto w-full max-w-[8.5in] bg-white text-zinc-900',
        'shadow-lg ring-1 ring-zinc-200/60',
        'print:max-w-none print:shadow-none print:ring-0',
        'text-[11pt] leading-[1.45] text-zinc-800'
      )}
      data-template="jake"
      data-accent={JAKE_TEMPLATE_META.accent}
      data-editable={editable || undefined}
      data-max-pages={JAKE_TEMPLATE_META.maxPages}
      data-page-size={JAKE_TEMPLATE_META.pageSize}
    >
      <div className="px-10 py-8 print:px-0 print:py-0">
        <JakeHeader mode={mode} />
        <JakeBody mode={mode} />
      </div>
    </article>
  );
}

/**
 * Server-renderable read-only alias — `editable={false}` is the
 * read-only path (PDF / preview / print). The print-hide tests
 * import this to verify the read-only rendering matches
 * expectations without going through the FormProvider. Mirrors
 * classic-readonly.tsx's role.
 */
export function JakeReadOnly({ data }: { data: ResumeData }) {
  return <JakeTemplate data={data} editable={false} />;
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                     */
/* -------------------------------------------------------------------------- */

function JakeHeader({ mode }: { mode: FieldMode }) {
  const b = mode.data.sections.basics;

  // Same contact / address resolution as the read-only path —
  // derived in a single place so the header is consistent in
  // both editor and read-only modes.
  const phone = isSet(b.phone) ? b.phone : '';
  const email = isSet(b.email) ? b.email : '';
  const website = isSet(b.url) ? b.url : '';
  const linkedin = b.profiles.find(
    (p) => isSet(p.network) && p.network.toLowerCase().includes('linkedin')
  );
  const github = b.profiles.find(
    (p) => isSet(p.network) && p.network.toLowerCase().includes('github')
  );
  const addressLine = [
    isSet(b.location.address) ? b.location.address : '',
    isSet(b.location.city) ? b.location.city : '',
    isSet(b.location.region) ? b.location.region : '',
    isSet(b.location.postalCode) ? b.location.postalCode : ''
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <header className="mb-5 text-center">
      <h1
        className={cn(
          'text-[28pt] font-bold uppercase leading-tight text-zinc-900',
          '[font-variant:small-caps]',
          'tracking-[0.05em]'
        )}
        data-testid="jake-name"
      >
        <Field
          mode={mode}
          path="sections.basics.name"
          as="span"
          className="inline"
          placeholder="Your name"
        />
      </h1>
      {isSet(b.label) && (
        <p className="mt-1 text-[12pt] italic text-zinc-600">
          <Field
            mode={mode}
            path="sections.basics.label"
            as="span"
            className="inline"
            placeholder=""
          />
        </p>
      )}
      {isSet(addressLine) && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5pt] text-zinc-600">
          <MapPin className="size-3 shrink-0" aria-hidden={true} />
          <span>{addressLine}</span>
        </p>
      )}
      {(isSet(phone) ||
        isSet(email) ||
        isSet(website) ||
        (linkedin && isSet(linkedin.username)) ||
        (github && isSet(github.username))) && (
        <div
          className={cn(
            'mt-2 flex flex-wrap items-center justify-center',
            'gap-x-3 gap-y-1 text-[10.5pt] text-zinc-700'
          )}
        >
          {isSet(phone) && <ContactItem icon={Phone} value={phone} />}
          {isSet(email) && <ContactItem icon={Mail} value={email} />}
          {isSet(website) && (
            <ContactItem
              icon={Globe}
              value={website.replace(/^https?:\/\//, '')}
            />
          )}
          {linkedin && isSet(linkedin.username) && (
            <ContactItem
              icon={Linkedin}
              value={`linkedin.com/in/${linkedin.username}`}
            />
          )}
          {github && isSet(github.username) && (
            <ContactItem
              icon={Github}
              value={`github.com/${github.username}`}
            />
          )}
        </div>
      )}
    </header>
  );
}

function ContactItem({
  icon: Icon,
  value
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3 shrink-0 text-zinc-500" aria-hidden={true} />
      <span>{value}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section helper                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Jake's section chrome: bold uppercase title with a hairline
 * rule under it. The same pattern Jake's LaTeX template uses.
 * The section is suppressed in read-only mode when the children
 * renderer returns null (matching the SmartSection contract
 * used by the other modern templates).
 *
 * `useSectionPrint` is editor-only (it pulls values from RHF);
 * in read-only mode we use the synchronous
 * `isSectionHiddenFromPrint` predicate against the saved
 * envelope, so the print-hide UX is consistent in both paths.
 */
function JakeSection({
  mode,
  title,
  id,
  sectionSlug,
  children
}: {
  mode: FieldMode;
  title: string;
  id?: string;
  sectionSlug?: string;
  children: React.ReactNode;
}) {
  const isHiddenFromPrint = sectionSlug
    ? mode.editable
      ? null // resolved by the hook below
      : isSectionHiddenFromPrint(mode.data, sectionSlug)
    : null;

  // The hook branches on `mode.editable` internally — in editor
  // mode it reads from RHF (so toggles propagate immediately),
  // in preview/print mode it reads from `mode.data.print`. When
  // no slug is provided we pass a sentinel that never matches a
  // real section; the hook is harmless in both modes.
  const { hidden: hookHidden } = useSectionPrint(
    sectionSlug ?? '__no_section__',
    mode
  );
  const hidden =
    sectionSlug && (mode.editable ? hookHidden : isHiddenFromPrint);

  // Suppress the whole section in read-only mode when the
  // renderer found no data — matches the SmartSection contract.
  const isEmpty =
    !mode.editable && (children === null || children === undefined);
  if (isEmpty) return null;

  return (
    <section
      id={id}
      className={cn(
        'mb-5 last:mb-0',
        sectionSlug && hidden && 'print:hidden opacity-60'
      )}
    >
      <div
        className={cn(
          'mb-2 flex items-center justify-between gap-2',
          'border-b border-zinc-700 pb-0.5',
          'print:break-after-avoid'
        )}
      >
        <h2
          className={cn(
            'text-[12pt] font-semibold uppercase',
            'tracking-[0.08em] text-zinc-900'
          )}
        >
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
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body                                                                       */
/* -------------------------------------------------------------------------- */

function JakeBody({ mode }: { mode: FieldMode }) {
  return (
    <>
      <JakeSummary mode={mode} />
      <JakeEducation mode={mode} />
      <JakeExperience mode={mode} />
      <JakeProjects mode={mode} />
      <JakeTechnicalSkills mode={mode} />
      <JakeVolunteer mode={mode} />
      <JakeAwards mode={mode} />
      <JakeCertificates mode={mode} />
      <JakePublications mode={mode} />
      <JakeLanguages mode={mode} />
      <JakeInterests mode={mode} />
      <JakeReferences mode={mode} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Summary                                                                    */
/* -------------------------------------------------------------------------- */

function JakeSummary({ mode }: { mode: FieldMode }) {
  const summary = str(mode.data, 'sections.basics.summary');
  if (!mode.editable && !summary) return null;
  return (
    <JakeSection mode={mode} title="Summary" id="section-summary" sectionSlug="summary">
      <FieldArea
        mode={mode}
        path="sections.basics.summary"
        className="text-[11pt] leading-relaxed text-zinc-800"
        placeholder="One-paragraph elevator pitch. Optional."
        rows={3}
      />
    </JakeSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Education                                                                  */
/* -------------------------------------------------------------------------- */

function JakeEducation({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.education) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <JakeEducationRow mode={mode} index={i} />
  );
  return (
    <JakeSection
      mode={mode}
      title="Education"
      id="section-education"
      sectionSlug="education"
    >
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.education"
          addLabel="Add education"
          testIdPrefix="jake-education-row"
          defaultRow={EMPTY_EDUCATION}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div className="space-y-4">
          {mode.data.sections.education.map((_, i) => (
            <div key={`e-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </JakeSection>
  );
}

function JakeEducationRow({ mode, index }: { mode: FieldMode; index: number }) {
  const e = mode.data.sections.education[index] ?? EMPTY_EDUCATION;
  const majors = (e.degree.majors ?? []).filter(isSet).join(', ');
  const minors = (e.degree.minors ?? []).map((m) => `Minor: ${m}`).join(', ');
  const degreeText = [isSet(e.degree.degreeLevel) ? e.degree.degreeLevel : '', majors, minors]
    .filter(Boolean)
    .join(', ');
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 print:break-inside-avoid">
        <span className="text-[12pt] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.education.${index}.institution`}
            as="span"
            className="inline"
            placeholder="Institution"
          />
        </span>
        <DateRange
          editable={mode.editable}
          start={e.startDate}
          end={e.endDate}
          startPath={`sections.education.${index}.startDate`}
          endPath={`sections.education.${index}.endDate`}
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[11pt] italic text-zinc-700">
          {mode.editable ? (
            <>
              <Field
                mode={mode}
                path={`sections.education.${index}.degree.degreeLevel`}
                as="span"
                className="inline"
                placeholder="Bachelor of Science in …"
              />
              <FieldChips
                mode={mode}
                path={`sections.education.${index}.degree.majors`}
                placeholder="major"
                className="ml-1"
              />
            </>
          ) : (
            degreeText || <span className="text-zinc-400">Degree</span>
          )}
        </span>
        <span className="text-[11pt] italic text-zinc-600">
          <Field
            mode={mode}
            path={`sections.education.${index}.location`}
            as="span"
            className="inline"
            placeholder="City, State"
          />
        </span>
      </div>
      <div className="text-[10pt] italic text-zinc-600">
        {mode.editable || isSet(e.gpa) ? (
          <>
            <span className="not-italic">GPA: </span>
            <Field
              mode={mode}
              path={`sections.education.${index}.gpa`}
              as="span"
              className="inline"
              placeholder="3.8 / 4.0"
            />
          </>
        ) : null}
      </div>
      <JakeCoursework mode={mode} educationIndex={index} />
    </div>
  );
}

function JakeCoursework({
  mode,
  educationIndex
}: {
  mode: FieldMode;
  educationIndex: number;
}) {
  const path = `sections.education.${educationIndex}.courses`;
  const courses = arr(mode.data, path).filter(isSet);
  if (!mode.editable && courses.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[11pt] font-semibold text-zinc-900">
        Relevant Coursework
      </p>
      {mode.editable ? (
        // In editor mode the user adds courses one-per-line; the
        // 4-column grid is purely a read-only presentation choice.
        // The editor's BulletList component renders each entry as
        // an <EditableText> with a remove button — much easier to
        // edit than a 4-col grid input.
        <BulletList
          path={path}
          placeholder="Course (e.g. Data Structures)"
          emptyText="Add the courses you want to highlight"
          className="mt-1 list-disc space-y-0.5 pl-5 text-[10.5pt] text-zinc-700 marker:text-zinc-500"
        />
      ) : (
        <ul
          className={cn(
            'mt-1 grid grid-cols-4 gap-x-4 gap-y-0.5',
            'text-[10.5pt] text-zinc-700'
          )}
          data-testid="jake-coursework-grid"
        >
          {courses.map((c, i) => (
            <li key={`course-${i}`} className="flex items-start gap-1.5">
              <span className="text-zinc-500" aria-hidden={true}>
                {'\u2022'}
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Experience                                                                 */
/* -------------------------------------------------------------------------- */

function JakeExperience({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.work) && !mode.editable) return null;
  const renderRow = (i: number) => <JakeWorkRow mode={mode} index={i} />;
  return (
    <JakeSection
      mode={mode}
      title="Experience"
      id="section-experience"
      sectionSlug="experience"
    >
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.work"
          addLabel="Add experience"
          testIdPrefix="jake-work-row"
          defaultRow={EMPTY_WORK}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div className="space-y-4">
          {mode.data.sections.work.map((_, i) => (
            <div key={`w-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </JakeSection>
  );
}

function JakeWorkRow({ mode, index }: { mode: FieldMode; index: number }) {
  const w = mode.data.sections.work[index] ?? EMPTY_WORK;
  // The schema stores dates on POSITIONS, not on the work entry
  // itself. So the company row can only ever show a date range by
  // borrowing one from a position — and if it borrows positions[0]'s
  // range, that same range must NOT also render on the position row,
  // or the reader sees the same range twice.
  //
  // Rule: the range renders EXACTLY ONCE per work entry.
  //   1 position  -> company row. This is the original Jake layout
  //                  ("Electronics Company — May 2020 – August 2020")
  //                  and by far the common case.
  //   2+ positions -> the company row stays bare and each position
  //                  row shows its own range, because the ranges
  //                  genuinely differ and a single borrowed span
  //                  would misrepresent the whole entry.
  //
  // This was a real bug: both rows rendered a DateRange bound to
  // positions[0], so a single-position entry printed "2022 – Present"
  // twice. See tests/unit/jake-template.test.tsx → "renders the date
  // range exactly once per work entry".
  const positionCount = w.positions?.length ?? 0;
  const dateOnCompanyRow = positionCount === 1;
  return (
    <div>
      {/* Top row: company + (dates, only when a single position owns
          them — see the rule above). */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 print:break-inside-avoid">
        <span className="text-[12pt] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.work.${index}.company`}
            as="span"
            className="inline"
            placeholder="Company"
          />
        </span>
        {dateOnCompanyRow && (
          <DateRange
            editable={mode.editable}
            start={w.positions?.[0]?.startDate}
            end={w.positions?.[0]?.endDate}
            startPath={`sections.work.${index}.positions.0.startDate`}
            endPath={`sections.work.${index}.positions.0.endDate`}
          />
        )}
      </div>
      {/* Position-level sub-rows. For a one-position work entry
          we still render the position to keep editor + read-only
          structurally identical. */}
      <JakeWorkPositions
        mode={mode}
        workIndex={index}
        showPositionDates={!dateOnCompanyRow}
      />
    </div>
  );
}

function JakeWorkPositions({
  mode,
  workIndex,
  showPositionDates
}: {
  mode: FieldMode;
  workIndex: number;
  /** False when the company row already owns the date range, so
   *  the position rows must not repeat it. */
  showPositionDates: boolean;
}) {
  const w = mode.data.sections.work[workIndex] ?? EMPTY_WORK;
  const positions = w.positions ?? [];
  if (!mode.editable && positions.length === 0) return null;

  // For the read-only path, the company-level location and
  // description are rendered once. In editor mode, the
  // per-position nested array is the source of truth.
  if (mode.editable) {
    return (
      <JakeEditableNestedFieldArray
        path={`sections.work.${workIndex}.positions`}
        addLabel="Add a position"
        testIdPrefix={`jake-work-${workIndex}-pos`}
        defaultRow={EMPTY_POSITION}
      >
        {(j) => (
          <JakePositionRow
            mode={mode}
            workIndex={workIndex}
            positionIndex={j}
            showDates={showPositionDates}
          />
        )}
      </JakeEditableNestedFieldArray>
    );
  }

  return (
    <div className="mt-1.5 space-y-3">
      {positions.map((p, j) => (
        <div key={`w-${workIndex}-p-${j}`}>
          <JakePositionRow
            mode={mode}
            workIndex={workIndex}
            positionIndex={j}
            showDates={showPositionDates}
          />
        </div>
      ))}
    </div>
  );
}

function JakePositionRow({
  mode,
  workIndex,
  positionIndex,
  showDates
}: {
  mode: FieldMode;
  workIndex: number;
  positionIndex: number;
  /** False when the company row already renders this position's
   *  date range (single-position entries). */
  showDates: boolean;
}) {
  const w = mode.data.sections.work[workIndex] ?? EMPTY_WORK;
  const p = w.positions?.[positionIndex] ?? EMPTY_POSITION;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[11pt] font-medium text-zinc-800">
          <Field
            mode={mode}
            path={`sections.work.${workIndex}.positions.${positionIndex}.title`}
            as="span"
            className="inline"
            placeholder="Position"
          />
        </span>
        {showDates ? (
          <DateRange
            editable={mode.editable}
            start={p.startDate}
            end={p.endDate}
            startPath={`sections.work.${workIndex}.positions.${positionIndex}.startDate`}
            endPath={`sections.work.${workIndex}.positions.${positionIndex}.endDate`}
          />
        ) : (
          /* No date on this row, so the location takes the
             right-hand slot. This is the original Jake row: position
             title on the left, "City, State" on the right, both
             italic. Only ever reached for position 0 of a
             single-position entry, so it cannot duplicate. */
          isSet(w.location) && (
            <span className="text-[11pt] italic text-zinc-600">
              {w.location}
            </span>
          )
        )}
      </div>
      {/* `location` is a COMPANY-level field, so it renders once per
          work entry — on the first position only. Repeating it under
          every position of a multi-position entry was the same class
          of bug as the duplicated date range. */}
      {showDates && positionIndex === 0 && isSet(w.location) && (
        <div className="flex flex-wrap items-baseline justify-end gap-x-3">
          <span className="text-[11pt] italic text-zinc-600">
            {w.location}
          </span>
        </div>
      )}
      <FieldBullets
        mode={mode}
        path={`sections.work.${workIndex}.positions.${positionIndex}.highlights`}
        placeholder="A concrete, quantified accomplishment."
        itemClassName="marker:text-zinc-500"
        className="mt-1 list-disc space-y-0.5 pl-5"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Projects                                                                   */
/* -------------------------------------------------------------------------- */

function JakeProjects({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.projects) && !mode.editable) return null;
  const renderRow = (i: number) => <JakeProjectRow mode={mode} index={i} />;
  return (
    <JakeSection
      mode={mode}
      title="Projects"
      id="section-projects"
      sectionSlug="projects"
    >
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.projects"
          addLabel="Add project"
          testIdPrefix="jake-project-row"
          defaultRow={EMPTY_PROJECT}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div className="space-y-3">
          {mode.data.sections.projects.map((_, i) => (
            <div key={`p-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </JakeSection>
  );
}

function JakeProjectRow({ mode, index }: { mode: FieldMode; index: number }) {
  const p = mode.data.sections.projects[index] ?? EMPTY_PROJECT;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 print:break-inside-avoid">
        <span className="text-[12pt] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.projects.${index}.name`}
            as="span"
            className="inline"
            placeholder="Project name"
          />
          {/* " | tech stack" — the Jake signature on the project
              line. Only rendered in read-only when the user has
              typed keywords. */}
          {!mode.editable && has(p.keywords) && (
            <span className="font-normal text-zinc-700">
              {' | '}
              {p.keywords.join(', ')}
            </span>
          )}
        </span>
        <DateRange
          editable={mode.editable}
          start={p.startDate}
          end={p.endDate}
          startPath={`sections.projects.${index}.startDate`}
          endPath={`sections.projects.${index}.endDate`}
        />
      </div>
      {mode.editable && (
        <div className="mt-1">
          <FieldChips
            mode={mode}
            path={`sections.projects.${index}.keywords`}
            placeholder="tech"
            className="text-[10pt]"
          />
        </div>
      )}
      <FieldArea
        mode={mode}
        path={`sections.projects.${index}.description`}
        className="mt-0.5 text-[11pt] italic text-zinc-700"
        placeholder=""
        rows={1}
      />
      <FieldBullets
        mode={mode}
        path={`sections.projects.${index}.highlights`}
        placeholder="What you built, scope, what you shipped."
        itemClassName="marker:text-zinc-500"
        className="mt-1 list-disc space-y-0.5 pl-5"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Technical Skills                                                           */
/* -------------------------------------------------------------------------- */

function JakeTechnicalSkills({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.skills) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <JakeSkillRow mode={mode} index={i} />
  );
  return (
    <JakeSection
      mode={mode}
      title="Technical Skills"
      id="section-skills"
      sectionSlug="skills"
    >
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.skills"
          addLabel="Add skill category"
          testIdPrefix="jake-skill-row"
          defaultRow={EMPTY_SKILL}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div className="space-y-1">
          {mode.data.sections.skills.map((_, i) => (
            <div key={`s-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </JakeSection>
  );
}

function JakeSkillRow({ mode, index }: { mode: FieldMode; index: number }) {
  const s = mode.data.sections.skills[index] ?? EMPTY_SKILL;
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-2 text-[11pt]',
        'print:break-inside-avoid'
      )}
    >
      <span className="font-semibold text-zinc-900">
        {mode.editable ? (
          <Field
            mode={mode}
            path={`sections.skills.${index}.name`}
            as="span"
            className="inline"
            placeholder="Category"
          />
        ) : (
          <span>{isSet(s.name) ? `${s.name}:` : 'Category:'}</span>
        )}
      </span>
      <FieldChips
        mode={mode}
        path={`sections.skills.${index}.keywords`}
        placeholder="keyword"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Volunteer (Leadership / Extracurricular)                                  */
/* -------------------------------------------------------------------------- */

function JakeVolunteer({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.volunteer) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <JakeVolunteerRow mode={mode} index={i} />
  );
  return (
    <JakeSection
      mode={mode}
      title="Leadership / Extracurricular"
      id="section-volunteer"
      sectionSlug="volunteer"
    >
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.volunteer"
          addLabel="Add leadership role"
          testIdPrefix="jake-volunteer-row"
          defaultRow={EMPTY_VOLUNTEER}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div className="space-y-3">
          {mode.data.sections.volunteer.map((_, i) => (
            <div key={`v-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </JakeSection>
  );
}

function JakeVolunteerRow({ mode, index }: { mode: FieldMode; index: number }) {
  const v = mode.data.sections.volunteer[index] ?? EMPTY_VOLUNTEER;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 print:break-inside-avoid">
        <span className="text-[12pt] font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.volunteer.${index}.organization`}
            as="span"
            className="inline"
            placeholder="Organization"
          />
        </span>
        <DateRange
          editable={mode.editable}
          start={v.startDate}
          end={v.endDate}
          startPath={`sections.volunteer.${index}.startDate`}
          endPath={`sections.volunteer.${index}.endDate`}
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[11pt] italic text-zinc-700">
          <Field
            mode={mode}
            path={`sections.volunteer.${index}.position`}
            as="span"
            className="inline"
            placeholder="Role"
          />
        </span>
      </div>
      <FieldBullets
        mode={mode}
        path={`sections.volunteer.${index}.highlights`}
        placeholder="What you led, scope, what you shipped."
        itemClassName="marker:text-zinc-500"
        className="mt-1 list-disc space-y-0.5 pl-5"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Awards, Certificates, Publications, Languages, Interests, References        */
/* -------------------------------------------------------------------------- */

function JakeAwards({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.awards) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.awards.${i}.title`}
            as="span"
            className="inline"
            placeholder="Award"
          />
        </span>
        <span className="text-[10pt] text-zinc-500">
          <Field
            mode={mode}
            path={`sections.awards.${i}.date`}
            as="span"
            className="inline"
            placeholder=""
          />
        </span>
      </div>
      <Field
        mode={mode}
        path={`sections.awards.${i}.awarder`}
        as="p"
        className="text-zinc-700"
        placeholder=""
      />
      <Field
        mode={mode}
        path={`sections.awards.${i}.summary`}
        as="p"
        className="text-zinc-600"
        placeholder=""
      />
    </div>
  );
  return (
    <JakeSection mode={mode} title="Awards" id="section-awards" sectionSlug="awards">
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.awards"
          addLabel="Add award"
          testIdPrefix="jake-award-row"
          defaultRow={EMPTY_AWARD}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div>{mode.data.sections.awards.map((_, i) => <div key={`a-${i}`}>{renderRow(i)}</div>)}</div>
      )}
    </JakeSection>
  );
}

function JakeCertificates({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.certificates) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.certificates.${i}.name`}
            as="span"
            className="inline"
            placeholder="Certificate"
          />
        </span>
        <span className="text-[10pt] text-zinc-500">
          <Field
            mode={mode}
            path={`sections.certificates.${i}.date`}
            as="span"
            className="inline"
            placeholder=""
          />
        </span>
      </div>
      <Field
        mode={mode}
        path={`sections.certificates.${i}.issuer`}
        as="p"
        className="text-zinc-700"
        placeholder=""
      />
    </div>
  );
  return (
    <JakeSection mode={mode} title="Certificates" id="section-certificates" sectionSlug="certificates">
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.certificates"
          addLabel="Add certificate"
          testIdPrefix="jake-cert-row"
          defaultRow={EMPTY_CERTIFICATE}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div>{mode.data.sections.certificates.map((_, i) => <div key={`c-${i}`}>{renderRow(i)}</div>)}</div>
      )}
    </JakeSection>
  );
}

function JakePublications({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.publications) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold text-zinc-900">
          <Field
            mode={mode}
            path={`sections.publications.${i}.name`}
            as="span"
            className="inline"
            placeholder="Publication"
          />
        </span>
        <span className="text-[10pt] text-zinc-500">
          <Field
            mode={mode}
            path={`sections.publications.${i}.releaseDate`}
            as="span"
            className="inline"
            placeholder=""
          />
        </span>
      </div>
      <Field
        mode={mode}
        path={`sections.publications.${i}.publisher`}
        as="p"
        className="italic text-zinc-700"
        placeholder=""
      />
      <Field
        mode={mode}
        path={`sections.publications.${i}.summary`}
        as="p"
        className="text-zinc-600"
        placeholder=""
      />
    </div>
  );
  return (
    <JakeSection mode={mode} title="Publications" id="section-publications" sectionSlug="publications">
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.publications"
          addLabel="Add publication"
          testIdPrefix="jake-pub-row"
          defaultRow={EMPTY_PUBLICATION}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div>{mode.data.sections.publications.map((_, i) => <div key={`p-${i}`}>{renderRow(i)}</div>)}</div>
      )}
    </JakeSection>
  );
}

function JakeLanguages({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.languages) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[11pt] print:break-inside-avoid">
      <span className="font-semibold text-zinc-900">
        {mode.editable ? (
          <Field
            mode={mode}
            path={`sections.languages.${i}.language`}
            as="span"
            className="inline"
            placeholder="Language"
          />
        ) : (
          <span>
            {isSet(mode.data.sections.languages[i]?.language)
              ? `${mode.data.sections.languages[i]!.language}:`
              : 'Language:'}
          </span>
        )}
      </span>
      <Field
        mode={mode}
        path={`sections.languages.${i}.fluency`}
        as="span"
        className="inline text-zinc-700"
        placeholder="Fluent"
      />
    </div>
  );
  return (
    <JakeSection mode={mode} title="Languages" id="section-languages" sectionSlug="languages">
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.languages"
          addLabel="Add language"
          testIdPrefix="jake-lang-row"
          defaultRow={EMPTY_LANGUAGE}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div className="space-y-1">
          {mode.data.sections.languages.map((_, i) => (
            <div key={`l-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </JakeSection>
  );
}

function JakeInterests({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.interests) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[11pt] print:break-inside-avoid">
      <span className="font-semibold text-zinc-900">
        {mode.editable ? (
          <Field
            mode={mode}
            path={`sections.interests.${i}.name`}
            as="span"
            className="inline"
            placeholder="Category"
          />
        ) : (
          <span>
            {isSet(mode.data.sections.interests[i]?.name)
              ? `${mode.data.sections.interests[i]!.name}:`
              : 'Category:'}
          </span>
        )}
      </span>
      <FieldChips
        mode={mode}
        path={`sections.interests.${i}.keywords`}
        placeholder="keyword"
      />
    </div>
  );
  return (
    <JakeSection mode={mode} title="Interests" id="section-interests" sectionSlug="interests">
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.interests"
          addLabel="Add interest"
          testIdPrefix="jake-interest-row"
          defaultRow={EMPTY_INTEREST}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div className="space-y-1">
          {mode.data.sections.interests.map((_, i) => (
            <div key={`i-${i}`}>{renderRow(i)}</div>
          ))}
        </div>
      )}
    </JakeSection>
  );
}

function JakeReferences({ mode }: { mode: FieldMode }) {
  if (!has(mode.data.sections.references) && !mode.editable) return null;
  const renderRow = (i: number) => (
    <div className="mb-2 last:mb-0 text-[11pt] print:break-inside-avoid">
      <Field
        mode={mode}
        path={`sections.references.${i}.name`}
        as="p"
        className="font-semibold text-zinc-900"
        placeholder="Name"
      />
      <FieldArea
        mode={mode}
        path={`sections.references.${i}.reference`}
        className="italic text-zinc-700"
        placeholder='"Short reference quote"'
        rows={2}
      />
    </div>
  );
  return (
    <JakeSection mode={mode} title="References" id="section-references" sectionSlug="references">
      {mode.editable ? (
        <JakeEditableFieldArray
          path="sections.references"
          addLabel="Add reference"
          testIdPrefix="jake-ref-row"
          defaultRow={EMPTY_REFERENCE}
        >
          {renderRow}
        </JakeEditableFieldArray>
      ) : (
        <div>{mode.data.sections.references.map((_, i) => <div key={`r-${i}`}>{renderRow(i)}</div>)}</div>
      )}
    </JakeSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Editable field array wrappers (thin pass-throughs to the shared helper)   */
/* -------------------------------------------------------------------------- */

/**
 * The shared `EditableSection` from `./editable-section.tsx` already
 * supports drag-to-reorder + "+ Add" / ✕ Remove affordances. Jake
 * uses it directly. The local wrappers below exist so the
 * section-component call sites can pass a strongly-typed
 * `defaultRow` (one of the EMPTY_* constants from
 * `lib/resume-schema/defaults.ts`) without the shared helper
 * caring what shape it is.
 */
function JakeEditableFieldArray<T>(props: {
  path: string;
  addLabel: string;
  testIdPrefix: string;
  defaultRow: T;
  children: (index: number) => React.ReactNode;
}) {
  return (
    <EditableSection
      path={props.path}
      addLabel={props.addLabel}
      testIdPrefix={props.testIdPrefix}
      defaultRow={props.defaultRow}
    >
      {props.children}
    </EditableSection>
  );
}

function JakeEditableNestedFieldArray<T>(props: {
  path: string;
  addLabel: string;
  testIdPrefix: string;
  defaultRow: T;
  children: (index: number) => React.ReactNode;
}) {
  return (
    <EditableNestedSection
      path={props.path}
      addLabel={props.addLabel}
      testIdPrefix={props.testIdPrefix}
      defaultRow={props.defaultRow}
    >
      {props.children}
    </EditableNestedSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function str(data: unknown, path: string): string {
  const v = read(data, path);
  return typeof v === 'string' ? v : '';
}

function arr(data: unknown, path: string): string[] {
  const v = read(data, path);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
