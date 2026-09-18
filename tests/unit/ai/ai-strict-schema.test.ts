import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { aiStrict } from '@/lib/ai/ai-strict-schema';

/**
 * Locks down the `aiStrict()` transformation behavior we rely on for
 * OpenAI's strict JSON schema mode. We hit a production error on
 * 2026-09-18 where openai/gpt-4o-mini rejected the resume parser's
 * schema because nested `.default({...})` wrappers weren't being
 * peeled. This module is the single fix for that class of bug.
 */
describe('aiStrict', () => {
  it('removes `.default("")` from leaves', () => {
    const before = z.string().default('');
    const after = aiStrict(before);
    expect(after._def.type).toBe('string');
    // Without the default, parsing `undefined` must fail.
    expect(() => after.parse(undefined as never)).toThrow();
    // Parsing an actual value still works.
    expect(after.parse('hello')).toBe('hello');
  });

  it('removes `.default([])` from arrays', () => {
    const before = z.array(z.string()).default([]);
    const after = aiStrict(before);
    expect(after._def.type).toBe('array');
    expect(() => after.parse(undefined as never)).toThrow();
    expect(after.parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('removes parent-level `.default({...})` from objects', () => {
    const before = z
      .object({ x: z.string(), y: z.string() })
      .default({ x: '', y: '' });
    const after = aiStrict(before);
    expect(after._def.type).toBe('object');
    expect(() => after.parse(undefined as never)).toThrow();
    expect(after.parse({ x: 'a', y: 'b' })).toEqual({ x: 'a', y: 'b' });
  });

  it('recurses into nested object properties and removes their defaults', () => {
    // Reproduces the exact 2026-09-18 production bug: a nested object
    // with its own .default({...}) wrapper + leaf .default('') leaves.
    const locationSchema = z.object({
      address: z.string().default(''),
      postalCode: z.string().default(''),
      city: z.string().default(''),
      countryCode: z.string().default(''),
      region: z.string().default('')
    });

    const before = z.object({
      name: z.string().default(''),
      location: locationSchema.default({
        address: '',
        postalCode: '',
        city: '',
        countryCode: '',
        region: ''
      })
    });

    const after = aiStrict(before);

    // The JSON Schema should have every property in `required` AND no
    // `default` keys anywhere.
    const json = z.toJSONSchema(after) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(json.required).toEqual(expect.arrayContaining(['name', 'location']));

    const location = (json.properties.location as {
      properties: Record<string, unknown>;
      required: string[];
    });
    expect(location.required).toEqual(
      expect.arrayContaining([
        'address',
        'postalCode',
        'city',
        'countryCode',
        'region'
      ])
    );
    // No `default` should survive on any of the location properties.
    for (const prop of Object.values(location.properties)) {
      expect((prop as Record<string, unknown>).default).toBeUndefined();
    }
  });

  it('preserves `.nullable()` and `.optional()` semantics', () => {
    // The JD parser uses `.nullable()` for fields like `company` and
    // `salaryMin` so the model can emit `null` when the JD doesn't
    // disclose. We pass these through to OpenAI unchanged: nullable
    // fields ARE in `required` (the model must emit SOMETHING - null
    // counts), with the property typed as `anyOf: [string, null]`.
    const before = z.object({
      title: z.string(),
      company: z.string().nullable(),
      salaryMin: z.number().nullable()
    });
    const after = aiStrict(before);
    const json = z.toJSONSchema(after) as {
      required: string[];
      properties: Record<string, { anyOf?: Array<{ type: string }> }>;
    };
    expect(json.required).toEqual(['title', 'company', 'salaryMin']);
    expect(json.properties.company.anyOf).toEqual([
      { type: 'string' },
      { type: 'null' }
    ]);
    expect(json.properties.salaryMin.anyOf).toEqual([
      { type: 'number' },
      { type: 'null' }
    ]);
    // The model must be able to omit `company` entirely (return null).
    expect(
      after.parse({ title: 'Eng', company: null, salaryMin: null })
    ).toEqual({ title: 'Eng', company: null, salaryMin: null });
  });

  it('handles enums and literals (no defaults, no recursion needed)', () => {
    const before = z.object({
      seniority: z.enum(['junior', 'senior', 'unknown']),
      level: z.literal(1)
    });
    const after = aiStrict(before);
    const json = z.toJSONSchema(after) as { required: string[] };
    expect(json.required).toEqual(['seniority', 'level']);
    expect(after.parse({ seniority: 'senior', level: 1 })).toEqual({
      seniority: 'senior',
      level: 1
    });
  });

  it('recurses into array element types', () => {
    const before = z.array(
      z.object({
        name: z.string().default(''),
        url: z.string().nullable()
      })
    );
    const after = aiStrict(before);
    const json = z.toJSONSchema(after) as {
      type: string;
      items: { properties: Record<string, unknown>; required: string[] };
    };
    expect(json.type).toBe('array');
    expect(json.items.required).toEqual(['name', 'url']);
    // No defaults left on the inner object.
    for (const prop of Object.values(json.items.properties)) {
      expect((prop as Record<string, unknown>).default).toBeUndefined();
    }
  });

  it('does not mutate the input schema', () => {
    // Important contract: callers (form / DB code) share the same
    // schema tree. aiStrict() must NOT mutate it; if it did, the
    // form's loose-parse behavior would silently break.
    const before = z.string().default('');
    const snapshot = JSON.stringify(z.toJSONSchema(before));
    aiStrict(before);
    expect(JSON.stringify(z.toJSONSchema(before))).toBe(snapshot);
  });
});
