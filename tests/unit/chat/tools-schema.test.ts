/**
 * Tests for the chat tool schemas (lib/chat/tools/types.ts).
 *
 * The point of the surgical rewrite is that the model is never asked to
 * identify anything by an opaque id and never has to echo existing content
 * back. These tests lock that contract in, because a regression here is
 * invisible until a user watches the agent silently fail to edit anything.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { templateRegistry } from '@/components/resume-templates';

import { CHAT_TOOLS } from '@/lib/chat/tools';

import {
  CLEARABLE_SECTIONS,
  editResumeArgsSchema,
  getAtsScoreArgsSchema,
  getPrintSettingsArgsSchema,
  switchTemplateArgsSchema,
  updatePrintSettingsArgsSchema,
  validateResumeArgsSchema
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
  it('accepts every template in the registry', () => {
    // Derived from `templateRegistry`, not a hand-written list. The old
    // list was a `z.enum([...])` of five ids, so the model could not even
    // NAME a template that was missing from it — the AI SDK validates
    // tool arguments against this schema before the executor ever runs.
    for (const id of Object.keys(templateRegistry)) {
      const parsed = switchTemplateArgsSchema.safeParse({ templateId: id });
      expect(parsed.success, `templateId: ${id}`).toBe(true);
    }
  });

  it('accepts the jake template (the regression)', () => {
    expect(switchTemplateArgsSchema.safeParse({ templateId: 'jake' }).success).toBe(true);
  });

  it('rejects a template that does not exist', () => {
    expect(switchTemplateArgsSchema.safeParse({ templateId: 'neon' }).success).toBe(false);
  });
});

describe('getAtsScoreArgsSchema', () => {
  it('accepts an empty call — the tool targets the attached resume', () => {
    const parsed = getAtsScoreArgsSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('rejects a resume id, so the agent cannot ask about a resume it cannot see', () => {
    // The chat session is attached to one resume. Accepting an id would
    // let the model request a score for a document it has no context for.
    expect(getAtsScoreArgsSchema.safeParse({ resumeId: 'r-1' }).success).toBe(false);
  });
});

describe('every tool the chat advertises is dispatchable', () => {
  it('registers all six tools with a description and a schema', () => {
    // The AI SDK validates arguments against these schemas before the
    // executor runs, so a tool that is described but not registered (or
    // registered but not described) is a silent dead end.
    expect(Object.keys(CHAT_TOOLS).sort()).toEqual([
      'editResume',
      'getAtsScore',
      'getPrintSettings',
      'switchTemplate',
      'updatePrintSettings',
      'validateResume'
    ]);
    for (const [name, def] of Object.entries(CHAT_TOOLS)) {
      expect(def.description, `${name} needs a description`).toBeTruthy();
      expect(def.parameters, `${name} needs a schema`).toBeDefined();
    }
  });

  it('executeTool dispatches every registered tool', () => {
    // A tool the model can call but the dispatcher does not know about
    // returns "Unknown tool" at runtime — long after the prompt shipped.
    const source = readFileSync(
      resolve(process.cwd(), 'lib/chat/execute-tool.ts'),
      'utf8'
    );
    for (const name of Object.keys(CHAT_TOOLS)) {
      expect(source, `execute-tool.ts must handle ${name}`).toContain(
        `case '${name}'`
      );
    }
  });
});

describe('getPrintSettingsArgsSchema', () => {
  it('accepts an empty call — it reads the attached resume', () => {
    expect(getPrintSettingsArgsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects arguments', () => {
    expect(getPrintSettingsArgsSchema.safeParse({ resumeId: 'r-1' }).success).toBe(false);
  });
});

describe('updatePrintSettingsArgsSchema', () => {
  it('accepts a partial update — omitted keys keep their current value', () => {
    // The agent usually wants to change ONE knob ("make it fit on one
    // page"). A full-object schema would be a trap: the model would
    // have to restate every setting it did not mean to change.
    const parsed = updatePrintSettingsArgsSchema.safeParse({ margin: 'compact' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.margin).toBe('compact');
      expect(parsed.data.lineHeight).toBeUndefined();
    }
  });

  it('rejects an unknown value for a known key', () => {
    expect(
      updatePrintSettingsArgsSchema.safeParse({ margin: 'enormous' }).success
    ).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(
      updatePrintSettingsArgsSchema.safeParse({ font: 'huge' }).success
    ).toBe(false);
  });

  it('accepts every documented preset value', () => {
    for (const margin of ['compact', 'standard', 'generous']) {
      expect(updatePrintSettingsArgsSchema.safeParse({ margin }).success).toBe(true);
    }
    for (const lineHeight of ['compact', 'standard', 'relaxed']) {
      expect(updatePrintSettingsArgsSchema.safeParse({ lineHeight }).success).toBe(true);
    }
    for (const fontSize of ['small', 'standard', 'large']) {
      expect(updatePrintSettingsArgsSchema.safeParse({ fontSize }).success).toBe(true);
    }
    for (const sectionSpacing of ['compact', 'standard', 'relaxed']) {
      expect(updatePrintSettingsArgsSchema.safeParse({ sectionSpacing }).success).toBe(true);
    }
  });
});

describe('validateResumeArgsSchema', () => {
  it('accepts an empty call — validate the resume as stored', () => {
    expect(validateResumeArgsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a proposedEdit using the SAME schema as editResume', () => {
    // The whole point is that the agent can dry-run exactly the call it
    // is about to make. If the two schemas drift apart, the dry run
    // stops being meaningful.
    const proposedEdit = {
      updateWork: [
        { matchCompany: 'Acme', set: { title: 'Senior Engineer' } }
      ]
    };
    const parsed = validateResumeArgsSchema.safeParse({ proposedEdit });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(editResumeArgsSchema.safeParse(parsed.data.proposedEdit).success).toBe(
        true
      );
    }
  });

  it('rejects a proposedEdit that is not a valid editResume payload', () => {
    // `updateWork` is an ARRAY of operations; a bare object is the wrong
    // shape and must be rejected rather than silently coerced.
    expect(
      validateResumeArgsSchema.safeParse({
        proposedEdit: { updateWork: { matchCompany: 'Acme' } }
      }).success
    ).toBe(false);
  });
});
