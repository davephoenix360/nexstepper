// Probe: does the actual resume schema + nullsToUndefined fix
// parse a typical Mistral response that has missing/optional fields?
import { describe, expect, it } from 'vitest';

import { resumeSectionsSchema } from '@/lib/resume-schema/sections';

function nullsToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(nullsToUndefined);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const c = nullsToUndefined(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return value;
}

describe('nullsToUndefined against resumeSectionsSchema', () => {
  it('handles a typical Mistral-style response with missing description', () => {
    const mistralResponse = {
      basics: {
        name: 'Jane Doe',
        label: 'Senior Software Engineer',
        email: 'jane@example.com',
        phone: '',
        url: 'https://janedoe.dev',
        summary: 'TypeScript engineer.',
        location: {
          address: '',
          postalCode: '',
          city: 'San Francisco',
          countryCode: 'US',
          region: 'CA'
        },
        profiles: []
      },
      work: [
        {
          // 'description' field omitted (model didn't emit it)
          company: 'Acme Corp',
          location: '',
          url: '',
          summary: '',
          positions: [
            {
              title: 'Senior Software Engineer',
              startDate: 'Jan 2022',
              endDate: 'Present',
              highlights: ['...']
            }
          ]
        }
      ]
    };

    const normalized = nullsToUndefined(mistralResponse);
    const result = resumeSectionsSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it('handles null values in nested fields', () => {
    const mistralResponse = {
      basics: {
        name: 'Jane Doe',
        label: '',
        email: 'jane@example.com',
        phone: '',
        url: '',
        summary: 'x',
        location: null,  // model emitted null
        profiles: []
      },
      work: [
        {
          company: 'Acme',
          location: '',
          url: '',
          summary: '',
          description: null,  // null
          positions: []
        }
      ]
    };
    const normalized = nullsToUndefined(mistralResponse);
    const result = resumeSectionsSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });
});
