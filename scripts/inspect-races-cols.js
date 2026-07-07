const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const url = m[1].trim()
;(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='races'
    ORDER BY ordinal_position`)
  console.log('=== races columns ===')
  for (const r of res.rows) console.log(`${r.column_name}\t${r.data_type}\t${r.is_nullable}`)
  const sc = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='start_classes'
    ORDER BY ordinal_position`)
  console.log('\n=== start_classes columns ===')
  for (const r of sc.rows) console.log(`${r.column_name}\t${r.data_type}`)
  await client.end()
})().catch(e => { console.error(e); process.exit(1) })
