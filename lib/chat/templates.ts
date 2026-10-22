import 'server-only';

import { templateRegistry } from '@/components/resume-templates';
import type { TemplateMeta } from '@/components/resume-templates/meta';

/**
 * Template facts for the chat assistant — derived from the registry.
 *
 * ## Why this module exists
 *
 * There were THREE hand-maintained lists of template ids in the chat
 * stack, and all of them had drifted:
 *
 *   1. the `switchTemplate` tool DESCRIPTION (model-facing)
 *   2. `AVAILABLE_TEMPLATES` in system-prompt.ts (prompt-facing)
 *   3. `TEMPLATE_DESCRIPTIONS` in switch-template.ts (executor-facing)
 *
 * When the Jake template shipped, all three still listed five. The
 * damage was worse than "the model doesn't know it exists":
 *
 *   - list 2 meant the system prompt never mentioned it,
 *   - list 1 meant the tool description never offered it,
 *   - list 3 is the VALIDATOR, so even a model that somehow guessed
 *     `jake` would get back
 *     `Unknown template: jake. Available: minimal, classic, executive,
 *     creative, modern`.
 *
 * A hand-written list is not a source of truth, it is a snapshot someone
 * has to remember to update. Everything here is computed from
 * `templateRegistry` at request time, so adding a template to the
 * registry is now sufficient to make it reachable from chat.
 */

/** Every template id the chat can address. Registry-derived. */
export const TEMPLATE_IDS: readonly string[] = Object.keys(templateRegistry);

/**
 * Back-compat alias. Several call sites import this name; it now just
 * points at the registry rather than duplicating it.
 */
export const AVAILABLE_TEMPLATES = TEMPLATE_IDS;

export function isValidTemplateId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(templateRegistry, id);
}

export function getTemplateMeta(id: string): TemplateMeta | undefined {
  return templateRegistry[id]?.meta;
}

/**
 * One template, described the way the model needs to hear about it:
 * name, what it looks like, and — the part that used to be missing
 * entirely — whether it is ATS-safe and how many pages it targets.
 *
 * "Is this ATS-safe?" is a question a user asks constantly. The
 * registry has always known the answer; the prompt never did.
 */
export function describeTemplate(id: string): string {
  const meta = getTemplateMeta(id);
  if (!meta) return `${id} (unknown template)`;

  const parts = [`${meta.name} — ${meta.description}`];
  parts.push(meta.atsSafe ? 'ATS-safe' : 'not ATS-safe');
  if (meta.maxPages !== 'auto') {
    parts.push(`max ${meta.maxPages} page${meta.maxPages === '1' ? '' : 's'}`);
  }
  if (meta.tags.length) parts.push(meta.tags.join(', '));
  return parts.join('. ');
}

/**
 * The full catalogue as one prompt-ready string. Used by both the
 * system prompt and the `switchTemplate` tool description so the model
 * sees the same list in both places.
 */
export function templateListForPrompt(): string {
  return TEMPLATE_IDS.map((id) => `${id} (${describeTemplate(id)})`).join('; ');
}