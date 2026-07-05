const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const KENTON = '77284a63-8850-43a2-8cda-aa929528a14a'
const CLUB = 'e9e25255-4563-4710-a171-5a86d3e5365a'
async function asUser(c, uid) {
  await c.query('set local role authenticated')
  await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
}
// a throwaway second user id to simulate a member (must exist in auth.users for FK-free profiles? profiles.id FKs auth.users)
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // Make a real member to test with: create an auth user + profile inside a tx, rollback after.
  await c.query('begin')
  const uid = (await c.query("insert into auth.users (id, instance_id, aud, role, email) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000','authenticated','authenticated','testmember@example.com') returning id")).rows[0].id
  await c.query("insert into profiles (id, full_name, club_id, role) values ($1,'Test Member',$2,'member') on conflict (id) do update set club_id=excluded.club_id, role=excluded.role", [uid, CLUB])

  // (1) member claims race officer while none exist -> 'claimed'
  await c.query('savepoint s1')
  await asUser(c, uid)
  console.log('(1) member claim (no officers):', (await c.query('select claim_race_officer_if_none() as r')).rows[0].r)
  console.log('    role:', (await c.query('select role from profiles where id=$1',[uid])).rows[0].role)
  // now that they are officer, can they insert a race?
  try {
    await c.query("insert into races (club_id,name,race_date,status,created_by) values ($1,'RO test',current_date,'draft',$2)", [CLUB, uid])
    console.log('    race insert as officer: OK')
  } catch(e){ console.log('    race insert as officer FAILED:', e.message) }
  await c.query('rollback to savepoint s1')

  // (2) second member tries to claim when an officer already exists -> 'officers-exist'
  await c.query('savepoint s2')
  await c.query("update profiles set role='race_officer' where id=$1",[uid]) // uid is now an officer
  const uid2 = (await c.query("insert into auth.users (id, instance_id, aud, role, email) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000','authenticated','authenticated','testmember2@example.com') returning id")).rows[0].id
  await c.query("insert into profiles (id, full_name, club_id, role) values ($1,'Test Member 2',$2,'member') on conflict (id) do update set club_id=excluded.club_id, role=excluded.role", [uid2, CLUB])
  await asUser(c, uid2)
  console.log('(2) 2nd member claim (officer exists):', (await c.query('select claim_race_officer_if_none() as r')).rows[0].r)
  await c.query('rollback to savepoint s2')

  // (3) admin grants + revokes race officer
  await c.query('savepoint s3')
  await asUser(c, KENTON)
  console.log('(3a) admin grant:', (await c.query('select set_race_officer($1,true) as r',[uid])).rows[0].r, '-> role', (await c.query('select role from profiles where id=$1',[uid])).rows[0].role)
  console.log('(3b) admin revoke:', (await c.query('select set_race_officer($1,false) as r',[uid])).rows[0].r, '-> role', (await c.query('select role from profiles where id=$1',[uid])).rows[0].role)
  await c.query('rollback to savepoint s3')

  // (4) member cannot grant officer (not-admin)
  await c.query('savepoint s4')
  await asUser(c, uid)
  console.log('(4) member tries to grant:', (await c.query('select set_race_officer($1,true) as r',[uid])).rows[0].r)
  await c.query('rollback to savepoint s4')

  await c.query('rollback')
  console.log('all rolled back — no test data left')
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
