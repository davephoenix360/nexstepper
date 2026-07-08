// Update the test master's revision with sample content so the preview
// has something to render. Then we can confirm the full pipeline
// (server -> registry -> template -> DOM) works.
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

const RESUME_ID = 'f82c755f-74fe-4c9a-9c82-3970c4201f10';

const sampleData = {
  template: 'modern',
  sections: {
    basics: {
      name: 'Alex Rivera',
      label: 'Staff Frontend Engineer',
      email: 'alex@example.com',
      phone: '+1 (415) 555-0142',
      url: 'alexrivera.dev',
      summary: 'Building fast, accessible web apps with React and TypeScript. Currently leading the platform team at a 200-person SaaS company.',
      location: {
        address: '',
        postalCode: '',
        city: 'San Francisco',
        region: 'CA',
        countryCode: 'US'
      },
      profiles: [
        { network: 'GitHub', username: 'alexrivera', url: 'github.com/alexrivera' },
        { network: 'LinkedIn', username: 'alexrivera', url: 'linkedin.com/in/alexrivera' }
      ]
    },
    work: [
      {
        company: 'Lumen Cloud',
        location: 'Remote',
        positions: [
          {
            title: 'Staff Frontend Engineer',
            startDate: '2022-04',
            endDate: '',
            highlights: [
              'Led migration of the design system from CSS-in-JS to Tailwind v4, cutting bundle size by 38%',
              'Authored the in-house Playwright + Visual Regression pipeline used by 14 product teams',
              'Mentored 5 engineers; 3 promoted within the same year'
            ],
            summary: '',
            keywords: []
          }
        ]
      },
      {
        company: 'Northbeam',
        location: 'San Francisco, CA',
        positions: [
          {
            title: 'Senior Frontend Engineer',
            startDate: '2019-08',
            endDate: '2022-03',
            highlights: [
              'Rebuilt the analytics dashboard in Next.js; time-to-interactive dropped from 4.2s to 0.9s',
              'Owned the in-product charting library used by 90% of paying customers'
            ],
            summary: '',
            keywords: []
          }
        ]
      }
    ],
    education: [
      {
        institution: 'Carnegie Mellon University',
        url: '',
        area: 'Computer Science',
        studyType: 'Bachelor',
        startDate: '2013-09',
        endDate: '2017-05',
        score: '3.91',
        courses: [],
        degree: {
          degreeLevel: 'BS',
          majors: ['Computer Science'],
          minors: []
        }
      }
    ],
    skills: [
      { name: 'Languages', keywords: ['TypeScript', 'JavaScript', 'Python', 'Go'] },
      { name: 'Frontend', keywords: ['React', 'Next.js', 'Tailwind', 'shadcn/ui', 'Storybook'] },
      { name: 'Backend', keywords: ['Node.js', 'Postgres', 'Drizzle', 'tRPC'] },
      { name: 'Infra', keywords: ['Vercel', 'AWS', 'Cloudflare', 'Docker'] }
    ],
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

(async () => {
  // Find current revision id
  const [row] = await sql`SELECT current_revision_id FROM resumes WHERE id = ${RESUME_ID}`;
  if (!row) {
    console.error('No resume found');
    process.exit(1);
  }
  const revId = row.current_revision_id;
  console.log('Updating revision:', revId);

  // Update the revision data
  await sql`
    UPDATE resume_revisions
    SET data = ${sql.json(sampleData)}
    WHERE id = ${revId}
  `;
  console.log('Done.');

  // Verify
  const [verify] = await sql`SELECT data->>'template' as tpl, data->'sections'->'basics'->>'name' as name FROM resume_revisions WHERE id = ${revId}`;
  console.log('Verified:', verify);
  await sql.end();
})();
