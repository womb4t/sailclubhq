const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const cs = m[1].trim().replace(/^["']|["']$/g, '')
const KENTON = '77284a63-8850-43a2-8cda-aa929528a14a'
const CLUB = 'e9e25255-4563-4710-a171-5a86d3e5365a'
async function asUser(c, uid){ await c.query('set local role authenticated'); await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`) }
;(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
  await c.connect(); await c.query('begin')

  const uid = (await c.query("insert into auth.users (id,instance_id,aud,role,email) values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','req@example.com') returning id")).rows[0].id
  await c.query("insert into profiles (id,full_name,club_id,role) values ($1,'Requester',$2,'member') on conflict (id) do update set club_id=$2, role='member'", [uid, CLUB])

  await c.query('savepoint s')
  await asUser(c, uid)
  console.log('request:', (await c.query('select request_race_officer() as r')).rows[0].r)
  console.log('request again:', (await c.query('select request_race_officer() as r')).rows[0].r)
  const reqId = (await c.query('select id from race_officer_requests where user_id=$1 and status=$2',[uid,'pending'])).rows[0].id
  await c.query('rollback to savepoint s')

  // recreate the request as the member, then admin approves
  await c.query('savepoint s2')
  await asUser(c, uid)
  await c.query('select request_race_officer()')
  const rid = (await c.query('select id from race_officer_requests where user_id=$1 and status=$2',[uid,'pending'])).rows[0].id
  await c.query('reset role'); await c.query('reset request.jwt.claims')
  await asUser(c, KENTON)
  console.log('admin approve:', (await c.query('select decide_race_officer_request($1,true) as r',[rid])).rows[0].r)
  console.log('requester role now:', (await c.query('select role from profiles where id=$1',[uid])).rows[0].role)
  await c.query('rollback to savepoint s2')

  // member cannot approve
  await c.query('savepoint s3')
  await asUser(c, uid)
  await c.query('select request_race_officer()')
  const rid2 = (await c.query('select id from race_officer_requests where user_id=$1 and status=$2',[uid,'pending'])).rows[0].id
  console.log('member tries approve own:', (await c.query('select decide_race_officer_request($1,true) as r',[rid2])).rows[0].r)
  await c.query('rollback to savepoint s3')

  await c.query('rollback')
  console.log('rolled back — clean')
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
