import type { ResumeData } from '@/lib/resume-schema';
import { gallerySampleResumeData } from '@/lib/resume-schema/sample';

/**
 * Deterministic resume generator for PAGE-COUNT MEASUREMENT.
 *
 * ## Why this exists
 *
 * The chat assistant has to answer "will this fit on one page?" and it
 * has no way to render the document. Everything it knows about length
 * today is a guess from the user's prose. Guessing is how users end up
 * printing, finding three pages, and coming back annoyed.
 *
 * So we measure instead: build resumes with a known number of work
 * entries and bullets, print them through the real template + print CSS,
 * and count the resulting PDF pages. That turns "roughly one page" into
 * a number.
 *
 * ## Why the sample resume
 *
 * `gallerySampleResumeData` is already the deterministic showcase resume
 * and is what the design lab renders, so the non-work sections (basics,
 * skills, projects, education, volunteer) contribute a realistic fixed
 * overhead. We replace only the WORK section, which is what actually
 * scales in a real resume.
 *
 * ## Determinism
 *
 * No `Date.now()`, no `Math.random()`. The same params always produce
 * byte-identical output, so a measurement can be re-run and compared.
 */

const COMPANIES = [
  ['Loom Systems', 'San Francisco, CA (Remote)'],
  ['Pagerly', 'New York, NY'],
  ['Northwind Labs', 'Toronto, ON'],
  ['Cedar Analytics', 'Vancouver, BC'],
  ['Harbor Health', 'Boston, MA'],
  ['Meridian Robotics', 'Austin, TX'],
  ['Lumen Pay', 'London, UK'],
  ['Atlas Freight', 'Chicago, IL']
] as const;

const ROLE_TITLES = [
  'Senior Software Engineer',
  'Software Engineer',
  'Full Stack Engineer',
  'Backend Engineer',
  'Product Engineer',
  'Founding Engineer'
] as const;

/**
 * Bullet pool. Deliberately realistic in length — roughly 110–150
 * characters, which is what wraps to two lines at 11pt on a 7-inch
 * text column. Short bullets would make every measurement optimistic.
 */
const BULLET_POOL = [
  'Led the migration from a monolithic Rails app to a modular Next.js + tRPC stack, cutting p95 page load from 2.4s to 0.9s.',
  'Designed and shipped the shared-workspace recording flow used by 40% of weekly active teams; lifted weekly share rate 18%.',
  'Mentored four engineers; ran the on-call rotation and authored the incident-response playbook still in use today.',
  'Built the original transcription pipeline that the team still ships to every customer in production today.',
  'Owned the integrations surface (Slack, Notion, Jira) from kickoff through general availability and adoption.',
  'Wrote the first 30,000 lines of a Go and React app that grew to serve 1,200 teams across three regions.',
  'Designed the scheduling engine that became the company’s wedge product and now drives 70% of revenue.',
  'Reduced cloud spend 34% by right-sizing instances and introducing a read-replica tier for the analytics workload.',
  'Shipped an accessibility overhaul that took the product from 61 to 98 on the Lighthouse accessibility audit.',
  'Introduced end-to-end tests covering the billing flow, which cut production payment incidents from 11 a month to zero.'
] as const;

export type MeasurableResumeParams = {
  /** Number of work entries. Each gets one position. */
  roles: number;
  /** Bullets per work entry. */
  bullets: number;
  /**
   * Which non-work content to include.
   *
   * `full` — everything the gallery sample has (projects, volunteer,
   * awards, certificates, education, languages, interests). This is the
   * "general resume with everything on it" case, and it is ALREADY two
   * pages before any work history is added.
   *
   * `minimal` — the typical one-page skeleton: identity, experience,
   * skills, education. This is the base that lets the measurement find
   * where ONE page ends, which is the number the assistant needs.
   */
  base?: 'full' | 'minimal';
};

export function buildMeasurableResume({
  roles,
  bullets,
  base = 'full'
}: MeasurableResumeParams): ResumeData {
  const sample = structuredClone(gallerySampleResumeData);

  const work = Array.from({ length: Math.max(0, roles) }, (_, i) => {
    const [company, location] = COMPANIES[i % COMPANIES.length];
    const title = ROLE_TITLES[i % ROLE_TITLES.length];
    // Deterministic backwards-dated ranges: role i starts 2i years ago.
    const startYear = 2024 - i * 2;
    const endYear = startYear + 2;

    const highlights = Array.from({ length: Math.max(0, bullets) }, (_, b) => {
      const text = BULLET_POOL[(i * 3 + b) % BULLET_POOL.length];
      return text;
    });

    return {
      company,
      location,
      url: '',
      description: '',
      positions: [
        {
          title,
          startDate: `${startYear}-01-01`,
          endDate: `${endYear}-01-01`,
          highlights
        }
      ]
    };
  });

  if (base === 'full') {
    return { ...sample, sections: { ...sample.sections, work } };
  }

  return {
    ...sample,
    sections: {
      ...sample.sections,
      work,
      projects: [],
      volunteer: [],
      awards: [],
      certificates: [],
      publications: [],
      languages: [],
      interests: [],
      references: []
    }
  };
}
