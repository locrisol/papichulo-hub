import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { photoPath } from '@/lib/photo'
import { ALLERGEN_KEYS } from '@/lib/allergens'
import { STAFF_WEEKS } from '@/lib/roster'

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

// One view's definition, from its CREATE to the end of its where clause.
const viewNamed = name => {
    const start = schema.indexOf(`CREATE OR REPLACE VIEW "public"."${name}"`)
    return start < 0 ? '' : schema.slice(start, schema.indexOf(';', start))
}

// Read only, and only for people signed in. A view over one table is one the
// database would otherwise write through as its owner. See 021.
const readOnlyForStaff = name => {
    expect(schema).toMatch(new RegExp(String.raw`revoke all on public\.${name}\s+from anon, authenticated, public;`))
    expect(schema).toMatch(new RegExp(String.raw`grant select on public\.${name}\s+to authenticated;`))
}

describe('what staff are given of their restaurant', () => {
    // A row policy picks rows and cannot pick columns. So the only way to give
    // staff their restaurant without its money and its mail addresses is a
    // view that leaves them out, and no policy on the table for them at all.
    const view = viewNamed('staff_restaurants')

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
        readOnlyForStaff('staff_restaurants')
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

describe('what staff are given of the menu', () => {
    // The selling price, the VAT, how much of each thing goes into a dish, and
    // the allergen rows behind the customer page. No staff screen reads any of
    // it, and the customer page reads the public_ views, which leave the money
    // and the quantities out.
    it.each(['menu_items', 'menu_item_components', 'product_allergens', 'menu_categories'])(
        'gives nobody below a manager a read of %s',
        table => {
            const policies = policiesOn(table)
            expect(policies.length, `found no policies on ${table} to check`).toBeGreaterThan(0)
            expect(policies.filter(p => p.includes("'employee'"))).toEqual([])
        },
    )
})

describe('what staff are given of the suppliers', () => {
    // The ones still in use, so they can ring the rep about a delivery. A
    // switched off supplier's contacts and notes are no use on the floor, and
    // is_active can be empty, which the app reads as switched off too.
    it('gives an employee only the suppliers still in use', () => {
        const select = policiesOn('suppliers')
            .find(p => p.startsWith('CREATE POLICY "suppliers_select"')) || ''
        expect(select, 'found no suppliers_select').toContain("'employee'")
        expect(select).toMatch(/= 'employee'::"text"\) AND \("is_active" IS TRUE\)/)
    })
})

describe('what staff are given of the stock takes', () => {
    // The count in progress, which is the only one they can open. Every closed
    // one carries what the stock was worth, and the lines of an old count
    // follow from this, because their rule asks this table as the employee.
    it('gives an employee only the count in progress', () => {
        const select = policiesOn('stock_takes')
            .find(p => p.startsWith('CREATE POLICY "stock_takes_select"')) || ''
        expect(select, 'found no stock_takes_select').toContain("'employee'")
        expect(select).not.toMatch(/ARRAY\[[^\]]*'employee'/)
        expect(select).toMatch(/= 'employee'::"text"\) AND \("restaurant_id" = \( SELECT "public"\."get_my_restaurant_id"\(\) \)\) AND \(\("status"\)::"text" = 'in_progress'::"text"\)/)
    })

    // A reopened count is one staff can read again, so what it was worth has
    // to go when it opens, however it is reopened. The Summary page clears it
    // itself; this is for the SQL editor and a tab left open on the old site.
    it('clears what a count was worth when it is reopened', () => {
        const trigger = schema.match(/CREATE OR REPLACE TRIGGER "stock_takes_reopened_clears_value" [^;]*;/)?.[0] || ''
        expect(trigger, 'found no trigger clearing the value on reopen').toContain('BEFORE UPDATE OF "status" ON "public"."stock_takes"')
        expect(trigger).toContain(`WHEN (((("new"."status")::"text" = 'in_progress'::"text") AND (("old"."status")::"text" IS DISTINCT FROM 'in_progress'::"text")))`)
        const start = schema.indexOf('CREATE OR REPLACE FUNCTION "public"."stock_take_reopened_clears_value"()')
        expect(schema.slice(start, schema.indexOf('$$;', start))).toContain('new.total_value := null;')
    })
})

describe('what staff are given of their delivery problems', () => {
    // The notes they took at the door, through my_claims. Once a manager
    // matches one to a line it carries what it was worth and what came back,
    // and a row policy cannot hide a column, so no policy on the table lets
    // an employee read it. Raising one is still theirs.
    const view = viewNamed('my_claims')

    it('leaves out the money and the invoice it was matched to', () => {
        expect(view, 'my_claims is not in schema.sql').toContain('"invoice_line_claims"')
        for (const column of ['amount', 'credited_amount', 'invoice_id', 'invoice_line_id', 'credit_invoice_id', 'counted_week']) {
            expect(view, `my_claims hands over ${column}`).not.toContain(`"c"."${column}"`)
        }
    })

    it('gives each person their own, at their own restaurant', () => {
        expect(view).toMatch(/"c"\."raised_by" = \( SELECT "auth"\."uid"\(\) \)/)
        expect(view).toMatch(/"c"\."restaurant_id" = \( SELECT "public"\."get_my_restaurant_id"\(\) \)/)
    })

    it('gives an employee no read of the table itself', () => {
        const reads = policiesOn('invoice_line_claims').filter(p => !p.includes('FOR INSERT'))
        expect(reads.length, 'found no policies on invoice_line_claims to check').toBeGreaterThan(0)
        expect(reads.filter(p => p.includes("'employee'"))).toEqual([])
    })

    it('can be read by people signed in and changed by nobody', () => {
        readOnlyForStaff('my_claims')
    })
})

describe('what staff are given of the swap requests', () => {
    // Their own, whole, because the cards on My shifts are about them. Of
    // everybody else's, only which shifts somebody has asked about, for the
    // mark on the week: not who asked whom, the hours or the message.
    it('gives an employee only the requests they are part of', () => {
        const read = policiesOn('shift_requests')
            .find(p => p.startsWith('CREATE POLICY "shift_requests_read"')) || ''
        expect(read, 'found no shift_requests_read').toContain('"from_employee_id" = ( SELECT "public"."get_my_employee_id"() )')
        expect(read).toContain('"to_employee_id" = ( SELECT "public"."get_my_employee_id"() )')
        expect(read).toContain(`ARRAY['owner'::"text", 'store_manager'::"text"]`)
        // Before, anybody at the restaurant read every request there.
        expect(read).not.toMatch(/OR \("restaurant_id" = \( SELECT "public"\."get_my_restaurant_id"\(\) \)\)\)\);$/)
    })

    it('marks the shifts asked about with nothing else of the request', () => {
        const view = viewNamed('roster_asks')
        expect(view, 'roster_asks is not in schema.sql').toContain('"shift_requests"')
        const columns = [...view.slice(0, view.indexOf('FROM')).matchAll(/"r"\."(\w+)"/g)].map(m => m[1])
        expect(columns).toEqual(['give_shift_id', 'take_shift_id', 'status'])
        expect(view).toContain(`ARRAY['asked'::"text", 'accepted'::"text"]`)
        expect(view).toMatch(/"r"\."restaurant_id" = \( SELECT "public"\."get_my_restaurant_id"\(\) \)/)
        readOnlyForStaff('roster_asks')
    })
})

describe('what staff are given of the roster', () => {
    // The week as it went out, through roster_published, which gives the note
    // a manager writes on a shift only to the person on it. The table itself
    // carries every colleague's note and every draft, so every rule on it asks
    // for a manager.
    it('gives nobody below a manager a read of roster_shifts', () => {
        const policies = policiesOn('roster_shifts')
        expect(policies.length, 'found no policies on roster_shifts to check').toBeGreaterThan(0)
        expect(policies.filter(p => !p.includes('"public"."get_my_role"()') || p.includes("'employee'"))).toEqual([])
    })
})

describe('what staff are given of the products', () => {
    // The columns a count and the Waste page use, through staff_products. The
    // notes, the weight loss, what one piece weighs and how often it is counted
    // are for the Products page, and a row policy cannot hide a column.
    it('gives the columns staff screens use and no others', () => {
        const view = viewNamed('staff_products')
        expect(view, 'staff_products is not in schema.sql').toContain('"public"."products"')
        const columns = [...view.slice(0, view.indexOf('FROM')).matchAll(/"p"\."(\w+)"/g)].map(m => m[1])
        expect(columns.sort()).toEqual([
            'also_in', 'batch_yield', 'category', 'held_for', 'id', 'is_active', 'is_mix', 'name', 'section', 'unit',
        ])
        expect(view).toContain('( SELECT "public"."get_my_role"() ) IS NOT NULL')
        readOnlyForStaff('staff_products')
    })

    it('gives an employee no read of the table itself', () => {
        const policies = policiesOn('products')
        expect(policies.length, 'found no policies on products to check').toBeGreaterThan(0)
        expect(policies.filter(p => p.includes("'employee'"))).toEqual([])
    })
})

describe('what staff are given of the diary', () => {
    // What is on, through staff_diary, without where each entry is on Google
    // or who wrote it. The Google ids are what the calendar function acts on,
    // and neither is on any staff screen.
    it('leaves out the Google ids and who wrote it', () => {
        const view = viewNamed('staff_diary')
        expect(view, 'staff_diary is not in schema.sql').toContain('"public"."diary_entries"')
        for (const column of ['google_event_ids', 'created_by', 'created_at', 'updated_at']) {
            expect(view.slice(0, view.indexOf('FROM')), `staff_diary hands over ${column}`).not.toContain(`"d"."${column}"`)
        }
        expect(view).toContain('( SELECT "public"."get_my_restaurant_id"() ) = ANY ("d"."restaurant_ids")')
        expect(view).toContain('( SELECT "public"."get_my_role"() ) IS NOT NULL')
        readOnlyForStaff('staff_diary')
    })

    // Their own private entries stay, and answer only to who wrote them.
    // Nothing else in the table answers to anybody below a manager.
    it('gives an employee no read of the group or site entries in the table', () => {
        const select = policiesOn('diary_entries')
            .find(p => p.startsWith('CREATE POLICY "diary_entries_select"')) || ''
        const shared = select.slice(0, select.indexOf(`("scope" = 'private'::"text")`))
        expect(shared, 'found no shared scopes in diary_entries_select').toContain(`'all_sites'`)
        expect(shared).not.toContain('IS NOT NULL')
        expect(shared).toContain(`("scope" = 'all_sites'::"text") AND (( SELECT "public"."get_my_role"() ) = ANY (ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]))`)
        expect(shared).toContain(`(( SELECT "public"."get_my_role"() ) = ANY (ARRAY['owner'::"text", 'store_manager'::"text"])) AND (( SELECT "public"."get_my_restaurant_id"() ) = ANY ("restaurant_ids"))`)
    })
})

describe('how far back and ahead staff see the team', () => {
    // My shifts steps eight weeks either way. Outside that, staff are not told
    // who left long ago, whose time off was last year, or a colleague's leaving
    // date months before it matters. The views give a week more than the page
    // opens, so a week at the edge is never cut short.
    const sqlDays = view => {
        const found = [...view.matchAll(/'Europe\/Dublin'::"text"\)\)::"date" [-+] (\d+)\)/g)].map(m => Number(m[1]))
        expect(found.length, `no window in ${view.slice(0, 60)}`).toBeGreaterThan(0)
        return Math.min(...found)
    }

    it.each(['roster_colleagues', 'roster_away'])('%s covers every week My shifts opens', name => {
        // The far edge of the furthest week, from any day of this one.
        expect(sqlDays(viewNamed(name))).toBeGreaterThanOrEqual(STAFF_WEEKS * 7 + 6)
    })

    // The number of days is not enough on its own. Written the wrong way
    // round, the same number keeps out everybody on the team this week and
    // staff see only their own row. Somebody counts from the day they start
    // to the day they leave, and time off while any of it is inside.
    it.each([
        ['roster_colleagues', '"e"."started_on" <=', '"e"."ended_on" >='],
        ['roster_away', '"starts_on" <=', '"ends_on" >='],
    ])('%s has the window the right way round', (name, starts, ends) => {
        const view = viewNamed(name)
        const where = view.slice(view.lastIndexOf('WHERE'))
        const day = String.raw`\(\(\("now"\(\) AT TIME ZONE 'Europe\/Dublin'::"text"\)\)::"date"`
        const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        expect(where).toMatch(new RegExp(String.raw`\(${escape(starts)} ${day} \+ \d+\)\)`))
        expect(where).toMatch(new RegExp(String.raw`\(${escape(ends)} ${day} - \d+\)\)`))
    })

    it('keeps has_login the last column of roster_colleagues', () => {
        const view = viewNamed('roster_colleagues')
        expect(view.slice(0, view.indexOf('FROM ("public"."employees"')).trim()).toMatch(/AS "has_login"$/)
    })

    it('never tells staff a leaving date beyond the weeks they can open', () => {
        const view = viewNamed('roster_colleagues')
        expect(view).toMatch(/CASE\s+WHEN \("e"\."ended_on" <= /)
    })
})

describe('what staff are given of what is on near us', () => {
    // A place as the roster and the calendar draw it: its name, the short one
    // and how many it holds. Not the page address, the Ticketmaster id, how it
    // is read or what went wrong, which are for Settings and the feed notice.
    it('gives the place without how it is set up', () => {
        const view = viewNamed('staff_places')
        expect(view, 'staff_places is not in schema.sql').toContain('"public"."places"')
        const columns = [...view.slice(0, view.indexOf('FROM')).matchAll(/"p"\."(\w+)"/g)].map(m => m[1])
        expect(columns.sort()).toEqual(['capacity', 'id', 'name', 'short_name'])
        readOnlyForStaff('staff_places')
    })

    // Only the employee side narrows. places_delete_only_when_unused reads
    // restaurant_places and events as the manager deleting, so a manager who
    // could not see the other restaurant's pairings could delete its place.
    it('gives an employee no read of the places table, and a manager all of it', () => {
        const select = policiesOn('places').find(p => p.startsWith('CREATE POLICY "places_select"')) || ''
        expect(select, 'found no places_select').not.toContain('IS NOT NULL')
        expect(select).toContain(`ARRAY['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"]`)
    })

    it('gives an employee only their own restaurant\'s pairings, and a manager every one', () => {
        const select = policiesOn('restaurant_places').find(p => p.startsWith('CREATE POLICY "restaurant_places_select"')) || ''
        expect(select, 'found no restaurant_places_select').not.toContain('IS NOT NULL')
        expect(select).toMatch(/^CREATE POLICY "restaurant_places_select" [^;]*\(\( SELECT "public"\."get_my_role"\(\) \) = ANY \(ARRAY\['super_admin'::"text", 'owner'::"text", 'store_manager'::"text"\]\)\) OR/)
        expect(select).toContain(`= 'employee'::"text") AND ("restaurant_id" = ( SELECT "public"."get_my_restaurant_id"() ))`)
    })

    it('gives an employee no dismissed listing and none from a place they do not watch', () => {
        const policies = policiesOn('events').filter(p => p.includes('FOR SELECT'))
        expect(policies.filter(p => p.includes('IS NOT NULL')), 'a read of every listing for anybody signed in').toEqual([])
        const staff = policies.find(p => p.includes("'employee'")) || ''
        expect(staff, 'found no read of events for staff').toContain(`"review" <> 'dismissed'::"text"`)
        expect(staff).toMatch(/FROM "public"\."restaurant_places" "rp"\s+WHERE \(\("rp"\."place_id" = "events"\."place_id"\) AND \("rp"\."restaurant_id" = \( SELECT "public"\."get_my_restaurant_id"\(\) \)\) AND "rp"\."is_active"\)/)
    })
})

describe('what staff are given of the recipes', () => {
    // What goes into a MIX and how much, which values what they count and log
    // as waste (his decision of 29 September), through staff_mix_recipes. Not
    // the notes beside each line, which no staff screen shows.
    it('gives the quantities without the notes', () => {
        const view = viewNamed('staff_mix_recipes')
        expect(view, 'staff_mix_recipes is not in schema.sql').toContain('"public"."mix_recipes"')
        const columns = [...view.slice(0, view.indexOf('FROM')).matchAll(/"r"\."(\w+)"/g)].map(m => m[1])
        expect(columns.sort()).toEqual(['id', 'ingredient_product_id', 'mix_product_id', 'quantity'])
        expect(view).toContain('( SELECT "public"."get_my_role"() ) IS NOT NULL')
        readOnlyForStaff('staff_mix_recipes')
    })

    it('gives an employee no read of the table itself', () => {
        const policies = policiesOn('mix_recipes')
        expect(policies.length, 'found no policies on mix_recipes to check').toBeGreaterThan(0)
        expect(policies.filter(p => p.includes("'employee'"))).toEqual([])
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

// 033 says it is safe to run twice, and the second time can come after 034.
// So it may only add. A rule written in 033 would quietly undo whatever 034
// narrowed on the same table, and staff would read it all again.
describe('033, which goes in before the merge', () => {
    it('writes no rule, so running it again after 034 gives nothing back', () => {
        const migration = readFileSync('supabase/migrations/033_staff_get_only_what_they_use.sql', 'utf8')
        const code = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
        expect(code.match(/\b(create|drop|alter)\s+policy\s+[^;]*/gi) || []).toEqual([])
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
