import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { useSectionPrint } from '@/components/editable/use-section-print';

function Probe({
  slug,
  mode
}: {
  slug: string;
  mode: Parameters<typeof useSectionPrint>[1];
}) {
  const { hidden } = useSectionPrint(slug, mode);
  return React.createElement('div', { 'data-hidden': hidden ? 'yes' : 'no' }, 'probe');
}

function withForm<T>(defaults: Record<string, unknown>, children: () => React.ReactNode) {
  function Wrapper() {
    const form = useForm({ defaultValues: defaults });
    return (
      <FormProvider {...form}>
        {children()}
      </FormProvider>
    );
  }
  return <Wrapper />;
}

describe('useSectionPrint — preview mode (no FormProvider)', () => {
  it('does not crash and reads from data.print.hiddenSections', () => {
    // This is the preview/PDF render path: MinimalTemplate et al.
    // call SmartSection, which calls useSectionPrint, with NO
    // FormProvider. Before the fix this crashed with
    // "Cannot read properties of null (reading 'control')".
    const html = renderToStaticMarkup(
      React.createElement(Probe, {
        slug: 'experience',
        mode: {
          editable: false,
          data: { print: { hiddenSections: ['experience'] } }
        }
      })
    );
    expect(html).toContain('data-hidden="yes"');
  });

  it('returns hidden=false when slug not in the array', () => {
    const html = renderToStaticMarkup(
      React.createElement(Probe, {
        slug: 'experience',
        mode: {
          editable: false,
          data: { print: { hiddenSections: ['skills'] } }
        }
      })
    );
    expect(html).toContain('data-hidden="no"');
  });

  it('returns hidden=false when the print envelope is absent (back-compat)', () => {
    const html = renderToStaticMarkup(
      React.createElement(Probe, {
        slug: 'experience',
        mode: { editable: false, data: {} }
      })
    );
    expect(html).toContain('data-hidden="no"');
  });

  it('returns hidden=false when data is undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(Probe, {
        slug: 'experience',
        mode: { editable: false }
      })
    );
    expect(html).toContain('data-hidden="no"');
  });

  it('exposes a no-op toggle in preview mode (no form context to write to)', () => {
    // Calling toggle() in preview mode must not throw. There is no
    // FormProvider, so any write attempt would either no-op or
    // crash — the hook contract says it must no-op.
    let captured: { toggle: () => void } | null = null;
    function CaptureProbe() {
      const r = useSectionPrint('experience', {
        editable: false,
        data: { print: { hiddenSections: [] } }
      });
      captured = r;
      return null;
    }
    renderToStaticMarkup(React.createElement(CaptureProbe));
    expect(captured).not.toBeNull();
    expect(() => captured!.toggle()).not.toThrow();
  });
});

describe('useSectionPrint — editor mode (with FormProvider)', () => {
  it('returns hidden=true when the slug is in the live form', () => {
    const html = renderToStaticMarkup(
      withForm(
        { print: { hiddenSections: ['experience'] } },
        () =>
          React.createElement(Probe, {
            slug: 'experience',
            mode: { editable: true }
          })
      )
    );
    expect(html).toContain('data-hidden="yes"');
  });

  it('returns hidden=false when the slug is not in the live form', () => {
    const html = renderToStaticMarkup(
      withForm(
        { print: { hiddenSections: ['skills'] } },
        () =>
          React.createElement(Probe, {
            slug: 'experience',
            mode: { editable: true }
          })
      )
    );
    expect(html).toContain('data-hidden="no"');
  });

  it('returns hidden=false when print envelope is absent (defaults to [])', () => {
    const html = renderToStaticMarkup(
      withForm(
        {},
        () =>
          React.createElement(Probe, {
            slug: 'experience',
            mode: { editable: true }
          })
      )
    );
    expect(html).toContain('data-hidden="no"');
  });
});
