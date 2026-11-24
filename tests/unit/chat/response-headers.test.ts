/**
 * The chat stream's response headers.
 *
 * ## The incident this file locks down
 *
 * On 2026-11-01 the production chat endpoint started 500ing on almost
 * every conversation. The Sentry report was:
 *
 *   TypeError: Cannot convert argument to a ByteString because the
 *   character at index 50 has a value of 8230 which is greater than 255.
 *     at webidl.converters.ByteString (node:internal/deps/undici/undici)
 *     ... at app/api/chat/route.ts:619 → new Response(...)
 *
 * The route was putting the chat's title into a response header
 * (`X-Title`). The title is derived from the user's first message, so it
 * is arbitrary user text — and header values are ByteStrings (0–255).
 * The auto-title truncates to 50 characters and appends `…` (U+2026 =
 * 8230), so ANY first message longer than 50 characters put the
 * ellipsis at index 50. A `•` (U+2022 = 8226) did the same at its own
 * index.
 *
 * The throw happened while building the `Response` — after the model
 * call had already been made and billed, and after the title had
 * already been written to the database. So the session was left holding
 * a poisoned title and every later turn in it threw again. The chat
 * looked simply "not working".
 *
 * These tests are the anti-drift guard: the header set is built in one
 * place, every value is sanitised, and the route no longer sends
 * user-controlled text in a header.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chatResponseHeaders, safeHeaderValue } from '@/lib/chat/response-headers';

const ROUTE_SOURCE = readFileSync(
  resolve(process.cwd(), 'app/api/chat/route.ts'),
  'utf8'
);

/** A legal HTTP header value: printable ASCII plus the horizontal tab. */
const HEADER_VALUE = /^[\t\x20-\x7E]*$/;

/** A legal HTTP header name (RFC 9110 token). */
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

describe('safeHeaderValue', () => {
  it('strips the ellipsis that broke the chat route', () => {
    // U+2026 = 8230 — the exact value in the production error report.
    const poisoned = 'a'.repeat(50) + '…';
    expect(poisoned.codePointAt(50)).toBe(8230);
    expect(safeHeaderValue(poisoned)).toBe('a'.repeat(50));
  });

  it('strips the bullet character', () => {
    // U+2022 = 8226.
    expect('•'.codePointAt(0)).toBe(8226);
    expect(safeHeaderValue('Led • shipped')).toBe('Led  shipped');
  });

  it('strips characters outside Latin-1 — em dash, curly quote, emoji', () => {
    expect(safeHeaderValue('a — b')).toBe('a  b');
    expect(safeHeaderValue('it’s')).toBe('its');
    expect(safeHeaderValue('ship it 🚀')).toBe('ship it ');
  });

  it('leaves printable ASCII untouched', () => {
    expect(safeHeaderValue('a1b2-c3_d4')).toBe('a1b2-c3_d4');
    expect(safeHeaderValue('')).toBe('');
  });
});

describe('chatResponseHeaders', () => {
  it('every value is a legal HTTP header value', () => {
    const headers = chatResponseHeaders({
      sessionId: '3f7c1a2b-0000-4000-8000-000000000000',
      turnsUsed: 7,
      turnLimit: 'unlimited',
      modelLabel: 'Claude Haiku 5.5'
    });
    for (const [name, value] of Object.entries(headers)) {
      expect(value, `value of ${name}`).toMatch(HEADER_VALUE);
    }
  });

  it('every name is a legal HTTP header name', () => {
    const headers = chatResponseHeaders({
      sessionId: 'abc',
      turnsUsed: 0,
      turnLimit: 'unlimited',
      modelLabel: 'Claude Haiku 5.5'
    });
    for (const name of Object.keys(headers)) {
      expect(name).toMatch(HEADER_NAME);
    }
  });

  it('reports the post-consume turn usage and the enforced limit', () => {
    const headers = chatResponseHeaders({
      sessionId: 'abc',
      turnsUsed: 7,
      turnLimit: 'unlimited',
      modelLabel: 'Claude Haiku 5.5'
    });
    expect(headers['X-Chat-Usage']).toBe('7');
    // Since 2026-11-24 Free turns 21+ are valid on the $0 chain, so the
    // client must never be handed a finite 20 that disables the composer.
    expect(headers['X-Chat-Limit']).toBe('unlimited');
  });

  it('reports the chain selected for this turn', () => {
    const pro = chatResponseHeaders({
      sessionId: 'abc',
      turnsUsed: 20,
      turnLimit: 'unlimited',
      modelLabel: 'Claude Haiku 5.5'
    });
    expect(pro['X-Chat-Model']).toBe('Claude Haiku 5.5');

    const fallback = chatResponseHeaders({
      sessionId: 'abc',
      turnsUsed: 21,
      turnLimit: 'unlimited',
      modelLabel: 'Beam'
    });
    expect(fallback['X-Chat-Model']).toBe('Beam');
  });

  it('sanitises a hostile model label like every other header value', () => {
    // The label is now dynamic (a model rename can add it), so it must go
    // through the same guard that killed the X-Title ByteString crash.
    const headers = chatResponseHeaders({
      sessionId: 'abc',
      turnsUsed: 1,
      turnLimit: 'unlimited',
      modelLabel: 'Claude • Haiku… 🚀'
    });
    expect(headers['X-Chat-Model']).toBe('Claude  Haiku ');
    expect(headers['X-Chat-Model']).toMatch(HEADER_VALUE);
  });

  it('never throws when handed hostile input — the original crash', () => {
    // Reproduces the production failure shape: header values carrying
    // the ellipsis and the bullet that undici refuses to convert.
    expect(() =>
      new Response('', {
        headers: chatResponseHeaders({
          sessionId: '•…',
          turnsUsed: 0,
          turnLimit: 'unlimited',
          modelLabel: 'Claude • Haiku… 🚀'
        })
      })
    ).not.toThrow();
  });

  it('does not send the chat title in any header', () => {
    // The title is arbitrary user text. It belongs in the body (the SSE
    // stream) or in the session list — never in a header.
    const headers = chatResponseHeaders({
      sessionId: 'abc',
      turnsUsed: 1,
      turnLimit: 'unlimited',
      modelLabel: 'Claude Haiku 5.5'
    });
    expect(Object.keys(headers).some((k) => k.toLowerCase().includes('title'))).toBe(false);
  });
});

describe('the chat route', () => {
  it('does not set an X-Title header', () => {
    // Source-level, because the bug was "a header whose value came from
    // the user" — a runtime assertion cannot see a header that is not
    // there.
    expect(ROUTE_SOURCE).not.toContain('X-Title');
  });

  it('builds its response headers through chatResponseHeaders', () => {
    // One builder, so every value is sanitised by construction.
    expect(ROUTE_SOURCE).toContain('chatResponseHeaders(');
  });

  it('reports an unlimited enforced turn limit to the client', () => {
    // Regression guard: sending the displayed 20 allowance here would
    // disable the composer at turn 20 even though Free turn 21 is valid
    // on the $0 chain. The allowance is informational UI copy only.
    expect(ROUTE_SOURCE).toMatch(/chatResponseHeaders\(\{[\s\S]*?turnLimit: 'unlimited'/);
    expect(ROUTE_SOURCE).toContain('modelLabel: chatModelLabelForTurn(');
  });

  it('still persists the auto-title to the database', () => {
    // Removing the header must not remove the title itself — the
    // history sidebar reads it from `GET /api/chat`.
    expect(ROUTE_SOURCE).toContain('updateChatSessionTitle(');
  });
});
