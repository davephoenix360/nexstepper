/**
 * `/feedback` — the standalone feedback page. Pinning the page title
 * and the form mount so the page can't accidentally regress to a
 * blank stub.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The form invokes a server action; mock it so the page render is
// independent of the action.
vi.mock('@/app/actions/feedback', () => ({
  submitFeedbackAction: vi.fn()
}));

import FeedbackPage from '@/app/(marketing)/feedback/page';

describe('/feedback page', () => {
  it('renders the page header + the form', () => {
    const html = renderToStaticMarkup(<FeedbackPage />);
    expect(html).toContain('Send us feedback');
    expect(html).toContain('data-testid="feedback-form"');
  });

  it('includes a back link to the home page', () => {
    const html = renderToStaticMarkup(<FeedbackPage />);
    expect(html).toMatch(/href="\/"/);
  });

  it('mentions the public GitHub issue destination', () => {
    const html = renderToStaticMarkup(<FeedbackPage />);
    // The disclosure line names the repo — pinning the literal here
    // means a future "let's make this private" change has to update
    // the test, which is the right time to have the conversation.
    expect(html).toContain('davephoenix360/nexstepper');
  });
});
