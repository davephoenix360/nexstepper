/**
 * Type contract for resume templates.
 *
 * A "template" is a server-renderable React component that takes the
 * canonical `ResumeData` (defined in `lib/resume-schema`) and produces
 * the HTML for one printable resume.
 *
 * Architecture split (see ./meta.ts for the full rationale):
 *   - `Component` → React JSX, full creative power, type-safe.
 *                    One per template. New templates ship as a PR.
 *   - `meta`      → Plain data, Zod-validated, admin-editable in
 *                    Phase 6, server-serializable. Drives the picker,
 *                    ATS badge, tier check, PDF cache key, accent
 *                    override, page format.
 *
 * Keeping the two halves separate lets us:
 *   - list available templates without importing their JSX
 *     (the registry can be evaluated in any context)
 *   - render a template-picker dropdown without running the
 *     render fn
 *   - serialize meta through server → client (e.g., for the
 *     gallery) without dragging React component code across the
 *     boundary
 *   - ship a Phase 6 admin UI that publishes / prices templates
 *     without needing to re-render the React component
 */

import type { ReactNode } from "react";
import type { ResumeData } from "@/lib/resume-schema";
import type { TemplateMeta } from "./meta";

export type { TemplateMeta } from "./meta";

export interface ResumeTemplate {
  meta: TemplateMeta;
  Component: (props: {
    data: ResumeData;
    /**
     * When true, the template renders interactive leaves
     * (<EditableText> in place of plain text) so the user can edit
     * values inside the rendered view. The idle/print render is
     * pixel-equivalent to the read-only render — only the
     * interactivity differs.
     */
    editable?: boolean;
  }) => ReactNode;
}
