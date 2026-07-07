const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '034_race_control_status.sql'), 'utf8')
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(sql)
  console.log('034 applied OK')
  const { rows: cols } = await c.query(
    "select column_name, data_type from information_schema.columns where table_name='races' and column_name in ('race_status','control_message','control_message_at') order by column_name"
  )
  console.log('columns:', JSON.stringify(cols))
  const { rows: fn } = await c.query(
    "select proname from pg_proc where proname in ('ood_delay_start','ood_abandon_race','ood_clear_message') order by proname"
  )
  console.log('functions:', JSON.stringify(fn.map(r => r.proname)))
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
