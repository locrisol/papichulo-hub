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
// Deploy with: supabase functions deploy roster-calendar --no-verify-jwt
// The flag matters. Without it Supabase demands a bearer token and Google
// cannot send one.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildIcs, hoursForDate, closesStore } from '../_shared/ics.js'

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

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: employee } = await supabase
        .from('employees')
        .select('id, full_name, restaurant_id, position_id')
        .eq('calendar_token', token)
        .maybeSingle()

    // The same answer for a token that is wrong as for one that never existed,
    // so this cannot be used to find out which tokens are real.
    if (!employee) return new Response('Not found', { status: 404 })

    const from = shift(-WEEKS_BACK * 7)
    const to = shift(WEEKS_FORWARD * 7)

    const [restaurantRes, shiftsRes, notesRes, positionsRes] = await Promise.all([
        supabase.from('restaurants').select('name, opening_hours')
            .eq('id', employee.restaurant_id).maybeSingle(),
        supabase.from('roster_shifts')
            .select('id, shift_date, starts_at, ends_at, note, position_id')
            .eq('employee_id', employee.id)
            .not('published_at', 'is', null)
            .gte('shift_date', from).lte('shift_date', to)
            .order('shift_date'),
        supabase.from('day_notes')
            .select('note_date, opens_at, closes_at, is_closed, is_bank_holiday')
            .eq('restaurant_id', employee.restaurant_id)
            .gte('note_date', from).lte('note_date', to),
        supabase.from('positions').select('id, name').eq('restaurant_id', employee.restaurant_id),
    ])

    const restaurant = restaurantRes.data
    const notes = notesRes.data || []
    const positions = positionsRes.data || []
    const noteFor = (date: string) => notes.find(n => n.note_date === date) || null
    const nameOf = (id: string) => positions.find(p => p.id === id)?.name || ''

    const events = (shiftsRes.data || []).map(s => {
        const hours = hoursForDate(restaurant?.opening_hours, noteFor(s.shift_date), s.shift_date)
        const position = nameOf(s.position_id || employee.position_id)
        return {
            id: s.id,
            date: s.shift_date,
            start: String(s.starts_at).slice(0, 5),
            end: String(s.ends_at).slice(0, 5),
            closesStore: closesStore(s, hours),
            summary: position ? `Work, ${position}` : 'Work',
            location: restaurant?.name || '',
            description: s.note || '',
        }
    })

    const body = buildIcs({
        calendarName: `Shifts, ${restaurant?.name || 'work'}`,
        shifts: events,
        now: new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z',
    })

    return new Response(body, {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            // Half an hour, so a calendar checking often does not hammer this and
            // one checking rarely is not held back by us. Google decides for
            // itself either way.
            'Cache-Control': 'public, max-age=1800',
            'Content-Disposition': 'inline; filename="shifts.ics"',
        },
    })
})
