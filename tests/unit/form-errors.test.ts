import { describe, expect, it } from 'vitest';

import {
  flattenFormErrors,
  humanizeFormPath
} from '@/components/editable/form-errors';

/**
 * Unit tests for the form-error helpers used by the editor's
 * validation summary panel. The panel itself renders React + DOM,
 * which we can't unit-test without jsdom; these tests cover the
 * pure logic so the panel can stay small and obvious.
 */

describe('flattenFormErrors', () => {
  it('returns [] for empty/null input', () => {
    expect(flattenFormErrors(undefined)).toEqual([]);
    expect(flattenFormErrors(null)).toEqual([]);
    expect(flattenFormErrors({})).toEqual([]);
  });

  it('flattens a single leaf error', () => {
    const result = flattenFormErrors({
      url: { message: 'Enter a URL', type: 'invalid_string' }
    });
    expect(result).toEqual([{ path: 'url', message: 'Enter a URL' }]);
  });

  it('flattens a deeply nested error with a dotted path', () => {
    const result = flattenFormErrors({
      sections: {
        basics: {
          url: { message: 'Enter a website URL or bare domain', type: 'custom' }
        }
      }
    });
    expect(result).toEqual([
      {
        path: 'sections.basics.url',
        message: 'Enter a website URL or bare domain'
      }
    ]);
  });

  it('flattens multiple leaf errors into separate entries', () => {
    const result = flattenFormErrors({
      sections: {
        basics: {
          name: { message: 'Required', type: 'required' },
          url: { message: 'Invalid', type: 'invalid' }
        },
        work: {
          0: {
            company: { message: 'Required', type: 'required' }
          }
        }
      }
    });
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.path).sort()).toEqual([
      'sections.basics.name',
      'sections.basics.url',
      'sections.work.0.company'
    ]);
  });

  it('skips nullish children silently', () => {
    const result = flattenFormErrors({
      sections: { basics: null, work: undefined, education: { ok: 'x' } },
      metadata: { nothing: null }
    });
    expect(result).toEqual([]);
  });

  it('handles RHF multi-error types wrapper by taking the first string message', () => {
    const result = flattenFormErrors({
      email: {
        types: { invalid_string: 'Bad email', required: 'Required' },
        message: 'Bad email',
        type: 'invalid_string'
      }
    });
    // The leaf shape (with `message`) takes precedence over `types`.
    expect(result).toEqual([{ path: 'email', message: 'Bad email' }]);
  });

  it('handles RHF types wrapper without a top-level message', () => {
    const result = flattenFormErrors({
      email: {
        types: { invalid_string: 'Bad email', required: 'Required' }
      }
    });
    expect(result).toEqual([{ path: 'email', message: 'Bad email' }]);
  });

  it('ignores entries with empty messages', () => {
    const result = flattenFormErrors({
      name: { message: '', type: 'required' },
      url: { message: 'Bad URL', type: 'invalid' }
    });
    expect(result).toEqual([{ path: 'url', message: 'Bad URL' }]);
  });
});

describe('humanizeFormPath', () => {
  it('returns empty string for empty input', () => {
    expect(humanizeFormPath('')).toBe('');
  });

  it('strips the sections. prefix', () => {
    expect(humanizeFormPath('sections.basics.url')).toBe('Basics › URL');
    // (`url` is in humanize's ACRONYMS map — see components/schema-form/
    // primitives.tsx — so it renders as URL, not Url. That's the
    // intentional convention: well-known acronyms stay ALL CAPS in the UI.)
  });

  it('drops numeric segments (array indices)', () => {
    expect(humanizeFormPath('sections.work.0.company')).toBe(
      'Work › Company'
    );
  });

  it('drops all numeric segments in a path', () => {
    expect(humanizeFormPath('sections.skills.0.keywords.1')).toBe(
      'Skills › Keywords'
    );
  });

  it('joins segments with a " › " separator', () => {
    expect(humanizeFormPath('sections.education.0.degree.degreeLevel')).toBe(
      'Education › Degree › Degree level'
    );
  });

  it('humanizes camelCase segments', () => {
    expect(humanizeFormPath('sections.basics.firstName')).toBe(
      'Basics › First name'
    );
  });

  it('falls back to the raw path if no usable segments remain', () => {
    expect(humanizeFormPath('0.1.2')).toBe('0.1.2');
  });
});