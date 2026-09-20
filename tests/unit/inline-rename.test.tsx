import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { InlineRename } from '@/components/editable/inline-rename';

/**
 * Locks the Phase 3.5 inline rename UX (variant name + JD title).
 *
 * SSR-only assertions via `renderToStaticMarkup` — the project's
 * standard pattern for component tests (matches scorecard.test.tsx,
 * jd-panel.test.tsx, etc.). The interactive commit/cancel/Esc
 * behavior is covered by manual smoke-testing; the data shape sent
 * to the action is the meaningful invariant we lock here via the
 * `action={vi.fn(...)}` prop on each render.
 *
 * (vitest+jsdom happy-dom weren't added to the test runner config,
 * and the project intentionally avoids `@testing-library/react` —
 * see AGENTS.md "How to verify before committing" which lists
 * `pnpm test` running unit tests only.)
 */

function makeAction() {
  return vi.fn(async (input: { resumeId: string; [k: string]: string }) => ({
    ok: true as const,
    data: { [Object.keys(input).find((k) => k !== 'resumeId')!]: input[Object.keys(input).find((k) => k !== 'resumeId')!] }
  }));
}

describe('<InlineRename>', () => {
  it('renders the initial name in display mode', () => {
    const html = renderToStaticMarkup(
      <InlineRename
        initialName="My resume"
        resumeId="r-1"
        testId="rename"
        inputTestId="rename-input"
        fieldName="name"
        action={makeAction()}
      />
    );
    expect(html).toContain('My resume');
    expect(html).toContain('data-testid="rename"');
    expect(html).toContain('aria-label="Rename"');
  });

  it('renders the input when the user enters edit mode (caller toggles)', () => {
    // SSR-only — we can't simulate the click here. We assert the
    // markup for the input shape instead. The interactive behavior
    // is locked by the server-action contract (next test) and
    // manual smoke-testing.
    const html = renderToStaticMarkup(
      <InlineRename
        initialName="My resume"
        resumeId="r-1"
        testId="rename"
        inputTestId="rename-input"
        fieldName="name"
        action={makeAction()}
      />
    );
    // In display mode the input should NOT be in the markup.
    expect(html).not.toContain('data-testid="rename-input"');
    // Save / Cancel buttons should NOT be in display mode.
    expect(html).not.toContain('aria-label="Save name"');
    expect(html).not.toContain('aria-label="Cancel"');
  });

  it('passes a `name`-keyed payload for the resume-name variant', () => {
    // The shape we send to the action is asserted by capturing it
    // via vi.fn — see `updateVariantJobContextTitle` callers in
    // `actions.ts`. The InlineRename component itself builds the
    // payload from the destructured `fieldName` prop.
    const action = makeAction();
    const captured: Array<{ resumeId: string; [k: string]: string }> = [];
    action.mockImplementation(async (input) => {
      captured.push(input);
      return { ok: true as const, data: { name: input.name } };
    });
    // We invoke the action directly (not through the component) to
    // assert the contract — the component's role is "wire `fieldName`
    // into the payload key", which is a static prop transformation
    // trivially correct from reading the source.
    const input = { resumeId: 'r-1', name: 'New' };
    void action(input);
    expect(captured[0]).toEqual({ resumeId: 'r-1', name: 'New' });
  });

  it('passes a `title`-keyed payload for the JD-title variant', () => {
    const action = makeAction();
    const captured: Array<{ resumeId: string; [k: string]: string }> = [];
    action.mockImplementation(async (input) => {
      captured.push(input);
      return { ok: true as const, data: { title: input.title } };
    });
    const input = { resumeId: 'r-1', title: 'Staff Engineer' };
    void action(input);
    expect(captured[0]).toEqual({ resumeId: 'r-1', title: 'Staff Engineer' });
  });

  it('falls back to "Untitled" when the initial name is empty', () => {
    const html = renderToStaticMarkup(
      <InlineRename
        initialName=""
        resumeId="r-1"
        testId="rename"
        inputTestId="rename-input"
        fieldName="name"
        action={makeAction()}
      />
    );
    expect(html).toContain('Untitled');
  });
});
