import { describe, expect, it } from 'vitest';

import {
  AI_SUBPROCESSORS_2026_10_21,
  SUBPROCESSOR_NOTICE_SUBJECT,
  buildSubprocessorNoticeHtml,
  buildSubprocessorNoticeText
} from '@/lib/email/subprocessor-notice';

/**
 * The subprocessor notice has one job that is easy to get subtly wrong:
 * it must read as a NOTICE, not as an announcement.
 *
 * The first draft said "we switched the model" because the swap had
 * already been merged on a branch. But the privacy policy promises 30
 * days' notice BEFORE the change takes effect — so a past-tense email
 * sent on the day it lands describes something that hasn't happened yet
 * for everyone still on the old provider. The founder caught this on
 * review. These tests pin the tense so it can't drift back.
 */

const ARGS = {
  name: 'Ada Lovelace',
  privacyUrl: 'https://www.nexstepper.com/privacy',
  effectiveDate: 'October 21, 2026'
};

describe('subprocessor notice — tense', () => {
  it('is forward-looking in the plain-text version', () => {
    const text = buildSubprocessorNoticeText(ARGS);
    expect(text).toContain('we are switching the model');
    expect(text).not.toMatch(/we switched the model/i);
  });

  it('is forward-looking in the HTML version', () => {
    const html = buildSubprocessorNoticeHtml(ARGS);
    expect(html).toContain('we are\n                  switching the model');
    expect(html).not.toMatch(/we switched/i);
  });

  it('describes future handling of resume content, not past handling', () => {
    const text = buildSubprocessorNoticeText(ARGS);
    expect(text).toContain('will be processed by Anthropic');
    expect(text).not.toMatch(/are processed by Anthropic/);
  });

  it('does not promise the change is already done', () => {
    // "the provider we use now" is the tell — a past-tense notice said
    // "we used before", which implies the switch already happened.
    expect(buildSubprocessorNoticeText(ARGS)).toContain('the provider we use now');
  });
});

describe('subprocessor notice — content', () => {
  it('lists every subprocessor the privacy policy names', () => {
    const text = buildSubprocessorNoticeText(ARGS);
    for (const p of AI_SUBPROCESSORS_2026_10_21) {
      expect(text).toContain(p.name);
    }
    expect(AI_SUBPROCESSORS_2026_10_21.length).toBe(7);
  });

  it('names Anthropic and marks it as the chat assistant', () => {
    const text = buildSubprocessorNoticeText(ARGS);
    expect(text).toContain('Anthropic — AI chat assistant');
  });

  it('offers account deletion as an opt-out, with a way to ask', () => {
    expect(buildSubprocessorNoticeText(ARGS)).toContain(
      'we will delete your account and data'
    );
  });

  it('links the full policy', () => {
    expect(buildSubprocessorNoticeText(ARGS)).toContain(ARGS.privacyUrl);
    expect(buildSubprocessorNoticeHtml(ARGS)).toContain(ARGS.privacyUrl);
  });

  it('greets by name when we have one, and degrades gracefully without', () => {
    expect(buildSubprocessorNoticeText(ARGS)).toContain('Hi Ada Lovelace,');
    const anon = buildSubprocessorNoticeText({ ...ARGS, name: null });
    expect(anon).toContain('Hi there,');
    // A blank-string name should NOT produce "Hi ,"
    const blank = buildSubprocessorNoticeText({ ...ARGS, name: '   ' });
    expect(blank).toContain('Hi there,');
    expect(blank).not.toContain('Hi ,');
  });

  it('escapes a name containing HTML', () => {
    const html = buildSubprocessorNoticeHtml({ ...ARGS, name: '<script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});