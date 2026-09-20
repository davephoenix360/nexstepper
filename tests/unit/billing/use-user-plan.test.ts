/**
 * Tests for `usePlanFromProps` and `useIsPro`.
 *
 * These hooks are intentionally trivial — they're server-passed
 * values forwarded to a typed discriminator. The "test" is really
 * locking the contract: a Free prop stays Free, a Pro prop stays
 * Pro, no client-side fetch.
 */

import { describe, expect, it } from 'vitest';

import { useIsPro, usePlanFromProps } from '@/lib/billing/use-user-plan';

describe('usePlanFromProps', () => {
  it('returns the prop unchanged', () => {
    expect(usePlanFromProps('free')).toBe('free');
    expect(usePlanFromProps('pro')).toBe('pro');
  });
});

describe('useIsPro', () => {
  it('returns true only for pro', () => {
    expect(useIsPro('pro')).toBe(true);
    expect(useIsPro('free')).toBe(false);
  });
});
