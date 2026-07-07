/**
 * Template registry — the single source of truth for which templates
 * exist. Keyed by `ResumeData.template` (the persisted envelope
 * field). Add a new template by dropping a file in this folder and
 * appending one line below — call sites don't need to change.
 */

import { classicTemplate } from './classic';
import type { ResumeTemplate } from './types';

export const templateRegistry: Record<string, ResumeTemplate> = {
  [classicTemplate.meta.id]: classicTemplate
};

/**
 * Resolve a template by id. Falls back to `classic` when the requested id
 * is unknown — this happens when a user upgrades to a template that
 * got removed, or types a typo. The fallback keeps the preview usable.
 */
export function getTemplate(id: string | undefined | null): ResumeTemplate {
  if (id && templateRegistry[id]) return templateRegistry[id];
  return classicTemplate;
}

/** All templates, in the order we want to display them in a picker. */
export function listTemplates(): ResumeTemplate[] {
  return Object.values(templateRegistry);
}

export { classicTemplate } from './classic';
export type { ResumeTemplate, ResumeTemplateMeta } from './types';
