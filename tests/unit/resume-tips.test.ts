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
  TIP_INTERVAL_MS,
  pickHeadline,
  pickTip
} from '@/lib/resume-tips';

describe('PARSING_HEADLINES', () => {
  it('has enough copy that the rotation does not feel like a stuck spinner', () => {
    expect(PARSING_HEADLINES.length).toBeGreaterThanOrEqual(10);
  });

  it('has no duplicate headlines', () => {
    expect(new Set(PARSING_HEADLINES).size).toBe(PARSING_HEADLINES.length);
  });

  it('rotates on a long enough interval to actually be read', () => {
    expect(HEADLINE_INTERVAL_MS).toBeGreaterThanOrEqual(3000);
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

  it('rotates tips slowly enough to read', () => {
    expect(TIP_INTERVAL_MS).toBeGreaterThanOrEqual(4000);
  });
});
