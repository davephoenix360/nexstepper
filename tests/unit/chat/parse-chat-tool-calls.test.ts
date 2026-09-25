import { describe, expect, it } from 'vitest';

import { parseChatToolCalls } from '@/lib/db/queries';

/**
 * `parseChatToolCalls` is the bridge between the `tool_calls` JSONB
 * column on `chat_messages` and the typed
 * `Array<{ name, args }>` shape the client + model prompt expect.
 *
 * Two reasons a test pin is worth it:
 *
 *   1. **Defensive contract** — Drizzle + the JSONB driver can hand
 *      us either a raw JSON string OR a pre-parsed value depending
 *      on the underlying adapter. A naive `as Array<...>` cast would
 *      blow up at the worst possible moment (a user reopening their
 *      chat history). The helper makes both shapes safe.
 *
 *   2. **Corruption tolerance** — a malformed row should be treated
 *      as "no tool calls" (undefined), never as a 500. That's the
 *      contract every caller relies on.
 */

describe('parseChatToolCalls', () => {
  it('parses a JSON string into the { name, args }[] shape', () => {
    const raw = JSON.stringify([
      { name: 'edit_section', args: { section: 'summary', content: 'Tweaked.' } },
      { name: 'switch_template', args: { template: 'classic' } }
    ]);

    const out = parseChatToolCalls(raw);

    expect(out).toEqual([
      { name: 'edit_section', args: { section: 'summary', content: 'Tweaked.' } },
      { name: 'switch_template', args: { template: 'classic' } }
    ]);
  });

  it('passes an already-parsed array through unchanged', () => {
    const parsed = [
      { name: 'noop', args: {} },
      { name: 'flag_jd', args: { kind: 'gap' } }
    ];

    const out = parseChatToolCalls(parsed);

    expect(out).toBe(parsed);
  });

  it('returns undefined for invalid JSON strings', () => {
    // Truncated mid-string — guaranteed to throw on JSON.parse.
    const out = parseChatToolCalls('[{"name":"foo","args":');

    expect(out).toBeUndefined();
  });

  it('returns undefined for non-array JSON', () => {
    // Valid JSON, but the wrong root type — we want a strict shape.
    expect(parseChatToolCalls('{"name":"foo","args":{}}')).toBeUndefined();
    expect(parseChatToolCalls('"just a string"')).toBeUndefined();
    expect(parseChatToolCalls('42')).toBeUndefined();
    expect(parseChatToolCalls({ name: 'foo', args: {} })).toBeUndefined();
  });

  it('returns undefined for null and undefined', () => {
    expect(parseChatToolCalls(null)).toBeUndefined();
    expect(parseChatToolCalls(undefined)).toBeUndefined();
  });
});