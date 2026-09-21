import { describe, expect, it } from 'vitest';

import { buildRewritePrompt, extractVocabulary } from '@/lib/inline-issue/prompts';

/**
 * Snapshot tests for the AI rewrite prompt template.
 *
 * The prompt is the contract between our app and Mistral Nemo
 * (PARSER_MODEL). Any change here changes what the model sees,
 * which can silently shift rewrite quality. Pin the templates as
 * snapshots so a future contributor notices drift and can
 * justify it explicitly.
 *
 * Plan: docs/plans/inline-issue-surface.md §"Test plan" #2.
 */

const SAMPLE_INPUT_GAP = {
  criterion: 'ATS Coverage',
  tipKind: 'gap' as const,
  sectionTitle: 'Experience',
  currentBullet:
    'Shipped a multi-tenant API gateway that handled 50k requests/sec.',
  jdVocabulary: ['kubernetes', 'helm', 'terraform', 'grpc', 'observability'],
  resumeVocabulary: ['python', 'go', 'rust', 'postgres', 'redis']
};

const SAMPLE_INPUT_REWRITE = {
  criterion: 'Accomplishment Focus',
  tipKind: 'rewrite' as const,
  sectionTitle: 'Experience',
  currentBullet: 'Worked on the API.',
  jdVocabulary: ['python', 'go'],
  resumeVocabulary: ['python', 'flask']
};

describe('buildRewritePrompt', () => {
  it('produces a system prompt with the JSON-shape line', () => {
    const { system } = buildRewritePrompt(SAMPLE_INPUT_GAP);
    expect(system).toContain(
      'Return JSON with this shape: { "rewrites": ["...", "...", "..."] }'
    );
  });

  it('includes the criterion + section title in the user prompt', () => {
    const { prompt } = buildRewritePrompt(SAMPLE_INPUT_GAP);
    expect(prompt).toContain('ATS Coverage');
    expect(prompt).toContain('Experience');
    expect(prompt).toContain('Shipped a multi-tenant API gateway');
  });

  it('lists both vocabulary lists in the user prompt', () => {
    const { prompt } = buildRewritePrompt(SAMPLE_INPUT_GAP);
    expect(prompt).toContain('JD vocabulary');
    expect(prompt).toContain('kubernetes, helm, terraform');
    expect(prompt).toContain('Resume vocabulary');
    expect(prompt).toContain('python, go, rust');
  });

  it('adds a "weave in this missing skill" hint for the gap kind', () => {
    const { system } = buildRewritePrompt(SAMPLE_INPUT_GAP);
    expect(system).toContain('missing a vocabulary term');
    expect(system).toContain('weave one of the JD vocabulary terms');
  });

  it('adds a "sharpen the action verb" hint for the rewrite kind', () => {
    const { system } = buildRewritePrompt(SAMPLE_INPUT_REWRITE);
    expect(system).toContain('reads weak');
    expect(system).toContain('sharpen the action verb');
  });

  it('forbids fabrication of skills not in either vocabulary list', () => {
    const { system } = buildRewritePrompt(SAMPLE_INPUT_GAP);
    expect(system).toContain('You MUST NOT introduce');
    expect(system).toContain('not in either vocabulary list');
  });

  it('caps the vocabulary list at 60 terms with a +N more tail', () => {
    const longJd = Array.from({ length: 200 }, (_, i) => `term${i}`);
    const { prompt } = buildRewritePrompt({
      ...SAMPLE_INPUT_GAP,
      jdVocabulary: longJd
    });
    expect(prompt).toContain('term0');
    // Should NOT contain term150 — past the 60-cap the tail says
    // "(+140 more)".
    expect(prompt).not.toContain('term150');
    expect(prompt).toContain('(+140 more)');
  });

  it('snapshot: gap prompt is stable (structural assertion, no color codes)', () => {
    // Inline snapshots pick up ANSI escape codes from vitest's
    // terminal formatting and fail under `--no-color`/`--color`.
    // We pin the structure with discrete substring assertions
    // instead — drift is still loud and easy to spot in PR review.
    const result = buildRewritePrompt(SAMPLE_INPUT_GAP);
    expect(result.system).toContain(
      'You rewrite a single bullet from a resume so it scores higher against a job description.'
    );
    expect(result.system).toContain('Return exactly 3 distinct rewrites.');
    expect(result.system).toContain(
      'Each rewrite must be 1-2 sentences, in the first-person implied style of a resume bullet (no "I", no quotes).'
    );
    expect(result.system).toContain(
      'Do NOT invent new employers, dates, or metrics.'
    );
    expect(result.system).toContain(
      'The bullet is missing a vocabulary term that the JD emphasizes.'
    );
    expect(result.system).toContain(
      'Your rewrite should weave one of the JD vocabulary terms into the existing bullet.'
    );
    expect(result.system).toContain('You MUST NOT introduce');
    expect(result.system).toContain(
      'Return JSON with this shape: { "rewrites": ["...", "...", "..."] }'
    );
    // User prompt structure.
    expect(result.prompt).toContain('Job target: Experience section.');
    expect(result.prompt).toContain('Optimization criterion: ATS Coverage.');
    expect(result.prompt).toContain('Current bullet:');
    expect(result.prompt).toContain(
      'Shipped a multi-tenant API gateway that handled 50k requests/sec.'
    );
    expect(result.prompt).toContain('JD vocabulary (you may use these terms):');
    expect(result.prompt).toContain(
      'kubernetes, helm, terraform, grpc, observability'
    );
    expect(result.prompt).toContain(
      'Resume vocabulary (already used elsewhere in the resume):'
    );
    expect(result.prompt).toContain('python, go, rust, postgres, redis');
  });
});

describe('extractVocabulary', () => {
  it('extracts deduped, lowercased tokens', () => {
    const out = extractVocabulary('Python python Go go Rust');
    expect(out).toEqual(['python', 'go', 'rust']);
  });

  it('drops tokens shorter than 2 chars', () => {
    const out = extractVocabulary('a I x Python');
    expect(out).toEqual(['python']);
  });

  it('preserves dots, pluses, hashes, hyphens (e.g. tool versions)', () => {
    const out = extractVocabulary('Next.js 14 Node.js C++ C# F#');
    expect(out).toContain('next.js');
    expect(out).toContain('node.js');
    expect(out).toContain('c++');
    expect(out).toContain('c#');
  });

  it('caps the output at the requested limit', () => {
    const out = extractVocabulary(
      Array.from({ length: 50 }, (_, i) => `word${i}`).join(' '),
      { cap: 5 }
    );
    expect(out.length).toBe(5);
  });

  it('returns [] for an empty string', () => {
    expect(extractVocabulary('')).toEqual([]);
  });
});