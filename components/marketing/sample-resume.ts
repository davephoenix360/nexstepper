import {
  resumeDataSchema,
  type ResumeData
} from '@/lib/resume-schema';

/**
 * `SAMPLE_RESUME` — placeholder resume used by the marketing landing page
 * to render a real Classic template preview (see `./resume-preview.tsx`).
 *
 * Why this exists
 *   The previous preview hand-rolled a fake "Sarah Chen / Acme Corp"
 *   resume, which is the kind of fabricated content Stripe flagged as a
 *   risk during the pre-launch review (we have a no-fake-testimonials
 *   policy in `hero.tsx`, and Stripe requires a real business site —
 *   placeholder data must look like placeholder data).
 *
 * Content rules
 *   - Names that scream "demo": "Sample Software Engineer" instead of a
 *     plausible human name; "Sample Co." / "Example Industries" /
 *     "University of Example" for employers and schools.
 *   - Generic, role-shaped content — nothing that could be mistaken for a
 *     real person's career.
 *   - Format is JSON Resume v1.0.0 (`sections.*`) so the real
 *     `ClassicReadOnly` template renders it without any adaptation.
 *
 * Validation
 *   The `resumeDataSchema.parse(...)` call below runs at module load.
 *   If a future schema change adds a new required field and this
 *   fixture isn't updated, the build fails fast — better than a
 *   half-broken preview on the live landing page.
 *
 * Do not import this from `app/(dashboard)/**` — it's marketing-only
 * fixture data, not a starter resume for new users. (Use
 * `blankResumeData()` from `@/lib/resume-schema` for that.)
 */
export const SAMPLE_RESUME: ResumeData = resumeDataSchema.parse({
  name: 'Sample Resume — Software Engineer',
  note: 'Demo data shown on the marketing landing page. Not a real person.',
  status: 'completed',
  template: 'classic',
  jobContext: null,
  sections: {
    basics: {
      name: 'Sample Software Engineer',
      label: 'Senior Software Engineer',
      email: 'sample@example.com',
      phone: '(555) 010-0000',
      url: '',
      summary:
        'Placeholder summary for the marketing preview. Replace this with one or two sentences that name the role you want, your years of experience, and the one result you can prove.',
      location: {
        address: '',
        postalCode: '',
        city: 'Sample City',
        countryCode: '',
        region: 'Sample State'
      },
      profiles: []
    },
    work: [
      {
        company: 'Sample Co.',
        location: 'Sample City, SS',
        url: '',
        description:
          'Placeholder employer used only to demonstrate the resume template.',
        positions: [
          {
            title: 'Senior Software Engineer',
            startDate: '2022-01',
            endDate: '',
            highlights: [
              'Placeholder bullet — swap for one concrete outcome with a number (e.g. cut p99 latency 47%).',
              'Placeholder bullet — start with a strong verb; avoid "responsible for" and "helped with".'
            ]
          },
          {
            title: 'Software Engineer',
            startDate: '2019-01',
            endDate: '2021-12',
            highlights: [
              'Placeholder bullet — early-tenure bullets still need a measurable outcome, not just a task list.'
            ]
          }
        ]
      },
      {
        company: 'Example Industries',
        location: 'Demo City, SS',
        url: '',
        description: '',
        positions: [
          {
            title: 'Junior Software Engineer',
            startDate: '2017-06',
            endDate: '2018-12',
            highlights: [
              'Placeholder bullet — keep one line per bullet; trim adjectives.'
            ]
          }
        ]
      }
    ],
    education: [
      {
        institution: 'University of Example',
        url: '',
        location: 'Example, SS',
        degree: {
          degreeLevel: 'Bachelor',
          majors: ['Computer Science'],
          minors: []
        },
        startDate: '2013-09',
        endDate: '2017-05',
        gpa: '',
        courses: []
      }
    ],
    projects: [],
    skills: [
      {
        name: 'Languages',
        level: '',
        keywords: ['TypeScript', 'Python', 'Go']
      },
      {
        name: 'Backend',
        level: '',
        keywords: ['Postgres', 'Redis', 'REST APIs']
      },
      {
        name: 'Frontend',
        level: '',
        keywords: ['React', 'Next.js', 'Tailwind CSS']
      },
      {
        name: 'Cloud',
        level: '',
        keywords: ['AWS', 'Docker', 'Terraform']
      }
    ],
    volunteer: [],
    awards: [],
    certificates: [],
    publications: [],
    languages: [],
    interests: [],
    references: []
  }
});