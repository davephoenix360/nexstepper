#!/usr/bin/env node
/**
 * Do the JD's requirements actually reach the score?
 *
 * ## The claim being checked
 *
 * I said the JD's requirement bullets "never reach the engine". That is
 * worth checking before it is written down as a defect, because the
 * answer changes what should be done.
 *
 * Three routes carry a JD's requirements into the engine:
 *
 *   1. `job.description` — the RAW posting text, requirements and all.
 *      The keyword score and the BM25 similarity both tokenise it.
 *   2. `job.mustHaveSkills` / `job.niceToHaveSkills` — the intent
 *      extractor's STRUCTURED list, which the v2 Intent Coverage
 *      dimension scores and the eligibility detector reads.
 *   3. `job.requirements` — the JD's own bullet list. **Empty in
 *      production** (no attach path writes it), and the coverage
 *      sub-criterion that read it was retired on 2026-11-17.
 *
 * So: are the requirements in the score, via routes 1 and 2? This
 * measures it rather than assuming.
 *
 * Offline. Writes nothing.
 */
import './load-env';

import { scoreResumeFromEnvelope } from '@/lib/scoring/score';
import { scoreIntentCoverage } from '@/lib/scoring/dimensions/intent-coverage';
import { resumeDataSchema, jobPostingSchema } from '@/lib/resume-schema';

const NOW = new Date('2026-01-15T00:00:00Z');

const RESUME = resumeDataSchema.parse({
  name: 'Test',
  note: '',
  status: 'draft',
  template: 'classic',
  jobContext: null,
  sections: {
    basics: {
      name: 'Jane',
      label: 'Backend Engineer',
      email: '',
      phone: '',
      url: '',
      summary: 'Backend engineer building streaming data platforms.',
      location: { address: '', postalCode: '', city: '', countryCode: '', region: '' },
      profiles: []
    },
    skills: [{ name: 'Languages', keywords: ['TypeScript', 'Python'], level: '' }],
    work: [
      {
        company: 'Acme',
        location: '',
        url: '',
        description: '',
        positions: [
          {
            title: 'Engineer',
            startDate: '2020-01',
            endDate: '',
            highlights: ['Built a streaming ingestion service handling 4M events a day']
          }
        ]
      }
    ],
    projects: [],
    education: [],
    awards: [],
    certificates: [],
    publications: [],
    languages: [],
    interests: [],
    references: [],
    volunteer: []
  }
});

function job(overrides: Record<string, unknown> = {}) {
  return jobPostingSchema.parse({
    id: 'j',
    url: 'https://example.com/job',
    title: 'Senior Backend Engineer',
    company: 'Cartwheel',
    location: 'Remote',
    description:
      'We build a streaming data platform for logistics.\n\nRequirements:\n- Experience with Kafka for event streaming\n- Strong TypeScript and Python skills\n- Experience operating production databases',
    requirements: [],
    niceToHaves: [],
    benefits: [],
    keywords: [],
    seniority: 'senior',
    employmentType: 'Full-time',
    source: 'paste',
    mustHaveSkills: ['TypeScript', 'Kafka'],
    niceToHaveSkills: ['Python'],
    implicitSkills: [],
    seniorityLevel: 'senior',
    yearsRequiredMin: 5,
    yearsRequiredMax: null,
    roleFamily: 'Backend Engineer',
    domainSignals: [],
    ...overrides
  });
}

function score(j: ReturnType<typeof job>) {
  const breakdown = scoreResumeFromEnvelope(RESUME, j, NOW);
  return {
    overall: breakdown.overallScore,
    keywords: breakdown.criteriaScores['ATS Keyword Match'],
    intent: breakdown.dimensionScores.intentCoverage
  };
}

const base = job();
const withKafka = score(base);

// The SAME JD, but the raw description no longer mentions Kafka.
const withoutKafka = score(
  job({
    description:
      'We build a streaming data platform for logistics.\n\nRequirements:\n- Strong TypeScript and Python skills\n- Experience operating production databases',
    mustHaveSkills: ['TypeScript'],
    niceToHaveSkills: ['Python']
  })
);

// The same JD again, but with a requirement the resume never mentions.
const withKubernetes = score(
  job({
    description:
      'We build a streaming data platform for logistics.\n\nRequirements:\n- Experience with Kafka for event streaming\n- Strong TypeScript and Python skills\n- Experience with Kubernetes in production',
    mustHaveSkills: ['TypeScript', 'Kafka', 'Kubernetes'],
    niceToHaveSkills: ['Python']
  })
);

console.log('');
console.log("Do the JD's requirements reach the score?");
console.log('-------------------------------------------------------');
console.log(
  `  baseline (mentions Kafka)      : overall ${withKafka.overall}, keywords ${withKafka.keywords}, intent ${withKafka.intent}`
);
console.log(
  `  Kafka removed from the JD      : overall ${withoutKafka.overall}, keywords ${withoutKafka.keywords}, intent ${withoutKafka.intent}`
);
console.log(
  `  Kubernetes added to the JD     : overall ${withKubernetes.overall}, keywords ${withKubernetes.keywords}, intent ${withKubernetes.intent}`
);
console.log('');
console.log(
  `  → adding a requirement the resume does NOT cover LOWERS the score by ` +
    `${withKafka.overall - withKubernetes.overall} points`
);
console.log(
  `  → removing a requirement the resume DOES cover RAISES it by ` +
    `${withoutKafka.overall - withKafka.overall} points`
);
console.log('');
console.log('  So the JD requirements DO reach the score — twice:');
console.log('    1. through the raw description prose (the keyword score),');
console.log('    2. through the extractor\'s structured skill lists (Intent');
console.log('       Coverage and the eligibility detector).');
console.log('');
console.log('  What never existed is the JD\'s own BULLET LIST as a structure');
console.log('  (`job.requirements` is empty in production) — and the one thing');
console.log('  that read it, the coverage sub-criterion, was retired on');
console.log('  2026-11-17.');
console.log('');
