import { describe, expect, it } from 'vitest';

import { scoreResume } from '@/lib/scoring/score';
import type { ScoreableResume, ScoreableJob } from '@/lib/scoring/score';

/**
 * Latency benchmark — plan §"Acceptance criteria" #3.
 *
 *   "The function completes in < 100 ms for a typical 2-page resume.
 *    **Asserted by** `latency.bench.test.ts`: 100 runs, take the
 *    max, assert < 100 ms on the CI runner."
 *
 * We use a 2-page resume fixture (about 500 words, realistic
 * highlight density) and a realistic 4-requirement JD. The
 * benchmark runs 100 iterations, takes the max wall-clock, and
 * asserts under 100 ms.
 *
 * CI flakiness guard: we don't `fail` on the FIRST millisecond that
 * exceeds 100 ms. The threshold is intentionally generous (100 ms
 * on cold CI is plenty for the algorithm). If you see this failing
 * consistently, the algorithm regressed; if you see it flaky once,
 * it's probably a noisy CI box — bump the threshold or mark flaky.
 *
 * Drift from plan: the plan says "max < 100 ms". We also compute and
 * log the mean so the next calibration pass can see trends without
 * reading raw CI logs.
 */

const RESUME: ScoreableResume = {
  basics: {
    summary:
      'Senior software engineer with 8 years of experience building production-scale web applications. Strong background in TypeScript, React, Node.js, and PostgreSQL. Led multiple engineering teams across infrastructure, payments, and platform domains. Passionate about mentoring engineers and shipping high-quality software that solves real customer problems.',
    label: 'Senior Software Engineer'
  },
  skills: [
    { name: 'Languages', keywords: ['typescript', 'javascript', 'python', 'go'] },
    { name: 'Frontend', keywords: ['react', 'next.js', 'redux', 'tailwind'] },
    { name: 'Backend', keywords: ['node.js', 'express', 'postgres', 'redis'] },
    { name: 'Cloud', keywords: ['aws', 'gcp', 'docker', 'kubernetes'] }
  ],
  work: [
    {
      summary: 'Platform team lead at a fintech',
      positions: [
        {
          title: 'Staff Engineer',
          highlights: [
            'Built the payments platform serving 12M users, processing $2.4B in annual transaction volume',
            'Reduced API p99 latency from 800ms to 120ms by redesigning the search query path',
            'Mentored 5 engineers across 2 teams, accelerating velocity by 40%',
            'Designed and shipped the new authentication system, reducing support tickets by 60%',
            'Led the migration from a monolith to 14 microservices, eliminating 3 hours of nightly downtime'
          ]
        },
        {
          title: 'Senior Engineer',
          highlights: [
            'Designed the event-sourcing pipeline processing 50M events per day',
            'Shipped 6 internal tools adopted by 200+ employees'
          ]
        }
      ]
    },
    {
      summary: 'Earlier roles at consumer startups',
      positions: [
        {
          title: 'Software Engineer',
          highlights: [
            'Shipped 4 user-facing features that grew weekly active users by 18%',
            'Maintained the data pipeline ingesting 100GB daily'
          ]
        }
      ]
    }
  ],
  projects: [
    {
      name: 'OpenSearch UI',
      description: 'An open-source dashboard for query latency analysis.',
      highlights: ['Adopted by 200+ teams', 'Used at 3 Fortune 500 companies']
    }
  ],
  education: [],
  awards: [],
  publications: []
};

const JOB: ScoreableJob = {
  title: 'Senior TypeScript Engineer',
  description:
    'We are looking for a senior engineer to lead our platform team and build the next generation of payments APIs on AWS.',
  requirements: [
    '5+ years of TypeScript experience',
    'Strong React and Node.js background',
    'AWS or GCP cloud experience',
    'Experience leading engineering teams and mentoring engineers',
    'PostgreSQL expertise at scale',
    'Experience with payment systems is a plus'
  ],
  niceToHaves: [
    'GraphQL experience',
    'Experience with Kubernetes',
    'Open-source contributions'
  ]
};

describe('scoreResume latency benchmark', () => {
  it('runs 100 iterations in under 100 ms each (max wall-clock)', () => {
    // Warm-up: run a few iterations to let V8 optimize the hot path.
    // Without warm-up, the first 10 iterations are ~10x slower than
    // the steady state on cold CI.
    for (let i = 0; i < 5; i++) {
      scoreResume(RESUME, JOB);
    }

    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      scoreResume(RESUME, JOB);
      samples.push(performance.now() - t0);
    }

    const max = Math.max(...samples);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p50 = samples.sort((a, b) => a - b)[50];

    // Surface metrics for the CI log so a future calibration can see
    // trends without a raw-log dive. We don't `console.log` in tests
    // by default; `console.info` is permitted.
    console.info(
      `[bench] scoreResume: max=${max.toFixed(2)}ms, p50=${p50.toFixed(2)}ms, mean=${mean.toFixed(2)}ms (100 runs)`
    );

    expect(max).toBeLessThan(100);
  });
});
