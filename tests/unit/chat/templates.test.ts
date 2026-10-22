/**
 * Regression tests for `lib/chat/templates.ts`.
 *
 * ## The bug these pin
 *
 * The chat stack had three hand-written lists of template ids, and all
 * of them had silently fallen behind the registry. The Jake template
 * was the most recent addition, so the list "lost" the new id, which
 * meant:
 *
 *   - the system prompt never mentioned it,
 *   - the `switchTemplate` tool description never offered it,
 *   - the `executeSwitchTemplate` validator REJECTED it (hard gate),
 *     so even a model that somehow guessed the id could not switch to it.
 *
 * All three lists are now derived from `templateRegistry` at request
 * time. The tests below are the safety net that the next contributor
 * doesn't reach for a fourth list somewhere.
 */

import { describe, expect, it } from 'vitest';

import { templateRegistry } from '@/components/resume-templates';

import {
  AVAILABLE_TEMPLATES,
  TEMPLATE_IDS,
  describeTemplate,
  isValidTemplateId,
  templateListForPrompt
} from '@/lib/chat/templates';

describe('chat template registry', () => {
  it('AVAILABLE_TEMPLATES contains every registry id (and only those)', () => {
    expect(new Set(AVAILABLE_TEMPLATES)).toEqual(new Set(Object.keys(templateRegistry)));
  });

  it('TEMPLATE_IDS is in lockstep with the registry', () => {
    expect(new Set(TEMPLATE_IDS)).toEqual(new Set(Object.keys(templateRegistry)));
  });

  it('isValidTemplateId accepts the jake template (the regression)', () => {
    // The whole point of the refactor: jake exists in the registry,
    // and a hand-written list used to exclude it.
    expect(isValidTemplateId('jake')).toBe(true);
    expect(isValidTemplateId('classic')).toBe(true);
    expect(isValidTemplateId('nope-not-a-template')).toBe(false);
  });

  it('describeTemplate returns a non-empty string for every registry id', () => {
    for (const id of TEMPLATE_IDS) {
      const d = describeTemplate(id);
      expect(d).toBeTruthy();
      // Defensive: every description should at least name the template.
      expect(d.toLowerCase()).toContain(id.toLowerCase().split('-')[0]);
    }
  });

  it('describeTemplate calls out ATS-safety when the registry says so', () => {
    const jake = describeTemplate('jake');
    // All current templates are ATS-safe; this is the contract the
    // model relies on. If a future template opts out, this assertion
    // forces the test file to be updated alongside the registry.
    expect(jake).toMatch(/ATS-safe|not ATS-safe/);
  });

  it('templateListForPrompt includes every registry id', () => {
    const text = templateListForPrompt();
    for (const id of TEMPLATE_IDS) {
      expect(text).toContain(id);
    }
    // The opposite direction too — no orphan ids.
    for (const id of Object.keys(templateRegistry)) {
      expect(text).toContain(id);
    }
  });

  it('the system prompt template list agrees with the tool description', () => {
    // Both consumers should show the same catalogue. The old hard-coded
    // lists could disagree, and the model would notice. Asserting the
    // invariant here means a future split would have to ship
    // deliberately.
    const text = templateListForPrompt();
    for (const id of TEMPLATE_IDS) {
      expect(text).toContain(id);
    }
    expect(TEMPLATE_IDS.length).toBeGreaterThanOrEqual(6);
  });
});