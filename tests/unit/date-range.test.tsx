import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm, type FieldValues } from 'react-hook-form';
import * as React from 'react';

import { DateRange } from '@/components/resume-templates/date-range';

/**
 * DateRange lives in a tiny file by itself so we can lock the
 * "Jan 2025 – Aug 2025" rendering contract end-to-end. Two
 * regressions these tests pin down:
 *
 *   1. The en-dash used to be a literal "-" touching the first
 *      date in the editable flex layout. Now it's an en-dash with
 *      `mx-1.5` on either side. The shape assertion checks both
 *      the character and the spacing class.
 *
 *   2. The dash used to render even when BOTH start and end were
 *      empty (leaving " – " floating alone in the PDF). The new
 *      rule: dash only when BOTH are filled, otherwise no dash.
 *
 * SSR (no jsdom) is enough because we only care about markup
 * shape. Real visual verification (font, pixel spacing) happens
 * in the browser via the print-preview smoke test.
 */

function withForm(
  defaultValues: FieldValues,
  children: (form: unknown) => React.ReactNode
): React.ReactElement {
  function FormHost() {
    const form = useForm<FieldValues>({ defaultValues });
    return <FormProvider {...form}>{children(form)}</FormProvider>;
  }
  return <FormHost />;
}

// Pattern that matches the dash wrapper in the markup. Attribute
// order isn't stable across React versions, so we look for the
// wrapper span that has `mx-1.5` (the breathing-room class) and
// contains the en-dash character.
const DASH_MARKUP = /<span[^>]*class="[^"]*mx-1\.5[^"]*"[^>]*>\s*–\s*<\/span>/;
const EN_DASH = '–';

describe('DateRange — read-only', () => {
  it('renders the range with an en-dash and proper spacing when both dates are filled', () => {
    const html = renderToStaticMarkup(
      <DateRange start="Jan 2025" end="Aug 2025" />
    );
    expect(html).toContain('Jan 2025');
    expect(html).toContain('Aug 2025');
    expect(html).toContain(EN_DASH);
    // The dash wrapper must have mx-1.5 for breathing room
    // (6px on each side). The earlier gap-1 layout had only 4px,
    // which the user reported as too tight in print.
    expect(html).toMatch(DASH_MARKUP);
  });

  it('returns null (renders nothing) when BOTH start and end are empty', () => {
    const html = renderToStaticMarkup(<DateRange />);
    // The whole range is hidden in read-only when empty so the
    // header doesn't reserve space for a phantom date.
    expect(html).toBe('');
  });

  it('returns null when both are whitespace-only', () => {
    const html = renderToStaticMarkup(
      <DateRange start="   " end="   " />
    );
    expect(html).toBe('');
  });

  it('shows only the start (no dash) when end is empty', () => {
    const html = renderToStaticMarkup(<DateRange start="Jan 2025" />);
    expect(html).toContain('Jan 2025');
    // Falls back to "Present" for the empty trailing end so the
    // range is unambiguous - "I'm still here" is the implicit
    // message of every range whose end is the current moment.
    expect(html).toContain('Present');
    // But the dash must NOT appear - the start is alone.
    expect(html).not.toContain(EN_DASH);
  });

  it('shows only the end with "—" fallback when start is empty', () => {
    const html = renderToStaticMarkup(<DateRange end="Aug 2025" />);
    expect(html).toContain('Aug 2025');
    expect(html).toContain('—');
    expect(html).not.toContain(EN_DASH);
  });

  it('formats ISO 8601 dates down to the year (2020-03-15 → 2020)', () => {
    // The intent: most resumes care about the year only; month
    // precision is noise. This pre-dates the current bug fix and
    // the test pins the formatting rule so it can't drift.
    const html = renderToStaticMarkup(
      <DateRange start="2020-03-15" end="2022-08" />
    );
    expect(html).toContain('2020');
    expect(html).toContain('2022');
    // "2020-03-15" and "2022-08" must NOT appear verbatim - the
    // formatter should collapse them to the year part.
    expect(html).not.toContain('2020-03-15');
    expect(html).not.toContain('2022-08');
  });

  it('passes through non-ISO month-name dates unchanged (Jan 2025 stays Jan 2025)', () => {
    // If the user types "Jan 2025" instead of an ISO date, the
    // formatter should respect their choice - the regex only
    // matches a 4-digit year at the start.
    const html = renderToStaticMarkup(
      <DateRange start="Jan 2025" end="Aug 2025" />
    );
    expect(html).toContain('Jan 2025');
    expect(html).toContain('Aug 2025');
  });
});

describe('DateRange — editable', () => {
  it('renders two EditableText inputs with the dash when BOTH dates are filled', () => {
    const html = renderToStaticMarkup(
      withForm(
        { sections: { work: { positions: [{ startDate: 'Jan 2025', endDate: 'Aug 2025' }] } } },
        () => (
          <DateRange
            editable
            start="Jan 2025"
            end="Aug 2025"
            startPath="sections.work.positions.0.startDate"
            endPath="sections.work.positions.0.endDate"
          />
        )
      )
    );

    expect(html).toContain('Jan 2025');
    expect(html).toContain('Aug 2025');
    expect(html).toContain(EN_DASH);
    expect(html).toMatch(DASH_MARKUP);
    // The dash wrapper is identifiable by a data-testid derived
    // from startPath so e2e tests can target it.
    expect(html).toContain('daterange-dash-sections.work.positions.0.startDate');
  });

  it('hides the dash in editable mode when both start and end are empty', () => {
    // The user explicitly asked: "the hyphen separator for the
    // dates is still there when both dates are empty, it should
    // only be shown when both are there." This is that contract.
    const html = renderToStaticMarkup(
      withForm(
        { sections: { work: { positions: [{ startDate: '', endDate: '' }] } } },
        () => (
          <DateRange
            editable
            start=""
            end=""
            startPath="sections.work.positions.0.startDate"
            endPath="sections.work.positions.0.endDate"
          />
        )
      )
    );

    // Both EditableText fields are present (with their placeholders).
    expect(html).toContain('YYYY');
    expect(html).toContain('Present');
    // But no en-dash separator between them.
    expect(html).not.toContain(EN_DASH);
    expect(html).not.toMatch(DASH_MARKUP);
  });

  it('hides the dash in editable mode when only start is filled', () => {
    // "Jan 2025 – " with nothing after the dash would be the
    // wrong output. If start is filled and end isn't, the user
    // is mid-typing the end - no dash yet, "Present" placeholder
    // visible so they know what to type.
    const html = renderToStaticMarkup(
      withForm(
        { sections: { work: { positions: [{ startDate: 'Jan 2025', endDate: '' }] } } },
        () => (
          <DateRange
            editable
            start="Jan 2025"
            end=""
            startPath="sections.work.positions.0.startDate"
            endPath="sections.work.positions.0.endDate"
          />
        )
      )
    );

    expect(html).toContain('Jan 2025');
    expect(html).toContain('Present');
    expect(html).not.toContain(EN_DASH);
  });

  it('hides the dash in editable mode when only end is filled', () => {
    // Symmetric case: end is set, start isn't. No dash.
    const html = renderToStaticMarkup(
      withForm(
        { sections: { work: { positions: [{ startDate: '', endDate: 'Aug 2025' }] } } },
        () => (
          <DateRange
            editable
            start=""
            end="Aug 2025"
            startPath="sections.work.positions.0.startDate"
            endPath="sections.work.positions.0.endDate"
          />
        )
      )
    );

    expect(html).toContain('Aug 2025');
    expect(html).toContain('YYYY');
    expect(html).not.toContain(EN_DASH);
  });
});
