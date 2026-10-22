/**
 * Tests for the per-resume print-settings feature.
 *
 * Pin:
 *   - The 4 preset enums and their numeric/rem values.
 *   - `printSettingsToCssVars` returns the 4 documented CSS custom
 *     properties in the documented units.
 *   - `coercePrintSettings` returns DEFAULT_PRINT_SETTINGS on
 *     missing / corrupt / stale-migration values.
 *   - The Zod `printSettingsSchema` rejects unknown enum values
 *     (defense in depth against a tampered client request).
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRINT_SETTINGS,
  FONT_SIZE_PRESETS,
  FONT_SIZE_VALUES,
  LINE_HEIGHT_PRESETS,
  LINE_HEIGHT_VALUES,
  MARGIN_PRESETS,
  MARGIN_PRESET_VALUES,
  SECTION_SPACING_PRESETS,
  SECTION_SPACING_VALUES,
  coercePrintSettings,
  printSettingsSchema,
  printSettingsToCssVars
} from '@/lib/print-settings';

describe('MARGIN_PRESETS', () => {
  it('exposes the three industry-standard page-margin shapes', () => {
    expect(MARGIN_PRESETS).toEqual(['compact', 'standard', 'generous']);
  });

  it('values are in inches (not cm, not pt)', () => {
    expect(MARGIN_PRESET_VALUES).toEqual({
      compact: 0.5,
      standard: 0.75,
      generous: 1
    });
  });
});

describe('LINE_HEIGHT_PRESETS', () => {
  it('values are unitless multipliers', () => {
    expect(LINE_HEIGHT_VALUES).toEqual({
      compact: 1.2,
      standard: 1.4,
      relaxed: 1.6
    });
  });
});

describe('FONT_SIZE_PRESETS', () => {
  it('values are in points', () => {
    expect(FONT_SIZE_VALUES).toEqual({
      small: 10,
      standard: 11,
      large: 12
    });
  });
});

describe('SECTION_SPACING_PRESETS', () => {
  it('values are rem (multiplier of root font size)', () => {
    expect(SECTION_SPACING_VALUES).toEqual({
      compact: '0.75rem',
      standard: '1.25rem',
      relaxed: '2rem'
    });
  });
});

describe('printSettingsSchema', () => {
  it('accepts a complete well-formed object', () => {
    const parsed = printSettingsSchema.safeParse({
      margin: 'compact',
      lineHeight: 'relaxed',
      fontSize: 'large',
      sectionSpacing: 'standard'
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown margin value', () => {
    const parsed = printSettingsSchema.safeParse({
      margin: 'huge', // not in the enum
      lineHeight: 'standard',
      fontSize: 'standard',
      sectionSpacing: 'standard'
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing field', () => {
    const parsed = printSettingsSchema.safeParse({
      margin: 'compact',
      lineHeight: 'standard',
      fontSize: 'standard'
      // sectionSpacing missing
    });
    expect(parsed.success).toBe(false);
  });
});

describe('coercePrintSettings', () => {
  it('returns DEFAULT_PRINT_SETTINGS on undefined', () => {
    expect(coercePrintSettings(undefined)).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it('returns DEFAULT_PRINT_SETTINGS on null', () => {
    expect(coercePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it('returns DEFAULT_PRINT_SETTINGS on a non-object', () => {
    expect(coercePrintSettings(42)).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(coercePrintSettings('hi')).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(coercePrintSettings(true)).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it('falls back to defaults only for the fields that are actually bad', () => {
    // This used to be all-or-nothing: any invalid field reset the WHOLE
    // object to defaults. That is a silent data-loss pattern — adding one
    // new field to the schema would have reverted every resume's
    // carefully chosen "compact margin" back to standard.
    //
    // Now each field is validated on its own, so one bad value never
    // disturbs the others.
    expect(coercePrintSettings({ margin: 'huge' })).toEqual(
      DEFAULT_PRINT_SETTINGS
    );
    expect(coercePrintSettings({ margin: 'compact' })).toEqual({
      ...DEFAULT_PRINT_SETTINGS,
      margin: 'compact'
    });
  });

  it('keeps the other fields when one is missing entirely', () => {
    // A blob written before `itemSpacing` existed must not lose the
    // user's margin / line-height choices.
    const result = coercePrintSettings({
      margin: 'compact',
      lineHeight: 'compact',
      fontSize: 'large',
      sectionSpacing: 'relaxed'
    });
    expect(result).toEqual({
      margin: 'compact',
      lineHeight: 'compact',
      fontSize: 'large',
      sectionSpacing: 'relaxed',
      itemSpacing: 'standard'
    });
  });

  it('passes through a well-formed object', () => {
    const result = coercePrintSettings({
      margin: 'generous',
      lineHeight: 'relaxed',
      fontSize: 'small',
      sectionSpacing: 'compact',
      itemSpacing: 'compact'
    });
    expect(result).toEqual({
      margin: 'generous',
      lineHeight: 'relaxed',
      fontSize: 'small',
      sectionSpacing: 'compact',
      itemSpacing: 'compact'
    });
  });
});

describe('printSettingsToCssVars', () => {
  it('emits the documented CSS custom properties in the documented units', () => {
    const cssVars = printSettingsToCssVars(DEFAULT_PRINT_SETTINGS);
    expect(cssVars).toEqual({
      '--resume-margin': '0.75in',
      '--resume-line-height': 1.4,
      '--resume-font-size': '11pt',
      '--resume-section-spacing': '1.25rem',
      '--resume-item-spacing': '0.875rem'
    });
  });

  it('reflects compact margin / large font size', () => {
    const cssVars = printSettingsToCssVars({
      margin: 'compact',
      lineHeight: 'compact',
      fontSize: 'large',
      sectionSpacing: 'relaxed',
      itemSpacing: 'compact'
    }) as Record<string, string | number>;
    expect(cssVars['--resume-margin']).toBe('0.5in');
    expect(cssVars['--resume-font-size']).toBe('12pt');
    expect(cssVars['--resume-line-height']).toBe(1.2);
    expect(cssVars['--resume-section-spacing']).toBe('2rem');
    expect(cssVars['--resume-item-spacing']).toBe('0.5rem');
  });

  it('keys are exactly the documented vars — nothing more, nothing less', () => {
    const keys = Object.keys(printSettingsToCssVars(DEFAULT_PRINT_SETTINGS));
    expect(keys.sort()).toEqual(
      [
        '--resume-font-size',
        '--resume-item-spacing',
        '--resume-line-height',
        '--resume-margin',
        '--resume-section-spacing'
      ].sort()
    );
  });
});