import { describe, expect, it } from 'vitest';

import { buildSuppressionNotice } from '@/lib/inline-issue/suppression-notice';

/**
 * Pin the four branches of the suppression notice. These are the
 * user-facing reasons the dim-bar click doesn't open the AI
 * popover:
 *
 *   1. Happy path (Pro + content + known target) → no notice.
 *   2. Free user → "upgrade to Pro" notice (info tone).
 *   3. Pro + unknown path → "couldn't locate a bullet" notice (warn).
 *   4. Pro + empty bullet text → "add content first" notice (warn).
 *
 * Plus edge cases:
 *   - whitespace-only text is treated as empty
 *   - Free + empty bullet = Free branch wins (upgrade CTA first)
 *   - Free + unknown path = Free branch wins (same reason)
 */
describe('buildSuppressionNotice', () => {
  it('returns null for the happy path (Pro + text + target)', () => {
    expect(
      buildSuppressionNotice({
        isPro: true,
        text: 'Built a widget that grew 30% MoM.',
        hasTarget: true
      })
    ).toBeNull();
  });

  it('returns null even with a single-character bullet', () => {
    // `text.trim().length > 0` is the gate — single char counts.
    expect(
      buildSuppressionNotice({ isPro: true, text: 'x', hasTarget: true })
    ).toBeNull();
  });

  it('returns the "upgrade to Pro" notice (info) for Free users', () => {
    const result = buildSuppressionNotice({
      isPro: false,
      text: 'Built a widget',
      hasTarget: true
    });
    expect(result).not.toBeNull();
    expect(result?.tone).toBe('info');
    expect(result?.message.toLowerCase()).toContain('pro');
    expect(result?.message.toLowerCase()).toContain('upgrade');
  });

  it('returns the "couldn\'t locate a bullet" notice (warn) for Pro + unknown path', () => {
    const result = buildSuppressionNotice({
      isPro: true,
      text: 'Built a widget',
      hasTarget: false
    });
    expect(result).not.toBeNull();
    expect(result?.tone).toBe('warn');
    expect(result?.message.toLowerCase()).toContain('locate');
  });

  it('returns the "empty bullet" notice (warn) for Pro + empty text + known target', () => {
    const result = buildSuppressionNotice({
      isPro: true,
      text: '',
      hasTarget: true
    });
    expect(result).not.toBeNull();
    expect(result?.tone).toBe('warn');
    expect(result?.message.toLowerCase()).toContain('empty');
  });

  it('treats whitespace-only text as empty', () => {
    // Whitespace shouldn't count as "content" — would lead to a
    // confusing AI rewrite of nothing.
    const result = buildSuppressionNotice({
      isPro: true,
      text: '   \n\t  ',
      hasTarget: true
    });
    expect(result).not.toBeNull();
    expect(result?.tone).toBe('warn');
    expect(result?.message.toLowerCase()).toContain('empty');
  });

  it('prefers the Free-user branch when both Free AND empty text apply', () => {
    // Free user has higher precedence — even with no content,
    // the user needs to upgrade before they can use the feature,
    // so the "add content" message would be misleading.
    const result = buildSuppressionNotice({
      isPro: false,
      text: '',
      hasTarget: true
    });
    expect(result).not.toBeNull();
    expect(result?.tone).toBe('info');
    expect(result?.message.toLowerCase()).toContain('pro');
  });

  it('prefers the Free-user branch when both Free AND unknown path apply', () => {
    const result = buildSuppressionNotice({
      isPro: false,
      text: 'Built a widget',
      hasTarget: false
    });
    expect(result).not.toBeNull();
    expect(result?.tone).toBe('info');
    expect(result?.message.toLowerCase()).toContain('pro');
  });

  it('returns null for happy path even with extra whitespace around text', () => {
    expect(
      buildSuppressionNotice({
        isPro: true,
        text: '  Built a widget  ',
        hasTarget: true
      })
    ).toBeNull();
  });
});
