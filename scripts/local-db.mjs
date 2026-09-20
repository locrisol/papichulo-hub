// Build the local database the way a brand new one is built.
//
// Run it with: npm run db:local
//
// This is the replacement for build-schema.mjs, and it does the opposite job.
// That one wrote supabase/schema.sql by gluing every migration together, which
// is why the file could not be read as a design. This one reads the design and
// checks it still builds a database.
//
// The order is the order a real install goes in, which is the point:
//
//   1. supabase db reset   an empty Supabase database
//   2. schema.sql          every table, key, rule and view
//   3. migrations/         anything written since, in order
//   4. seed.sql            the rows it cannot start without
//
// So if this works a fresh install works, and if a fresh install is going to
// break it breaks here rather than in front of somebody setting the project up.
//
// The Supabase CLI cannot do this on its own. `db reset` applies
// supabase/migrations and has no way to apply schema.sql, so a reset on its own
// would run the migrations against an empty database. That is why
// db.migrations.enabled is false in config.toml, and why this file exists.
// schema_paths in config.toml is for `db diff`, not for reset, which is worth
// knowing before trying it again.
//
// It counts the tables at the end. The first version of this script piped
// nothing into psql, so psql read an empty stdin, did nothing at all, and the
// script printed Done. An empty database and a successful run looked exactly
// the same, which is the one thing a setup script must never do.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const EXPECTED_TABLES = 39

for (const f of ['supabase/schema.sql', 'supabase/seed.sql']) {
    if (!existsSync(f)) {
        console.error(`Cannot find ${f}. Run this from the project root.`)
        process.exit(1)
    }
}

console.log('\n1. Resetting the local database')
execFileSync('npx', ['supabase', 'db', 'reset'], { stdio: 'inherit', shell: true })

// The container name follows project_id in supabase/config.toml. Asking docker
// is more reliable than guessing it.
const container = execFileSync(
    'docker',
    ['ps', '--filter', 'name=supabase_db', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
).trim().split('\n')[0]

if (!container) {
    console.error('\nNo supabase_db container is running. Start it with: npx supabase start')
    process.exit(1)
}

const psql = (args, input) => execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', ...args],
    { input, encoding: 'utf8' },
)

const migrations = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort()

const files = [
    'supabase/schema.sql',
    ...migrations.map(f => `supabase/migrations/${f}`),
    'supabase/seed.sql',
]

// psql reads from stdin, so nothing has to be copied into the container first
// and a project path with a space in it cannot bite.
for (const [i, file] of files.entries()) {
    console.log(`\n${i + 2}. Applying ${file}`)
    try {
        psql(['-v', 'ON_ERROR_STOP=1', '-q'], readFileSync(file))
    } catch (err) {
        console.error(`\n${file} failed:\n`)
        console.error(err.stderr || err.message)
        process.exit(1)
    }
}

const one = (sql) => Number(psql(['-t', '-A', '-c', sql], '').trim())

const tables = one("select count(*) from pg_tables where schemaname = 'public'")
const places = one('select count(*) from public.restaurants')

console.log(`\n${tables} tables, ${places} restaurants, ${migrations.length} migrations on top.`)

if (tables < EXPECTED_TABLES) {
    console.error(`Expected at least ${EXPECTED_TABLES} tables. Something did not run.`)
    process.exit(1)
}
if (places < 1) {
    console.error('No restaurants. Nothing in the app would load against this database.')
    process.exit(1)
}

console.log('Done.')
