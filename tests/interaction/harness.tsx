/**
 * Shared helpers for `tests/interaction/**` — the DOM-based suites.
 *
 * ## Why this directory exists
 *
 * Every template bug found while shipping Jake's Resume (5 of them,
 * 3 of which were interaction bugs) slipped past a
 * `renderToStaticMarkup` assertion, because that API renders markup
 * and **never dispatches a click**. A test could assert that a
 * "Remove profile" button exists and pass against an implementation
 * where clicking it did nothing at all.
 *
 * Concretely, the per-row `useFieldArray` bug (see
 * `docs/drift/2026-10-19-jake-resume-template.md`, Round 5) was
 * invisible to the unit suite: the button rendered, so the testid
 * assertion held, while `remove(i)` ran against clobbered RHF state
 * and unset values without shrinking the array.
 *
 * These tests use jsdom + Testing Library and actually click.
 *
 * ## Environment
 *
 * Each file opts in with a `@vitest-environment jsdom` docblock rather
 * than flipping `vitest.config.ts`'s default — see the comment there.
 */

import * as React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FormProvider,
  useForm,
  type FieldValues,
  type UseFormReturn
} from 'react-hook-form';

import type { ResumeData } from '@/lib/resume-schema';

/**
 * Captures the `useForm` return value so a test can assert on
 * `form.getValues(...)` AFTER an interaction — which is the only way
 * to prove a mutation actually reached RHF rather than just changing
 * what the DOM shows.
 *
 * Written to during render, which React Testing Library drives
 * synchronously, so it is populated by the time `render()` returns.
 */
export interface FormCapture {
  current: UseFormReturn<FieldValues> | null;
}

/**
 * Mounts `children` inside a real `<FormProvider>` seeded with
 * `defaultValues`, and returns the render result plus a handle on the
 * form.
 */
export function renderWithForm(
  defaultValues: ResumeData,
  children: React.ReactNode
): RenderResult & { form: FormCapture } {
  const capture: FormCapture = { current: null };

  function Host() {
    const form = useForm<FieldValues>({
      defaultValues: defaultValues as unknown as FieldValues,
      mode: 'onChange'
    });
    capture.current = form;
    return <FormProvider {...form}>{children}</FormProvider>;
  }

  const result = render(<Host />);
  return Object.assign(result, { form: capture });
}

/** A ready-to-use user-event session scoped to `document`. */
export function user() {
  return userEvent.setup({ document });
}

/** Read a dotted path out of the captured form. */
export function formValue(
  capture: FormCapture,
  path: string
): unknown {
  if (!capture.current) {
    throw new Error(
      'formValue called before render — pass the object returned by renderWithForm'
    );
  }
  return capture.current.getValues(path as never);
}