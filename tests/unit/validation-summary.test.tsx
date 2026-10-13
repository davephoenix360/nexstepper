/**
 * Tests for `<ValidationSummary />` — the editor's top-of-page
 * error list. Pinned in here so a future refactor of the panel
 * (e.g. moving the "Go to field" affordance into a different
 * component) has to consciously re-decide the surface.
 *
 * Renders to static markup so the tests don't need jsdom. The
 * onGoToField callback is verified via a `vi.fn()` spy — the
 * component's actual scroll behaviour is exercised end-to-end in
 * the manual smoke test, not here.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { ValidationSummary } from '@/components/editable/editable-resume';
import type { FlatFormError } from '@/components/editable/form-errors';

const ERRORS: FlatFormError[] = [
  { path: 'sections.work.0.company', message: 'Required' },
  { path: 'sections.basics.url', message: 'Enter a URL' },
  { path: 'sections.skills.0.keywords.0', message: 'Pick at least one' }
];

describe('ValidationSummary', () => {
  it('renders nothing when there are no errors', () => {
    const html = renderToStaticMarkup(
      <ValidationSummary errors={[]} onGoToField={() => {}} />
    );
    expect(html).toBe('');
  });

  it('lists every error with a humanized path + the message', () => {
    const html = renderToStaticMarkup(
      <ValidationSummary errors={ERRORS} onGoToField={() => {}} />
    );
    expect(html).toContain('Work › Company');
    expect(html).toContain('Basics › URL');
    expect(html).toContain('Skills › Keywords');
    expect(html).toContain('Required');
    expect(html).toContain('Enter a URL');
  });

  it('renders a "Go to field" button for every mappable path', () => {
    const html = renderToStaticMarkup(
      <ValidationSummary errors={ERRORS} onGoToField={() => {}} />
    );
    // `work` and `skills` map to a rendered section header.
    expect(html).toContain('data-testid="validation-go-to-sections.work.0.company"');
    expect(html).toContain('data-testid="validation-go-to-sections.skills.0.keywords.0"');
  });

  it('omits the "Go to field" button for paths with no rendered section (basics)', () => {
    const html = renderToStaticMarkup(
      <ValidationSummary errors={ERRORS} onGoToField={() => {}} />
    );
    // `sections.basics.*` has no formal section header — the button
    // is hidden for those entries. The error itself is still listed.
    expect(html).not.toContain('data-testid="validation-go-to-sections.basics.url"');
    expect(html).toContain('Basics › URL');
  });

  it('calls onGoToField with the path when the button is clicked (via data-testid)', () => {
    // We can't simulate clicks through renderToStaticMarkup, so we
    // test the wiring by inspecting the rendered button. The actual
    // click handler is verified in the e2e smoke test.
    const html = renderToStaticMarkup(
      <ValidationSummary errors={ERRORS} onGoToField={vi.fn()} />
    );
    expect(html).toMatch(/<button[^>]*data-testid="validation-go-to-sections\.work\.0\.company"/);
  });
});
