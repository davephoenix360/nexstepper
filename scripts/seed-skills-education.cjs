// Seed test data into the test resume so we can visually verify the
// inline-editable sections (Skills + Education + Projects + Volunteer +
// Awards). Writes a new revision row and updates
// `resumes.current_revision_id`, mirroring what saveResumeAction does
// (but bypassing the auth/lock check — this is a dev-only shortcut,
// not production code).
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

const RESUME_ID = '9663e16c-8350-49db-aa07-e30e99970d42';

const skillsSeed = [
  {
    name: 'Cloud & DevOps',
    level: 'Senior',
    keywords: ['AWS', 'Terraform', 'Kubernetes', 'GitHub Actions']
  },
  {
    name: 'Frontend',
    level: 'Senior',
    keywords: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS']
  },
  {
    name: 'Backend',
    level: 'Mid',
    keywords: ['Postgres', 'Node.js', 'Drizzle', 'Better Auth']
  }
];

const educationSeed = [
  {
    institution: 'University of Colorado Boulder',
    url: '',
    location: 'Boulder, CO',
    degree: {
      degreeLevel: 'B.S. Computer Science',
      majors: ['Computer Science'],
      minors: []
    },
    startDate: '2014',
    endDate: '2018',
    gpa: '',
    courses: []
  }
];

const projectsSeed = [
  {
    name: 'Nextep',
    description: 'AI-assisted resume builder, schema-driven.',
    highlights: [
      'Built the WYSIWYG editor on RHF + Zod-backed field arrays.',
      'Shipped Phase 1 slices 1–3 (schema-form, editor, preview).',
      'Cut AC–>commit cycle from weeks to hours.'
    ],
    keywords: ['Next.js', 'TypeScript', 'Drizzle', 'Tailwind CSS'],
    startDate: '2026',
    endDate: '',
    url: '',
    roles: ['Founder', 'Solo developer']
  }
];

const volunteerSeed = [
  {
    organization: 'Boulder Dev Meetup',
    position: 'Co-organizer',
    url: '',
    startDate: '2024',
    endDate: '',
    summary: 'Monthly AI + web meetup; ~150 attendees.',
    highlights: [
      'Lined up speakers + sponsors every month.',
      'Kept the discord friendly & on-topic.'
    ]
  }
];

const awardsSeed = [
  {
    title: 'Top Open-Source Contributor',
    date: '2025',
    awarder: 'NocoDE Conference',
    summary: 'For sustained work on schema-driven UI primitives.'
  }
];

(async () => {
  await sql.begin(async (tx) => {
    // 1. Read the current revision data so we can preserve basics/work.
    const [{ data: existing }] = await tx`
      SELECT rev.data
      FROM resumes r
      JOIN resume_revisions rev ON rev.id = r.current_revision_id
      WHERE r.id = ${RESUME_ID}
    `;

    // 2. Stamp seeded sections back into a new revision payload.
    const merged = {
      ...existing,
      sections: {
        ...existing.sections,
        skills: skillsSeed,
        education: educationSeed,
        projects: projectsSeed,
        volunteer: volunteerSeed,
        awards: awardsSeed
      }
    };

    // 3. Insert a new revision (append-only history). The id column is
    // text — no DB default — so we generate a uuid client-side (matching
    // what Better Auth uses for primary keys).
    //
    // Pass the data as a plain JS object — postgres-js serializes JS
    // objects to JSONB automatically (no ::jsonb cast needed). Casting
    // a JSON.stringify-ed string with ::jsonb works in a parameterized
    // query too, but we hit a double-encoding quirk in this project,
    // so we keep things simple and let the driver handle it.
    const newRevisionId = crypto.randomUUID();
    await tx`
      INSERT INTO resume_revisions (id, resume_id, data, created_at)
      VALUES (
        ${newRevisionId},
        ${RESUME_ID},
        ${merged},
        NOW()
      )
    `;

    // 4. Flip current_revision_id on the parent resume row.
    await tx`
      UPDATE resumes
      SET current_revision_id = ${newRevisionId},
          updated_at = NOW()
      WHERE id = ${RESUME_ID}
    `;

    console.log(
      `Seeded revision ${newRevisionId}: ${skillsSeed.length} skills, ` +
        `${educationSeed.length} edu, ${projectsSeed.length} proj, ` +
        `${volunteerSeed.length} vol, ${awardsSeed.length} awards.`
    );
  });

  await sql.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
