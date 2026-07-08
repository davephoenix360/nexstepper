'use client';

/**
 * Header contact / location lines — the two rows under the user's
 * name in the resume header.
 *
 * Two print bugs to fix in the same family:
 *
 *  1. The `·` separator spans (contact line) and the `, `
 *     separator spans (location line) used to print even when
 *     every value was empty. Each EditableText placeholder was
 *     correctly `print:hidden`, but the separators live in the
 *     parent and weren't hidden — so the printed PDF showed
 *     "· ·" and ", ," floating alone.
 *
 *  2. With only ONE field filled, the trailing separators still
 *     rendered — "email · ·" or "Denver , ,". The fix is to
 *     condition each separator on BOTH the fields it sits
 *     between being non-empty.
 *
 * The fix: each component reads the live form values via
 * `useController` and:
 *   - hides the whole wrapper with `print:hidden` when all
 *     three values are empty (no stray "· ·" row in the PDF);
 *   - suppresses each individual separator when either
 *     adjacent field is empty (no trailing "value · ·").
 *
 * Why own the wrapper <div> instead of relying on the parent?
 * Because the parent has to be a server component for the
 * static read-only render; useController needs the FormProvider
 * context, which only lives inside client components. Pushing
 * the wrapper into the editable component keeps the parent
 * clean.
 *
 * Always rendered inside a <FormProvider> in editable mode
 * (provided by the editor's <EditableResume>).
 */

import { useController } from 'react-hook-form';

import { EditableText } from '@/components/editable/editable-text';
import { cn } from '@/lib/utils';

import type { ResumeData } from '@/lib/resume-schema';

/**
 * Editable contact line — email · phone · url separated by " · ".
 *
 * `print:hidden` is applied to the wrapper when all three values
 * are empty. Each `·` separator is additionally conditional on
 * both adjacent fields being filled, so a partial fill renders
 * as "email" or "email · phone" — never "email · ·".
 */
export function ContactLineEditable({
  contact: _contact
}: {
  contact: ResumeData['sections']['basics'];
}) {
  // `contact` is currently unused — we read the live values via
  // useController instead because useFieldArray / static prop
  // values are frozen at mount. Keeping the prop for the
  // call-site signature and so the contact type stays available
  // if we ever want to seed defaults from it.
  void _contact;

  const emailCtrl = useController({ name: 'sections.basics.email' });
  const phoneCtrl = useController({ name: 'sections.basics.phone' });
  const urlCtrl = useController({ name: 'sections.basics.url' });
  const email = (emailCtrl.field.value as string | undefined) ?? '';
  const phone = (phoneCtrl.field.value as string | undefined) ?? '';
  const url = (urlCtrl.field.value as string | undefined) ?? '';
  const allEmpty = !email && !phone && !url;

  return (
    <div
      className={cn(
        'mt-2 text-[10pt] text-zinc-600',
        allEmpty && 'print:hidden'
      )}
      data-testid="contact-line-editable"
    >
      <EditableText
        path="sections.basics.email"
        className="inline"
        placeholder="email@example.com"
      />
      {email && phone && (
        <span className="mx-2 text-zinc-400" aria-hidden="true">
          ·
        </span>
      )}
      <EditableText
        path="sections.basics.phone"
        className="inline"
        placeholder="+1 (555) 123-4567"
      />
      {phone && url && (
        <span className="mx-2 text-zinc-400" aria-hidden="true">
          ·
        </span>
      )}
      <EditableText
        path="sections.basics.url"
        className="inline"
        placeholder="website.com"
      />
    </div>
  );
}

/**
 * Editable location line — city, region, countryCode in the
 * canonical JSON Resume order.
 *
 * Same `print:hidden`-when-all-empty + per-separator logic as
 * the contact line. Each `, ` separator is conditional on both
 * adjacent fields being filled.
 */
export function LocationLineEditable({
  location: _location
}: {
  location: ResumeData['sections']['basics']['location'];
}) {
  void _location;

  const cityCtrl = useController({ name: 'sections.basics.location.city' });
  const regionCtrl = useController({
    name: 'sections.basics.location.region'
  });
  const countryCtrl = useController({
    name: 'sections.basics.location.countryCode'
  });
  const city = (cityCtrl.field.value as string | undefined) ?? '';
  const region = (regionCtrl.field.value as string | undefined) ?? '';
  const country = (countryCtrl.field.value as string | undefined) ?? '';
  const allEmpty = !city && !region && !country;

  return (
    <div
      className={cn(
        'mt-1 text-[10pt] text-zinc-500',
        allEmpty && 'print:hidden'
      )}
      data-testid="location-line-editable"
    >
      <EditableText
        path="sections.basics.location.city"
        className="inline"
        placeholder="City"
      />
      {city && region && (
        <span className="ml-1" aria-hidden="true">
          ,
        </span>
      )}
      <EditableText
        path="sections.basics.location.region"
        className="inline ml-1"
        placeholder="Region"
      />
      {region && country && (
        <span className="ml-1" aria-hidden="true">
          ,
        </span>
      )}
      <EditableText
        path="sections.basics.location.countryCode"
        className="inline ml-1"
        placeholder="Country"
      />
    </div>
  );
}
