const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '035_individual_recall.sql'), 'utf8')
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(sql)
  console.log('035 applied OK')
  const { rows: reCols } = await c.query(
    "select column_name, data_type from information_schema.columns where table_name='race_entries' and column_name in ('ocs','ocs_at') order by column_name"
  )
  console.log('race_entries columns:', JSON.stringify(reCols))
  const { rows: rCols } = await c.query(
    "select column_name, data_type from information_schema.columns where table_name='races' and column_name='individual_recall'"
  )
  console.log('races columns:', JSON.stringify(rCols))
  const { rows: fn } = await c.query(
    "select proname from pg_proc where proname in ('ood_flag_ocs','ood_set_individual_recall') order by proname"
  )
  console.log('functions:', JSON.stringify(fn.map(r => r.proname)))
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
