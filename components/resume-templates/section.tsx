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

interface SmartSectionProps {
  mode: FieldMode;
  title: string;
  /** Children may be null when the section renderer found no data
   *  in read-only mode. SmartSection suppresses the whole section
   *  in that case. */
  children: React.ReactNode;
}

export function SmartSection({ mode, title, children }: SmartSectionProps) {
  if (!mode.editable && (children === null || children === undefined)) {
    return null;
  }
  return (
    <section>
      <SectionTitle title={title} />
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
 */
function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="mb-2 text-[10pt] font-medium uppercase tracking-[0.18em] text-zinc-500">
      {title}
    </h2>
  );
}
