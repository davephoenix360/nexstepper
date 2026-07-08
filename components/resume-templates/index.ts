/**
 * Template registry — the single source of truth for which templates
 * exist. Keyed by `ResumeData.template` (the persisted envelope
 * field). Add a new template by dropping a file in this folder and
 * appending one line below — call sites don't need to change.
 *
 * Architecture (see ./meta.ts for the full contract):
 *   - `meta` is a Zod-validated data object: id, name, version,
 *     tier, ATS safety, category, accent, max pages, page size,
 *     tags, preview URL.
 *   - `Component` is the React rendering code.
 *
 * The picker UI only reads `meta` (cheap, serializable). The PDF
 * pipeline reads both: meta for the cache key + tier check,
 * Component for the actual render.
 *
 * IMPORTANT: this file runs on BOTH the server (preview page) and
 * the client (editor). We compose the { meta, Component } objects
 * here so that `meta` stays a plain serializable object on the
 * server. Importing `{ meta, Component }` from a 'use client' file
 * would replace the object with a client-reference proxy on the
 * server, breaking `template.meta.name` reads (e.g. the preview
 * page's chrome bar). So each template file exports the Component
 * directly, and the meta is sourced from `./meta.ts` (server-safe).
 */

import { ClassicTemplate } from "./classic";
import { ModernTemplate } from "./modern";
import { CLASSIC_TEMPLATE_META, MODERN_TEMPLATE_META } from "./meta";
import type { ResumeTemplate } from "./types";

export const templateRegistry: Record<string, ResumeTemplate> = {
  [CLASSIC_TEMPLATE_META.id]: {
    meta: CLASSIC_TEMPLATE_META,
    Component: ClassicTemplate
  },
  [MODERN_TEMPLATE_META.id]: {
    meta: MODERN_TEMPLATE_META,
    Component: ModernTemplate
  }
};

/**
 * Resolve a template by id. Falls back to `classic` when the
 * requested id is unknown — this happens when a user upgrades to a
 * template that got removed, or types a typo. The fallback keeps
 * the preview usable.
 */
export function getTemplate(id: string | undefined | null): ResumeTemplate {
  if (id && templateRegistry[id]) return templateRegistry[id];
  return templateRegistry[CLASSIC_TEMPLATE_META.id];
}

/** All templates, in the order we want to display them in the picker. */
export function listTemplates(): ResumeTemplate[] {
  return Object.values(templateRegistry);
}

export { TemplatePicker } from "./template-picker";
export type { ResumeTemplate, TemplateMeta } from "./types";
