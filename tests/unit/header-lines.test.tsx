import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FormProvider,
  useForm,
  type FieldValues
} from 'react-hook-form';
import * as React from 'react';

import {
  ContactLineEditable,
  LocationLineEditable
} from '@/components/resume-templates/header-lines';

/**
 * Lock the print-mode behavior of the resume header's contact and
 * location lines. The bug these tests pin down:
 *
 *   1. Each row has a separator (`·` between contact fields,
 *      `, ` between location fields). When ALL the values in a
 *      row are empty, the printed PDF used to show those
 *      separators alone — " · · " for contact, " , , " for
 *      location. Recruiters notice. The fix is `print:hidden` on
 *      the wrapper when all fields are empty.
 *
 *   2. The opposite case (any field filled) must NOT hide the
 *      row in print — a contact line with just an email is still
 *      legitimate and should print.
 *
 *   3. The fix must be reactive: when the user types a value,
 *      the line un-hides for print immediately. (Implicit — we
 *      use useController, which subscribes.)
 *
 * SSR (no jsdom) works for this; we only check class strings.
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

describe('ContactLineEditable — print:hidden when all empty', () => {
  const emptyContact = {
    name: 'Test',
    label: '',
    email: '',
    phone: '',
    url: '',
    summary: '',
    location: {
      address: '',
      postalCode: '',
      city: '',
      countryCode: '',
      region: ''
    },
    profiles: [] as never[]
  };

  it('applies print:hidden when email, phone, AND url are all empty', () => {
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: emptyContact } }, () => (
        <ContactLineEditable contact={emptyContact} />
      ))
    );

    // The wrapper gets the print:hidden class so the whole row
    // disappears from the PDF. Without it the rendered markup
    // would still carry the `·` separators in the print engine.
    expect(html).toMatch(/<div[^>]*class="[^"]*print:hidden[^"]*"/);
    // The placeholder text is still on screen — only the
    // printed copy is suppressed.
    expect(html).toContain('email@example.com');
    expect(html).toContain('+1 (555) 123-4567');
    expect(html).toContain('website.com');
  });

  it('does NOT apply print:hidden when just one field is filled', () => {
    const partial = { ...emptyContact, email: 'me@example.com' };
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: partial } }, () => (
        <ContactLineEditable contact={partial} />
      ))
    );

    expect(html).not.toMatch(/<div[^>]*class="[^"]*print:hidden[^"]*"/);
    // The actual value is in the markup, no placeholder for that
    // field.
    expect(html).toContain('me@example.com');
  });

  it('does NOT apply print:hidden when two fields are filled', () => {
    // Same contract — partial fills keep the line printing.
    const partial = {
      ...emptyContact,
      email: 'me@example.com',
      phone: '+1 (555) 123-4567'
    };
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: partial } }, () => (
        <ContactLineEditable contact={partial} />
      ))
    );

    expect(html).not.toMatch(/<div[^>]*class="[^"]*print:hidden[^"]*"/);
  });

  it('hides the trailing separator when only the first field is filled', () => {
    // With only email filled, the line should print "me@example.com"
    // — NOT "me@example.com · ·" (which is what a naive
    // placeholder-only fix would have produced).
    const partial = { ...emptyContact, email: 'me@example.com' };
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: partial } }, () => (
        <ContactLineEditable contact={partial} />
      ))
    );

    expect(html).toContain('me@example.com');
    // The separator should be absent — only one field is filled.
    expect(html).not.toContain('·');
  });

  it('hides the trailing separator when only the middle field is filled', () => {
    // phone alone — no leading or trailing dots.
    const partial = { ...emptyContact, phone: '+1 (555) 123-4567' };
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: partial } }, () => (
        <ContactLineEditable contact={partial} />
      ))
    );

    expect(html).toContain('+1 (555) 123-4567');
    expect(html).not.toContain('·');
  });

  it('shows the inner separator when email AND phone are filled, but not the trailing one', () => {
    // email + phone → "me@example.com · +1 (555) 123-4567" — one
    // dot, between the two filled fields. No trailing dot.
    const partial = {
      ...emptyContact,
      email: 'me@example.com',
      phone: '+1 (555) 123-4567'
    };
    const html = renderToStaticMarkup(
      withForm({ sections: { basics: partial } }, () => (
        <ContactLineEditable contact={partial} />
      ))
    );

    // Count the visible separator dots: should be exactly 1.
    // The dot lives in <span class="mx-2 text-zinc-400" ...>·</span>;
    // attribute order isn't stable, so we look for the class and
    // the text content separately.
    const separatorCount = (
      html.match(/class="[^"]*mx-2[^"]*text-zinc-400[^"]*"/g) ?? []
    ).length;
    expect(separatorCount).toBe(1);
  });
});

describe('LocationLineEditable — print:hidden when all empty', () => {
  it('applies print:hidden when city, region, AND countryCode are all empty', () => {
    const html = renderToStaticMarkup(
      withForm(
        {
          sections: {
            basics: {
              location: {
                address: '',
                postalCode: '',
                city: '',
                region: '',
                countryCode: ''
              }
            }
          }
        },
        () => (
          <LocationLineEditable
            location={{
              address: '',
              postalCode: '',
              city: '',
              region: '',
              countryCode: ''
            }}
          />
        )
      )
    );

    expect(html).toMatch(/<div[^>]*class="[^"]*print:hidden[^"]*"/);
    // Placeholders visible on screen
    expect(html).toContain('City');
    expect(html).toContain('Region');
    expect(html).toContain('Country');
  });

  it('does NOT apply print:hidden when just one location field is filled', () => {
    const html = renderToStaticMarkup(
      withForm(
        {
          sections: {
            basics: {
              location: {
                address: '',
                postalCode: '',
                city: 'Denver',
                region: '',
                countryCode: ''
              }
            }
          }
        },
        () => (
          <LocationLineEditable
            location={{
              address: '',
              postalCode: '',
              city: 'Denver',
              region: '',
              countryCode: ''
            }}
          />
        )
      )
    );

    expect(html).not.toMatch(/<div[^>]*class="[^"]*print:hidden[^"]*"/);
    expect(html).toContain('Denver');
  });

  it('does NOT apply print:hidden when all three location fields are filled', () => {
    const html = renderToStaticMarkup(
      withForm(
        {
          sections: {
            basics: {
              location: {
                address: '',
                postalCode: '',
                city: 'Denver',
                region: 'CO',
                countryCode: 'US'
              }
            }
          }
        },
        () => (
          <LocationLineEditable
            location={{
              address: '',
              postalCode: '',
              city: 'Denver',
              region: 'CO',
              countryCode: 'US'
            }}
          />
        )
      )
    );

    expect(html).not.toMatch(/<div[^>]*class="[^"]*print:hidden[^"]*"/);
    expect(html).toContain('Denver');
    expect(html).toContain('CO');
    expect(html).toContain('US');
  });

  it('hides the trailing comma when only the first field is filled', () => {
    // City only — no trailing ", ,"
    const html = renderToStaticMarkup(
      withForm(
        {
          sections: {
            basics: {
              location: {
                address: '',
                postalCode: '',
                city: 'Denver',
                region: '',
                countryCode: ''
              }
            }
          }
        },
        () => (
          <LocationLineEditable
            location={{
              address: '',
              postalCode: '',
              city: 'Denver',
              region: '',
              countryCode: ''
            }}
          />
        )
      )
    );

    expect(html).toContain('Denver');
    // The separator <span> tags hold just a comma. None should
    // render when only one location field is filled.
    const separatorCommas = (
      html.match(/<span[^>]*aria-hidden="true"[^>]*>\s*,\s*<\/span>/g) ?? []
    ).length;
    expect(separatorCommas).toBe(0);
  });

  it('shows only the inner comma when city AND region are filled', () => {
    // city + region → "Denver, CO" — one comma between them.
    const html = renderToStaticMarkup(
      withForm(
        {
          sections: {
            basics: {
              location: {
                address: '',
                postalCode: '',
                city: 'Denver',
                region: 'CO',
                countryCode: ''
              }
            }
          }
        },
        () => (
          <LocationLineEditable
            location={{
              address: '',
              postalCode: '',
              city: 'Denver',
              region: 'CO',
              countryCode: ''
            }}
          />
        )
      )
    );

    const separatorCommas = (
      html.match(/<span[^>]*aria-hidden="true"[^>]*>\s*,\s*<\/span>/g) ?? []
    ).length;
    expect(separatorCommas).toBe(1);
  });
});
