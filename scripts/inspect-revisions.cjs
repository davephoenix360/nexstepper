// Look up the id column type + default for resume_revisions.
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

(async () => {
  const [cols] = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'resume_revisions'
    ORDER BY ordinal_position
  `;
  console.log(JSON.stringify(cols, null, 2));

  const [sample] = await sql`SELECT id, created_at FROM resume_revisions ORDER BY created_at DESC LIMIT 2`;
  console.log(JSON.stringify(sample, null, 2));
  await sql.end();
})();
