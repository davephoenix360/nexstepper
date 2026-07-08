require('dotenv').config({ path: '.env.local' });
const sql = require('postgres')(process.env.POSTGRES_URL, { ssl: 'require' });
sql`SELECT data FROM resume_revisions WHERE id = 'a777f6fc-7f92-4511-a0ef-e2224abb1108'`
  .then(([r]) => {
    console.log('typeof data:', typeof r.data);
    console.log('data:', JSON.stringify(r.data).slice(0, 500));
    sql.end();
  });
