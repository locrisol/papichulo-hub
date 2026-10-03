// The bits of the events screen that are worth testing on their own.
//
// No React in here, the same split the rest of lib uses.

import { weekStartOf, dayMonth, monthLabel, addDays } from '@/lib/dates'

// Colour by the broad type, so a glance tells you what kind of night it is.
//
// These are soft on purpose. A calendar cell can hold three of them at once and
// solid colours at that size turn the month into a patchwork you cannot read.
const CATEGORY_STYLE = {
    Music: 'bg-purple-50 text-purple-800 border-purple-200',
    Sports: 'bg-blue-50 text-blue-800 border-blue-200',
    Arts: 'bg-pink-50 text-pink-800 border-pink-200',
    'Arts & Theatre': 'bg-pink-50 text-pink-800 border-pink-200',
    Family: 'bg-amber-50 text-amber-800 border-amber-200',
    Film: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    Miscellaneous: 'bg-gray-100 text-gray-700 border-gray-200',
}

export function categoryStyle(category) {
    return CATEGORY_STYLE[category] || 'bg-gray-100 text-gray-700 border-gray-200'
}

// What the sale status is worth saying out loud, or nothing.
//
// On sale is the ordinary case and saying so on every event would just be noise
// to read past. The rest all change how busy the night will be, and off sale
// well before the date is the useful one: it usually means it sold out, which
// says more than the category ever does.
export function statusNote(status) {
    switch (String(status ?? '').toLowerCase()) {
        case 'offsale':
            return { text: 'No longer on sale, so it may have sold out', tone: 'warn' }
        // Ticketmaster sends canceled, the American way. Only this one was
        // known, so a show called off said nothing here either.
        case 'cancelled':
        case 'canceled':
            return { text: 'Cancelled, so expect a normal night', tone: 'bad' }
        case 'postponed':
            return { text: 'Postponed, so the date may change', tone: 'warn' }
        case 'rescheduled':
            return { text: 'Rescheduled, so check the date', tone: 'warn' }
        default:
            return null
    }
}

// The heading over a week in the list.
//
// This week and next week are named rather than dated, because those are the
// two anybody is actually rostering for and a date makes you work out which one
// it is. Everything after that is dated, since "in three weeks" is harder to
// place than the date itself.
export function weekTitle(weekStart, today) {
    const thisWeek = weekStartOf(today)
    if (weekStart === thisWeek) return 'This week'
    if (weekStart === addDays(thisWeek, 7)) return 'Next week'
    return `Week of ${dayMonth(weekStart)}`
}

// Groups a list of events by the day they are on.
//
// Used by every view: the month looks each cell up, the week looks each of its
// seven days up, and the list walks it in order.
export function byDate(events) {
    const out = {}
    for (const e of events || []) {
        if (!out[e.event_date]) out[e.event_date] = []
        out[e.event_date].push(e)
    }
    return out
}

// The list in Coming up, as a flat run of headings and days.
//
// Worked out here rather than in the markup because it is a set of rules about
// when a heading appears, and rules are worth testing.
//
// Two levels of heading. The month, because a list that runs from August into
// October showed nothing but day numbers and you had to work out from the dates
// where one month ended. And the week inside it, because that is what is being
// rostered.
//
// A week that runs across the end of a month gets its heading printed again
// underneath the new month. That looks like a repeat and it is not: it is what
// says the week is still going, rather than leaving a month heading sitting in
// the middle of a week with nothing to explain it.
// dateOf is how a row says which day it is on. It defaults to the Arena's own
// column because that is what this was written for, and the diary passes its
// own because the headings are the same headings. One copy of the rules rather
// than two that drift.
export function agendaRows(events, today, dateOf = e => e.event_date) {
    const days = []
    for (const e of events || []) {
        const date = dateOf(e)
        const last = days[days.length - 1]
        if (last && last.date === date) last.events.push(e)
        else days.push({ date, events: [e] })
    }

    const rows = []
    let month = ''
    let week = ''

    for (const day of days) {
        const m = day.date.slice(0, 7)
        if (m !== month) {
            month = m
            week = ''
            rows.push({ type: 'month', key: `m${m}`, label: monthLabel(day.date) })
        }

        const w = weekStartOf(day.date)
        if (w !== week) {
            week = w
            rows.push({ type: 'week', key: `w${m}-${w}`, label: weekTitle(w, today) })
        }

        rows.push({ type: 'day', key: day.date, date: day.date, events: day.events })
    }

    return rows
}
