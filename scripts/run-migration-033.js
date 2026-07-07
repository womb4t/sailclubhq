const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '033_race_control_start.sql'), 'utf8')
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(sql)
  console.log('033 applied OK')
  const { rows } = await c.query(
    "select column_name, data_type from information_schema.columns where table_name='races' and column_name='start_scheduled_at'"
  )
  console.log('column check:', JSON.stringify(rows))
  const { rows: fn } = await c.query(
    "select proname from pg_proc where proname='ood_set_start'"
  )
  console.log('function check:', JSON.stringify(fn))
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
