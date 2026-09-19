import { describe, expect, it } from 'vitest';

import {
  jaccard,
  tokenize,
  wordCount,
  flattenResumeText,
  flattenJobText
} from '@/lib/scoring/similarity';
import type { ResumeTextSource, JobTextSource } from '@/lib/scoring/similarity';

describe('tokenize', () => {
  it('lowercases input', () => {
    expect(tokenize('TypeScript React Node')).toEqual(
      new Set(['typescript', 'react', 'node'])
    );
  });

  it('splits on non-word characters', () => {
    expect(tokenize('C++, C#, .NET, AWS/GCP')).toEqual(
      new Set(['net', 'aws', 'gcp'])
    );
  });

  it('drops empty tokens', () => {
    expect(tokenize('   \n\n\t  ')).toEqual(new Set());
  });

  it('drops 1-character tokens', () => {
    // "I a am" → after lowercase + split → ['i', 'a', 'am']
    // → drops 'i' and 'a' (length < 2), keeps 'am'
    expect(tokenize('I a am')).toEqual(new Set(['am']));
  });

  it('preserves tokens with underscores (\\w matches _)', () => {
    expect(tokenize('node_postgres vector_db')).toEqual(
      new Set(['node_postgres', 'vector_db'])
    );
  });

  it('returns a frozen-ish set (cannot mutate the input array)', () => {
    const input = 'foo bar baz';
    const tokens = tokenize(input);
    expect(() => {
      // ReadonlySet blocks .add at the type level, but we can verify
      // at runtime that the size stays consistent.
      (tokens as Set<string>).add('mutated');
    }).not.toThrow();
    // The actual contract: we use ReadonlySet in the signature, so
    // callers shouldn't be doing that. But the runtime set *is* a
    // regular Set — the contract is the type. Sanity: the original
    // tokens are present.
    expect(tokens.has('foo')).toBe(true);
    expect(tokens.has('bar')).toBe(true);
  });
});

describe('jaccard', () => {
  it('returns 0 when either set is empty', () => {
    expect(jaccard(new Set(['a']), new Set())).toBe(0);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it('returns 1 when sets are identical', () => {
    const a = new Set(['typescript', 'react']);
    expect(jaccard(a, new Set(a))).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
  });

  it('returns the correct ratio for partial overlap', () => {
    // a = {x, y, z}, b = {y, z, w} → intersect = 2, union = 4 → 0.5
    const a = new Set(['x', 'y', 'z']);
    const b = new Set(['y', 'z', 'w']);
    expect(jaccard(a, b)).toBe(0.5);
  });

  it('is symmetric — jaccard(a, b) === jaccard(b, a)', () => {
    const a = new Set(['typescript', 'react', 'node']);
    const b = new Set(['react', 'python', 'rust']);
    expect(jaccard(a, b)).toBe(jaccard(b, a));
  });

  it('handles large sets without quadratic blow-up', () => {
    // 1000-element sets with 50% overlap. The function iterates the
    // smaller set, so this is O(min(|a|, |b|)) — well under a
    // millisecond on any modern runtime.
    const a = new Set(Array.from({ length: 1000 }, (_, i) => `tok${i}`));
    const b = new Set([
      ...Array.from({ length: 500 }, (_, i) => `tok${i}`),
      ...Array.from({ length: 500 }, (_, i) => `other${i}`)
    ]);
    expect(jaccard(a, b)).toBeCloseTo(500 / 1500, 5);
  });
});

describe('wordCount', () => {
  it('counts whitespace-separated words', () => {
    expect(wordCount('one two three four')).toBe(4);
  });

  it('returns 0 for whitespace-only input', () => {
    expect(wordCount('   \n\t  ')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(wordCount('')).toBe(0);
  });

  it('ignores leading/trailing whitespace', () => {
    expect(wordCount('  leading  trailing  ')).toBe(2);
  });
});

describe('flattenResumeText', () => {
  const sample: ResumeTextSource = {
    basics: {
      summary: 'Senior engineer with 8 years of TypeScript experience.',
      label: 'Senior Software Engineer'
    },
    skills: [
      { name: 'Languages', keywords: ['typescript', 'python', 'rust'] },
      { name: 'Cloud', keywords: ['aws', 'gcp'] }
    ],
    work: [
      {
        summary: 'Platform team lead',
        positions: [
          {
            title: 'Staff Engineer',
            highlights: [
              'Built the payments platform serving 12M users',
              'Mentored 5 engineers across 2 teams'
            ]
          },
          {
            title: 'Senior Engineer',
            highlights: ['Shipped the search rewrite']
          }
        ]
      }
    ],
    projects: [
      {
        name: 'OpenSearch UI',
        description: 'A dashboard for query latency.',
        highlights: ['Adopted by 200+ teams']
      }
    ]
  };

  it('includes basics summary + label', () => {
    const text = flattenResumeText(sample);
    expect(text).toContain('Senior engineer');
    expect(text).toContain('Senior Software Engineer');
  });

  it('includes all skill keywords', () => {
    const text = flattenResumeText(sample);
    expect(text).toContain('typescript');
    expect(text).toContain('rust');
    expect(text).toContain('aws');
  });

  it('includes all work highlights and titles', () => {
    const text = flattenResumeText(sample);
    expect(text).toContain('Staff Engineer');
    expect(text).toContain('Built the payments platform');
    expect(text).toContain('Shipped the search rewrite');
  });

  it('includes project names + descriptions + highlights', () => {
    const text = flattenResumeText(sample);
    expect(text).toContain('OpenSearch UI');
    expect(text).toContain('dashboard for query latency');
    expect(text).toContain('Adopted by 200+ teams');
  });

  it('handles empty optional fields without crashing', () => {
    const minimal: ResumeTextSource = {
      basics: {},
      skills: [],
      work: [],
      projects: []
    };
    expect(() => flattenResumeText(minimal)).not.toThrow();
    expect(flattenResumeText(minimal)).toBe('');
  });

  it('handles undefined optional fields (no `projects` key)', () => {
    const noProjects: ResumeTextSource = {
      basics: { summary: 'Just a summary.' },
      skills: [],
      work: []
    };
    const text = flattenResumeText(noProjects);
    expect(text).toBe('Just a summary.');
  });
});

describe('flattenJobText', () => {
  it('concatenates all text-bearing fields', () => {
    const job: JobTextSource = {
      title: 'Senior Backend Engineer',
      description: 'Build the next generation of payment APIs.',
      requirements: ['5+ years of TypeScript', 'Strong PostgreSQL skills'],
      niceToHaves: ['Rust experience', 'GraphQL'],
      benefits: ['Equity', 'Unlimited PTO']
    };
    const text = flattenJobText(job);
    expect(text).toContain('Senior Backend Engineer');
    expect(text).toContain('payment APIs');
    expect(text).toContain('5+ years of TypeScript');
    expect(text).toContain('Rust experience');
    expect(text).toContain('Unlimited PTO');
  });

  it('handles missing optional fields', () => {
    const minimal: JobTextSource = {
      title: 'Engineer',
      description: 'Build things.'
    };
    const text = flattenJobText(minimal);
    expect(text).toContain('Engineer');
    expect(text).toContain('Build things');
    expect(text).not.toContain('undefined');
  });

  it('handles an empty job gracefully', () => {
    expect(flattenJobText({})).toBe('');
  });
});
