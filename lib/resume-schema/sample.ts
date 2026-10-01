import type { ResumeData } from './resume-data';

/**
 * Empty `ResumeData` — used as the default when creating a new master resume.
 * All sections present with empty defaults so the form doesn't have to
 * special-case missing keys.
 */
export function blankResumeData(): ResumeData {
  return {
    sections: {
      basics: {
        name: '',
        label: '',
        email: '',
        phone: '',
        url: '',
        summary: '',
        location: {
          address: '',
          postalCode: '',
          city: '',
          countryCode: '',
          region: ''
        },
        profiles: []
      },
      work: [],
      education: [],
      projects: [],
      skills: [],
      volunteer: [],
      awards: [],
      certificates: [],
      publications: [],
      languages: [],
      interests: [],
      references: []
    },
    name: 'Untitled resume',
    note: '',
    status: 'draft',
    template: 'classic',
    jobContext: null
  };
}

/**
 * Sample resume data — useful for onboarding screenshots, dev fixtures,
 * and as a "load demo" affordance. Adapted from the JSON Resume sample.
 *
 * Intentionally thin (1 work entry, 1 education entry, 2 skills).
 * Other tests depend on the exact shape; don't expand this without
 * auditing callers. For richer previews, see `gallerySampleResumeData`
 * below — that's the one the TemplateGalleryModal renders.
 */
export const sampleResumeData: ResumeData = {
  sections: {
    basics: {
      name: 'Richard Hendriks',
      label: 'Programmer',
      email: 'rhendriks@mail.com',
      phone: '(912) 555-4321',
      url: 'http://richardhendricks.example.com',
      summary:
        'Richard hails from Tulsa. He has earned degrees from the University of Oklahoma and Stanford. (Open Source Tools for Numerical Data Curation).',
      location: {
        address: '2712 Broadway St',
        postalCode: 'CA 94115',
        city: 'San Francisco',
        countryCode: 'US',
        region: 'California'
      },
      profiles: [
        {
          network: 'Twitter',
          username: 'rhendriks',
          url: 'https://twitter.com/rhendriks'
        }
      ]
    },
    work: [
      {
        company: 'Pied Piper',
        location: 'Palo Alto, CA',
        url: 'http://piedpiper.example.com',
        description: 'Pied Piper is a multi-platform technology based on a proprietary universal compression algorithm.',
        positions: [
          {
            title: 'CEO / Super Coder',
            startDate: '2013-12-01',
            endDate: '2014-12-01',
            highlights: [
              'Built an algorithm that compresses data so efficiently it triggered a lawsuit from Big Content.'
            ]
          }
        ]
      }
    ],
    education: [
      {
        institution: 'University of Oklahoma',
        url: 'http://ou.example.com',
        location: 'Norman, OK',
        degree: {
          degreeLevel: 'Bachelor',
          majors: ['Computer Science'],
          minors: ['Mathematics']
        },
        startDate: '2011-06-01',
        endDate: '2014-01-01',
        gpa: '4.0',
        courses: ['DB', 'AI', 'Algorithms']
      }
    ],
    projects: [],
    skills: [
      {
        name: 'Web Development',
        level: 'Master',
        keywords: ['HTML', 'CSS', 'Javascript']
      },
      {
        name: 'Compression',
        level: 'Master',
        keywords: ['MPEG', 'WebM', 'ffmpeg']
      }
    ],
    volunteer: [],
    awards: [],
    certificates: [],
    publications: [],
    languages: [
      { language: 'English', fluency: 'Native' },
      { language: 'Spanish', fluency: 'Conversational' }
    ],
    interests: [],
    references: []
  },
  name: 'Richard Hendriks — Software Engineer',
  note: 'Demo resume. Replace with your own.',
  status: 'completed',
  template: 'classic',
  jobContext: null
};

/**
 * Richer sample used by the Template Gallery Modal preview.
 *
 * Why a separate constant
 *   `sampleResumeData` above is intentionally thin (1 work, 1
 *   education, 2 skills) — other tests depend on its exact shape.
 *   For the gallery preview we want a resume that *looks* like a
 *   real one: multiple work entries with multi-position history,
 *   projects with bullets, a fuller skills list, a few awards /
 *   certificates / volunteer rows. This exercises more of each
 *   template's layout (multi-bullet work entries, multi-position
 *   companies, section transitions, projects vs work differentiation)
 *   so the preview is representative of what the user's own resume
 *   will look like once filled in.
 *
 * Static / deterministic
 *   No `Date.now()`, no `Math.random()` — identical between server
 *   and client renders so the gallery preview is SSR-safe.
 */
export const gallerySampleResumeData: ResumeData = {
  sections: {
    basics: {
      name: 'Alex Morgan',
      label: 'Senior Product Engineer',
      email: 'alex.morgan@example.com',
      phone: '(415) 555-0142',
      url: 'https://alexmorgan.example.com',
      summary:
        'Senior product engineer with eight years building consumer SaaS. I lead small teams through ambiguous 0→1 work — from problem framing through launch metrics. Strong opinions on instrumentation, weak opinions on frameworks.',
      location: {
        address: '',
        postalCode: '94110',
        city: 'San Francisco',
        countryCode: 'US',
        region: 'California'
      },
      profiles: [
        {
          network: 'GitHub',
          username: 'alexmorgan',
          url: 'https://github.com/alexmorgan'
        },
        {
          network: 'LinkedIn',
          username: 'alexmorgan-eng',
          url: 'https://linkedin.com/in/alexmorgan-eng'
        }
      ]
    },
    work: [
      {
        company: 'Loom Systems',
        location: 'San Francisco, CA (Remote)',
        url: 'https://loomsystems.example.com',
        description:
          'Series B collaboration platform. Owned the recording-and-share surface end-to-end.',
        positions: [
          {
            title: 'Senior Product Engineer',
            startDate: '2022-03-01',
            endDate: '',
            highlights: [
              'Led the migration from a monolithic Rails app to a modular Next.js + tRPC stack, cutting p95 page load from 2.4s to 0.9s.',
              'Designed and shipped the shared-workspace recording flow used by 40% of weekly active teams; lifted weekly share rate 18%.',
              'Mentored four engineers; ran the on-call rotation and authored the incident-response playbook still in use.'
            ]
          },
          {
            title: 'Product Engineer',
            startDate: '2019-08-01',
            endDate: '2022-02-28',
            highlights: [
              'Built the original transcription pipeline (FFmpeg + Whisper + custom diarization) that the team still ships.',
              'Owned the integrations surface (Slack, Notion, Jira) from kickoff through general availability.'
            ]
          }
        ]
      },
      {
        company: 'Pagerly',
        location: 'New York, NY',
        url: 'https://pagerly.example.com',
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
        institution: 'University of Michigan',
        url: 'https://umich.example.com',
        location: 'Ann Arbor, MI',
        degree: {
          degreeLevel: 'Bachelor',
          majors: ['Computer Science'],
          minors: ['Mathematics']
        },
        startDate: '2012-09-01',
        endDate: '2016-05-31',
        gpa: '3.8',
        courses: ['Algorithms', 'Operating Systems', 'Compilers', 'HCI']
      }
    ],
    projects: [
      {
        name: 'Resumake',
        description:
          'Open-source CLI that turns a single YAML file into a print-ready PDF. 4.2k stars on GitHub.',
        highlights: [
          'Designed the layout DSL that other tools now copy (single source → five templates).',
          'Maintain a small contributor community; cut average issue-resolution time to under a week.'
        ],
        keywords: ['TypeScript', 'Playwright', 'PDF'],
        startDate: '2021-01-01',
        endDate: '',
        url: 'https://github.com/alexmorgan/resumake',
        roles: ['Creator', 'Maintainer']
      },
      {
        name: 'Local-first notes sync',
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
        keywords: ['TypeScript', 'Python', 'Go', 'Rust']
      },
      {
        name: 'Frontend',
        level: 'Master',
        keywords: ['React', 'Next.js', 'Tailwind', 'Radix']
      },
      {
        name: 'Backend',
        level: 'Master',
        keywords: ['Postgres', 'Redis', 'gRPC', 'Node.js']
      },
      {
        name: 'Infrastructure',
        level: 'Intermediate',
        keywords: ['AWS', 'Terraform', 'Kubernetes']
      },
      {
        name: 'Practices',
        level: 'Master',
        keywords: ['Code review', 'Mentoring', 'Incident response']
      }
    ],
    volunteer: [
      {
        organization: 'CoderDojo SF',
        position: 'Mentor',
        url: 'https://coderdojosf.example.com',
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
        awarder: 'Loom Systems',
        date: '2023-12-01',
        summary: 'Awarded annually to one engineer for cross-team impact.'
      },
      {
        title: 'Best Open-Source Tool',
        awarder: 'GitHub Stars Awards',
        date: '2022-06-01',
        summary: 'Resumake took second place in the productivity-tools category.'
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
      { language: 'Spanish', fluency: 'Conversational' },
      { language: 'German', fluency: 'Beginner' }
    ],
    interests: [
      { name: 'Climbing', keywords: ['Bouldering', 'Sport'] },
      { name: 'Coffee', keywords: ['Pour-over', 'Espresso'] }
    ],
    references: []
  },
  name: 'Alex Morgan — Senior Product Engineer',
  note: 'Preview resume used by the Template Gallery modal.',
  status: 'completed',
  template: 'classic',
  jobContext: null
};