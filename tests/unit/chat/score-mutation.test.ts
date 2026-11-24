import { describe, expect, it } from 'vitest';

import {
  editResumeHasReplaceWorkHighlight,
  toolResultSucceeded
} from '@/lib/chat/score-mutation';

describe('editResumeHasReplaceWorkHighlight', () => {
  it('recognises a surgical bullet edit', () => {
    expect(
      editResumeHasReplaceWorkHighlight({
        replaceWorkHighlight: [{ oldText: 'worked on', newText: 'Led' }]
      })
    ).toBe(true);
  });

  it('ignores an empty or absent operation list', () => {
    expect(editResumeHasReplaceWorkHighlight({ replaceWorkHighlight: [] })).toBe(false);
    expect(editResumeHasReplaceWorkHighlight({ setBasics: { summary: 'New summary' } })).toBe(false);
  });

  it('ignores non-object input', () => {
    expect(editResumeHasReplaceWorkHighlight(null)).toBe(false);
    expect(editResumeHasReplaceWorkHighlight('replaceWorkHighlight')).toBe(false);
  });
});

describe('toolResultSucceeded', () => {
  it('accepts the direct tool return shape', () => {
    expect(toolResultSucceeded({ ok: true, result: 'Saved as revision abc.' })).toBe(true);
  });

  it('accepts the AI SDK json wrapper', () => {
    expect(
      toolResultSucceeded({
        type: 'json',
        value: { ok: true, result: 'Saved as revision abc.' }
      })
    ).toBe(true);
  });

  it('accepts a JSON-string result', () => {
    expect(toolResultSucceeded('{"ok":true,"result":"Saved"}')).toBe(true);
  });

  it('does not treat a failed or no-op result as success', () => {
    expect(toolResultSucceeded({ ok: false, error: 'No changes were applied.' })).toBe(false);
    expect(toolResultSucceeded({ type: 'json', value: { ok: false } })).toBe(false);
  });

  it('does not treat malformed or unrelated output as success', () => {
    expect(toolResultSucceeded('not json')).toBe(false);
    expect(toolResultSucceeded(undefined)).toBe(false);
    expect(toolResultSucceeded({ result: 'Saved' })).toBe(false);
  });
});
