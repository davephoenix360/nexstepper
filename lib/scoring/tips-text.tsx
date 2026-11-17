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
 * Server-only by intent: `react-dom/server` must not reach a client
 * bundle. The tips module itself stays free of it.
 */
import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DynamicTips } from './tips';

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, ' '],
  [/&quot;/g, '"'],
  [/&#x27;/g, "'"],
  [/&#39;/g, "'"],
  [/&apos;/g, "'"],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&amp;/g, '&']
];

/**
 * Render one tip's JSX down to a single line of plain text.
 *
 * The tags are stripped and the HTML entities decoded, so the model
 * reads "10 of 29 work bullets describe a task rather than an outcome"
 * rather than markup.
 */
export function tipToPlainText(tip: React.ReactNode): string {
  if (tip === null || tip === undefined || typeof tip === 'boolean') return '';
  if (typeof tip === 'string' || typeof tip === 'number') return String(tip);

  const html = renderToStaticMarkup(createElement(Fragment, null, tip));
  let text = html.replace(/<[^>]*>/g, '');
  for (const [pattern, replacement] of ENTITIES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Every dynamic tip as plain text, keyed by criterion.
 *
 * Empty entries are dropped — a tip with no text is not advice.
 */
export function tipsToPlainText(tips: DynamicTips): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, tip] of Object.entries(tips)) {
    const text = tipToPlainText(tip);
    if (text) out[key] = text;
  }
  return out;
}
