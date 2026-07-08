import { describe, expect, it } from 'vitest';

import {
  SECTION_DIALOGS,
  _arraySectionHelper
} from '@/components/editable/section-schemas';
import { basicsSchema, blankResumeData } from '@/lib/resume-schema';

/**
 * Tests for the section-edit dialog registry. Currently the registry
 * has a single entry (basics) because every other section is
 * inline-editable in the WYSIWYG view. These tests pin down:
 *
 *  - The registry's shape — every entry must carry the contract the
 *    EditSectionDialog component relies on.
 *  - The basics dialog's `toItems` / `fromItems` are inverses — if
 *    someone breaks the identity assumption, the dialog starts losing
 *    user input on save.
 *  - The array-section helper produces a dialog whose wrapped
 *    `{ items: [...] }` schema round-trips arrays correctly.
 *
 * If you add a new dialog row, this test should grow a new entry.
 */

describe('SECTION_DIALOGS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SECTION_DIALOGS)).toBe(true);
    expect(SECTION_DIALOGS.length).toBeGreaterThan(0);
  });

  it('every entry has the required SectionDialog contract', () => {
    for (const entry of SECTION_DIALOGS) {
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.path).toBe('string');
      expect(entry.path.startsWith('sections.')).toBe(true);
      expect(entry.schema).toBeDefined();
      expect(typeof entry.toItems).toBe('function');
      expect(typeof entry.fromItems).toBe('function');
    }
  });

  it('every path is unique across entries', () => {
    // Two dialogs writing to the same path would clobber each other.
    const paths = SECTION_DIALOGS.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('the basics dialog is registered with path sections.basics', () => {
    const basics = SECTION_DIALOGS.find((e) => e.path === 'sections.basics');
    expect(basics).toBeDefined();
    expect(basics?.label).toBe('Profile (basics)');
  });

  it('the basics dialog schema parses a fully-populated basics object', () => {
    // The dialog wraps the basics object directly (no `{ items: ... }`
    // envelope because basics is already an object). SchemaForm submits
    // through this schema, so it must accept what we hand it.
    const basics = blankResumeData().sections.basics;
    expect(basicsSchema.safeParse(basics).success).toBe(true);
  });
});

describe('basics dialog: toItems/fromItems inverse', () => {
  const basics = SECTION_DIALOGS.find((e) => e.path === 'sections.basics');
  if (!basics) {
    throw new Error('Test precondition failed: basics dialog not registered');
  }

  it('toItems + fromItems round-trip preserves the basics object', () => {
    const current = blankResumeData().sections.basics;
    const dialogDefaults = basics.toItems(current);
    const reconstructed = basics.fromItems(dialogDefaults);
    expect(reconstructed).toEqual(current);
  });

  it('fromItems is identity (basics is already an object shape)', () => {
    // The basics dialog is structurally a pass-through — SchemaForm
    // submits the section shape directly, fromItems just hands it
    // back. Lock that contract: if someone "helpfully" wraps it in
    // `{ items: ... }`, this test fails.
    const someData = { name: 'D', email: '' };
    expect(basics.fromItems(someData)).toBe(someData);
  });

  it('toItems tolerates undefined currentValue', () => {
    // The dialog is sometimes opened before RHF has a value at the
    // path (rare race on first edit). Should fall back to {}.
    expect(basics.toItems(undefined)).toEqual({});
  });
});

describe('arraySection helper', () => {
  // `_arraySectionHelper` is the bare factory used by future array-
  // shaped dialog rows. It wraps an array in `{ items: [...] }` so
  // SchemaForm (which expects a ZodObject) can render it. We test the
  // wrapping shape here so a future contributor who plumbs it in for
  // a real section has a regression net.

  const array = _arraySectionHelper('Test', 'sections.test', 'desc');

  it('produces a dialog with a non-empty label + path', () => {
    expect(array.label).toBe('Test');
    expect(array.path).toBe('sections.test');
    expect(array.description).toBe('desc');
  });

  it('toItems wraps the current value in { items: [...] }', () => {
    expect(array.toItems([{ a: 1 }, { b: 2 }])).toEqual({
      items: [{ a: 1 }, { b: 2 }]
    });
  });

  it('toItems returns an empty items array when currentValue is missing', () => {
    expect(array.toItems(undefined)).toEqual({ items: [] });
    expect(array.toItems(null)).toEqual({ items: [] });
  });

  it('fromItems unwraps the { items } envelope back to the array', () => {
    expect(array.fromItems({ items: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('fromItems returns [] when the envelope is missing items', () => {
    // Defensive — a malformed form could submit without an `items`
    // key. The `?? []` short-circuit handles the undefined access.
    expect(array.fromItems({})).toEqual([]);
  });

  it('fromItems is defensive against null/undefined inputs', () => {
    // Optional-chained `.items` access so malformed callers (e.g. a
    // future caller passing `null`) don't throw before the `?? []`
    // fallback fires. SchemaForm never feeds us `null` in practice,
    // but the helper is exported — this is the floor.
    expect(array.fromItems(null as never)).toEqual([]);
    expect(array.fromItems(undefined as never)).toEqual([]);
  });

  it('toItems + fromItems are inverses on non-empty arrays', () => {
    const original = [{ x: 'a' }, { y: 'b' }];
    expect(array.fromItems(array.toItems(original))).toEqual(original);
  });
});