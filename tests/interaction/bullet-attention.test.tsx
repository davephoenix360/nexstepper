// @vitest-environment jsdom
/**
 * DOM tests for the measured ATS attention icon beside a work bullet.
 *
 * A `renderToStaticMarkup` test can prove the button exists, but it cannot
 * prove a click reaches Scout. These tests use the real `BulletList` inside
 * a real template and a real `ChatHandoffProvider`, then dispatch clicks.
 */

import * as React from 'react';
import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { ChatHandoffProvider, useChatHandoff, type ChatHandoffRequest } from '@/components/chat/chat-handoff-provider';
import { ModernTemplate } from '@/components/resume-templates/modern';
import { VariantIssuesProvider } from '@/components/editable/variant-issues-context';
import { sampleResumeData } from '@/lib/resume-schema/sample';
import type { ResumeData } from '@/lib/resume-schema';
import type { BulletIssue } from '@/lib/scoring/bullet-issues';
import { renderWithForm, user } from './harness';

const PATH = 'sections.work.0.positions.0.highlights.0';

// Radix Tooltip's Popper uses ResizeObserver, which jsdom does not ship.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const ISSUES: BulletIssue[] = [
  {
    path: PATH,
    criterion: 'Accomplishment Focus',
    dimensionLabel: 'Impact',
    reason: 'This reads as a task, not an outcome.',
    fix: 'Say what changed because of this work, not just what you did.',
    currentText: 'helped with the deployment',
    company: 'Northwind',
    role: 'Engineer',
    occurrence: 0
  },
  {
    path: PATH,
    criterion: 'Action Verb Usage',
    dimensionLabel: 'Action Verb Usage',
    reason: 'This bullet opens flatly.',
    fix: 'Lead with a stronger action verb.',
    currentText: 'helped with the deployment',
    company: 'Northwind',
    role: 'Engineer',
    occurrence: 0
  }
];

function fixture(): ResumeData {
  return {
    ...sampleResumeData,
    sections: {
      ...sampleResumeData.sections,
      work: [
        {
          company: 'Northwind',
          location: '',
          url: '',
          description: '',
          positions: [
            {
              title: 'Engineer',
              startDate: '',
              endDate: '',
              highlights: ['helped with the deployment', 'Built a service']
            }
          ]
        }
      ]
    }
  };
}

/**
 * Captures the request that `BulletAttention` hands to Scout without
 * needing to mount the whole chat panel.
 */
let lastRequest: ChatHandoffRequest | null = null;

function HandoffSpy() {
  const { currentRequest } = useChatHandoff();
  lastRequest = currentRequest;
  return null;
}

function mount(issues: BulletIssue[] = ISSUES) {
  const data = fixture();
  return renderWithForm(
    data,
    <ChatHandoffProvider>
      <HandoffSpy />
      <VariantIssuesProvider issues={issues}>
        <ModernTemplate data={data} editable />
      </VariantIssuesProvider>
    </ChatHandoffProvider>
  );
}

describe('BulletAttention', () => {
  it('renders one icon on a flagged bullet and none on a clean bullet', () => {
    mount();

    expect(screen.getByTestId(`bullet-issue-${PATH}`)).toBeTruthy();
    expect(
      screen.queryByTestId('bullet-issue-sections.work.0.positions.0.highlights.1')
    ).toBeNull();
  });

  it('explains both reasons and fixes on hover', async () => {
    const userSession = user();
    mount();

    await userSession.hover(screen.getByTestId(`bullet-issue-${PATH}`));

    // Radix keeps the portal mounted after a previous hover in the same
    // suite, so there can be more than one visible tooltip in the DOM.
    expect(
      (await screen.findAllByText('ATS issue on this bullet')).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Impact:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Action Verb Usage:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Say what changed because of this work/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Lead with a stronger action verb/).length).toBeGreaterThan(0);
  });

  it('sends exactly one bounded, bullet-specific prompt to Scout on click', async () => {
    lastRequest = null;
    const userSession = user();
    mount();

    await userSession.click(screen.getByTestId(`bullet-issue-${PATH}`));

    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.targetPath).toBe(PATH);
    expect(lastRequest!.label).toContain('Impact');
    expect(lastRequest!.label).toContain('Action Verb Usage');
    expect(lastRequest!.prompt).toContain('helped with the deployment');
    expect(lastRequest!.prompt).toContain('replaceWorkHighlight');
    expect(lastRequest!.prompt).toContain('Northwind');
    expect(lastRequest!.prompt.length).toBeLessThanOrEqual(4000);
  });

  it('is editor chrome and disappears when the print stylesheet is simulated', () => {
    const { container } = mount();
    const icon = screen.getByTestId(`bullet-issue-${PATH}`);
    expect(icon.className).toContain('no-print');

    // Mirrors tests/unit/print/print-cleanliness.test.tsx: remove every
    // element the print stylesheet strips, then read what survives.
    container
      .querySelectorAll('[class*="print:hidden"], [class*="no-print"]')
      .forEach((node) => node.remove());

    expect(container.querySelector(`[data-testid="bullet-issue-${PATH}"]`)).toBeNull();
    expect(container.textContent).toContain('helped with the deployment');
    expect(container.textContent).not.toContain('ATS issue on this bullet');
  });
});
