/**
 * Pure predicates used by the chat stream to decide whether a successful
 * tool result needs an ATS recompute.
 *
 * The route must not infer this from the tool call: a model can emit a
 * `replaceWorkHighlight` call that matches nothing, fails validation, or is
 * rejected after an ownership check. Only the tool result tells us whether
 * the resume actually changed.
 */

interface ToolSuccess {
  ok?: unknown;
}

/** True when an `editResume` call contains at least one surgical bullet edit. */
export function editResumeHasReplaceWorkHighlight(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const operations = (input as { replaceWorkHighlight?: unknown }).replaceWorkHighlight;
  return Array.isArray(operations) && operations.length > 0;
}

/**
 * True when a tool result reports success.
 *
 * AI SDK versions have emitted both the direct tool return value and a
 * `{ type: 'json', value }` wrapper, so accept either shape. A JSON-string
 * result is also handled defensively because tool results round-trip through
 * Postgres JSONB and older rows may be stored as strings.
 */
export function toolResultSucceeded(output: unknown): boolean {
  let value = output;

  if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
    value = (value as { value: unknown }).value;
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return false;
    }
  }

  return Boolean(
    value && typeof value === 'object' && (value as ToolSuccess).ok === true
  );
}
