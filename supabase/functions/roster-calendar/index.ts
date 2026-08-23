// The calendar feed.
//
// A calendar app arrives with no login, no cookies and no way to be asked for
// one, so this is the only part of the project that runs outside row level
// security. The token in the URL is the whole of the credential, which is why
// it is long, random, one per person, and replaceable.
//
// It answers with that one person's published shifts and nothing else. Not the
// week, not who else is on, and nothing at all about what anybody is paid.
//
// It has to be reachable without a key of any kind, because a calendar app has
// none to send. On the command line that is:
//
//   supabase functions deploy roster-calendar --no-verify-jwt
//
// From the dashboard it is the JWT verification setting on the function. Either
// way, leave it on and every request comes back 401 with no clue why.
//
// Deliberately the plain Deno.serve form rather than the withSupabase wrapper
// the dashboard template starts you with. That wrapper is there to check the
// caller's key and hand you an authenticated client, which is exactly what this
// cannot have.
//
// ics.js sits in this folder rather than in a shared one because only what is
// inside a function's own folder gets deployed with it. Putting it a level up
// works locally and then fails on the server with a missing import, which is a
// poor way to find out.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildIcs, hoursForDate, closesStore } from './ics.js'

// The key that can read past row level security, under whichever name this
// project's runtime gives it.
//
// Supabase is part way through renaming these: older projects have
// SUPABASE_SERVICE_ROLE_KEY and newer ones a secret key. Asking for all of them
// and taking the first that exists costs three lines and saves finding out the
// hard way, which here means a feed that returns an empty calendar rather than
// an error.
function serviceKey() {
    const names = [
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SECRET_KEY',
        'SB_SECRET_KEY',
    ]
    for (const name of names) {
        const value = Deno.env.get(name)
        if (value) return value
    }
    throw new Error('No service key. Set SUPABASE_SERVICE_ROLE_KEY in the function secrets.')
}

// How much of the roster to hand over. Far enough back that last month is still
// in their diary, and far enough forward for anything published.
const WEEKS_BACK = 8
const WEEKS_FORWARD = 26

const iso = (date: Date) => date.toISOString().slice(0, 10)

const shift = (days: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    return iso(d)
}

Deno.serve(async (request) => {
    const token = new URL(request.url).searchParams.get('token')
    if (!token || token.length < 20) {
        return new Response('Not found', { status: 404 })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey())

    const { data: employee } = await supabase
        .from('employees')
        .select('id, full_name, restaurant_id')
        .eq('calendar_token', token)
        .maybeSingle()

    // The same answer for a token that is wrong as for one that never existed,
    // so this cannot be used to find out which tokens are real.
    if (!employee) return new Response('Not found', { status: 404 })

    const from = shift(-WEEKS_BACK * 7)
    const to = shift(WEEKS_FORWARD * 7)

    const [restaurantRes, shiftsRes, notesRes] = await Promise.all([
        supabase.from('restaurants').select('name, opening_hours')
            .eq('id', employee.restaurant_id).maybeSingle(),
        supabase.from('roster_shifts')
            .select('id, shift_date, starts_at, ends_at, note')
            .eq('employee_id', employee.id)
            .not('published_at', 'is', null)
            .gte('shift_date', from).lte('shift_date', to)
            .order('shift_date'),
        supabase.from('day_notes')
            .select('note_date, opens_at, closes_at, is_closed, is_bank_holiday')
            .eq('restaurant_id', employee.restaurant_id)
            .gte('note_date', from).lte('note_date', to),
    ])

    const restaurant = restaurantRes.data
    const notes = notesRes.data || []
    const noteFor = (date: string) => notes.find(n => n.note_date === date) || null

    // Just Work.
    //
    // It said Work, Manager, which is a job title somebody is reading off their
    // own diary. They know what they do. The restaurant is on the event as its
    // location, so a phone showing Work at Point Campus has said everything
    // there is to say, and the positions no longer have to be fetched at all.
    const events = (shiftsRes.data || []).map(s => {
        const hours = hoursForDate(restaurant?.opening_hours, noteFor(s.shift_date), s.shift_date)
        return {
            id: s.id,
            date: s.shift_date,
            start: String(s.starts_at).slice(0, 5),
            end: String(s.ends_at).slice(0, 5),
            closesStore: closesStore(s, hours),
            summary: 'Work',
            location: restaurant?.name || '',
            description: s.note || '',
        }
    })

    const calendarName = `${employee.full_name}, ${restaurant?.name || 'shifts'}`
    const body = buildIcs({
        calendarName,
        calendarDescription: `Published shifts for ${employee.full_name}.`,
        shifts: events,
        now: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
    })

    // Some clients name the calendar after the file rather than after anything
    // inside it, so the file is named too.
    const filename = calendarName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')

    return new Response(body, {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            // Half an hour, so a calendar checking often does not hammer this and
            // one checking rarely is not held back by us. Google decides for
            // itself either way.
            'Cache-Control': 'public, max-age=1800',
            'Content-Disposition': `inline; filename="${filename}.ics"`,
        },
    })
})
