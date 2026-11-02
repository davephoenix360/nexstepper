/**
 * Demo fixtures — the data behind the demo account.
 *
 * Used by `scripts/seed-demo.ts`. Nothing here is imported by the app.
 *
 * ## Why hand-written rather than AI-generated
 *
 * The JD parser (`parseJd`) and the intent extractor (`extractJdIntent`) both
 * run through the Gateway. Calling them here would make the seed depend on a
 * live model, which means the demo state changes every time you re-seed and
 * every take of the video has a different posting. A hand-written fixture is
 * deterministic, reviewable, and cheap.
 *
 * The fixtures are still validated against the real Zod schemas
 * (`parsedJdSchema`, `jobPostingSchema`, `resumeSectionsSchema`) at seed
 * time, so a fixture that drifts out of shape fails loudly instead of
 * producing a row the app cannot read.
 *
 * ## The candidate is synthetic on purpose
 *
 * A demo video is publication. Putting a real user's resume on screen would
 * be a GDPR problem in a product whose entire legal posture is built on
 * taking that seriously (see `lib/data-rights/` and the privacy page). Every
 * name, company, URL and phone number here is invented.
 *
 * Plan: docs/plans/demo-video.md
 */

import {
  resumeSectionsSchema,
  type ResumeSections
} from '@/lib/resume-schema/sections';
import { jobPostingSchema, type JobPosting } from '@/lib/resume-schema/job-posting';
import { parsedJdSchema, type ParsedJd } from '@/lib/jd-parser/schema';

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** The demo account. Printed by the seeder so you can sign in with it. */
export const DEMO_EMAIL = 'demo@nexstepper.com';
export const DEMO_PASSWORD = 'nexstepper-demo';
export const DEMO_USER_NAME = 'Jordan Ellis';

// ---------------------------------------------------------------------------
// The resume
// ---------------------------------------------------------------------------

/**
 * Jordan Ellis — Senior Software Engineer.
 *
 * Structurally modelled on `gallerySampleResumeData` (which is a real,
 * reviewed fixture), with a distinct persona so the demo account never
 * collides with the Template Gallery preview.
 *
 * The candidate is deliberately a STRONG match for a backend platform role
 * with a small number of gaps that can be closed HONESTLY:
 *
 *   - "event-driven architecture" — the resume shows async pipeline work but
 *     never uses the posting's language. Scout can reframe; it does not need
 *     to invent anything.
 *   - "owning on-call" — present, but buried in the third bullet of the
 *     current role. Scout can promote it.
 *   - "technical leadership across teams" — "Mentored four engineers" is
 *     framed as mentoring rather than leadership. Scout can reframe.
 *   - "Kafka" — genuinely absent. Scout CANNOT close this one, and must not.
 *     The demo's whole thesis is that nothing gets invented, so the score
 *     after the fix is still short of 100. That gap is the point.
 */
export const demoResumeSections: ResumeSections = resumeSectionsSchema.parse({
  basics: {
    name: 'Jordan Ellis',
    label: 'Senior Software Engineer',
    email: 'jordan.ellis@example.com',
    phone: '(206) 555-0184',
    url: 'https://jordanellis.example.com',
    summary:
      'Senior software engineer with nine years building and running backend systems. I have spent most of that time on infrastructure and reliability — moving a monolith to services, then keeping those services up. Comfortable owning a page at 3am.',
    location: {
      address: '',
      postalCode: '98104',
      city: 'Seattle',
      countryCode: 'US',
      region: 'Washington'
    },
    profiles: [
      {
        network: 'GitHub',
        username: 'jordanellis-dev',
        url: 'https://github.com/jordanellis-dev'
      },
      {
        network: 'LinkedIn',
        username: 'jordanellis-dev',
        url: 'https://linkedin.com/in/jordanellis-dev'
      }
    ]
  },
  work: [
    {
      company: 'Halcyon Systems',
      location: 'Seattle, WA (Hybrid)',
      url: 'https://halcyonsystems.example.com',
      description:
        'Series B collaboration platform. Owned the recording-and-share surface end-to-end.',
      positions: [
        {
          title: 'Senior Software Engineer',
          startDate: '2022-03-01',
          endDate: '',
          highlights: [
            'Built the Go service layer behind the shared-workspace recording flow (gRPC over PostgreSQL), running on Kubernetes in AWS and provisioned with Terraform.',
            'Led the migration from a monolithic Rails app to a modular Next.js + tRPC stack, cutting p95 page load from 2.4s to 0.9s.',
            'Designed and shipped the shared-workspace recording flow used by 40% of weekly active teams; lifted weekly share rate 18%.',
            'Ran the on-call rotation and authored the incident-response playbook still in use.',
            'Built the asynchronous transcription pipeline (FFmpeg + Whisper + custom diarization) that the team still ships today.'
          ]
        },
        {
          title: 'Software Engineer',
          startDate: '2019-08-01',
          endDate: '2022-02-28',
          highlights: [
            'Owned the integrations surface (Slack, Notion, Jira) from kickoff through general availability.',
            'Mentored four engineers through the first year of their career.'
          ]
        }
      ]
    },
    {
      company: 'Rotosignal',
      location: 'Seattle, WA',
      url: 'https://rotosignal.example.com',
      description: 'Early-stage on-call rotation tool. Acquired 2021.',
      positions: [
        {
          title: 'Founding Engineer',
          startDate: '2017-06-01',
          endDate: '2019-07-31',
          highlights: [
            'Wrote the first 30,000 lines of a Go + React app that grew to serve 1,200 teams.',
            'Designed the scheduling engine that became the company’s wedge product.'
          ]
        }
      ]
    }
  ],
  education: [
    {
      institution: 'University of Washington',
      url: 'https://uw.example.com',
      location: 'Seattle, WA',
      degree: {
        degreeLevel: 'Bachelor',
        majors: ['Computer Science'],
        minors: ['Mathematics']
      },
      startDate: '2012-09-01',
      endDate: '2016-05-31',
      gpa: '3.8',
      courses: ['Algorithms', 'Operating Systems', 'Compilers', 'Databases']
    }
  ],
  projects: [
    {
      name: 'Docsmith',
      description:
        'Open-source CLI that turns a single YAML file into a print-ready PDF. 4.2k stars on GitHub.',
      highlights: [
        'Designed the layout DSL that other tools now copy (single source → five templates).',
        'Maintain a small contributor community; cut average issue-resolution time to under a week.'
      ],
      keywords: ['TypeScript', 'Playwright', 'PDF'],
      startDate: '2021-01-01',
      endDate: '',
      url: 'https://github.com/jordanellis-dev/docsmith',
      roles: ['Creator', 'Maintainer']
    },
    {
      name: 'Local-first field notes',
      description:
        'Experimental CRDT-based notes app exploring offline-first collaboration without a central server.',
      highlights: [
        'Implemented a custom Yjs provider over WebRTC that survives 30-minute disconnects.'
      ],
      keywords: ['CRDTs', 'WebRTC', 'Rust'],
      startDate: '2023-09-01',
      endDate: '2024-02-28',
      url: '',
      roles: ['Solo']
    }
  ],
  skills: [
    {
      name: 'Languages',
      level: 'Master',
      keywords: ['Go', 'Python', 'TypeScript', 'Rust']
    },
    {
      name: 'Backend',
      level: 'Master',
      keywords: ['PostgreSQL', 'gRPC', 'Redis', 'Node.js']
    },
    {
      name: 'Infrastructure',
      level: 'Intermediate',
      keywords: ['AWS', 'Terraform', 'Kubernetes', 'Docker']
    },
    {
      name: 'Practices',
      level: 'Master',
      keywords: ['Code review', 'Mentoring', 'Incident response']
    }
  ],
  volunteer: [
    {
      organization: 'CoderDojo Seattle',
      position: 'Mentor',
      url: 'https://coderdojoseattle.example.com',
      startDate: '2020-09-01',
      endDate: '',
      summary: 'Weekly Saturday mentor for teens learning web development.',
      highlights: [
        'Ran the introductory HTML/CSS track for two cohorts of ~12 students each.'
      ]
    }
  ],
  awards: [
    {
      title: 'Engineering Excellence',
      awarder: 'Halcyon Systems',
      date: '2023-12-01',
      summary: 'Awarded annually to one engineer for cross-team impact.'
    },
    {
      title: 'Best Open-Source Tool',
      awarder: 'GitHub Stars Awards',
      date: '2022-06-01',
      summary: 'Docsmith took second place in the productivity-tools category.'
    }
  ],
  certificates: [
    {
      name: 'AWS Solutions Architect Associate',
      date: '2021-04-01',
      issuer: 'Amazon Web Services',
      url: 'https://aws.amazon.com/certification/'
    }
  ],
  publications: [],
  languages: [
    { language: 'English', fluency: 'Native' },
    { language: 'Spanish', fluency: 'Conversational' }
  ],
  interests: [
    { name: 'Climbing', keywords: ['Bouldering', 'Sport'] },
    { name: 'Coffee', keywords: ['Pour-over', 'Espresso'] }
  ],
  references: []
});

// ---------------------------------------------------------------------------
// Posting 1 — the primary demo posting (names real skills)
// ---------------------------------------------------------------------------

export const DEMO_JD_TITLE = 'Senior Backend Engineer, Platform';
export const DEMO_JD_COMPANY = 'Cartwheel';

export const DEMO_JD_TEXT = `Senior Backend Engineer, Platform
Cartwheel — Seattle, WA (Hybrid)

About the role
Cartwheel is a marketplace for refurbished electronics. We move about 40,000 orders a week through a system that has to be boring on the busiest day of the year. You would own the services behind order orchestration, payments, and fulfilment — the parts that are hard to change and impossible to take down.

What you'll do
- Design and operate the backend services behind order orchestration, payments, and fulfilment.
- Own service reliability: SLOs, on-call, incident response, and postmortems.
- Evolve our event-driven platform on Kafka as volume grows.
- Partner with product teams on API design, and ship reliable integrations with our partner network.
- Mentor engineers and raise the bar on design review.

What we look for
- 5+ years building and operating backend services in production.
- Strong proficiency in one of Go, Python, or Java.
- Production experience with PostgreSQL, including schema design and query performance.
- Experience designing distributed systems and event-driven architectures.
- Hands-on experience with Kubernetes, Terraform, and AWS.
- Comfort with gRPC or a similar service-to-service RPC model.
- A track record of owning on-call for production systems.

Nice to have
- Kafka, or another partitioned log, in production.
- Observability tooling such as OpenTelemetry or Prometheus.
- Mentoring and technical leadership across teams.

Requirements
- Bachelor's degree in Computer Science or equivalent practical experience.
- This role is on-call; we ask for people who have carried a pager before.

Benefits
- Equity, medical/dental/vision, and a 401(k) match.
- $25k annual learning budget.`;

export const DEMO_JD_PARSED: ParsedJd = parsedJdSchema.parse({
  jobTitle: 'Senior Backend Engineer, Platform',
  company: 'Cartwheel',
  seniority: 'senior',
  location: 'Seattle, WA',
  remote: 'hybrid',
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  requiredSkills: [
    'Go',
    'Python',
    'PostgreSQL',
    'distributed systems',
    'event-driven architectures',
    'Kubernetes',
    'Terraform',
    'AWS',
    'gRPC',
    'on-call ownership'
  ],
  niceToHaveSkills: [
    'Kafka',
    'OpenTelemetry',
    'Prometheus',
    'technical leadership'
  ],
  keywords: [
    'Go',
    'Python',
    'PostgreSQL',
    'distributed systems',
    'event-driven architectures',
    'Kubernetes',
    'Terraform',
    'AWS',
    'gRPC',
    'on-call',
    'Kafka',
    'OpenTelemetry',
    'Prometheus',
    'mentoring',
    'technical leadership',
    'SLOs',
    'incident response',
    'schema design'
  ],
  responsibilities: [
    'Design and operate the backend services behind order orchestration, payments, and fulfilment.',
    'Own service reliability: SLOs, on-call, incident response, and postmortems.',
    'Evolve our event-driven platform on Kafka as volume grows.',
    'Partner with product teams on API design, and ship reliable integrations with our partner network.',
    'Mentor engineers and raise the bar on design review.'
  ],
  qualifications: [
    '5+ years building and operating backend services in production.',
    "Strong proficiency in one of Go, Python, or Java.",
    'Production experience with PostgreSQL, including schema design and query performance.',
    'Experience designing distributed systems and event-driven architectures.',
    'Hands-on experience with Kubernetes, Terraform, and AWS.',
    'Comfort with gRPC or a similar service-to-service RPC model.',
    'A track record of owning on-call for production systems.',
    "Bachelor's degree in Computer Science or equivalent practical experience."
  ],
  yearsExperienceMin: 5,
  employmentType: 'full_time',
  summary:
    'Cartwheel is a marketplace for refurbished electronics. This role owns the backend services behind order orchestration, payments, and fulfilment, and carries the on-call rotation for them.'
});

/**
 * The `JobPosting` envelope attached to the variant — the v2 intent fields
 * are what the Intent Coverage dimension scores against, so they are set
 * explicitly here rather than left to the (AI) extractor.
 */
export const DEMO_JOB_CONTEXT: JobPosting = jobPostingSchema.parse({
  id: 'demo-posting-cartwheel-platform',
  title: DEMO_JD_TITLE,
  company: DEMO_JD_COMPANY,
  location: 'Seattle, WA',
  description: DEMO_JD_TEXT,
  requirements: DEMO_JD_PARSED.qualifications,
  niceToHaves: DEMO_JD_PARSED.niceToHaveSkills,
  benefits: [
    'Equity, medical/dental/vision, and a 401(k) match.',
    '$25k annual learning budget.'
  ],
  keywords: DEMO_JD_PARSED.keywords,
  seniority: 'senior',
  employmentType: 'Full-time',
  source: 'paste',
  markdown: null,
  markdownGeneratedAt: null,
  mustHaveSkills: [
    'Go',
    'Python',
    'PostgreSQL',
    'distributed systems',
    'event-driven architectures',
    'Kubernetes',
    'Terraform',
    'AWS',
    'gRPC',
    // The real intent extractor puts Qualification-section entries into
    // `mustHaveSkills` too — which is exactly why Jev has to classify
    // gates rather than trust the bucket. This line is what puts a green
    // chip in the eligibility list.
    "Bachelor's degree in Computer Science or equivalent practical experience"
  ],
  niceToHaveSkills: ['Kafka', 'OpenTelemetry', 'Prometheus', 'technical leadership'],
  implicitSkills: ['Docker', 'microservices', 'CI/CD', 'REST APIs'],
  seniorityLevel: 'senior',
  yearsRequiredMin: 5,
  yearsRequiredMax: null,
  roleFamily: 'Backend Engineer',
  domainSignals: ['e-commerce', 'marketplace'],
  intentExtractedAt: null,
  intentExtractorModel: null
});

// ---------------------------------------------------------------------------
// Posting 2 — the posting that names NO real skills (the refusal beat)
// ---------------------------------------------------------------------------

export const DEMO_JD2_TITLE = 'Customer Operations Specialist';
export const DEMO_JD2_COMPANY = 'Northwind Supply';

export const DEMO_JD2_TEXT = `Customer Operations Specialist
Northwind Supply — Seattle, WA (On-site)

About the role
Northwind Supply sells building materials to small contractors. You will be the first person our customers reach when an order is wrong, a delivery is late, or a return needs a decision.

What you'll do
- Handle inbound customer questions by email and phone.
- Investigate order and delivery issues and arrange resolutions.
- Work with the warehouse team to prioritise shipments.
- Keep records accurate in our order system.
- Take part in the weekly operations meeting.

Requirements
- A bachelor's degree in any discipline, or equivalent professional experience.
- Professional fluency in English, written and spoken.
- Excellent communication and interpersonal skills.
- The ability to analyze complex problems and break them into manageable steps.
- A genuine passion for hands-on work and continuous improvement.

Nice to have
- Previous experience in a building supplies, logistics, or retail environment.
- Familiarity with an order management system.

Hours: Monday to Friday, 8am to 5pm, on-site.`;

export const DEMO_JD2_PARSED: ParsedJd = parsedJdSchema.parse({
  jobTitle: 'Customer Operations Specialist',
  company: 'Northwind Supply',
  seniority: 'mid',
  location: 'Seattle, WA',
  remote: 'onsite',
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  // Deliberately empty. Nothing in this posting names a genuine skill.
  requiredSkills: [],
  niceToHaveSkills: [],
  keywords: [],
  responsibilities: [
    'Handle inbound customer questions by email and phone.',
    'Investigate order and delivery issues and arrange resolutions.',
    'Work with the warehouse team to prioritise shipments.',
    'Keep records accurate in our order system.',
    'Take part in the weekly operations meeting.'
  ],
  qualifications: [
    "A bachelor's degree in any discipline, or equivalent professional experience.",
    'Professional fluency in English, written and spoken.',
    'Excellent communication and interpersonal skills.',
    'The ability to analyze complex problems and break them into manageable steps.',
    'A genuine passion for hands-on work and continuous improvement.'
  ],
  yearsExperienceMin: null,
  employmentType: 'full_time',
  summary:
    'Northwind Supply is a building-materials merchant. This role handles customer questions, order and delivery issues, and day-to-day operations records.'
});

export const DEMO_JOB_CONTEXT_2: JobPosting = jobPostingSchema.parse({
  id: 'demo-posting-northwind-ops',
  title: DEMO_JD2_TITLE,
  company: DEMO_JD2_COMPANY,
  location: 'Seattle, WA',
  description: DEMO_JD2_TEXT,
  requirements: DEMO_JD2_PARSED.qualifications,
  niceToHaves: DEMO_JD2_PARSED.niceToHaveSkills,
  benefits: [],
  keywords: [],
  seniority: 'mid',
  employmentType: 'Full-time',
  source: 'paste',
  markdown: null,
  markdownGeneratedAt: null,
  // Deliberately NOT empty, and deliberately NOT skills. The real intent
  // extractor puts Qualification-section entries into `mustHaveSkills`; Jev
  // then has to work out that none of these name a genuine skill. This is
  // the posting from the drift memo — a degree, English proficiency,
  // communication, "analyze complex problems", "passion for hands-on work" —
  // and the honest answer is "this posting doesn't name skills your resume
  // lists".
  mustHaveSkills: [
    "A bachelor's degree in any discipline, or equivalent professional experience",
    'Professional fluency in English, written and spoken',
    'Excellent communication and interpersonal skills',
    'The ability to analyze complex problems and break them into manageable steps',
    'A genuine passion for hands-on work and continuous improvement'
  ],
  // The posting's nice-to-haves name no tool either — "an order management
  // system" is a duty, not a skill the candidate could be marked for.
  niceToHaveSkills: [],
  implicitSkills: [],
  seniorityLevel: null,
  yearsRequiredMin: null,
  yearsRequiredMax: null,
  roleFamily: null,
  domainSignals: [],
  intentExtractedAt: null,
  intentExtractorModel: null
});
