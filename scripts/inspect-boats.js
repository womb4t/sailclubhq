const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const cs = m[1].trim().replace(/^["']|["']$/g, '')
const TOKEN = 'eade045afa58eed4de0cc032af80fd63'
;(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const race = (await c.query("select id, name, club_id, entry_token from races where entry_token=$1",[TOKEN])).rows[0]
  console.log('race:', race)
  console.log('all boats:', (await c.query("select id, boat_name, owner_id, club_id from boats order by created_at")).rows)
  console.log('profiles (owner/club):', (await c.query("select id, full_name, club_id, role from profiles")).rows)
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
