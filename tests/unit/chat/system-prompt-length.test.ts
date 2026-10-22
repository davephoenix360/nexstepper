/**
 * Tests for the length advice in the chat system prompt.
 *
 * The assistant cannot render the document, so everything it says about
 * page length is either a measurement or a guess. These tests make sure
 * it is the measurement, and that the prompt tells the model to quote
 * the number it was given rather than improvising one.
 *
 * The tables in the prompt are GENERATED from real printed resumes (see
 * `scripts/measure-page-counts.cjs`), so a regression here means either
 * the prompt stopped using the generated data, or the measurement
 * harness broke and the generated tables went stale.
 */

import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import {
  PAGE_FIT_TABLE,
  ROLES_THAT_FIT
} from '@/lib/chat/page-fit.generated';
import { SECTION_SPACE_TABLE } from '@/lib/chat/section-space.generated';
import { blankResumeData } from '@/lib/resume-schema';

const TEMPLATE_LABEL: Record<string, string> = {
  classic: 'Classic',
  minimal: 'Minimal',
  modern: 'Modern',
  jake: 'Jake',
  executive: 'Executive',
  creative: 'Creative'
};

function prompt(): string {
  return buildSystemPrompt(blankResumeData());
}

describe('the system prompt carries the measured page-length data', () => {
  it('includes the generated page-fit table verbatim', () => {
    expect(prompt()).toContain(PAGE_FIT_TABLE);
  });

  it('includes the generated section-space table verbatim', () => {
    expect(prompt()).toContain(SECTION_SPACE_TABLE);
  });

  it('takes its role counts from the measured data, not from prose', () => {
    // The old prompt carried a hand-written table ("Classic | 2 roles |
    // 3 roles | 4 roles"). It was measured at the wrong width and with
    // the wrong margin, and nothing would have flagged it. The
    // generated table replaces it — so the numbers in the prompt have
    // to be exactly the measured ones.
    const text = prompt();
    for (const [template, bySetting] of Object.entries(ROLES_THAT_FIT)) {
      const label = TEMPLATE_LABEL[template] ?? template;
      const cell = bySetting.standard;
      expect(
        text,
        `${label} should report ${cell} roles at default settings`
      ).toContain(
        `| ${label} | ${cell} role${cell === 1 ? '' : 's'} | ${bySetting.compact} role${
          bySetting.compact === 1 ? '' : 's'
        } | ${bySetting.tightest} role${bySetting.tightest === 1 ? '' : 's'} |`
      );
    }
  });

  it('names the measurement tool so the model can get a real number', () => {
    expect(prompt()).toContain('estimatePageCount');
  });

  it('tells the model to measure rather than guess', () => {
    const text = prompt();
    expect(text).toMatch(/always measure before you advise/i);
    expect(text).toMatch(/do not guess a page count/i);
  });

  it('keeps the free-levers-first ordering', () => {
    const text = prompt();
    const hide = text.indexOf('Hide a section first');
    const cut = text.indexOf('Cut content second');
    const tighten = text.indexOf('Tighten the layout last');
    expect(hide).toBeGreaterThan(-1);
    expect(cut).toBeGreaterThan(hide);
    expect(tighten).toBeGreaterThan(cut);
  });

  it('still says "about" rather than promising a page count', () => {
    expect(prompt()).toMatch(/possibly spilling to two/i);
  });
});

describe('the generated tables say what they claim', () => {
  it('the page-fit table states the formula and the measured widths', () => {
    expect(PAGE_FIT_TABLE).toContain('height_inches');
    expect(PAGE_FIT_TABLE).toContain('perBullet');
    expect(PAGE_FIT_TABLE).toContain('usable_inches_per_page');
  });

  it('the section-space table names the usable page height', () => {
    expect(SECTION_SPACE_TABLE).toContain('9.5 inches');
  });
});
