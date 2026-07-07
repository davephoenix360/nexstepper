/**
 * Type contract for resume templates.
 *
 * A "template" is a server-renderable React component that takes the
 * canonical `ResumeData` (defined in `lib/resume-schema`) and produces the
 * HTML for one printable resume. Phase 1 ships just `classic`; Phase 2 will
 * add a registry-driven selection step and a few more designs.
 *
 * Keeping `meta` separate from `Component` lets us:
 *  - list available templates without importing their JSX
 *  - render a template-picker dropdown without running the render fn
 *  - serialize meta through server → client (e.g., for the gallery)
 */
import type { ReactNode } from 'react';
import type { ResumeData } from '@/lib/resume-schema';

export interface ResumeTemplateMeta {
  /** Stable id used in `data.template` and the registry key. */
  id: string;
  /** Human-readable name shown in the picker + preview chrome. */
  name: string;
  /** Semver-ish version stamp for cache busts and template drift checks. */
  version: string;
  description?: string;
}

export interface ResumeTemplate {
  meta: ResumeTemplateMeta;
  Component: (props: { data: ResumeData }) => ReactNode;
}
