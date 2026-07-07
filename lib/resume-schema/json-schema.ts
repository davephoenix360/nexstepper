import { zodToJsonSchema } from 'zod-to-json-schema';

import { resumeDataSchema } from './resume-data';

/**
 * JSON Schema export of our resume shape. Used by:
 *
 * - **AI tooling** (Phase 4): Vercel AI SDK's `generateObject` accepts
 *   a Zod schema directly, but for Anthropic's tool-use API we need
 *   JSON Schema to declare function-input shapes.
 * - **Browser-side validation** if we ever want client-only validation
 *   without shipping Zod to the bundle.
 *
 * Computed lazily and memoized — `resumeDataSchema` is large and this
 * function is called at most a handful of times per server boot.
 */

// zod-to-json-schema's TypeScript types were written against Zod 3 internals
// and don't perfectly line up with Zod 4's stricter ZodType shape. The runtime
// conversion works correctly — only the type-level check needs the cast.
// `unknown` is the safest cast: we control both sides of the boundary.
type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: unknown, name: string): JsonSchema {
  return zodToJsonSchema(
    schema as Parameters<typeof zodToJsonSchema>[0],
    { name, $refStrategy: 'none' }
  ) as JsonSchema;
}

let cached: JsonSchema | undefined;

export function getResumeJsonSchema(): JsonSchema {
  if (!cached) {
    cached = toJsonSchema(resumeDataSchema, 'ResumeData');
  }
  return cached;
}

let cachedSections: JsonSchema | undefined;

export function getResumeSectionsJsonSchema(): JsonSchema {
  if (!cachedSections) {
    cachedSections = toJsonSchema(resumeDataSchema.shape.sections, 'ResumeSections');
  }
  return cachedSections;
}