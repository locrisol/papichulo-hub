import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { photoPath } from '@/lib/photo'
import { ALLERGEN_KEYS } from '@/lib/allergens'

// What supabase/schema.sql must hold that no comparison with live can catch.
//
// The fold is checked by dumping live and a database built from the file and
// comparing them object by object. Both dumps cover public, so anything the
// design puts on a table outside it is invisible to that check, and the two
// triggers on auth.users went missing in the September rewrite without it
// saying a word. Live kept them; a new database, a restore or db:local would
// not have had them.
const schema = readFileSync('supabase/schema.sql', 'utf8')

describe('a database built from schema.sql', () => {
    // Without it a new login has no users row, so get_my_role() is null, every
    // policy refuses them, and they see "Your login is switched off" with no
    // row on the Users page for anybody to give a role to.
    it('gives a new login its users row', () => {
        expect(schema).toContain(
            'CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" '
            + 'FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();',
        )
    })

    // Before, not after. The users row points at the login, and the check on
    // that key would refuse the delete before an after trigger could clear it.
    it('takes the users row away before the login goes', () => {
        expect(schema).toContain(
            'CREATE OR REPLACE TRIGGER "on_auth_user_deleted" BEFORE DELETE ON "auth"."users" '
            + 'FOR EACH ROW EXECUTE FUNCTION "public"."handle_delete_user"();',
        )
    })
})

// A store manager's own holiday or day off is an owner's to answer, and the
// database refuses their own answer. Their own part of a day is not: the mail
// tells nobody about it, so nobody else would ever answer it. Since 029.
describe('who answers a store manager\'s own time off', () => {
    const start = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."absence_answer_guard"()')
    const guard = schema.slice(start, schema.indexOf('end $$;', start))

    it('is an owner, for a whole day', () => {
        expect(start, 'absence_answer_guard is not in schema.sql').toBeGreaterThan(-1)
        expect(guard).toContain("raise exception 'You cannot answer your own request. An owner has to.'")
    })

    it('is the manager, for their own part of a day', () => {
        expect(guard).toContain('and old.can_work_from is null')
        expect(guard).toContain('and old.can_work_to is null')
    })
})

// The columns the allergen answer depends on. Each one had a default and no
// NOT NULL, and the app reads an empty one as none or as false: an allergen
// left empty by a script or a spreadsheet pasted into the table editor read as
// not present, a MIX whose is_mix was empty was never opened up, and a dish or
// category with is_active empty dropped off the sheet. Since 032.
describe('what the allergen answer depends on', () => {
    // One column's line inside one table, from schema.sql.
    function columnLine(table, column) {
        const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${table}" (`)
        expect(start, `${table} is not in schema.sql`).toBeGreaterThan(-1)
        const body = schema.slice(start, schema.indexOf(');', start))
        const line = body.split('\n').find(l => l.trim().startsWith(`"${column}" `))
        expect(line, `${table}.${column} is not in schema.sql`).toBeTruthy()
        return line
    }

    it.each([
        ...ALLERGEN_KEYS.map(key => ['product_allergens', key]),
        ['products', 'is_mix'],
        ['products', 'is_active'],
        ['menu_items', 'is_active'],
        ['menu_categories', 'is_active'],
    ])('%s.%s cannot be empty', (table, column) => {
        expect(columnLine(table, column)).toMatch(/NOT NULL/)
    })
})

describe('today, to the database', () => {
    // The database's own date is UTC, and the app writes the date the phone
    // shows. From midnight to one in the morning in summer those are two days,
    // so waste an employee had just logged vanished from their own list the
    // moment it was saved. Live agreed with the file, so only this would say.
    it('is the date in Ireland, never the server date', () => {
        const code = schema.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
        expect(code).not.toMatch(/current_date/i)
    })
})

// The policies on one table, each as its whole statement.
const policiesOn = table => schema.match(
    new RegExp(String.raw`CREATE POLICY "\w+" ON "public"\."${table}"[^;]*;`, 'g'),
) || []

describe('what staff are given of their restaurant', () => {
    // A row policy picks rows and cannot pick columns. So the only way to give
    // staff their restaurant without its money and its mail addresses is a
    // view that leaves them out, and no policy on the table for them at all.
    const start = schema.indexOf('CREATE OR REPLACE VIEW "public"."staff_restaurants"')
    const view = start < 0 ? '' : schema.slice(start, schema.indexOf(';', start))

    it('has the hours and rules My shifts needs', () => {
        for (const column of ['opening_hours', 'break_rules', 'roster_rules', 'watch_city_events']) {
            expect(view, `staff_restaurants has no ${column}`).toContain(`"${column}"`)
        }
    })

    it('leaves out the cost targets, the default rate and the mail addresses', () => {
        for (const column of [
            'food_cost_target', 'labour_cost_target', 'packaging_cost_target', 'hourly_rate',
            'report_recipients', 'timesheet_recipients', 'mail_from', 'pay_period_start',
        ]) {
            expect(view, `staff_restaurants hands over ${column}`).not.toContain(column)
        }
    })

    it('gives an employee no way to read the table itself', () => {
        const forStaff = policiesOn('restaurants').filter(p => p.includes("'employee'"))
        expect(forStaff).toEqual([])
    })

    it('can be read by people signed in and changed by nobody', () => {
        expect(schema).toMatch(/revoke all on public\.staff_restaurants\s+from anon, authenticated, public;/)
        expect(schema).toMatch(/grant select on public\.staff_restaurants\s+to authenticated;/)
    })
})

describe('what staff are given of their own record on the team', () => {
    // The row carries what they cost per hour and whatever a manager wrote
    // about them in Notes. My shifts finds them through roster_colleagues, so
    // no policy on the table answers to the person it is about.
    it('gives nobody below a manager a read of the employees table', () => {
        const policies = policiesOn('employees')
        expect(policies.length, 'found no policies on employees to check').toBeGreaterThan(0)
        const forStaff = policies.filter(p => p.includes('"auth"."uid"') || p.includes("'employee'"))
        expect(forStaff).toEqual([])
    })
})

describe('a switched off account', () => {
    // get_my_role() answers nothing for an account that is not active, which
    // is how every rule refuses a leaver the night after their last day. A
    // rule that only asks auth.uid() skips that check.
    it('reads none of its own private diary entries', () => {
        const select = policiesOn('diary_entries')
            .find(p => p.startsWith('CREATE POLICY "diary_entries_select"')) || ''
        // Private is the last of the three scopes in the rule.
        const own = select.slice(select.indexOf(`("scope" = 'private'::"text")`))
        expect(own, 'found no private scope in diary_entries_select').toContain('"auth"."uid"')
        expect(own).toContain('( SELECT "public"."get_my_role"() ) IS NOT NULL')
    })
})

describe('the nightly photo job', () => {
    // It keeps a photo while its round is open, and finds the round from the
    // third folder of the path. Pinned against where the app puts the photo,
    // so the round cannot move in the path without a test saying the job
    // would then delete photos still waiting to be submitted. Live would agree
    // with the file either way, so no comparison would notice.
    it('keeps an open round\'s photos, looking for the round where the app puts it', () => {
        const round = 'b3f1c2d4-0000-4000-8000-000000000001'
        expect(photoPath('R1', 'round', round).split('/')[2]).toBe(round)

        const due = schema.slice(schema.indexOf('function public.checklist_photos_due()'))
        expect(due.slice(0, due.indexOf('$$;')))
            .toMatch(/r\.id::text = split_part\(o\.name, '\/', 3\)\s+and r\.ended_at is null/)
    })
})

describe('places say how their last read went', () => {
    // read-listings writes it when a page cannot be read, and the settings row
    // shows it. Without the column a page failing every Monday only kept an
    // old date with nothing saying why.
    it('has a column for what went wrong reading a page', () => {
        const migration = readFileSync('supabase/migrations/028_the_feed_says_how_it_went.sql', 'utf8')
        expect(migration).toContain('alter table public.places add column if not exists read_problem text;')
        const table = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS "public"."places"'))
        expect(table.slice(0, table.indexOf(');'))).toContain('"read_problem" "text"')
    })
})

describe('the change log', () => {
    // Every Ticketmaster sync stamps the place it checked, twice a day and on
    // every manager's visit, and the weekly page read does the same. Logged,
    // that was four places writing "The Hub itself" into Changes all day long
    // to say only that something ran. What went wrong is real news, so it stays.
    const ignoredIn = text => {
        const found = /audit_ignored_columns"?\(\)[\s\S]*?array\[([^\]]*)\]/.exec(text)
        return found ? found[1].split(',').map(v => v.trim().replace(/'/g, '')) : []
    }

    it('does not log a sync that only says when it ran and how many it found', () => {
        const migration = readFileSync('supabase/migrations/028_the_feed_says_how_it_went.sql', 'utf8')
        for (const text of [schema, migration]) {
            const ignored = ignoredIn(text)
            for (const column of ['updated_at', 'last_seen_at', 'feed_synced_at', 'feed_count', 'last_read_at', 'last_read_count']) {
                expect(ignored).toContain(column)
            }
            expect(ignored).not.toContain('feed_problem')
            expect(ignored).not.toContain('read_problem')
        }
    })
})
