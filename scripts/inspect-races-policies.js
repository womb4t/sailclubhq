const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows } = await c.query(
    "select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename='races' order by cmd, policyname"
  )
  for (const r of rows) {
    console.log('---', r.cmd, '::', r.policyname, '::', r.roles)
    if (r.qual) console.log('  USING:', r.qual)
    if (r.with_check) console.log('  WITH CHECK:', r.with_check)
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
