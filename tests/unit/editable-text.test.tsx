import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FormProvider,
  useForm,
  type FieldValues,
  type UseFormReturn
} from 'react-hook-form';
import * as React from 'react';

import { EditableText, EditableTextarea } from '@/components/editable/editable-text';

/**
 * Lock the print/PDF behavior of the empty-state placeholder in
 * <EditableText> + <EditableTextarea>.
 *
 * Background: when the user clicks "Print / Save as PDF" on the
 * editor, the browser's print engine renders the same DOM the user
 * sees on screen. Empty fields used to show their "Click to add" /
 * "Job title" / "Company" placeholder text in the printed output —
 * which is wrong, because that's editor copy, not resume copy.
 *
 * The fix is a `print:hidden` span wrapping the placeholder. This
 * test renders the component with SSR (no DOM/jsdom needed) and
 * checks the output HTML:
 *   - empty value  → placeholder text appears inside a span with
 *                    class="print:hidden"
 *   - filled value → placeholder text is absent entirely
 *
 * The `print:` Tailwind variant is just a string in the className;
 * we don't need to resolve the CSS to know it's there. Tailwind v4
 * only emits the `print:hidden { display: none }` rule when the
 * utility is used in source, and it IS used (in classic.tsx +
 * editable-text.tsx), so the build will produce the right CSS.
 *
 * Component wrapper: <EditableText> reads its value from RHF via
 * `useController({ name: path })`, so we have to give it a real
 * FormProvider with defaultValues. SSR-only path is fine.
 */
function withForm(
  defaultValues: FieldValues,
  children: (form: UseFormReturn<FieldValues>) => React.ReactNode
): React.ReactElement {
  // Factory component so we can call useForm() inside a render.
  function FormHost() {
    const form = useForm<FieldValues>({ defaultValues });
    return <FormProvider {...form}>{children(form)}</FormProvider>;
  }
  return <FormHost />;
}

describe('EditableText — placeholder is print-hidden', () => {
  it('wraps the placeholder in a print:hidden span when the value is empty', () => {
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: { name: '' } } }, () => (
        <EditableText path="sections.basics.name" placeholder="Your name" />
      ))
    );

    // The placeholder text should be present in the markup.
    expect(html).toContain('Your name');
    // And it must be wrapped in a span with the `print:hidden` Tailwind
    // utility so the browser's print engine hides it. The data-testid
    // gives us a stable hook to check the wrapping span specifically.
    //
    // Attribute order isn't guaranteed across React versions, so we
    // match the placeholder span as a self-contained element and then
    // verify print:hidden lives on the same span (vs some other span
    // further up or down the tree).
    const placeholderSpan = html.match(
      /<span[^>]*data-testid="editable-sections\.basics\.name-placeholder"[^>]*>[^<]*Your name<\/span>/
    );
    expect(placeholderSpan).not.toBeNull();
    expect(placeholderSpan![0]).toContain('print:hidden');
  });

  it('does not render the placeholder when the value is filled', () => {
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: { name: 'Diepreye Alagbe' } } }, () => (
        <EditableText
          path="sections.basics.name"
          placeholder="Your name"
        />
      ))
    );

    // Real value appears.
    expect(html).toContain('Diepreye Alagbe');
    // Placeholder text must NOT appear when the value is set —
    // otherwise an unstyled "Your name" would bleed into the PDF
    // alongside the user's actual name.
    expect(html).not.toContain('Your name');
    // And the print:hidden placeholder span should be absent.
    expect(html).not.toContain('editable-sections.basics.name-placeholder');
  });
});

describe('EditableTextarea — placeholder is print-hidden', () => {
  it('wraps the placeholder in a print:hidden span when the value is empty', () => {
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: { summary: '' } } }, () => (
        <EditableTextarea
          path="sections.basics.summary"
          placeholder="A short professional summary"
        />
      ))
    );

    expect(html).toContain('A short professional summary');
    const placeholderSpan = html.match(
      /<span[^>]*data-testid="editable-sections\.basics\.summary-placeholder"[^>]*>[^<]*A short professional summary<\/span>/
    );
    expect(placeholderSpan).not.toBeNull();
    expect(placeholderSpan![0]).toContain('print:hidden');
  });

  it('does not render the placeholder when the value is filled', () => {
    const html = renderToStaticMarkup(
      withForm(
        { sections: { basics: { summary: 'Ten years building web platforms.' } } },
        () => (
          <EditableTextarea
            path="sections.basics.summary"
            placeholder="A short professional summary"
          />
        )
      )
    );

    expect(html).toContain('Ten years building web platforms');
    expect(html).not.toContain('A short professional summary');
  });
});
