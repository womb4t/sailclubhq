const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
const cs = m[1].trim().replace(/^["']|["']$/g, '')
;(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const rows = (await c.query(`
    select p.id, p.full_name, p.role, p.club_id, u.email, u.created_at, u.last_sign_in_at
    from profiles p left join auth.users u on u.id = p.id
    order by u.created_at
  `)).rows
  console.log('accounts:', JSON.stringify(rows, null, 2))
  // is email unique in auth.users?
  console.log('email unique index:', (await c.query("select indexname, indexdef from pg_indexes where tablename='users' and schemaname='auth' and indexdef ilike '%email%'")).rows)
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
