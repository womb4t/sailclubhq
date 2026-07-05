const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const cs = m[1].trim().replace(/^["']|["']$/g, '')
const KENTON = '77284a63-8850-43a2-8cda-aa929528a14a'  // admin
const CLUB = 'e9e25255-4563-4710-a171-5a86d3e5365a'
async function asUser(c, uid){ await c.query('reset role'); await c.query('reset request.jwt.claims'); await c.query('set local role authenticated'); await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`) }
async function mkUser(c, email, role){
  const uid=(await c.query("insert into auth.users (id,instance_id,aud,role,email) values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$1) returning id",[email])).rows[0].id
  await c.query("insert into profiles (id,full_name,club_id,role) values ($1,$2,$3,$4) on conflict (id) do update set club_id=$3, role=$4",[uid,email.split('@')[0],CLUB,role])
  return uid
}
async function ood(c){ const r=(await c.query('select ood_id, ood_accepted from races where id=$1',[global.race])).rows[0]; return r }
;(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
  await c.connect(); await c.query('begin')

  global.race = (await c.query("insert into races (club_id,name,race_date,status,entry_token) values ($1,'OOD test',current_date,'planned',$2) returning id",[CLUB,'oodtok_'+Math.random().toString(36).slice(2,8)])).rows[0].id
  // create all test users up front (before switching to the authenticated role)
  const alice = await mkUser(c,'alice@ex.com','member')
  const bob   = await mkUser(c,'bob@ex.com','member')
  const carol = await mkUser(c,'carol@ex.com','member')

  // 1) empty -> Alice takes it (accepted)
  await asUser(c, alice)
  console.log('1) alice take (empty):', (await c.query('select ood_take($1) as r',[global.race])).rows[0].r, await ood(c))

  // 2) Bob tries to take accepted OOD -> blocked
  await asUser(c, bob)
  console.log('2) bob take (accepted held):', (await c.query('select ood_take($1) as r',[global.race])).rows[0].r)

  // 3) Alice nominates Bob -> provisional, must accept
  await asUser(c, alice)
  console.log('3) alice nominate bob:', (await c.query('select ood_nominate($1,$2) as r',[global.race,bob])).rows[0].r, await ood(c))

  // 4) Carol tries to take provisional -> needs-confirm; then override -> taken
  await asUser(c, carol)
  console.log('4a) carol take (provisional, no override):', (await c.query('select ood_take($1,false) as r',[global.race])).rows[0].r)
  console.log('4b) carol take (override):', (await c.query('select ood_take($1,true) as r',[global.race])).rows[0].r, await ood(c))

  // 5) officer (Kenton) pre-assigns Bob -> provisional; Bob accepts
  await asUser(c, KENTON)
  console.log('5a) kenton assign bob:', (await c.query('select ood_assign($1,$2) as r',[global.race,bob])).rows[0].r, await ood(c))
  await asUser(c, bob)
  console.log('5b) bob accept:', (await c.query('select ood_accept($1) as r',[global.race])).rows[0].r, await ood(c))

  // 6) now Bob accepted -> Alice blocked
  await asUser(c, alice)
  console.log('6) alice take (bob accepted):', (await c.query('select ood_take($1,true) as r',[global.race])).rows[0].r)

  // 7) Bob stands down -> empty
  await asUser(c, bob)
  console.log('7) bob stand down:', (await c.query('select ood_stand_down($1) as r',[global.race])).rows[0].r, await ood(c))

  await c.query('rollback')
  console.log('rolled back — clean')
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
