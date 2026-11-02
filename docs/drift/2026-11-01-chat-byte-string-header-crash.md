# The chat was 500ing on almost every conversation — a ByteString header

**Date:** 2026-11-01
**Severity:** production, user-facing, total feature failure
**Surface:** `POST /api/chat` → every turn
**Found via:** Sentry, `TypeError: Cannot convert argument to a ByteString`

## What happened

The AI chat agent stopped working. The user sent a message and got
nothing — no reply, no error message, just a dead panel. Sentry had one
event, repeated on every attempt:

```
TypeError: Cannot convert argument to a ByteString because the
character at index 50 has a value of 8230 which is greater than 255.
    at webidl.converters.ByteString (node:internal/deps/undici/undici)
    at Object.record<ByteString, ByteString>
    at webidl.converters.HeadersInit
    at Object.ResponseInit
    at new Response
    at app/api/chat/route.ts:619
```

## Root cause

`app/api/chat/route.ts` built the streaming response like this:

```ts
return new Response(resultStream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Session-Id': sessionId,
    'X-Title': title,          // ← the bug
    'X-Chat-Usage': `${usage.turnsUsed}`,
    'X-Chat-Limit': …
  }
});
```

`title` is the chat session's title, and for a brand-new session it is
derived from the user's own first message:

```ts
const preview = message.replace(/\s+/g, ' ').trim().slice(0, 50).trimEnd();
const newTitle = preview.length < message.trim().length ? preview + '…' : preview;
```

**HTTP header values are ByteStrings (ISO-8859-1, 0–255).** A character
above 255 makes undici's `new Response()` throw.

Two things made it fire on essentially every real conversation:

1. **The `…` (U+2026 = 8230).** The title is truncated to 50 characters
   and an ellipsis appended, so the ellipsis always landed at index 50
   — which is exactly the index *and* the value in the error report.
   **Any first message longer than 50 characters triggered it.**
2. **The `•` (U+2022 = 8226).** A bullet anywhere in the message threw
   at its own index. In a resume tool, bullets are the most likely thing
   a user pastes.

Reproduced exactly, locally:

```js
new Response('x', { headers: { 'X-Title': 'a'.repeat(50) + '…' } })
// TypeError: Cannot convert argument to a ByteString because the
// character at index 50 has a value of 8230 which is greater than 255.
```

## Why it was so bad

The throw happens while **constructing the `Response`** — which is after:

- the model call has already been made (and billed), and
- the title has already been written to the database.

So the failed turn still cost money, the session was left holding a
poisoned title, and **every later turn in that session threw again on
the same header**. The chat was not merely failing on the first
message — it was permanently bricked for that session.

And `X-Title` was read by **nobody**. The client's
`use-chat-stream.ts` reads `X-Session-Id`, `X-Chat-Usage` and
`X-Chat-Limit`; the history sidebar renders titles from
`GET /api/chat`'s session list. The header was write-only, and its only
effect was to 500 the endpoint.

## The fix

- **`X-Title` removed.** It was unread, and it was the crash. The title
  is still persisted and still reaches the client — through the session
  list, where it belongs.
- **All response headers now come from one builder**,
  `chatResponseHeaders()` in `lib/chat/response-headers.ts`, and every
  value passes through `safeHeaderValue()`, which strips anything
  outside printable ASCII. The invariant is structural rather than a
  convention someone has to remember at each call site.
- **The rule is written down:** never put user-controlled text in a
  response header. User-facing text goes in the body (the SSE stream
  already does) or in a follow-up request.

## The guard

`tests/unit/chat/response-headers.test.ts` — 13 tests:

- `safeHeaderValue` strips the ellipsis, the bullet, em dashes, curly
  quotes and emoji, and leaves ASCII untouched;
- every header value and name is a legal HTTP header value/name;
- `new Response('', { headers: chatResponseHeaders(…) })` does **not**
  throw with hostile input — the original crash, reproduced as a test;
- no header carries a title;
- source-level: the route sets no `X-Title`, builds its headers through
  `chatResponseHeaders(`, and still persists the auto-title.

## The lesson

This is the same shape as a bug the product has shipped before: two
surfaces disagreeing about one value (the list badge and the scorecard
showing different ATS numbers,
`docs/drift/2026-10-23-list-score-badge-divergence.md`). The common
thread is **a value crossing a boundary that had a narrower contract
than the thing crossing it** — a number that two surfaces computed
separately, and now a string that a header could not represent.

The generalisable rule: *when a value crosses a boundary, check the
boundary's contract.* A header value must be ASCII-safe. A token must
be a number. Neither was checked, and in both cases the failure was
silent until a user hit it.

## Follow-ups (not in this fix)

- The `…` in the auto-title is also what made the stored title differ
  from the message. Harmless in the database, but worth revisiting if
  the title is ever surfaced somewhere length-sensitive.
- The model call was billed for every failed turn. Worth checking
  whether the route should build the `Response` before it starts the
  model — it cannot today, because the stream is the response body —
  but it is a cost observation, not a defect.
