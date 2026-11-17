/**
 * The dynamic tips as PLAIN TEXT.
 *
 * ## Why this exists
 *
 * The scorecard renders the dynamic tips as rich JSX (`<strong>` for
 * the keywords, the bullet names, the counts). The chat agent needs the
 * SAME advice — but a model reads text, not JSX.
 *
 * Without this, the chat agent saw only the dimension NUMBERS:
 *
 *     contentQuality: 68
 *
 * and had to improvise the advice from them. Meanwhile the scorecard
 * beside it was saying:
 *
 *     10 of 29 work bullets describe a task rather than an outcome
 *     (Building Launchpad…; Conducted a personal audit…; Designed a
 *     discounts API…). Say what changed, not just what you did.
 *
 * Two surfaces, one question, two answers — and the chat's answer was
 * the invented one. This module makes the chat quote the scorecard's.
 *
 * ## One source of truth
 *
 * It renders the tips the scorecard renders; it does not re-derive
 * them. So the advice cannot drift between the two surfaces — which is
 * the whole point (recurring trap #13 in AGENTS.md).
 *
 * ## Why not `react-dom/server`
 *
 * The obvious implementation — `renderToStaticMarkup` — is rejected by
 * Next 16's Turbopack: a module importing `react-dom/server` cannot
 * sit in the client module graph, and this module is reachable from
 * both (the scoring module is imported by client components). So this
 * walks the element tree directly.
 *
 * That is not a workaround with a cost: the tips are built from a
 * small, known vocabulary of nodes — strings, numbers, fragments,
 * arrays and `<strong>`/`<em>`/`<span>` wrappers around children. A
 * recursive walk over `props.children` handles all of them, needs no
 * renderer, and works in a browser as well as on the server.
 */
import { isValidElement, type ReactNode } from 'react';

import type { DynamicTips } from './tips';

/**
 * The text of a React node, ignoring the markup.
 *
 * Elements contribute their CHILDREN, not their tag: `<strong>AWS</strong>`
 * contributes "AWS". Whitespace-only strings between elements are
 * preserved, because the tips use `{' '}` to separate words.
 */
export function tipToPlainText(tip: ReactNode): string {
  if (tip === null || tip === undefined || typeof tip === 'boolean') return '';
  if (typeof tip === 'string') return tip;
  if (typeof tip === 'number') return String(tip);
  if (Array.isArray(tip)) return tip.map(tipToPlainText).join('');

  if (isValidElement(tip)) {
    const props = tip.props as { children?: ReactNode };
    return tipToPlainText(props.children);
  }

  return '';
}

/**
 * Every dynamic tip as plain text, keyed by criterion.
 *
 * Empty entries are dropped — a tip with no text is not advice.
 */
export function tipsToPlainText(tips: DynamicTips): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, tip] of Object.entries(tips)) {
    const text = tipToPlainText(tip).replace(/\s+/g, ' ').trim();
    if (text) out[key] = text;
  }
  return out;
}
