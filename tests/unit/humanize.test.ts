import { describe, expect, it } from 'vitest';

import { humanize } from '@/components/schema-form/primitives';

describe('humanize', () => {
  it('converts camelCase keys to Title Case', () => {
    expect(humanize('firstName')).toBe('First name');
    expect(humanize('jobContext')).toBe('Job context');
    expect(humanize('postalCode')).toBe('Postal code');
    expect(humanize('linkedinUrl')).toBe('Linkedin url');
  });

  it('handles snake_case keys', () => {
    expect(humanize('first_name')).toBe('First name');
    expect(humanize('linkedin_url')).toBe('Linkedin url');
  });

  it('handles kebab-case keys', () => {
    expect(humanize('first-name')).toBe('First name');
  });

  it('handles single-word keys', () => {
    expect(humanize('name')).toBe('Name');
    expect(humanize('email')).toBe('Email');
  });

  it('handles keys with multiple capitals (acronyms)', () => {
    expect(humanize('url')).toBe('Url');
    expect(humanize('id')).toBe('Id');
  });

  it('returns the original key when transformation produces empty string', () => {
    // Edge case: underscores only collapses to empty, fall back to original.
    expect(humanize('_')).toBe('_');
    expect(humanize('-')).toBe('-');
  });
});