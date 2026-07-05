const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const cs = m[1].trim().replace(/^["']|["']$/g, '')
async function asUser(c, uid){ await c.query('reset role'); await c.query('reset request.jwt.claims'); await c.query('set local role authenticated'); await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`) }
;(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
  await c.connect(); await c.query('begin')

  // A clubless user
  const uid = (await c.query("insert into auth.users (id,instance_id,aud,role,email) values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','boatless@ex.com') returning id")).rows[0].id
  await c.query("insert into profiles (id,full_name,club_id,role) values ($1,'Boatless',null,'member') on conflict (id) do update set club_id=null, role='member'",[uid])

  await asUser(c, uid)
  // insert a boat with NO club
  try {
    const b = await c.query("insert into boats (owner_id, owner_name, boat_name, club_id) values ($1,'Boatless','Windrush',null) returning id, boat_name, club_id",[uid])
    console.log('clubless insert:', b.rows[0])
  } catch(e){ console.log('clubless insert FAILED:', e.message) }
  // read own boats
  console.log('read own boats:', (await c.query('select boat_name, club_id from boats where owner_id=$1',[uid])).rows)

  await c.query('rollback')
  console.log('rolled back — clean')
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
