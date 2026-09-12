// Build the local database the way a brand new one is built.
//
// Run it with: npm run db:local
//
// This is the replacement for build-schema.mjs, and it does the opposite job.
// That one wrote supabase/schema.sql by gluing every migration together, which
// is why the file could not be read as a design. This one reads the design and
// checks it still builds a database.
//
// The steps are exactly the ones in the README, so if this works a fresh
// install works, and if a fresh install is going to break it breaks here first
// rather than in front of somebody setting the project up.
//
//   1. supabase db reset   an empty Supabase database, no migrations
//   2. schema.sql          every table, key, rule and view
//   3. seed.sql            the rows it cannot start without
//
// The Supabase CLI cannot do this on its own. `db reset` applies
// supabase/migrations, and the whole point is that the folder is empty until
// somebody writes 001. schema_paths in config.toml is for `db diff`, not for
// reset, which is a thing worth knowing before trying it again.
//
// It counts the tables at the end. The first version of this script piped
// nothing into psql, so psql read an empty stdin, did nothing at all, and the
// script printed Done. An empty database and a successful run looked exactly
// the same, which is the one thing a setup script must never do.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const EXPECTED_TABLES = 36

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

// psql reads from stdin, so nothing has to be copied into the container first
// and a project path with a space in it cannot bite.
for (const [step, file] of [['2', 'supabase/schema.sql'], ['3', 'supabase/seed.sql']]) {
    console.log(`\n${step}. Applying ${file}`)
    try {
        psql(['-v', 'ON_ERROR_STOP=1', '-q'], readFileSync(file))
    } catch (err) {
        console.error(`\n${file} failed:\n`)
        console.error(err.stderr || err.message)
        process.exit(1)
    }
}

const count = Number(psql(['-t', '-A', '-c',
    "select count(*) from pg_tables where schemaname = 'public'"], '').trim())

const places = Number(psql(['-t', '-A', '-c',
    'select count(*) from public.restaurants'], '').trim())

console.log(`\n${count} tables, ${places} restaurants.`)

if (count < EXPECTED_TABLES) {
    console.error(`Expected at least ${EXPECTED_TABLES} tables. Something did not run.`)
    process.exit(1)
}
if (places < 1) {
    console.error('No restaurants. Nothing in the app would load against this database.')
    process.exit(1)
}

console.log('Done.')
