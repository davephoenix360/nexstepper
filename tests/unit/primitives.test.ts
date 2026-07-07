import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getTabForField, getTypeName, leafName, unwrapSchema } from '@/components/schema-form/primitives';

describe('getTypeName', () => {
  it('returns "string" for z.string()', () => {
    expect(getTypeName(z.string())).toBe('string');
  });

  it('returns "number" for z.number()', () => {
    expect(getTypeName(z.number())).toBe('number');
  });

  it('returns "boolean" for z.boolean()', () => {
    expect(getTypeName(z.boolean())).toBe('boolean');
  });

  it('returns "object" for z.object()', () => {
    expect(getTypeName(z.object({}))).toBe('object');
  });

  it('returns "array" for z.array(z.string())', () => {
    expect(getTypeName(z.array(z.string()))).toBe('array');
  });

  it('returns "enum" for z.enum(["a","b"])', () => {
    expect(getTypeName(z.enum(['a', 'b']))).toBe('enum');
  });
});

describe('leafName', () => {
  it('returns the last segment of a dotted path', () => {
    expect(leafName('sections.basics.email')).toBe('email');
    expect(leafName('sections.work[0].company')).toBe('company');
  });

  it('returns the input when there are no dots', () => {
    expect(leafName('email')).toBe('email');
  });

  it('handles trailing dots gracefully', () => {
    expect(leafName('foo.')).toBe('foo.');
  });
});

describe('getTabForField', () => {
  it('maps basics to profile', () => {
    expect(getTabForField('sections.basics')).toBe('profile');
  });

  it('groups work, projects, volunteer, education under experience', () => {
    expect(getTabForField('sections.work')).toBe('experience');
    expect(getTabForField('sections.projects')).toBe('experience');
    expect(getTabForField('sections.volunteer')).toBe('experience');
    expect(getTabForField('sections.education')).toBe('experience');
  });

  it('groups skills, languages, interests under skills', () => {
    expect(getTabForField('sections.skills')).toBe('skills');
    expect(getTabForField('sections.languages')).toBe('skills');
    expect(getTabForField('sections.interests')).toBe('skills');
  });

  it('groups awards, certificates, publications, references under recognition', () => {
    expect(getTabForField('sections.awards')).toBe('recognition');
    expect(getTabForField('sections.certificates')).toBe('recognition');
    expect(getTabForField('sections.publications')).toBe('recognition');
    expect(getTabForField('sections.references')).toBe('recognition');
  });

  it('returns undefined for envelope fields (always-visible)', () => {
    expect(getTabForField('name')).toBeUndefined();
    expect(getTabForField('note')).toBeUndefined();
    expect(getTabForField('status')).toBeUndefined();
    expect(getTabForField('template')).toBeUndefined();
    expect(getTabForField('jobContext')).toBeUndefined();
  });

  it('returns undefined for unknown section keys', () => {
    expect(getTabForField('sections.unknown')).toBeUndefined();
  });
});

describe('unwrapSchema', () => {
  it('passes through plain types unchanged', () => {
    const schema = z.string();
    const { inner, optional } = unwrapSchema(schema);
    expect(optional).toBe(false);
    expect(getTypeName(inner)).toBe('string');
  });

  it('unwraps ZodOptional', () => {
    const schema = z.string().optional();
    const { inner, optional } = unwrapSchema(schema);
    expect(optional).toBe(true);
    expect(getTypeName(inner)).toBe('string');
  });

  it('unwraps ZodDefault', () => {
    const schema = z.string().default('x');
    const { inner, optional } = unwrapSchema(schema);
    expect(optional).toBe(false);
    expect(getTypeName(inner)).toBe('string');
  });

  it('unwraps ZodNullable', () => {
    const schema = z.string().nullable();
    const { inner, optional } = unwrapSchema(schema);
    expect(optional).toBe(false);
    expect(getTypeName(inner)).toBe('string');
  });

  it('unwraps ZodUnion (takes the first option)', () => {
    // This pattern is used heavily in the resume schema (z.string().or(z.literal('')))
    const schema = z.string().or(z.literal(''));
    const { inner, optional } = unwrapSchema(schema);
    expect(optional).toBe(false);
    expect(getTypeName(inner)).toBe('string');
  });

  it('unwraps nested wrappers (optional + nullable + default)', () => {
    const schema = z.string().default('').nullable().optional();
    const { inner, optional } = unwrapSchema(schema);
    expect(optional).toBe(true);
    expect(getTypeName(inner)).toBe('string');
  });
});