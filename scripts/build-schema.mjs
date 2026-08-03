// Rebuilds supabase/schema.sql and supabase/seed.sql from the migrations.
//
// schema.sql is what a fresh install runs, so a migration missing from it is
// missing from any new database. Rebuilding rather than appending means it is
// always exactly the migrations folder, no matter how many times you run it.
//
// Run it with: npm run schema

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const MIGRATIONS = 'supabase/migrations'

const SCHEMA_HEADER = `-- =====================================================================
-- Papi Chulo Hub, full schema.
--
-- Built from supabase/migrations/ by scripts/build-schema.mjs. Do not edit
-- this file by hand: add a migration and run "npm run schema" instead.
--
-- WARNING: this file DROPS EVERY TABLE before creating them. It is meant
-- for setting up a new, empty database. Running it against a database
-- that has data in it will destroy that data with no warning and no way
-- back. To change a database that already exists, write a new numbered
-- migration instead.
--
-- Run supabase/seed.sql afterwards, or there will be no restaurants and
-- nothing in the app will load.
-- =====================================================================

`

const SEED_HEADER = `-- =====================================================================
-- Papi Chulo Hub, seed data.
--
-- Built from the seed migrations by scripts/build-schema.mjs. Run this
-- after schema.sql: with no restaurant, nothing in the app will load.
--
-- There is no check for rows that already exist, so running this twice
-- gives you two of everything. It is meant for a fresh database only.
-- =====================================================================

`

// Sorted so 000 comes before 020. Zero padding makes plain sorting correct.
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()

const isSeed = f => f.includes('seed')

function join_files(list) {
    return list
        .map(f => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/\r\n/g, '\n'))
        .join('\n')
}

const schema = SCHEMA_HEADER + join_files(files.filter(f => !isSeed(f)))
const seed = SEED_HEADER + join_files(files.filter(isSeed))

// Written without a byte order mark: Postgres can object to one before the
// first statement, and it is a miserable thing to debug in the SQL editor.
writeFileSync('supabase/schema.sql', schema, 'utf8')
writeFileSync('supabase/seed.sql', seed, 'utf8')

console.log(`schema.sql  ${files.filter(f => !isSeed(f)).length} migrations, ${schema.split('\n').length} lines`)
console.log(`seed.sql    ${files.filter(isSeed).length} migrations, ${seed.split('\n').length} lines`)