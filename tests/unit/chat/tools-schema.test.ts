/**
 * Tests for the chat tool schemas (lib/chat/tools/types.ts).
 *
 * The point of the surgical rewrite is that the model is never asked to
 * identify anything by an opaque id and never has to echo existing content
 * back. These tests lock that contract in, because a regression here is
 * invisible until a user watches the agent silently fail to edit anything.
 */

import { describe, expect, it } from 'vitest';

import {
  CLEARABLE_SECTIONS,
  editResumeArgsSchema,
  switchTemplateArgsSchema
} from '@/lib/chat/tools/types';

describe('editResumeArgsSchema — no identifier the model cannot see', () => {
  it('accepts a bare setBasics with no ids anywhere', () => {
    const parsed = editResumeArgsSchema.safeParse({
      setBasics: { summary: 'A sharper summary.' }
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.setBasics?.summary).toBe('A sharper summary.');
  });

  it('accepts a full multi-operation call with nothing required', () => {
    const parsed = editResumeArgsSchema.safeParse({
      setBasics: { summary: 'New.', headline: 'Staff Engineer' },
      addWork: [{ company: 'Globex', role: 'Engineer' }],
      updateWork: [{ matchCompany: 'Acme', set: { role: 'Senior' } }],
      addSkills: [{ category: 'Backend', keywords: ['Go'] }],
      removeWork: [{ company: 'OldCo' }],
      clearSection: ['projects']
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a role with no company rather than writing a broken entry', () => {
    const parsed = editResumeArgsSchema.safeParse({
      addWork: [{ role: 'Engineer' }]
    });

    expect(parsed.success).toBe(false);
  });

  it('preserves skill keywords rather than collapsing them to a name+level pair', () => {
    // The old shape was `{id, name, level}`, so keywords never round-tripped
    // and the category rendered blank in the PDF.
    const parsed = editResumeArgsSchema.safeParse({
      addSkills: [{ category: 'Backend', keywords: ['Go', 'Postgres', 'Redis'] }]
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.addSkills?.[0].keywords).toEqual([
      'Go',
      'Postgres',
      'Redis'
    ]);
  });

  it('uses `url` (the real ResumeData key) and not `link`', () => {
    const withUrl = editResumeArgsSchema.safeParse({
      addProject: [{ name: 'Project', url: 'https://example.com' }]
    });
    expect(withUrl.success).toBe(true);
    expect(withUrl.success && withUrl.data.addProject?.[0].url).toBe('https://example.com');
  });

  it('refuses to let the agent clear `basics`', () => {
    // A misparse should never be able to wipe a user's name and contact
    // details as a side effect.
    expect(CLEARABLE_SECTIONS).not.toContain('basics');
    const parsed = editResumeArgsSchema.safeParse({ clearSection: ['basics'] });
    expect(parsed.success).toBe(false);
  });

  it('accepts every advertised clearable section', () => {
    for (const slug of CLEARABLE_SECTIONS) {
      const parsed = editResumeArgsSchema.safeParse({ clearSection: [slug] });
      expect(parsed.success, `clearSection: ${slug}`).toBe(true);
    }
  });

  it('rejects an unknown section slug', () => {
    expect(editResumeArgsSchema.safeParse({ clearSection: ['nonsense'] }).success).toBe(false);
  });
});

describe('switchTemplateArgsSchema', () => {
  it('accepts the five shipped templates', () => {
    for (const id of ['minimal', 'classic', 'executive', 'creative', 'modern']) {
      const parsed = switchTemplateArgsSchema.safeParse({ templateId: id });
      expect(parsed.success, `templateId: ${id}`).toBe(true);
    }
  });

  it('rejects a template that does not exist', () => {
    expect(switchTemplateArgsSchema.safeParse({ templateId: 'neon' }).success).toBe(false);
  });
});
