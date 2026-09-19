import { describe, expect, it } from 'vitest';

import {
  ACTION_VERBS,
  WEAK_VERBS,
  SOFT_SKILLS,
  STOP_WORDS
} from '@/lib/scoring/dictionaries';

/**
 * Locks the contents of the dictionaries. Per the plan §"Risks" #3:
 *   "extract to `dictionaries.ts`, ship a test that asserts the
 *    list contains the most-common 20 verbs (so future PRs that
 *    remove a verb need to justify it)."
 *
 * We assert presence (the contract) and uniqueness (no accidental
 * dupes). We do NOT assert full-set equality — the dictionary is
 * expected to grow over time.
 */

describe('ACTION_VERBS', () => {
  it('contains the most-common 20 strong verbs from the legacy list', () => {
    const must = [
      'achieved',
      'built',
      'created',
      'delivered',
      'designed',
      'developed',
      'directed',
      'established',
      'implemented',
      'improved',
      'increased',
      'launched',
      'led',
      'managed',
      'optimized',
      'organized',
      'planned',
      'produced',
      'reduced',
      'shipped'
    ];
    // 'shipped' is NOT in the legacy list — it's a common variant
    // we may want to add. So we replace it with a legacy verb.
    must[must.indexOf('shipped')] = 'solved';
    for (const verb of must) {
      expect(ACTION_VERBS.has(verb), `${verb} should be in ACTION_VERBS`).toBe(true);
    }
  });

  it('contains at least 80 entries (the legacy had ~100)', () => {
    // Loose bound — the plan asks for "the most-common 20" but the
    // legacy list was much larger. A future PR that wants to shrink
    // it must also update this test.
    expect(ACTION_VERBS.size).toBeGreaterThanOrEqual(80);
  });

  it('has no duplicates', () => {
    // Sets can't have duplicates by construction — but the test
    // documents the invariant for future readers.
    const arr = Array.from(ACTION_VERBS);
    expect(new Set(arr).size).toBe(arr.length);
  });

  it('does not overlap with WEAK_VERBS (would double-count)', () => {
    for (const verb of WEAK_VERBS) {
      expect(ACTION_VERBS.has(verb), `${verb} is in WEAK_VERBS`).toBe(false);
    }
  });
});

describe('WEAK_VERBS', () => {
  it('contains the legacy essentials', () => {
    const must = ['be', 'made', 'worked', 'helped', 'responsible'];
    for (const verb of must) {
      expect(WEAK_VERBS.has(verb)).toBe(true);
    }
  });
});

describe('SOFT_SKILLS', () => {
  it('contains the legacy 4-word list verbatim', () => {
    // Per plan §"Open questions" #3 default.
    expect(SOFT_SKILLS).toEqual([
      'team',
      'leadership',
      'collaborated',
      'communication'
    ]);
  });
});

describe('STOP_WORDS', () => {
  it('contains common English stop words', () => {
    const must = ['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'with'];
    for (const word of must) {
      expect(STOP_WORDS.has(word)).toBe(true);
    }
  });

  it('contains at least 80 entries (matches the legacy keyword-extractor)', () => {
    expect(STOP_WORDS.size).toBeGreaterThanOrEqual(80);
  });
});
