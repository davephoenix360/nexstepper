'use client';

/**
 * DateRange — the compact "Jan 2025 – Aug 2025" range used in the
 * work / education / projects / volunteer row headers.
 *
 * Three things to know about this component:
 *
 *  1. The dash is anchored by the start. The en-dash separator
 *     renders whenever there IS a start date — the start anchors
 *     the range. The end falls back to the placeholder "Present"
 *     when empty, so a current role reads as "2022 – Present"
 *     (never "2022Present" mashed together). The dash is
 *     suppressed only when the start is empty, in which case
 *     the em-dash "—" placeholder shows in its place so the
 *     reader knows the start was intentionally left blank. Both
 *     empty → the read-only path returns null entirely so the
 *     header doesn't reserve space for a phantom date.
 *
 *  2. Typographic en-dash, not hyphen-minus. Resumes use the same
 *     en-dash convention as the rest of professional typography:
 *     "Jan 2025 – Aug 2025", never "Jan 2025 - Aug 2025". The
 *     difference is visible at print resolution.
 *
 *  3. Whitespace matters. Both the en-dash separator AND the
 *     em-dash fallback carry `mx-1.5 text-zinc-400` (6px on each
 *     side + the lighter placeholder color) so they don't touch
 *     the surrounding dates. The earlier flex-with-gap-1 layout
 *     crammed the dash against the first date because the start
 *     field was `w-12 text-right` — the dash then sat at the
 *     right edge of a 48px box that the text overflowed, ending
 *     up glued to the last digit. We dropped the fixed width;
 *     the fields now grow to fit their content and the gap is
 *     honest.
 *
 * Editable variant
 * ---------------
 * When `editable` is true, the start and end are two <EditableText>s
 * bound to the form via `startPath` / `endPath`. The dash is
 * conditional the same way as read-only. Placeholders ("YYYY" /
 * "Present") show on screen when the underlying value is empty;
 * they go away in print (see the print:hidden fix on
 * EditableText). When the user is mid-typing, the dash may pop
 * in/out as they fill the second field — that's intentional, it
 * tells them "you're in the middle of a range".
 *
 * **Live values via useWatch.** The dash logic needs the CURRENT
 * form values, not whatever the array-field metadata said at the
 * time the row was added. `useFieldArray`'s `field` object is a
 * stable reference that doesn't update with value changes —
 * `field.startDate` stays "" forever even after the user types.
 * We use `useWatch` to subscribe to the live values instead. The
 * `start` / `end` props are still accepted (for tests + the
 * read-only path) but in editable mode the watched values win.
 *
 * Always renders inside a <FormProvider> in editable mode (the
 * editor's <EditableResume> provides one).
 */

import * as React from 'react';
import { useController } from 'react-hook-form';

import { EditableText } from '@/components/editable/editable-text';

interface DateRangeProps {
  /** Start date, free-form (e.g. "2020-03-15" or "Mar 2020" or "2020"). */
  start?: string;
  /** End date. Empty/undefined means "still going" for typical resumes. */
  end?: string;
  /** When true, render <EditableText> inputs bound to the paths. */
  editable?: boolean;
  /** RHF path for the start field (editable mode only). */
  startPath?: string;
  /** RHF path for the end field (editable mode only). */
  endPath?: string;
}

/**
 * Trim, then if it starts with a 4-digit year, return just the year;
 * otherwise return the trimmed original. "2020-03-15" → "2020";
 * "Mar 2020" → "Mar 2020" (passed through so the user's own
 * formatting wins when they type a month).
 */
function formatDate(d: string | undefined): string {
  if (!d || !d.trim()) return '';
  const m = /^(\d{4})/.exec(d.trim());
  return m ? m[1] : d.trim();
}

export function DateRange({
  start,
  end,
  editable = false,
  startPath,
  endPath
}: DateRangeProps) {
  // The editable path mounts a child component so its RHF hooks
  // (useController) only run when there's a FormProvider in
  // scope. The read-only path uses the prop values directly and
  // never touches RHF, so it works in any context — including
  // SSR with no provider.
  if (editable && startPath && endPath) {
    return (
      <DateRangeEditable startPath={startPath} endPath={endPath} />
    );
  }

  const s = formatDate(start);
  const e = formatDate(end);
  const hasStart = s.length > 0;
  const hasEnd = e.length > 0;
  // The dash earns its place whenever there is a start (the start
  // anchors the range). Previously we only showed the dash when
  // BOTH sides had user-supplied values, which collapsed the common
  // "current role" pattern "2022 – Present" into "2022Present".
  // "Present" is still a real end value, so the dash wins whenever
  // there's at least a start. If there's only an end (rare), we
  // skip the dash entirely — "— – 2024" reads worse than "2024".
  const hasAny = hasStart || hasEnd;
  const showDash = hasStart;

  if (!hasAny) return null;

  return (
    <span className="text-[10pt] whitespace-nowrap text-zinc-500">
      <span className={hasStart ? '' : 'mx-1.5 text-zinc-400'}>
        {s || '—'}
      </span>
      {showDash && (
        <span
          aria-hidden="true"
          className="mx-1.5 text-zinc-400"
          data-testid={`daterange-dash-readonly`}
        >
          –
        </span>
      )}
      <span>{e || 'Present'}</span>
    </span>
  );
}

/**
 * Editable child — only mounted when `editable` is true. Reads
 * live values from RHF via useController so the dash updates
 * the instant the user types. Separated from the parent so the
 * parent can render in SSR / non-form contexts (e.g. tests)
 * without crashing on the missing FormProvider.
 */
function DateRangeEditable({
  startPath,
  endPath
}: {
  startPath: string;
  endPath: string;
}) {
  // useController subscribes to value changes via RHF's internal
  // subject. The start/end props from the parent would be the
  // frozen useFieldArray metadata (which doesn't update on
  // keystrokes) — that's why the dash used to stay hidden even
  // after the user typed both dates. Watching via the controller
  // is what makes the dash reactive.
  const startCtrl = useController({ name: startPath });
  const endCtrl = useController({ name: endPath });

  const s = formatDate(startCtrl.field.value as string | undefined);
  const e = formatDate(endCtrl.field.value as string | undefined);
  const hasStart = s.length > 0;
  const hasEnd = e.length > 0;
  // Mirror the read-only path on Line 117 (showDash = hasStart).
  // The dash earns its place whenever there is a start — the
  // start anchors the range, and an empty end falls back to
  // "Present" so the user gets "2022 – Present" while editing
  // an ongoing role, matching what they'll see in the printed
  // PDF after they leave edit mode.
  const showDash = hasStart;

  return (
    <span className="text-[10pt] whitespace-nowrap text-zinc-500">
      <EditableText
        path={startPath}
        placeholder="YYYY"
        className="inline"
      />
      {showDash && (
        <span
          aria-hidden="true"
          className="mx-1.5 text-zinc-400"
          data-testid={`daterange-dash-${startPath}`}
        >
          –
        </span>
      )}
      <EditableText
        path={endPath}
        placeholder="Present"
        className="inline"
      />
    </span>
  );
}
