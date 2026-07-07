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
  await c.query(fs.readFileSync('supabase/migrations/029_entry_sail_number.sql', 'utf8'));
  const cols = await c.query("select column_name from information_schema.columns where table_name='race_entries' and column_name='sail_number'");
  console.log('Migration 029 applied. sail_number present:', cols.rowCount === 1);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
