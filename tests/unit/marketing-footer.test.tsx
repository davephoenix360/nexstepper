/**
 * Marketing footer — the "Feedback" link in the Product column is the
 * one entry point that reaches anonymous / pre-purchase visitors.
 * Pin its presence so a future footer refactor can't silently drop it.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { MarketingFooter } from '@/components/marketing/footer';

describe('MarketingFooter', () => {
  it('renders a Feedback link under the Product column pointing at /feedback', () => {
    const html = renderToStaticMarkup(<MarketingFooter />);
    // Pull the Product column block so the assertion is scoped to
    // the right place — a stray "Feedback" elsewhere in the footer
    // would not pass.
    const productIdx = html.indexOf('>Product<');
    const feedbackIdx = html.indexOf('>Feedback<', productIdx);
    expect(productIdx).toBeGreaterThan(-1);
    expect(feedbackIdx).toBeGreaterThan(productIdx);

    // The link href appears before the visible label. Slice back
    // from the label to find the opening <a tag.
    const before = html.slice(0, feedbackIdx);
    const anchorOpen = before.lastIndexOf('<a');
    const anchorClose = html.indexOf('>', anchorOpen);
    const openingTag = html.slice(anchorOpen, anchorClose + 1);
    expect(openingTag).toContain('href="/feedback"');
  });
});
