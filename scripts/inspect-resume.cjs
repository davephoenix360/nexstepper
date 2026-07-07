// Quick DB inspection helper — reads the resume's *latest* revision so
// we know what test data we're loading against. Reads from
// `resume_revisions.data` (JSONB), not `resumes.*` (the resum row
// itself only holds metadata; the schema lives on the revision).
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

(async () => {
  const rows = await sql`
    SELECT
      r.id              AS resume_id,
      r.name            AS name,
      rev.data->'sections'->'skills'    AS skills,
      rev.data->'sections'->'education' AS education,
      length(rev.data::text)            AS bytes,
      rev.created_at
    FROM resumes r
    JOIN resume_revisions rev ON rev.id = r.current_revision_id
    WHERE r.id = '9663e16c-8350-49db-aa07-e30e99970d42'
  `;
  console.log(JSON.stringify(rows[0], null, 2));
  await sql.end();
})();
