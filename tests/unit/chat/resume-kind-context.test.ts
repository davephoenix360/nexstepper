/**
 * Tests for the chat system prompt's resume-kind awareness
 * (docs/plans/chat-agent-v2.md follow-up).
 *
 * Gap this closes: the assistant had no idea whether it was looking at a
 * master resume or a variant, so it could not answer "is this my master?"
 * and could not give kind-correct advice. A master is meant to stay general; a
 * variant is deliberately narrow.
 */

import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { blankResumeData } from '@/lib/resume-schema';

const master = () =>
  buildSystemPrompt(blankResumeData(), undefined, null, {
    isMaster: true,
    variantCount: 3
  });

const variant = () =>
  buildSystemPrompt(blankResumeData(), undefined, null, {
    isMaster: false,
    parentResumeName: 'Backend Engineer — Master',
    variantCount: 2
  });

describe('buildSystemPrompt — resume kind', () => {
  it('says so when the resume is a master', () => {
    const sp = master();
    expect(sp).toMatch(/MASTER RESUME/);
    expect(sp).toMatch(/Which resume you are editing/i);
  });

  it('tells the model to keep a master general', () => {
    // The practical instruction: tailoring belongs in variants, not the master.
    expect(master()).toMatch(/Keep it broad and generic/i);
  });

  it('says so when the resume is a variant, and names the parent', () => {
    const sp = variant();
    expect(sp).toMatch(/VARIANT/);
    expect(sp).toMatch(/Backend Engineer — Master/);
  });

  it('tells the model edits here do not affect the master', () => {
    expect(variant()).toMatch(/do not affect the master/i);
  });

  it('reports how many variants hang off the master', () => {
    expect(master()).toMatch(/3 variant/);
    expect(variant()).toMatch(/parent master currently has 2 variant/);
  });

  it('omits the whole section when no kind is supplied', () => {
    // Backwards compatible: the parameter is optional, and a caller that
    // doesn't know the kind shouldn't get a confident wrong answer.
    const sp = buildSystemPrompt(blankResumeData());
    expect(sp).not.toMatch(/Which resume you are editing/i);
    expect(sp).not.toMatch(/MASTER RESUME/);
  });

  it('never emits a bare "VARIANT" label for a master', () => {
    // Guards the template interpolation: `isMaster ? A : B` inverted is the
    // easy mistake here and would be very hard to spot by reading.
    expect(master()).not.toMatch(/^VARIANT$/m);
  });

  it('still contains the injection guard regardless of kind', () => {
    for (const sp of [master(), variant()]) {
      expect(sp).toMatch(/Instruction hierarchy/);
      expect(sp).toMatch(/only the user's/i);
      expect(sp).toContain('<untrusted_resume>');
    }
  });
});
