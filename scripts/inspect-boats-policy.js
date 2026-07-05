const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const cs = m[1].trim().replace(/^["']|["']$/g, '')
;(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const { rows } = await c.query("select policyname, cmd, qual, with_check from pg_policies where tablename='boats' order by cmd")
  for (const r of rows) { console.log('---', r.cmd, '::', r.policyname); if (r.qual) console.log('  USING:', r.qual); if (r.with_check) console.log('  CHECK:', r.with_check) }
  console.log('boats columns:', (await c.query("select column_name, is_nullable from information_schema.columns where table_name='boats' order by ordinal_position")).rows.map(r=>`${r.column_name}${r.is_nullable==='NO'?'*':''}`).join(', '))
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
