// Usage: node scripts/run-migration.js supabase/migrations/023_hide_intro.sql
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// Load SUPABASE_DB_URL from .env.local
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const m = env.match(/^SUPABASE_DB_URL=(.+)$/m)
if (!m) { console.error('SUPABASE_DB_URL not found'); process.exit(1) }
const connectionString = m[1].trim().replace(/^["']|["']$/g, '')

const file = process.argv[2]
if (!file) { console.error('pass a .sql file'); process.exit(1) }
const sql = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

;(async () => {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  const { rows } = await client.query(
    "select column_name, data_type, column_default from information_schema.columns where table_name='profiles' and column_name='hide_intro'"
  )
  console.log('applied:', file)
  console.log('verify:', JSON.stringify(rows))
  await client.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
