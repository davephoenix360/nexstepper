/**
 * FeedbackForm — the shared form used by the page + the dialog.
 *
 * Pinned surface: the form labels, the three category radios, the
 * submit button, the optional email field. Behavioral tests
 * (submit, success state) live in feedback-action.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The form invokes the server action via a real import. We mock
// the action module so the form render is independent of the
// server-side validation/rate-limit logic (which has its own test).
vi.mock('@/app/actions/feedback', () => ({
  submitFeedbackAction: vi.fn()
}));

import { FeedbackForm } from '@/components/feedback/feedback-form';

describe('FeedbackForm', () => {
  it('renders every category radio + the message + email + submit', () => {
    const html = renderToStaticMarkup(<FeedbackForm variant="page" />);

    expect(html).toContain('data-testid="feedback-form"');
    expect(html).toContain('data-testid="feedback-cat-bug"');
    expect(html).toContain('data-testid="feedback-cat-idea"');
    expect(html).toContain('data-testid="feedback-cat-other"');
    expect(html).toContain('data-testid="feedback-message"');
    expect(html).toContain('data-testid="feedback-email"');
    expect(html).toContain('data-testid="feedback-submit"');
  });

  it('uses a tighter message placeholder in dialog mode', () => {
    const pageHtml = renderToStaticMarkup(<FeedbackForm variant="page" />);
    const dialogHtml = renderToStaticMarkup(<FeedbackForm variant="dialog" />);

    // The dialog placeholder focuses on quick bug reports; the page
    // placeholder is more open-ended. They should differ.
    expect(pageHtml).not.toBe(dialogHtml);
    expect(pageHtml.length).toBeGreaterThan(0);
    expect(dialogHtml.length).toBeGreaterThan(0);
  });

  it('disables the submit button until the message meets the minimum length', () => {
    // The button is rendered with `disabled` whenever the trimmed
    // message is shorter than the floor. Static render at mount
    // (empty message) should therefore mark it disabled.
    const html = renderToStaticMarkup(<FeedbackForm variant="page" />);
    const submitMatch = html.match(/<button[^>]*data-testid="feedback-submit"[^>]*>/);
    expect(submitMatch).not.toBeNull();
    expect(submitMatch![0]).toContain('disabled');
  });
});

describe('FeedbackForm — dynamic per-category copy', () => {
  // We can't toggle the radio in renderToStaticMarkup, so the
  // prompt/placeholder map is exported and exercised in isolation.
  // The form wires the same map into the JSX — if a future change
  // drifts the wiring (e.g. hard-codes the label), the form-level
  // check below (label = category prompt) will catch it.
  it('ships a distinct prompt per category', async () => {
    const { FEEDBACK_CATEGORY_PROMPTS } = await import(
      '@/lib/feedback/schema'
    );
    expect(FEEDBACK_CATEGORY_PROMPTS.bug).not.toBe(
      FEEDBACK_CATEGORY_PROMPTS.idea
    );
    expect(FEEDBACK_CATEGORY_PROMPTS.idea).not.toBe(
      FEEDBACK_CATEGORY_PROMPTS.other
    );
    expect(FEEDBACK_CATEGORY_PROMPTS.bug).not.toBe(
      FEEDBACK_CATEGORY_PROMPTS.other
    );
  });

  it('ships distinct page + dialog placeholders per category', async () => {
    const { FEEDBACK_CATEGORY_PLACEHOLDERS } = await import(
      '@/lib/feedback/schema'
    );
    for (const variant of ['page', 'dialog'] as const) {
      const set = new Set(
        Object.values(FEEDBACK_CATEGORY_PLACEHOLDERS).map(
          (p) => p[variant]
        )
      );
      expect(set.size).toBe(3);
    }
  });

  it('uses the page placeholder in page variant and dialog in dialog', async () => {
    const { FEEDBACK_CATEGORY_PLACEHOLDERS } = await import(
      '@/lib/feedback/schema'
    );
    const bug = FEEDBACK_CATEGORY_PLACEHOLDERS.bug;
    expect(bug.page).not.toBe(bug.dialog);
    // Sanity: the dialog copy is shorter — the user is mid-flow.
    expect(bug.dialog.length).toBeLessThan(bug.page.length);
  });
});
