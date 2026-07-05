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

  // (a) Kenton is admin now -> should return 'has-admin', no change
  await c.query('begin')
  await asUser(c, KENTON)
  console.log('(a) Kenton (already admin):', (await c.query('select claim_admin_if_orphaned() as r')).rows[0].r)
  await c.query('rollback')

  // (b) Simulate orphaned club: demote Kenton to member in a tx, then call -> 'promoted'
  await c.query('begin')
  await c.query("update profiles set role='member' where id=$1", [KENTON])
  await asUser(c, KENTON)
  console.log('(b) orphaned club, call result:', (await c.query('select claim_admin_if_orphaned() as r')).rows[0].r)
  console.log('    role after:', (await c.query('select role from profiles where id=$1',[KENTON])).rows[0].role)
  await c.query('rollback')
  console.log('rolled back — Kenton stays admin')

  console.log('final role:', (await c.query('select role from profiles where id=$1',[KENTON])).rows[0].role)
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
