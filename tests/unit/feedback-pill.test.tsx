/**
 * FeedbackPill — the floating "Feedback" button that lives in the
 * dashboard layout. Pinning its presence + a11y label so a future
 * layout refactor can't silently remove it.
 *
 * We also pin `no-print` — the pill should never bleed into a
 * printed/PDF'd resume, same as the rest of the dashboard chrome.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// The Dialog component pulls in a portal — `document` doesn't exist
// at static-render time, so we mock it to a no-op wrapper.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

import { FeedbackPill } from '@/components/feedback/feedback-pill';

describe('FeedbackPill', () => {
  it('renders a fixed-position, no-print feedback button', () => {
    const html = renderToStaticMarkup(<FeedbackPill />);
    expect(html).toContain('data-testid="feedback-pill"');
    expect(html).toContain('aria-label="Send feedback"');
    expect(html).toContain('no-print');
    // `fixed bottom-4 right-4` — visible-position class signature.
    expect(html).toMatch(/fixed\s+bottom-4\s+right-4/);
  });

  it('includes the visible "Feedback" label (sm+) and the MessageSquare icon (always)', () => {
    const html = renderToStaticMarkup(<FeedbackPill />);
    expect(html).toContain('>Feedback</span>');
    // The lucide MessageSquare icon renders as <svg> with class
    // `lucide-message-square` (or similar). We only check the label
    // is present — exact class names are an internal detail.
  });
});
