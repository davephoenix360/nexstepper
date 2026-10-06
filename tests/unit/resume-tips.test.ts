/**
 * Tests for the AI-parsing loading modal copy (lib/resume-tips.ts).
 *
 * The modal is shown for 30–90 seconds while the parser runs, so the tips it
 * cycles are a real product surface: they are a user's first exposure to how
 * Nexstepper thinks about resumes. These tests guard the properties that make
 * that copy worth showing.
 */

import { describe, expect, it } from 'vitest';

import {
  HEADLINE_INTERVAL_MS,
  PARSING_HEADLINES,
  RESUME_TIPS,
  TIP_MAX_DURATION_MS,
  TIP_MIN_DURATION_MS,
  TIP_WORDS_PER_SECOND,
  pickHeadline,
  pickTip,
  tipDurationMs,
  tipWordCount
} from '@/lib/resume-tips';

describe('PARSING_HEADLINES', () => {
  it('has enough copy that the rotation does not feel like a stuck spinner', () => {
    expect(PARSING_HEADLINES.length).toBeGreaterThanOrEqual(8);
  });

  it('has no duplicate headlines', () => {
    expect(new Set(PARSING_HEADLINES).size).toBe(PARSING_HEADLINES.length);
  });

  it('rotates on a long enough interval to actually be read', () => {
    expect(HEADLINE_INTERVAL_MS).toBeGreaterThanOrEqual(3000);
  });

  it('does not use emoji or casual adjectives in headline copy', () => {
    // v2 (Oct 2026) deliberately dropped emojis + playful words like
    // "fantabulous" / "stardust" from the headlines so the modal
    // reads as premium. Pin it so a future TODO can't put them back.
    for (const headline of PARSING_HEADLINES) {
      expect(headline, `headline: ${headline}`).not.toMatch(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
      );
      expect(headline.toLowerCase(), `casual word in: ${headline}`).not.toMatch(
        /\b(fantabulous|stardust|like a boss|boss)\b/
      );
    }
  });

  it('keeps headlines short enough to fit the rotation interval', () => {
    // 4 s rotation @ 3 WPS = ~12 words max for a comfortable read.
    for (const headline of PARSING_HEADLINES) {
      const words = headline.trim().split(/\s+/).length;
      expect(words, `headline too long: ${headline}`).toBeLessThanOrEqual(10);
    }
  });
});

describe('RESUME_TIPS', () => {
  it('covers all three categories', () => {
    const categories = new Set(RESUME_TIPS.map((t) => t.category));
    expect(categories).toEqual(
      new Set(['resume', 'cover-letter', 'nexstepper'])
    );
  });

  it('gives the Nexstepper category real weight, not a token mention', () => {
    const productTips = RESUME_TIPS.filter((t) => t.category === 'nexstepper');
    expect(productTips.length).toBeGreaterThanOrEqual(5);
  });

  it('explains the master resume / variant distinction', () => {
    // The single most-confused concept in the product, and the reason the
    // user asked for product tips on this screen in the first place.
    const productCopy = RESUME_TIPS.filter((t) => t.category === 'nexstepper')
      .map((t) => t.text.toLowerCase())
      .join(' ');

    expect(productCopy).toContain('master resume');
    expect(productCopy).toContain('variant');
  });

  it('gives every tip an emoji and non-trivial body copy', () => {
    for (const tip of RESUME_TIPS) {
      expect(tip.emoji.length, `emoji for ${tip.text.slice(0, 30)}`).toBeGreaterThan(0);
      expect(tip.text.length, `text for ${tip.text.slice(0, 30)}`).toBeGreaterThan(40);
    }
  });

  it('has no duplicate tips', () => {
    expect(new Set(RESUME_TIPS.map((t) => t.text)).size).toBe(RESUME_TIPS.length);
  });

  it('keeps tips readable on screen rather than essays', () => {
    for (const tip of RESUME_TIPS) {
      expect(tip.text.length, `too long: ${tip.text.slice(0, 40)}`).toBeLessThan(220);
    }
  });

  it('every tip duration lands inside the [MIN, MAX] clamp window', () => {
    for (const tip of RESUME_TIPS) {
      const ms = tipDurationMs(tip.text);
      expect(ms, `${tip.text.slice(0, 30)} → ${ms}ms`).toBeGreaterThanOrEqual(
        TIP_MIN_DURATION_MS
      );
      expect(ms, `${tip.text.slice(0, 30)} → ${ms}ms`).toBeLessThanOrEqual(
        TIP_MAX_DURATION_MS
      );
    }
  });
});

describe('tipWordCount', () => {
  it('counts whitespace-separated tokens and ignores empty entries', () => {
    expect(tipWordCount('one two three')).toBe(3);
    expect(tipWordCount('  one  two   three  ')).toBe(3);
    expect(tipWordCount('')).toBe(0);
  });

  it('strips em-dashes, en-dashes, ellipses, and straight/curly quotes', () => {
    // The em-dash here shouldn't be counted as a word — it's silent in
    // prose and would otherwise inflate the duration for every tip
    // that uses it as a pause mark.
    expect(tipWordCount('cut deploy time 40% — beats helped any day')).toBe(8);
    expect(tipWordCount('match — the — company\'s — own — words')).toBe(5);
    expect(tipWordCount('keep it "simple" today…')).toBe(4);
  });
});

describe('tipDurationMs', () => {
  it('uses the NN/G carousel anchor (3 words per second)', () => {
    expect(TIP_WORDS_PER_SECOND).toBe(3);
  });

  it('respects the [MIN, MAX] floor + ceiling', () => {
    expect(TIP_MIN_DURATION_MS).toBe(5000);
    expect(TIP_MAX_DURATION_MS).toBe(15000);
  });

  it('clamps short tips up to the minimum', () => {
    // 6-word tip would otherwise be 2000ms — below the floor.
    expect(tipDurationMs('Keep it short and clear.')).toBe(TIP_MIN_DURATION_MS);
  });

  it('clamps long tips down to the maximum', () => {
    // 90-word tip would otherwise be 30000ms — above the ceiling.
    const longText =
      'This is a very long tip used to verify the upper bound of the tip ' +
      'duration clamp in the carousel it goes on and on and on and on and ' +
      'on and on and on and on and on and on and on and on and on and on ' +
      'until we hit the upper bound of the clamp window';
    expect(tipDurationMs(longText)).toBe(TIP_MAX_DURATION_MS);
  });

  it('scales linearly with word count inside the clamp window', () => {
    // 15-word tip at 3 WPS = 5000ms — exactly at the floor. 18 words
    // = 6000ms — above the floor, should be the exact value.
    expect(tipDurationMs('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen')).toBe(5000);
    expect(tipDurationMs('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen eighteen nineteen')).toBe(6000);
    // 30 words = 10000ms
    expect(tipDurationMs(Array.from({ length: 30 }, (_, i) => `w${i}`).join(' '))).toBe(10000);
    // 45 words = 15000ms — exactly at the ceiling.
    expect(tipDurationMs(Array.from({ length: 45 }, (_, i) => `w${i}`).join(' '))).toBe(TIP_MAX_DURATION_MS);
  });

  it('is monotonic non-decreasing in word count', () => {
    let prev = 0;
    for (let n = 0; n <= 60; n++) {
      const ms = tipDurationMs(Array.from({ length: n }, (_, i) => `w${i}`).join(' '));
      expect(ms, `duration for ${n} words`).toBeGreaterThanOrEqual(prev);
      prev = ms;
    }
  });
});

describe('rotation helpers', () => {
  it('pickHeadline cycles deterministically and stays in range', () => {
    for (let seed = -20; seed < PARSING_HEADLINES.length * 2 + 5; seed++) {
      expect(PARSING_HEADLINES).toContain(pickHeadline(seed));
    }
    expect(pickHeadline(0)).toBe(pickHeadline(PARSING_HEADLINES.length));
  });

  it('pickTip wraps around the full list without ever returning undefined', () => {
    for (let i = -5; i < RESUME_TIPS.length * 2 + 5; i++) {
      expect(RESUME_TIPS).toContain(pickTip(i));
    }
    expect(pickTip(RESUME_TIPS.length)).toBe(pickTip(0));
  });
});
