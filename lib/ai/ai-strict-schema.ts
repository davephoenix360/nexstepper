import 'server-only';

import { z } from 'zod';

/**
 * AI-strict schema wrapper.
 *
 * OpenAI's `response_format: json_schema` (which the Vercel AI SDK uses
 * for `generateObject` with structured output) requires EVERY property
 * of EVERY object to be in `required` and `additionalProperties: false`
 * on every nested object. Zod's `.default('')` produces JSON Schema
 * with `default: ""` in the property definition — which OpenAI
 * accepts as long as the field is in `required`, BUT a parent-level
 * `.default({...})` makes the model emit the whole object as `null` or
 * skip it (because it's "optional" in the schema), which then fails
 * the missing-fields check downstream.
 *
 * We hit this on 2026-09-18 with `basics.location`: the
 * `locationSchema.default({...})` wrapper caused the location object
 * to be skipped by openai/gpt-4o-mini with:
 *
 *   "Invalid schema for response_format 'response':
 *    In context=('properties', 'basics', 'properties', 'location'),
 *    'required' is required to be supplied and to be an array
 *    including every key in properties. Missing 'address'."
 *
 * (Even though Zod 4's own `z.toJSONSchema()` does put every key in
 * `required`, OpenAI's strict-mode validator looks at the schema as
 * sent over the wire and treats nested `.default()`-wrapped objects
 * as optional, then complains about the missing-required behavior.)
 *
 * The fix: walk the Zod schema, peel off every `.default(...)`
 * wrapper, and rebuild as strict-mode-compatible. The TypeScript
 * type barely changes (Zod infers `.default()` leaves as non-optional
 * `string` / `string[]` already). The form/DB schemas keep their
 * loose-with-defaults semantics; only the AI-facing copies get the
 * strict treatment.
 *
 * What this does to a Zod schema:
 *
 *   `z.string().default('')`             -> `z.string()`
 *   `z.array(...).default([])`           -> `z.array(...)`
 *   `z.object({...}).default({...})`     -> `z.object({...})`
 *   `z.object({...})`                    -> `z.object({...})` (unchanged)
 *   `z.enum([...])`                      -> `z.enum([...])` (unchanged)
 *   `z.literal(...)`                     -> `z.literal(...)` (unchanged)
 *
 * What this does NOT do:
 *   - Add `additionalProperties: false` — Zod 4's `.strict()` is a
 *     parse-time guard but doesn't affect the AI SDK's schema
 *     serialization the way you'd want. The default Zod 4 output for
 *     `z.object({...})` already has `additionalProperties: false` in
 *     its JSON Schema. If we see OpenAI reject a schema with a
 *     `additionalProperties` error, that's a separate bug to chase.
 *   - Strip `.optional()` — fields explicitly marked `.optional()` are
 *     semantically optional (e.g. `parsedJdSchema.company: ... .nullable()`).
 *     We leave those alone; the AI must always emit them (null is fine).
 *
 * @example
 *   import { resumeSectionsSchema } from '@/lib/resume-schema';
 *   const strict = aiStrict(resumeSectionsSchema);
 *   generateObject({ schema: strict, ... });
 */
export function aiStrict<S extends z.ZodTypeAny>(schema: S): S {
  return stripDefaults(schema) as S;
}

function stripDefaults(schema: z.ZodTypeAny): z.ZodTypeAny {
  // Zod 4 uses `_def.type === 'default'` (string discriminator) on
  // ZodDefault wrappers and stores the inner schema in `_def.innerType`.
  // Older / future Zod versions also expose `removeDefault()` which
  // returns the inner schema — we use both for safety.
  const def = schema._def as {
    type?: string;
    innerType?: z.ZodTypeAny;
  };

  // ZodDefault: peel off the default + recurse into the inner schema.
  // The peeled-off `defaultValue` was telling the form layer "fill
  // missing inputs with ''" — we don't need that for the AI; the AI
  // must emit every field explicitly (empty strings OK).
  if (def.type === 'default') {
    const innerSchema = 'removeDefault' in schema
      ? (schema as unknown as { removeDefault: () => z.ZodTypeAny }).removeDefault()
      : (def.innerType as z.ZodTypeAny);
    return stripDefaults(innerSchema);
  }

  // ZodObject: recurse into each property. Zod 4 stores the shape as
  // a function; some older versions stored it as a plain object. We
  // try both. We rebuild a fresh `z.object(shape)` rather than
  // mutating in place, so the original schema is untouched.
  if (def.type === 'object') {
    const shapeFn = (schema as unknown as {
      _def?: { shape?: z.ZodRawShape | (() => z.ZodRawShape) };
      shape?: z.ZodRawShape | (() => z.ZodRawShape);
    }).shape;
    const shapeRaw = (schema as unknown as {
      _def?: { shape?: z.ZodRawShape | (() => z.ZodRawShape) };
    })._def?.shape;
    const rawShape =
      typeof shapeRaw === 'function' ? shapeRaw() : shapeRaw;
    const shape =
      typeof shapeFn === 'function'
        ? shapeFn()
        : typeof shapeFn === 'object'
        ? shapeFn
        : rawShape;
    if (!shape || typeof shape !== 'object') {
      // Unknown shape representation — return as-is. Better than
      // throwing here; the AI SDK will surface a clearer error.
      return schema;
    }
    // Zod 4 marks object shapes as readonly. Build the new shape by
    // spreading entries into a fresh mutable object so TypeScript
    // is happy.
    const newShape: z.ZodRawShape = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [
        key,
        stripDefaults(value as z.ZodTypeAny)
      ])
    );
    return z.object(newShape);
  }

  // ZodArray: recurse into the element type.
  if (def.type === 'array') {
    const elementType = (def as unknown as { element: z.ZodTypeAny })
      .element;
    if (!elementType) return schema;
    return z.array(stripDefaults(elementType));
  }

  // Other types (z.string, z.number, z.boolean, z.enum, z.literal,
  // z.null, z.union, etc.) are passed through unchanged. We only need
  // to peel defaults and recurse into composable containers.
  return schema;
}
