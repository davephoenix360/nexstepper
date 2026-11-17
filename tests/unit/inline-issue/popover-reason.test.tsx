/**
 * The popover must say WHY the leaf needs work, not just offer fixes.
 *
 * ## The gap this pins
 *
 * The popover showed the bullet and three rewrites with no explanation.
 * So the REASON lived somewhere else — the inline tip in the editor —
 * and the user had to read two places to answer "why is this bullet
 * flagged?".
 *
 * The popover is where the rewrite happens, so it is where the reason
 * belongs. And it is the scorecard's OWN tip, so the popover, the
 * scorecard and the chat cannot disagree about what is wrong.
 *
 * The popover body renders through a Radix portal, which does not
 * render in `renderToStaticMarkup` — so the reason block is extracted
 * into `<InlineIssueReason>` and pinned here.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { InlineIssueReason } from '@/lib/inline-issue/inline-issue-popover';

describe('<InlineIssueReason />', () => {
  it('renders the reason the leaf needs work', () => {
    const html = renderToStaticMarkup(
      <InlineIssueReason
        tip={
          <>
            <strong>10 of 29</strong> work bullets describe a task rather than an
            outcome. Say what changed.
          </>
        }
      />
    );
    expect(html).toContain('data-testid="inline-issue-tip"');
    expect(html).toContain('10 of 29');
    expect(html).toContain('work bullets describe a task rather than an outcome');
    // The rich emphasis survives - it is the same tip the scorecard shows.
    expect(html).toContain('<strong>10 of 29</strong>');
  });

  it('renders nothing when there is no tip', () => {
    expect(renderToStaticMarkup(<InlineIssueReason />)).toBe('');
    expect(renderToStaticMarkup(<InlineIssueReason tip={null} />)).toBe('');
  });
});
