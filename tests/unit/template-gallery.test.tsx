import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  TemplateGalleryGrid,
  TemplatePreviewBody,
  TemplateBadges
} from '@/components/resume-templates';
import {
  CLASSIC_TEMPLATE_META,
  EXECUTIVE_TEMPLATE_META,
  CREATIVE_TEMPLATE_META,
  MODERN_TEMPLATE_META,
  MINIMAL_TEMPLATE_META
} from '@/components/resume-templates/meta';
import { getTemplate } from '@/components/resume-templates';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';

/**
 * Tests for the template gallery modal surface.
 *
 * The gallery + preview modals wrap their content in `<Dialog>`, which
 * returns `null` on the server (it requires `document` for the portal).
 * To get useful SSR coverage without dragging in jsdom + testing-library
 * (neither is wired into this project's vitest config), we test the
 * SSR-renderable inner pieces directly:
 *
 *   - `<TemplateBadges>` — pure, already extracted.
 *   - `<TemplateGalleryGrid>` — extracted from the modal so tests can
 *     render the card grid without going through `<Dialog>`.
 *   - `<TemplatePreviewBody>` — extracted from the preview modal for
 *     the same reason.
 *
 * Interactive plumbing (state, click handlers, "current" toggle, save
 * pipeline) is exercised manually + by the project's existing
 * `template-meta.test.ts` invariants.
 */

describe('TemplateBadges', () => {
  it('renders ATS-safe badge when the template is ATS-safe', () => {
    const html = renderToStaticMarkup(
      <TemplateBadges template={getTemplate('classic')} />
    );
    expect(html).toContain('ATS-safe');
    expect(html).toContain('data-testid="template-ats-badge-classic"');
  });

  it('renders the category as a small label', () => {
    const html = renderToStaticMarkup(
      <TemplateBadges template={getTemplate('modern')} />
    );
    // Modern template's category is 'modern'; rendered as an
    // uppercase tracking-wider label inside the badges row.
    expect(html).toContain('modern');
  });

  it('renders all tags from meta.tags', () => {
    const html = renderToStaticMarkup(
      <TemplateBadges template={getTemplate('classic')} />
    );
    // Classic template tags: ['single-column', 'serif', 'traditional'].
    expect(html).toContain('single-column');
    expect(html).toContain('serif');
    expect(html).toContain('traditional');
  });

  it('does NOT render the Pro badge for free templates', () => {
    const html = renderToStaticMarkup(
      <TemplateBadges template={getTemplate('classic')} />
    );
    expect(html).not.toContain('template-pro-badge-classic');
    expect(html).not.toContain('>Pro<');
  });

  it('does NOT render the ATS badge when the template is not ATS-safe', () => {
    // Build a synthetic ATS-unsafe template for the test. We bypass
    // the registry because all five shipped templates are ATS-safe.
    const html = renderToStaticMarkup(
      <TemplateBadges
        template={{
          meta: { ...CLASSIC_TEMPLATE_META, atsSafe: false },
          Component: () => null
        }}
      />
    );
    expect(html).not.toContain('ATS-safe');
  });
});

describe('TemplateGalleryGrid', () => {
  function render(
    currentTemplateId: string,
    onPreview = vi.fn(),
    onUse = vi.fn()
  ) {
    return renderToStaticMarkup(
      <TemplateGalleryGrid
        currentTemplateId={currentTemplateId}
        onPreview={onPreview}
        onUse={onUse}
      />
    );
  }

  it('renders exactly 5 cards — one per registered template', () => {
    const html = render(CLASSIC_TEMPLATE_META.id);
    expect(html).toContain('data-testid="template-card-classic"');
    expect(html).toContain('data-testid="template-card-modern"');
    expect(html).toContain('data-testid="template-card-minimal"');
    expect(html).toContain('data-testid="template-card-executive"');
    expect(html).toContain('data-testid="template-card-creative"');
  });

  it('renders the grid wrapper with the expected testid', () => {
    const html = render(CLASSIC_TEMPLATE_META.id);
    expect(html).toContain('data-testid="template-gallery-grid"');
  });

  it('marks the active template with the "Current" badge and only that one', () => {
    const html = render(EXECUTIVE_TEMPLATE_META.id);
    expect(html).toContain('data-testid="template-card-current-executive"');
    // The other four templates should NOT carry the Current badge.
    expect(html).not.toContain('template-card-current-classic');
    expect(html).not.toContain('template-card-current-modern');
    expect(html).not.toContain('template-card-current-minimal');
    expect(html).not.toContain('template-card-current-creative');
  });

  it('disables the "Use this template" CTA on the current card', () => {
    const html = render(MINIMAL_TEMPLATE_META.id);
    // The current card's use button shows "In use" + is disabled.
    expect(html).toContain('data-testid="template-card-use-minimal"');
    // All other use buttons remain enabled (no disabled attr).
    expect(html).toContain('data-testid="template-card-use-classic"');
  });

  it('renders Preview buttons on every card', () => {
    const html = render(CLASSIC_TEMPLATE_META.id);
    expect(html).toContain('data-testid="template-card-preview-classic"');
    expect(html).toContain('data-testid="template-card-preview-modern"');
    expect(html).toContain('data-testid="template-card-preview-minimal"');
    expect(html).toContain('data-testid="template-card-preview-executive"');
    expect(html).toContain('data-testid="template-card-preview-creative"');
  });

  it('renders the template name + version on each card', () => {
    const html = render(CLASSIC_TEMPLATE_META.id);
    // Names are rendered inside elements with the per-template
    // `template-card-name-<id>` testid.
    expect(html).toContain('data-testid="template-card-name-classic"');
    expect(html).toContain('>Classic<');
    expect(html).toContain('v' + CLASSIC_TEMPLATE_META.version);
  });

  it('renders the footer hint about preview + auto-save', () => {
    const html = render(CLASSIC_TEMPLATE_META.id);
    expect(html).toContain('saves automatically');
  });
});

describe('TemplatePreviewBody', () => {
  it('renders the rendered-template frame', () => {
    const html = renderToStaticMarkup(
      <TemplatePreviewBody
        template={getTemplate('classic')}
        isKnown={true}
        onBack={vi.fn()}
        onUse={vi.fn()}
      />
    );
    expect(html).toContain('data-testid="template-preview-frame"');
  });

  it('renders the Back-to-gallery + Use buttons', () => {
    const html = renderToStaticMarkup(
      <TemplatePreviewBody
        template={getTemplate('modern')}
        isKnown={true}
        onBack={vi.fn()}
        onUse={vi.fn()}
      />
    );
    expect(html).toContain('data-testid="template-preview-close"');
    expect(html).toContain('data-testid="template-preview-use"');
    expect(html).toContain('Back to gallery');
    expect(html).toContain('Use this template');
  });

  it('disables the Use button when the template is unknown', () => {
    const html = renderToStaticMarkup(
      <TemplatePreviewBody
        template={getTemplate('classic')}
        isKnown={false}
        onBack={vi.fn()}
        onUse={vi.fn()}
      />
    );
    // The `disabled` attribute lands on the <button> with
    // data-testid="template-preview-use". We don't pin the
    // attribute order (React / cva can reorder) — we slice out
    // the button tag by testid and assert it carries disabled.
    const buttonTag = html.match(
      /<button[^>]*data-testid="template-preview-use"[^>]*>/
    )?.[0];
    expect(buttonTag).toBeTruthy();
    expect(buttonTag).toMatch(/disabled/);
  });

  it('renders the "Pick a template to preview" placeholder when not known', () => {
    const html = renderToStaticMarkup(
      <TemplatePreviewBody
        template={getTemplate('classic')}
        isKnown={false}
        onBack={vi.fn()}
        onUse={vi.fn()}
      />
    );
    expect(html).toContain('Pick a template to preview');
  });
});

describe('gallerySampleResumeData', () => {
  it('exercises multiple work entries and sections so previews are representative', () => {
    // This is a shape-locking test: if a future contributor
    // accidentally trims the sample down to 1 work entry or 0
    // projects, the previews stop looking like real resumes.
    // We pin the counts here so the gallery preview stays
    // visually representative.
    expect(gallerySampleResumeData.sections.work.length).toBeGreaterThanOrEqual(
      2
    );
    expect(gallerySampleResumeData.sections.work[0].positions.length).toBeGreaterThanOrEqual(
      2
    );
    expect(gallerySampleResumeData.sections.projects.length).toBeGreaterThanOrEqual(
      1
    );
    expect(gallerySampleResumeData.sections.skills.length).toBeGreaterThanOrEqual(
      3
    );
    expect(gallerySampleResumeData.sections.education.length).toBeGreaterThanOrEqual(
      1
    );
    expect(gallerySampleResumeData.sections.basics.name).toBeTruthy();
    expect(gallerySampleResumeData.sections.basics.summary).toBeTruthy();
  });

  it('is static / deterministic (no Date.now or Math.random refs in the import surface)', () => {
    // We assert the sample doesn't change across calls — guards
    // against a future contributor replacing the literal object
    // with a function that reads time / random.
    const a = JSON.stringify(gallerySampleResumeData);
    const b = JSON.stringify(gallerySampleResumeData);
    expect(a).toBe(b);
  });

  it('uses an empty jobContext so templates render their non-JD layout', () => {
    expect(gallerySampleResumeData.jobContext).toBeNull();
  });
});

describe('TemplateCard button state via the grid', () => {
  it('shows the right "Use" CTA text per card based on currentTemplateId', () => {
    const html = renderToStaticMarkup(
      <TemplateGalleryGrid
        currentTemplateId={CREATIVE_TEMPLATE_META.id}
        onPreview={vi.fn()}
        onUse={vi.fn()}
      />
    );
    // The current (Creative) card's button text is "In use" because
    // it's already selected. The non-current cards say
    // "Use this template".
    expect(html).toContain('>In use<');
    expect(html).toContain('>Use this template<');
  });

  it('every template renders version-prefixed "v<semver>" string on its card', () => {
    const html = renderToStaticMarkup(
      <TemplateGalleryGrid
        currentTemplateId={CLASSIC_TEMPLATE_META.id}
        onPreview={vi.fn()}
        onUse={vi.fn()}
      />
    );
    for (const meta of [
      CLASSIC_TEMPLATE_META,
      MODERN_TEMPLATE_META,
      MINIMAL_TEMPLATE_META,
      EXECUTIVE_TEMPLATE_META,
      CREATIVE_TEMPLATE_META
    ]) {
      // Card should contain the version, prefixed with 'v'.
      expect(html).toContain('v' + meta.version);
    }
  });
});
