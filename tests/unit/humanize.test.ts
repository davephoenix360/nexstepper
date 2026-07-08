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

  it('renders well-known acronyms as ALL CAPS (not title case)', () => {
    // The humanize function has an intentional ACRONYMS map (see
    // components/schema-form/primitives.tsx) that overrides the default
    // "first char up, rest lower" treatment for JSON Resume + common
    // app fields. The map exists because "Url" and "Id" read as
    // awkward; "URL" and "ID" are what the user expects to see in
    // field labels.
    //
    // We pin every entry in the map here so a future rename of an
    // acronym has to touch both the source and the test - the test
    // can no longer silently drift from production behavior.
    expect(humanize('url')).toBe('URL');
    expect(humanize('id')).toBe('ID');
    expect(humanize('api')).toBe('API');
    expect(humanize('pdf')).toBe('PDF');
    expect(humanize('ai')).toBe('AI');
    expect(humanize('ui')).toBe('UI');
    expect(humanize('ux')).toBe('UX');
    expect(humanize('seo')).toBe('SEO');
    expect(humanize('sql')).toBe('SQL');
    expect(humanize('css')).toBe('CSS');
    expect(humanize('html')).toBe('HTML');
    expect(humanize('json')).toBe('JSON');
    expect(humanize('yaml')).toBe('YAML');
    expect(humanize('uuid')).toBe('UUID');
  });

  it('acronym override is case-insensitive but whole-word', () => {
    // Case-insensitive match: "URL", "Url", "url" all resolve to "URL".
    expect(humanize('URL')).toBe('URL');
    expect(humanize('Url')).toBe('URL');
    // Whole-word: "uid" must NOT be treated as "u + ID". It falls
    // through to the standard humanize treatment, becoming "Uid".
    // (If we ever do want "uid" to expand, it needs a separate
    // ACRONYMS entry - silently inheriting from "id" would be a bug.)
    expect(humanize('uid')).toBe('Uid');
  });

  it('returns the original key when transformation produces empty string', () => {
    // Edge case: underscores only collapses to empty, fall back to original.
    expect(humanize('_')).toBe('_');
    expect(humanize('-')).toBe('-');
  });
});