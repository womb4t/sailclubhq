const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const CLUB = 'e9e25255-4563-4710-a171-5a86d3e5365a'
async function asUser(c, uid) {
  await c.query('set local role authenticated')
  await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
}
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query('begin')

  // Need a race with an entry_token in Kenton's club. Create one (admin-owned) for the test.
  const token = 'testtok_' + Math.random().toString(36).slice(2, 10)
  await c.query(
    "insert into races (club_id, name, race_date, status, entry_token) values ($1,'Join-via-race test',current_date,'planned',$2)",
    [CLUB, token]
  )

  // Brand-new clubless user
  const uid = (await c.query("insert into auth.users (id, instance_id, aud, role, email) values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','newracer@example.com') returning id")).rows[0].id
  await c.query("insert into profiles (id, full_name, club_id, role) values ($1,'New Racer', null, 'member') on conflict (id) do update set club_id=null, role='member'", [uid])

  await asUser(c, uid)
  console.log('before:', (await c.query('select club_id, role from profiles where id=$1',[uid])).rows[0])
  console.log('rpc result:', (await c.query('select join_club_via_race($1) as r',[token])).rows[0].r)
  console.log('after:', (await c.query('select club_id, role from profiles where id=$1',[uid])).rows[0])

  // second call should be a no-op (already-in-club)
  console.log('rpc again:', (await c.query('select join_club_via_race($1) as r',[token])).rows[0].r)

  await c.query('rollback')
  console.log('rolled back — no test data left')
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
