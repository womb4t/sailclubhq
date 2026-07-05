// Simulate an authenticated insert under RLS as Kenton, then roll back.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const KENTON = '77284a63-8850-43a2-8cda-aa929528a14a'
const CLUB = 'e9e25255-4563-4710-a171-5a86d3e5365a'
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query('begin')
  // Emulate PostgREST auth context
  await c.query("set local role authenticated")
  await c.query(`set local request.jwt.claims = '{"sub":"${KENTON}","role":"authenticated"}'`)
  try {
    const res = await c.query(
      "insert into races (club_id, name, race_date, status, created_by) values ($1,$2,current_date,'draft',$3) returning id, name, status",
      [CLUB, 'RLS test race (rollback)', KENTON]
    )
    console.log('INSERT OK under RLS:', res.rows)
  } catch (e) {
    console.log('INSERT FAILED under RLS:', e.message)
  }
  await c.query('rollback')
  console.log('rolled back (no test data left)')
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
