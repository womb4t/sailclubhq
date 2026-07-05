const { Client } = require('pg');
const fs = require('fs');
function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const env = fs.readFileSync('.env.local', 'utf8');
  const m = env.match(/^SUPABASE_DB_URL=(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}
(async () => {
  const c = new Client({ connectionString: dbUrl() });
  await c.connect();
  const sql = fs.readFileSync('supabase/migrations/025_crew_invites.sql', 'utf8');
  await c.query(sql);
  console.log('Migration 025 applied.');
  const cols = await c.query("select column_name from information_schema.columns where table_name='race_entries' and column_name in ('crew_invited_by','crew_invite_status','crew_invited_boat_name') order by column_name");
  console.log('New columns present:', cols.rows.map(r => r.column_name).join(', '));
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
