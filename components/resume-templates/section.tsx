'use client';

/**
 * SmartSection — the section wrapper used by the new templates
 * (Minimal, Executive, Creative) and any future template that wants
 * print-correct empty-section behavior.
 *
 * Why this exists
 *   The previous pattern (Minimal/Executive/Creative pre-fix) was:
 *
 *     <Section title="Publications & Speaking">
 *       <PublicationsList mode={mode} />
 *     </Section>
 *
 *   where `PublicationsList` returns `null` in read-only mode when
 *   there's no data. The wrapper, however, ALWAYS rendered the
 *   title element. Result: "Publications & Speaking" appeared in
 *   the print/PDF output as a header with no body underneath.
 *
 *   SmartSection fixes this: in read-only mode, if the child rendered
 *   to `null` (no data), the entire section (title + content) is
 *   suppressed. In editable mode the section is always rendered so
 *   the user can reach the "+ Add" affordances through the section-
 *   edit dialogs (see classic.tsx's comment about "Sections still
 *   surfaced by the section-edit dialogs").
 *
 *   Convention: section renderers must `return null` (not an empty
 *   fragment or empty div) when there's no data in read-only mode.
 *   The classic + modern templates already follow this convention.
 *
 * Editable vs read-only dispatch
 *   - editable=true   -> always render the section header + children.
 *                         Children is expected to be a non-null React
 *                         element (the renderer renders +Add buttons
 *                         even when empty).
 *   - editable=false  -> render only if children is non-null. This
 *                         is what the PDF/print path sees, so empty
 *                         sections disappear from the saved PDF.
 *
 * Why not a pure CSS hide (e.g. `print:hidden` on the section)?
 *   The body content is also empty in read-only mode (the renderer
 *   returns null). The cleanest fix is to drop the entire <section>
 *   from the DOM in read-only mode so there's no phantom header
 *   stealing vertical space when other sections push down. Also,
 *   `print:hidden` doesn't help in the on-screen preview where
 *   users see the same empty headers.
 */

import * as React from 'react';

import type { FieldMode } from './field';
import { useSectionPrint } from '@/components/editable/use-section-print';
import { PrintPrefsBar } from '@/components/editable/print-prefs-bar';

interface SmartSectionProps {
  mode: FieldMode;
  title: string;
  /**
   * Stable DOM id for the section header (e.g. "section-skills").
   * Used by the inline-issue surface (`lib/inline-issue/`) to
   * scroll to + pulse the affected section. Optional — older
   * callers that don't yet pass it get the default `no id`
   * behavior. The legacy Minimal/Executive/Creative templates
   * that render SmartSection without an explicit id still work.
   */
  id?: string;
  /**
   * Slug used by the print-hide UX. When provided, the
   * `<PrintPrefsBar>` reads `data.print.hiddenSections` and
   * renders the toggle + badge next to the title; the
   * section itself gets `print:hidden` when the slug is
   * flagged. When omitted, the section has no print-hide
   * affordance (used for sections that are always-printed,
   * e.g. "Header").
   */
  sectionSlug?: string;
  /** Children may be null when the section renderer found no data
   *  in read-only mode. SmartSection suppresses the whole section
   *  in that case. */
  children: React.ReactNode;
}

export function SmartSection({
  mode,
  title,
  id,
  sectionSlug,
  children
}: SmartSectionProps) {
  // The hook branches on `mode.editable` internally — in editor
  // mode it reads from RHF (so toggles propagate immediately),
  // in preview/print mode it reads from `mode.data.print`
  // (the saved envelope). When no slug is provided we pass a
  // sentinel that never matches a real section; the hook is
  // harmless in both modes.
  const { hidden } = useSectionPrint(sectionSlug ?? '__no_section__', mode);
  // When the section is hidden, apply `print:hidden` so the PDF
  // / browser print preview omits the entire section. The
  // opacity-60 is a soft "I'm hidden" cue in the editor only —
  // the bar already shows the explicit "Hidden from print"
  // badge, but the dim makes the affected section scannable.
  const isEmpty =
    !mode.editable && (children === null || children === undefined);
  if (isEmpty) return null;
  const className =
    sectionSlug && hidden ? 'print:hidden opacity-60' : undefined;
  return (
    <section className={className}>
      <SectionTitle title={title} id={id} sectionSlug={sectionSlug} mode={mode} />
      {children}
    </section>
  );
}

/**
 * SectionTitle — the small-caps header used by every section in the
 * Minimal / Executive / Creative templates. Pulled out so SmartSection
 * can wrap it without each template duplicating the typography.
 *
 * Typography is intentionally plain (no accent rule). Templates that
 * want a rule under their titles (Executive + Creative do) override
 * via the section's own h2 inside their body — SmartSection's default
 * is "no rule", which matches the Minimal template's editorial feel.
 *
 * When `sectionSlug` is provided, the title row also renders a
 * `<PrintPrefsBar>` (hidden from PDF via `.no-print`) so the user
 * can toggle this section out of the printable view. The bar
 * reads/writes `data.print.hiddenSections` via RHF.
 */
function SectionTitle({
  title,
  id,
  sectionSlug,
  mode
}: {
  title: string;
  id?: string;
  sectionSlug?: string;
  mode: FieldMode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2
        id={id}
        className="text-[10pt] font-medium uppercase tracking-[0.18em] text-zinc-500"
      >
        {title}
      </h2>
      {sectionSlug && (
        <PrintPrefsBar
          sectionSlug={sectionSlug}
          mode={mode}
          className="no-print ml-auto"
        />
      )}
    </div>
  );
}
