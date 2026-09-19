import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { JdPanel } from '@/app/(dashboard)/dashboard/resumes/[id]/_components/jd-panel';
import type { JobPosting } from '@/lib/resume-schema';

/**
 * Locks the right-rail slot shape for Slice 2 of the variant-first
 * UX (plan: docs/plans/variant-first-ux.md §"Slice 2"), plus the
 * Markdown render path from Plan B (docs/plans/jd-markdown-format.md).
 *
 *   - The scorecard renders even with no JD so the right rail
 *     doesn't shift when the AI lands.
 *   - The four ATS dimensions are always listed in the same order
 *     (the future scoring algorithm slots in here).
 *   - When a JD IS attached, the panel hints that scoring is
 *     "next slice" instead of asking for one.
 *   - When `jobContext.markdown` is populated by the formatter AI,
 *     `<JdPanel>` renders it as Markdown (headings, lists, code).
 *   - When `jobContext.markdown` is null (no API key, AI failure,
 *     legacy data), `<JdPanel>` falls back to raw `<pre>` text.
 *   - Raw HTML in the Markdown source is stripped (XSS guard).
 */

const EMPTY_JD: JobPosting = {
  id: 'job-1',
  url: '',
  title: '',
  company: '',
  location: '',
  description: '',
  requirements: [],
  niceToHaves: [],
  benefits: [],
  keywords: [],
  seniority: '',
  employmentType: '',
  source: 'paste'
};

const ATTACHED_JD: JobPosting = {
  ...EMPTY_JD,
  title: 'Senior Backend Engineer',
  company: 'Stripe',
  location: 'Remote',
  description: 'Build the next generation of payment APIs.',
  keywords: ['typescript', 'rust', 'distributed systems']
};

// AtsScorecard tests moved to tests/unit/scorecard.test.tsx (slice 2)
// and tests/unit/scorecard-client.test.tsx (slice 3). The component
// is now rendered by the <ScorecardClient> wrapper on the page; the
// raw <ScorecardPanel> is the presentational surface they test.

/**
 * Markdown render path — Plan B (docs/plans/jd-markdown-format.md).
 *
 * `<JdPanel>` is a client component that owns local UI state
 * (open/closed, editing mode, draft text, pending, error). To keep
 * these tests deterministic we render the JSX directly via
 * `renderToStaticMarkup` — that bypasses `useState` initialization
 * to a controlled default, but for the read-only `AttachedView`
 * branch (which is what the Markdown path lives in) the state is
 * irrelevant. We supply `jobContext` directly and assert the
 * resulting HTML.
 */
describe('JdPanel — Markdown render path', () => {
  const jdWithMarkdown: JobPosting = {
    ...ATTACHED_JD,
    markdown: [
      '## About the role',
      '',
      'We are looking for a **senior** engineer to join the team.',
      '',
      '## Requirements',
      '',
      '- 5+ years of TypeScript',
      '- Strong React + Next.js',
      '- PostgreSQL experience',
      '',
      '## Nice to have',
      '',
      '- GraphQL',
      '- AWS'
    ].join('\n')
  };

  it('renders headings, lists, and emphasis from the Markdown source', () => {
    const html = renderToStaticMarkup(
      <JdPanel resumeId="r1" jobContext={jdWithMarkdown} />
    );
    // <h2> headings from "## About the role" etc.
    expect(html).toMatch(/<h2[^>]*>\s*About the role\s*<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>\s*Requirements\s*<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>\s*Nice to have\s*<\/h2>/);
    // <strong> from **senior**
    expect(html).toMatch(/<strong[^>]*>senior<\/strong>/);
    // <ul> / <li> from the bullet list
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toMatch(/<li[^>]*>\s*5\+ years of TypeScript\s*<\/li>/);
    expect(html).toMatch(/<li[^>]*>\s*GraphQL\s*<\/li>/);
    // Container marker — proves we took the Markdown branch, not the raw branch.
    expect(html).toContain('data-testid="jd-panel-markdown"');
    // The raw-text fallback should NOT appear.
    expect(html).not.toContain('data-testid="jd-panel-raw"');
  });

  it('renders fenced code blocks with the `<pre>` styling', () => {
    const jdWithCode: JobPosting = {
      ...ATTACHED_JD,
      markdown: [
        '## Example',
        '',
        'Use the API like this:',
        '',
        '```ts',
        'await client.submit({ id: "abc" });',
        '```'
      ].join('\n')
    };
    const html = renderToStaticMarkup(
      <JdPanel resumeId="r1" jobContext={jdWithCode} />
    );
    // <pre><code> from the fenced block.
    expect(html).toMatch(/<pre[^>]*>[\s\S]*<code[^>]*>[\s\S]*await client\.submit/);
    // Code contents escape the closing fence's literal backticks.
    expect(html).not.toContain('```');
  });

  it('falls back to a raw `<pre>` block when `markdown` is null', () => {
    const jdNoMarkdown: JobPosting = {
      ...ATTACHED_JD,
      markdown: null,
      description: 'Plain JD text without AI formatting yet.'
    };
    const html = renderToStaticMarkup(
      <JdPanel resumeId="r1" jobContext={jdNoMarkdown} />
    );
    expect(html).toContain('data-testid="jd-panel-raw"');
    expect(html).not.toContain('data-testid="jd-panel-markdown"');
    // The raw description text appears verbatim, wrapped in <pre>.
    expect(html).toContain('Plain JD text without AI formatting yet.');
    expect(html).toMatch(/<pre[^>]*>[\s\S]*Plain JD text without AI formatting yet\.[\s\S]*<\/pre>/);
  });

  it('strips raw HTML from the Markdown source (XSS guard)', () => {
    const jdWithXss: JobPosting = {
      ...ATTACHED_JD,
      markdown: [
        '## Role',
        '',
        'A normal paragraph.',
        '',
        '<script>alert(1)</script>',
        '',
        '<img src=x onerror=alert(2)>'
      ].join('\n')
    };
    const html = renderToStaticMarkup(
      <JdPanel resumeId="r1" jobContext={jdWithXss} />
    );
    // No executable script tag reaches the DOM.
    expect(html).not.toMatch(/<script[^>]*>/i);
    // No img tag with onerror handler.
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    // The non-malicious content still rendered.
    expect(html).toMatch(/<h2[^>]*>\s*Role\s*<\/h2>/);
    expect(html).toContain('A normal paragraph.');
  });
});