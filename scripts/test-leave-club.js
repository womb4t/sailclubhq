const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const KENTON = '77284a63-8850-43a2-8cda-aa929528a14a'
async function asUser(c, uid) {
  await c.query('set local role authenticated')
  await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
}
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // (a) Kenton is sole admin -> should be blocked
  await c.query('begin')
  await asUser(c, KENTON)
  console.log('(a) sole admin leave attempt:', (await c.query('select leave_club() as r')).rows[0].r)
  console.log('    still in club?', (await c.query('select club_id, role from profiles where id=$1',[KENTON])).rows[0])
  await c.query('rollback')

  // (b) If Kenton were a member (not admin), leaving should work
  await c.query('begin')
  await c.query("update profiles set role='member' where id=$1", [KENTON])
  await asUser(c, KENTON)
  console.log('(b) member leave attempt:', (await c.query('select leave_club() as r')).rows[0].r)
  console.log('    after:', (await c.query('select club_id, role from profiles where id=$1',[KENTON])).rows[0])
  await c.query('rollback')
  console.log('rolled back — Kenton unchanged')

  console.log('final:', (await c.query('select club_id, role from profiles where id=$1',[KENTON])).rows[0])
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
