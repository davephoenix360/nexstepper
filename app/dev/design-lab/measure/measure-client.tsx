'use client';

import { getTemplate } from '@/components/resume-templates';
import { PrintSettingsVars } from '@/components/editable/print-settings-vars';
import {
  coercePrintSettings,
  printSettingsToCssVars,
  type PrintSettings
} from '@/lib/print-settings';
import type { ResumeData } from '@/lib/resume-schema';

/**
 * Client island for the page-count measurement route.
 *
 * The templates are 'use client', so they can only be instantiated from
 * a client tree. This mirrors the split the Design Lab uses: the server
 * page reads `searchParams` (a server-component prop) and hands the
 * resolved values down here.
 *
 * ## Why this mirrors the real preview page EXACTLY
 *
 * The whole point is to measure what the user will actually get, so the
 * markup here has to match `app/(dashboard)/dashboard/resumes/[id]/preview/page.tsx`:
 *
 *   - the same `max-w-[8.5in]` outer column
 *   - the same `.printable` wrapper carrying the four `--resume-*` vars
 *   - the same template component with the same props
 *
 * The driver script then prints this with `page.pdf({ preferCSSPageSize: true })`,
 * which honours the `@page { size: letter; margin: var(--resume-margin) }`
 * rule from globals.css — i.e. the same pagination the browser's own
 * "Save as PDF" produces.
 *
 * No chrome is rendered here on purpose: any extra element would
 * compete for page space and inflate every measurement.
 */
export function MeasureClient({
  data,
  templateId,
  settings
}: {
  data: ResumeData;
  templateId: string;
  settings: PrintSettings;
}) {
  const template = getTemplate(templateId);
  const Template = template.Component;
  const cssVars = printSettingsToCssVars(coercePrintSettings(settings));

  return (
    <div className="mx-auto max-w-[8.5in] print:max-w-none">
      <div className="printable bg-white" style={cssVars}>
        <PrintSettingsVars vars={cssVars} />
        <Template data={data} />
      </div>
    </div>
  );
}
