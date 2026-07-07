// Seed test data into the test resume so we can visually verify the
// Skills + Education inline renderings. Writes a new revision row and
// updates `resumes.current_revision_id`, mirroring what saveResumeAction
// does (but bypassing the auth/lock check — this is a dev-only
// shortcut, not production code).
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

const RESUME_ID = '9663e16c-8350-49db-aa07-e30e99970d42';

// The minimum ResumeData shape (envelope + sections.skills + sections.education)
// so we can inject via Postgres JSON. We keep the existing basics/work
// and just add skills + education rows.
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
        education: educationSeed
      }
    };

    // 3. Insert a new revision (append-only history). The id column is
    // text — no DB default — so we generate a uuid client-side (matching
    // what Better Auth uses for primary keys).
    const newRevisionId = crypto.randomUUID();
    await tx`
      INSERT INTO resume_revisions (id, resume_id, data, created_at)
      VALUES (
        ${newRevisionId},
        ${RESUME_ID},
        ${JSON.stringify(merged)}::jsonb,
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

    console.log(`Seeded revision ${newRevisionId} with ${skillsSeed.length} skills and ${educationSeed.length} education entries.`);
  });

  await sql.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
