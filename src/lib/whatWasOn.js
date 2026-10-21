import { addDays, weekDates } from '@/lib/dates'
import { round2 } from '@/lib/format'
import { rowsOn, eventName, placeName, elsewhere, offFor } from '@/lib/nearby'
import { onDate, kindLabel, timeLabel, atRestaurant } from '@/lib/diary'
import { extrasFor, extraLabel } from '@/lib/dayExtras'

// What was on each day of a report's week, beside what the day took (his, 17
// October): "The owners want to see how the sales relate to events."
//
// Worked out here once and frozen into the report's figures with the words
// already written, the same as the prices, because the mail cannot import any
// of this. A listing taken down next month does not change a report already
// sent.

// How many of the same weekday "usual" is taken from.
export const USUAL_WEEKS = 8
// Fewer than this and there is no usual worth saying.
const USUAL_AT_LEAST = 4
// How far back the show nights are compared.
export const COMPARE_WEEKS = 12

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const weekdayOf = date => new Date(date + 'T00:00:00').getDay()

// The middle of a list of figures, his choice over the average (17 October):
// one conference Wednesday at €4,107 lifted the average Wednesday for eight
// weeks after it, and ordinary days read as a little below usual. With an even
// count it is halfway between the two in the middle.
export function middleOf(numbers) {
    const sorted = (numbers || []).filter(n => Number.isFinite(n)).sort((a, b) => a - b)
    if (sorted.length === 0) return null
    const half = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
}

// What a day usually takes: the middle of the same weekday over the eight
// weeks before it. Closed days and days with nothing entered are left out, so a
// Sunday the restaurant was shut does not drag every later Sunday down.
export function usualFor(date, salesByDate) {
    const figures = []
    for (let back = 1; back <= 52 && figures.length < USUAL_WEEKS; back++) {
        const day = salesByDate.get(addDays(date, -7 * back))
        if (day && !day.is_closed && day.net_sales != null) figures.push(Number(day.net_sales))
    }
    if (figures.length < USUAL_AT_LEAST) return null
    return { value: round2(middleOf(figures)), days: figures.length }
}

// One listing in words: where, when, then what. "3Arena, 18:30 · The Pussycat
// Dolls". Where comes first because the place is what explains a day: a film
// at the Odeon and a concert next door are different nights.
function listingWords(row) {
    const where = elsewhere(row) || placeName(row.place, { short: true })
    const when = row.time ? `${where}, ${row.time}` : where
    return `${when} · ${eventName(row.event)}`
}

// The same show listed twice is one show. Ticketmaster had the Hans Zimmer
// night on 4 October as the show and again as a ticket and hotel package, at
// the same place and the same time. The shorter name is the show itself.
function oncePerShow(rows) {
    const kept = new Map()
    for (const row of rows) {
        const key = `${row.place?.id}|${row.event.event_date}|${row.time}`
        const was = kept.get(key)
        if (!was || eventName(row.event).length < eventName(was.event).length) kept.set(key, row)
    }
    return [...kept.values()]
}

// Nearby listings that count: checked by somebody (or from a feed trusted as it
// stands), and not called off.
function counted(rows) {
    return (rows || []).filter(r => r.checked && !offFor(r.event))
}

// Diary entries that were decided. An enquiry may never have happened, and a
// cancelled job did not.
function decided(entries, restaurantId) {
    return (entries || []).filter(e => e.scope !== 'private' && atRestaurant(e, restaurantId)
        && ['confirmed', 'done'].includes(e.status))
}

// Each day of the week.
//
// `on` is what to print under the day, in order: shows and listings nearby,
// then the diary, then the Also on row from the roster (Feedr, Lunch Team and
// the like) on one quiet line. Each line carries a tone for its edge colour.
export function weekDays({ weekStart, sales, rows, diary, notes, restaurantId }) {
    const salesByDate = new Map((sales || []).map(s => [s.sale_date, s]))
    const listings = counted(rows)
    const entries = decided(diary, restaurantId)

    return weekDates(weekStart).map(date => {
        const day = salesByDate.get(date)
        const note = (notes || []).find(n => n.note_date === date) || null
        const closed = !!(day?.is_closed || note?.is_closed)
        const nearby = oncePerShow(rowsOn(listings, date))
            .sort((a, b) => Number(b.ownRow) - Number(a.ownRow) || String(a.time).localeCompare(String(b.time)))

        const on = [
            ...nearby.map(r => ({ tone: r.ownRow ? 'show' : 'nearby', text: listingWords(r) })),
            ...onDate(entries, date).map(e => ({
                tone: e.kind,
                text: `${kindLabel(e.kind)} · ${e.title}${e.starts_at ? `, ${timeLabel(e).split(' to ')[0]}` : ''}`,
            })),
        ]
        const extras = extrasFor(note)
        if (extras.length > 0) on.push({ tone: 'also', text: `Also on: ${extras.map(extraLabel).join(', ')}` })

        const usual = closed ? null : usualFor(date, salesByDate)
        const net = !closed && day?.net_sales != null ? round2(Number(day.net_sales)) : null
        return {
            date,
            weekday: WEEKDAYS[weekdayOf(date)],
            closed,
            net,
            usual: usual?.value ?? null,
            usualDays: usual?.days ?? 0,
            change: net != null && usual?.value ? net / usual.value - 1 : null,
            nothingNearby: nearby.length === 0,
            on,
        }
    })
}

// Show nights against other nights, over the twelve weeks up to the end of
// this one. Only the place with a row of its own on the roster counts (the
// 3Arena for Point Campus): a film at the Odeon is not the same kind of night,
// and mixing them would water down the one answer the owners asked for.
//
// Each trading day is set against its own usual, and the two groups are the
// average of those. By weekday, the middle of each group's takings.
export function showNights({ weekStart, sales, rows }) {
    const shows = counted(rows).filter(r => r.ownRow)
    const place = shows[0]?.place || null
    if (!place) return null

    const salesByDate = new Map((sales || []).map(s => [s.sale_date, s]))
    const last = addDays(weekStart, 6)
    const first = addDays(weekStart, -7 * (COMPARE_WEEKS - 1))
    const showOn = date => rowsOn(shows, date).length > 0

    const groups = { with: [], without: [] }
    const byDay = WEEKDAYS.map(() => ({ with: [], without: [] }))
    for (let date = first; date <= last; date = addDays(date, 1)) {
        const day = salesByDate.get(date)
        if (!day || day.is_closed || day.net_sales == null) continue
        const which = showOn(date) ? 'with' : 'without'
        byDay[weekdayOf(date)][which].push(Number(day.net_sales))
        const usual = usualFor(date, salesByDate)
        if (usual) groups[which].push(Number(day.net_sales) / usual.value - 1)
    }

    const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
    const summary = list => ({ days: list.length, change: mean(list) })
    return {
        place: placeName(place, { short: true }),
        weeks: COMPARE_WEEKS,
        from: first,
        to: last,
        with: summary(groups.with),
        without: summary(groups.without),
        byDay: byDay.map((d, i) => ({
            weekday: WEEKDAYS[i],
            with: { middle: d.with.length ? round2(middleOf(d.with)) : null, days: d.with.length },
            without: { middle: d.without.length ? round2(middleOf(d.without)) : null, days: d.without.length },
        })),
    }
}

// The one sentence the mail carries from the comparison.
export function showNightsWords(shows) {
    if (!shows || !shows.with.days || !shows.without.days) return ''
    const pct = n => `${Math.abs(Math.round(n * 100))}%`
    const way = n => (Math.round(n * 100) === 0 ? 'about the same as' : n > 0 ? `${pct(n)} more than` : `${pct(n)} less than`)
    return `Over the last ${shows.weeks} weeks, days with a show at the ${shows.place} took `
        + `${way(shows.with.change)} usual for that day, and days without one ${way(shows.without.change)} usual.`
}

// Everything frozen into the report, words and all.
export function whatWasOn({ weekStart, sales, rows, diary, notes, restaurantId }) {
    const days = weekDays({ weekStart, sales, rows, diary, notes, restaurantId })
    const compared = days.filter(d => d.net != null && d.usual != null)
    const shows = showNights({ weekStart, sales, rows })
    return {
        usualWeeks: USUAL_WEEKS,
        days,
        week: {
            net: round2(days.reduce((t, d) => t + (d.net || 0), 0)),
            // Only the days with both, so a day with no usual yet is not
            // compared against nothing.
            usual: compared.length ? round2(compared.reduce((t, d) => t + d.usual, 0)) : null,
            comparedNet: round2(compared.reduce((t, d) => t + d.net, 0)),
        },
        shows,
        showsWords: showNightsWords(shows),
    }
}
