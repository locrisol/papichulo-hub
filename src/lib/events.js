// The bits of the events screen that are worth testing on their own.
//
// No React in here, the same split the rest of lib uses.

import { weekStartOf, shortDate, addDays } from './dates'

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
}

export function categoryStyle(category) {
    return CATEGORY_STYLE[category] || 'bg-gray-100 text-gray-700 border-gray-200'
}

// The three letter day, for a date like 2026-08-27.
export function dayName(dateStr) {
    return DAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()]
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
            return { text: 'No longer on sale, so it has probably sold out', tone: 'warn' }
        case 'cancelled':
            return { text: 'Cancelled, so this is an ordinary night after all', tone: 'bad' }
        case 'postponed':
            return { text: 'Postponed, so the date may still move', tone: 'warn' }
        case 'rescheduled':
            return { text: 'Rescheduled, so check the date is still this one', tone: 'warn' }
        default:
            return null
    }
}

// Splits a list of events into weeks, Sunday to Saturday, the same weeks the
// sales and cost screens use.
//
// The list is for planning ahead, and a run of thirty events with nothing
// between them reads as one long block where "the next two weeks" is the thing
// anybody actually wants out of it.
//
// Weeks with nothing in them are not returned. The gap between two events three
// weeks apart is already obvious from their dates, and empty headings would
// take up more room than the events do.
export function groupByWeek(events) {
    const weeks = []
    for (const e of events || []) {
        const start = weekStartOf(e.event_date)
        const last = weeks[weeks.length - 1]
        if (last && last.weekStart === start) last.events.push(e)
        else weeks.push({ weekStart: start, events: [e] })
    }
    return weeks
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
    return `Week of ${shortDate(weekStart)}`
}
