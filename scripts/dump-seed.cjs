// For every revision of the test resume, dump its sections keys.
// That tells us which revision lost the basics/work/etc.
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

(async () => {
  const rows = await sql`
    SELECT rev.id, rev.created_at, rev.data
    FROM resume_revisions rev
    WHERE rev.resume_id = '9663e16c-8350-49db-aa07-e30e99970d42'
    ORDER BY rev.created_at ASC
  `;
  for (const r of rows) {
    let sections = r.data?.sections;
    if (typeof sections === 'string') {
      // bad row — driver returned the JSONB as a char-indexed string
      sections = null;
    }
    const keys = sections ? Object.keys(sections).sort() : '[stringified-as-string]';
    console.log(r.created_at.toISOString(), r.id.slice(0, 8), keys);
  }
  await sql.end();
})();
