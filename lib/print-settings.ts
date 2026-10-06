/**
 * Per-resume print settings — the four most common knobs users want
 * when tuning a resume for paper.
 *
 * Why these four (v1):
 *   - margin: the single biggest layout lever. Tightening from 0.75"
 *     to 0.5" buys back ~½" of vertical space per page, which is often
 *     the difference between a 1-page and 2-page resume.
 *   - section spacing: between-sections vertical density. "Compact"
 *     shaves ~⅓" off a long resume; "Relaxed" reads as more breathable
 *     for senior roles.
 *   - font size: opt-in global font scale on the resume body.
 *     Headings / section headers keep their relative sizes (they're
 *     tied to the rest of the design, not to user preference).
 *   - line height: body line spacing. The default 1.4 is the readability
 *     sweet spot; compact (1.2) fits more content; relaxed (1.6) reads
 *     as "spacious."
 *
 * Out of scope (deferred):
 *   - section reordering
 *   - multi-column layouts
 *   - accent color customization
 *   - custom date formats
 *
 * Persistence shape: stored on the `resumes` row as `print_settings jsonb`
 * — per-resume (so variants can differ from their master). Schema version
 * is pinned via the Zod schema; on read we re-validate against this
 * version's shape (and fall back to defaults if a future schema migration
 * leaves stale data — see `coercePrintSettings`).
 */
import { z } from 'zod';
import type { CSSProperties } from 'react';

/* ─── Presets ─────────────────────────────────────────────────────────── */

/**
 * Page margin (top/bottom/left/right, all uniform). Inches. Each preset
 * is one of three industry-standard shapes:
 *   • `compact` 0.5"  — what most tech resumes use. Maximum content
 *     per page; the smallest the eye comfortably reads at.
 *   • `standard` 0.75" — the default. Balanced.
 *   • `generous` 1" — what traditional (non-tech) resumes use. More
 *     whitespace, "easier on the eye" feel.
 */
export const MARGIN_PRESETS = ['compact', 'standard', 'generous'] as const;
export type MarginPreset = (typeof MARGIN_PRESETS)[number];

/** Inches keyed by preset. */
export const MARGIN_PRESET_VALUES: Record<MarginPreset, number> = {
  compact: 0.5,
  standard: 0.75,
  generous: 1
};

/**
 * Body line height. Unitless multiplier of font size. Headings keep
 * their own line-height (Tailwind `leading-tight` / `leading-snug`)
 * — this knob only affects body paragraphs and bullets.
 */
export const LINE_HEIGHT_PRESETS = ['compact', 'standard', 'relaxed'] as const;
export type LineHeightPreset = (typeof LINE_HEIGHT_PRESETS)[number];

export const LINE_HEIGHT_VALUES: Record<LineHeightPreset, number> = {
  compact: 1.2,
  standard: 1.4,
  relaxed: 1.6
};

/**
 * Body font size in points. The Classic/Modern/Executive/Creative
 * templates render body copy at 11pt by default; Minimal at 10.5pt.
 * The 10 / 11 / 12 ladder covers the standard "ATS-friendly" range
 * recruiters expect (anything below 10pt or above 12pt looks
 * unprofessional).
 */
export const FONT_SIZE_PRESETS = ['small', 'standard', 'large'] as const;
export type FontSizePreset = (typeof FONT_SIZE_PRESETS)[number];

export const FONT_SIZE_VALUES: Record<FontSizePreset, number> = {
  small: 10,
  standard: 11,
  large: 12
};

/**
 * Vertical space between major sections. Rem units (multiplier of the
 * user's root font size). Compact is the minimum that still feels
 * separated; Relaxed gives a more editorial feel.
 */
export const SECTION_SPACING_PRESETS = ['compact', 'standard', 'relaxed'] as const;
export type SectionSpacingPreset = (typeof SECTION_SPACING_PRESETS)[number];

export const SECTION_SPACING_VALUES: Record<SectionSpacingPreset, string> = {
  compact: '0.75rem',
  standard: '1.25rem',
  relaxed: '2rem'
};

/* ─── Zod schema ──────────────────────────────────────────────────────── */

export const printSettingsSchema = z.object({
  margin: z.enum(MARGIN_PRESETS),
  lineHeight: z.enum(LINE_HEIGHT_PRESETS),
  fontSize: z.enum(FONT_SIZE_PRESETS),
  sectionSpacing: z.enum(SECTION_SPACING_PRESETS)
});

export type PrintSettings = z.infer<typeof printSettingsSchema>;

/**
 * Defaults — the values a fresh resume row gets written with, and the
 * values the popover seeds on first open. `Standard` across the board.
 */
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  margin: 'standard',
  lineHeight: 'standard',
  fontSize: 'standard',
  sectionSpacing: 'standard'
};

/**
 * The name of the JSONB column on the `resumes` row.
 *
 * Drizzle uses camelCase for the TS property and snake_case for the SQL
 * column. Keep them paired — see `lib/db/schema.ts` for the column
 * definition.
 */
export const PRINT_SETTINGS_COLUMN = 'printSettings';

/**
 * Read printSettings off a resume-shaped object, falling back to defaults
 * if missing or invalid. Always returns a usable `PrintSettings` —
 * callers never have to null-check.
 *
 * Why a separate helper instead of `.parse()` inline: future schema
 * versions can add fields. The fallback guarantees a stale or
 * hand-edited JSONB blob doesn't take down the popover.
 */
export function coercePrintSettings(value: unknown): PrintSettings {
  if (!value || typeof value !== 'object') return DEFAULT_PRINT_SETTINGS;
  const parsed = printSettingsSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_PRINT_SETTINGS;
  return parsed.data;
}

/* ─── CSS-var mapping ────────────────────────────────────────────────── */

/**
 * Convert print settings to a record of CSS custom properties. The
 * printable wrapper element gets these as inline `style`, so each
 * template picks them up via cascade without per-template rewrites.
 *
 * The keys are the contract consumed by `app/globals.css`:
 *   `--resume-margin`     → `@page { margin }`
 *   `--resume-line-height`→ `.printable { line-height }`
 *   `--resume-font-size`  → `.printable { font-size }`
 *   `--resume-section-spacing` → `.printable section { margin-bottom }`
 */
export function printSettingsToCssVars(
  settings: PrintSettings
): CSSProperties {
  return {
    // CSS custom properties — React's CSSProperties type doesn't know
    // about them, so we cast the values to `string` to satisfy the
    // `Properties<string | number, string & {}>` constraint. The string
    // values are valid CSS (lengths, unitless numbers, color functions,
    // etc. — see each field's preset above).
    '--resume-margin': `${MARGIN_PRESET_VALUES[settings.margin]}in`,
    '--resume-line-height': LINE_HEIGHT_VALUES[settings.lineHeight],
    '--resume-font-size': `${FONT_SIZE_VALUES[settings.fontSize]}pt`,
    '--resume-section-spacing':
      SECTION_SPACING_VALUES[settings.sectionSpacing]
  } as CSSProperties;
}

/* ─── Server-action input schema ────────────────────────────────────── */

export const updatePrintSettingsInputSchema = z.object({
  resumeId: z.string().min(1, 'Resume id is required'),
  settings: printSettingsSchema
});
export type UpdatePrintSettingsInput = z.infer<
  typeof updatePrintSettingsInputSchema
>;