/**
 * Tests for the feedback Zod schema (`lib/feedback/schema.ts`).
 *
 * The schema is the security boundary for the public feedback form;
 * these cases pin the rules so a future "let me relax this" change
 * has to acknowledge the trade-off.
 */

import { describe, expect, it } from 'vitest';

import {
  countUrls,
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  feedbackInputSchema
} from '@/lib/feedback/schema';

describe('feedbackInputSchema', () => {
  describe('happy path', () => {
    it('accepts a minimal valid submission', () => {
      const result = feedbackInputSchema.safeParse({
        message: 'This is a real note, ten chars or more.',
        category: 'idea'
      });
      expect(result.success).toBe(true);
    });

    it('accepts every defined category', () => {
      for (const category of FEEDBACK_CATEGORIES) {
        const result = feedbackInputSchema.safeParse({
          message: 'A note about the product.',
          category
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts a valid email when one is provided', () => {
      const result = feedbackInputSchema.safeParse({
        message: 'Could you add dark mode?',
        category: 'idea',
        email: 'me@example.com'
      });
      expect(result.success).toBe(true);
    });

    it('accepts an empty string for email (treats as "not given")', () => {
      // The form posts the email field unconditionally. An empty
      // string means "the user typed nothing" and is semantically
      // equivalent to omitting the key.
      const result = feedbackInputSchema.safeParse({
        message: 'Could you add dark mode?',
        category: 'idea',
        email: ''
      });
      expect(result.success).toBe(true);
    });

    it('trims surrounding whitespace on the message', () => {
      const result = feedbackInputSchema.safeParse({
        message: '   hello there friends   ',
        category: 'other'
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe('hello there friends');
      }
    });
  });

  describe('rejections', () => {
    it('rejects a message shorter than the minimum', () => {
      const tooShort = 'a'.repeat(FEEDBACK_MESSAGE_MIN - 1);
      const result = feedbackInputSchema.safeParse({
        message: tooShort,
        category: 'idea'
      });
      expect(result.success).toBe(false);
    });

    it('rejects a message longer than the maximum', () => {
      const tooLong = 'a'.repeat(FEEDBACK_MESSAGE_MAX + 1);
      const result = feedbackInputSchema.safeParse({
        message: tooLong,
        category: 'idea'
      });
      expect(result.success).toBe(false);
    });

    it('rejects an unknown category', () => {
      const result = feedbackInputSchema.safeParse({
        message: 'A perfectly fine message',
        // Intentionally invalid for the test — `category` is
        // `z.enum(FEEDBACK_CATEGORIES)`, which Zod narrows tightly
        // enough that TS catches the wrong literal at the literal
        // type, so we need the wider `string` to bypass that and
        // exercise the Zod-level rejection.
        category: 'complaint' as unknown as 'bug'
      });
      expect(result.success).toBe(false);
    });

    it('rejects a non-email string in the email field', () => {
      const result = feedbackInputSchema.safeParse({
        message: 'A perfectly fine message',
        category: 'idea',
        email: 'not-an-email'
      });
      expect(result.success).toBe(false);
    });

    it('rejects a missing message', () => {
      const result = feedbackInputSchema.safeParse({
        category: 'idea'
      });
      expect(result.success).toBe(false);
    });

    it('rejects a missing category', () => {
      const result = feedbackInputSchema.safeParse({
        message: 'A perfectly fine message'
      });
      expect(result.success).toBe(false);
    });

    it('rejects a non-string message', () => {
      // The Zod schema's `message: z.string()` rejects non-strings
      // at the runtime layer; the wire shape we pass here is wider
      // than the Zod input so TS doesn't catch it first.
      const result = feedbackInputSchema.safeParse({
        message: 1234 as unknown as string,
        category: 'idea'
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('countUrls', () => {
  it('returns 0 for plain text with no links', () => {
    expect(countUrls('Just a regular message with no links.')).toBe(0);
  });

  it('counts http and https links', () => {
    expect(
      countUrls('See https://example.com and http://example.org for more.')
    ).toBe(2);
  });

  it('counts www.-prefixed links (no scheme)', () => {
    expect(countUrls('Try www.example.com for context.')).toBe(1);
  });

  it('does not count email addresses as URLs', () => {
    // `\b` boundaries keep the matcher from eating the `@` in an
    // email address as if it were a URL.
    expect(countUrls('Email me at user@example.com please.')).toBe(0);
  });

  it('handles multiple links in one sentence', () => {
    expect(
      countUrls(
        'Compare https://a.com/x, https://b.com/y and https://c.com/z.'
      )
    ).toBe(3);
  });
});
