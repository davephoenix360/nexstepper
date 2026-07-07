'use client';

/**
 * SchemaForm — the top-level dynamic form.
 *
 * Takes a Zod object schema and renders the entire shape via the field
 * dispatcher. Uses react-hook-form with `zodResolver` so client-side
 * validation mirrors the server-side (we re-validate in Server Actions too
 * — never trust the client).
 *
 * Usage:
 *
 *   <SchemaForm
 *     schema={resumeDataSchema}
 *     defaultValues={initialData}
 *     onSubmit={async (data) => {
 *       const result = await saveResumeAction(data);
 *       if (!result.ok) toast.error(result.error);
 *     }}
 *   />
 */

import * as React from 'react';
import { FormProvider, useForm, type Resolver } from 'react-hook-form';
import type { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { renderObjectShape, type FieldDescriptor } from './field-dispatcher';

export interface SchemaFormProps<T extends z.ZodObject<z.ZodRawShape>> {
  schema: T;
  defaultValues: z.infer<T>;
  onSubmit: (data: z.infer<T>) => void | Promise<void>;
  /** Optional fields to skip (e.g. envelope fields like `id`, `userId`). */
  omitFields?: readonly string[];
  /** Submit-button label. */
  submitLabel?: string;
  /**
   * Override per-field UI hints. Keys are full dotted paths into the form
   * shape — `sections.basics.email` for top-level fields, nested paths
   * for children, and `<array-path>.0.<leaf>` (with `0` being a stand-in
   * for any item index) for items inside a Zod array.
   */
  fieldOverrides?: Record<string, Partial<FieldDescriptor>>;
  /** Optional custom className for the outer form. */
  className?: string;
  /** Disable the submit button while a parent mutation is in-flight. */
  submitting?: boolean;
}

export function SchemaForm<T extends z.ZodObject<z.ZodRawShape>>({
  schema,
  defaultValues,
  onSubmit,
  omitFields = [],
  submitLabel = 'Save',
  fieldOverrides,
  className,
  submitting
}: SchemaFormProps<T>) {
  type Values = z.infer<T> & Record<string, unknown>;

  // Zod 4's `z.infer<T>` returns `Record<string, unknown>` (because T is
  // constrained to ZodObject<ZodRawShape>), which doesn't perfectly match
  // RHF's deeply-readonly `DefaultValues<Values>`. The `as never` cast
  // bridges the boundary; runtime behavior is unaffected. When Zod 4's
  // resolver types catch up, this cast can be removed.
  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: defaultValues as never,
    mode: 'onBlur'
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data as unknown as z.infer<T>);
  });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={handleSubmit}
        className={className}
        data-testid="schema-form"
      >
        <div className="flex flex-col gap-6">
          {renderObjectShape(schema, '', { fieldOverrides, omitFields })}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {form.formState.errors.root?.message && (
            <p className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          )}
          <Button
            type="submit"
            disabled={submitting || form.formState.isSubmitting}
            data-testid="schema-form-submit"
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}