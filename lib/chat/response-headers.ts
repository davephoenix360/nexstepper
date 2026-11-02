/**
 * Response headers for the chat stream.
 *
 * ## Why this file exists (production incident, 2026-11-01)
 *
 * The chat route used to set `X-Title: <the chat's title>` on its response.
 * The title is derived from the user's first message, so it is arbitrary
 * user text — and **HTTP header values are ByteStrings (ISO-8859-1,
 * 0–255)**. Any character above 255 makes undici's `new Response()` throw:
 *
 *   TypeError: Cannot convert argument to a ByteString because the
 *   character at index 50 has a value of 8230 which is greater than 255.
 *
 * Two things made it fire on almost every real conversation:
 *
 * - The auto-title truncates the first message to 50 characters and
 *   appends `…` (U+2026 = 8230). So **any** first message longer than 50
 *   characters put the ellipsis at index 50 — exactly the index and value
 *   in the production error report.
 * - A `•` (U+2022 = 8226) anywhere in the message did the same thing at
 *   its own index.
 *
 * The throw happens while building the `Response` — i.e. AFTER the model
 * call has already been made (and billed) and AFTER the title has already
 * been written to the database. So the user saw nothing at all, the
 * session was left holding a poisoned title, and every later turn in
 * that session threw again on the same header. To the user the chat
 * simply "wasn't working".
 *
 * ## The rule
 *
 * **Never put user-controlled text in a response header.** A header
 * value must be ASCII-safe by construction. If a client needs
 * user-facing text, send it in the body — the SSE stream already does —
 * or fetch it from the session endpoint (`GET /api/chat`).
 *
 * The title was removed rather than sanitised because no client ever
 * read it: the sidebar renders titles from the session list, not from a
 * response header. `safeHeaderValue` below is the belt-and-braces guard
 * for every value that IS dynamic.
 */

/**
 * Characters that cannot legally appear in an HTTP header value.
 *
 * Printable ASCII only, plus the horizontal tab. Everything else —
 * every non-Latin-1 character (ellipsis, bullet, em dash, curly quote,
 * emoji) and every control character — is stripped.
 */
const UNSAFE_HEADER_CHARS = /[^\t\x20-\x7E]/g;

/**
 * Make a string safe to use as an HTTP header value.
 *
 * Lossy by design: characters outside printable ASCII are removed
 * rather than encoded. That is the correct trade for the values this
 * actually carries (a UUID and two integers, none of which ever contain
 * one), and it is the wrong trade for user-facing text — which is
 * exactly why user-facing text does not go in headers.
 */
export function safeHeaderValue(value: string): string {
  return value.replace(UNSAFE_HEADER_CHARS, '');
}

export type ChatResponseHeaderInput = {
  /** The chat session id. A UUID in practice. */
  sessionId: string;
  /** Turns this user has consumed today. */
  turnsUsed: number;
  /** The plan's daily turn allowance, or `'unlimited'` on Pro. */
  turnLimit: number | 'unlimited';
};

/**
 * The chat stream's response headers.
 *
 * Built in one place so that every value passes through
 * `safeHeaderValue` — the invariant is structural, not a convention
 * someone has to remember at each call site.
 */
export function chatResponseHeaders(input: ChatResponseHeaderInput): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Session-Id': safeHeaderValue(input.sessionId),
    // Post-consume usage so the client can render an honest
    // "N messages remaining today" readout. Previously the
    // bubble hardcoded `{ limit: 20, used: 0 }` and never
    // decremented, so the number the user saw was always the
    // full allowance regardless of how much they'd used.
    'X-Chat-Usage': safeHeaderValue(String(input.turnsUsed)),
    'X-Chat-Limit': safeHeaderValue(String(input.turnLimit))
  };
}
