const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')
const CLUB = 'e9e25255-4563-4710-a171-5a86d3e5365a'
;(async () => {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const admins = (await c.query(
    "select id, full_name, role from profiles where club_id=$1 and role='admin'", [CLUB]
  )).rows
  console.log('current admins in club:', admins)
  if (admins.length === 0) {
    // No admin in this club — promote its sole owner (Kenton) to admin.
    const res = await c.query(
      "update profiles set role='admin' where club_id=$1 and full_name='Kenton Ward' returning id, full_name, role", [CLUB]
    )
    console.log('promoted:', res.rows)
  } else {
    console.log('club already has an admin — no change made')
  }
  console.log('after:', (await c.query('select full_name, role from profiles where club_id=$1', [CLUB])).rows)
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
