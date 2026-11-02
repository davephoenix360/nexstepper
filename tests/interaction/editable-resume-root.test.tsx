/**
 * @vitest-environment jsdom
 *
 * A smoke test for the editor ROOT.
 *
 * ## Why this file exists
 *
 * On 2026-11-02 a change shipped that crashed the editor on EVERY
 * resume:
 *
 *   TypeError: Cannot read properties of null (reading 'control')
 *     at components/rich-text/use-formatting.ts:49
 *     at components/editable/editable-resume.tsx:348
 *
 * The cause: `useFormatting()` reads `useFormContext()`, and
 * `EditableResume` RENDERS the `<FormProvider>` — it is not *inside*
 * one. So the context was null and reading `form.control` off it
 * threw, taking the whole page with it.
 *
 * ## Why nothing caught it
 *
 * Because **no test rendered `EditableResume`**. The formatting tests
 * rendered the pieces — a field, the toolbar — inside a provider of
 * their own, which is exactly the shape the bug did *not* have. A test
 * that renders the real root in the real shape is the only thing that
 * catches "the page this component lives on does not mount".
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/resumes/r1'
}));

// The server actions pull in the database module; the editor never
// calls them in this test, they only have to import cleanly.
vi.mock('@/app/(dashboard)/dashboard/resumes/actions', () => ({
  saveResumeAction: vi.fn(),
  autosaveResumeAction: vi.fn()
}));

import { EditableResume } from '@/components/editable/editable-resume';
import { sampleResumeData } from '@/lib/resume-schema/sample';

describe('the editor root', () => {
  it('mounts without throwing', () => {
    expect(() =>
      render(
        <EditableResume
          resumeId="r1"
          initialData={sampleResumeData}
          isMaster={false}
        />
      )
    ).not.toThrow();
  });

  it('mounts with formatting already applied', () => {
    // The other shape that used to crash: a resume that HAS marks, so
    // the editor reads the overlay rather than the "no formatting" path.
    expect(() =>
      render(
        <EditableResume
          resumeId="r2"
          initialData={{
            ...sampleResumeData,
            formatting: {
              'sections.basics.summary': [
                { text: 'Engineer', start: 4, marks: ['bold'] }
              ]
            }
          }}
          isMaster={false}
        />
      )
    ).not.toThrow();
  });
});
