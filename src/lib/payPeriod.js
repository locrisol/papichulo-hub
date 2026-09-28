// The pay period.
//
// **It is always a fortnight.** His words, 23 September 2026, and the reason
// this file exists at all: the Hub works in weeks everywhere else, because that
// is how a roster and a report and a week's takings work, but the payroll runs
// every two weeks and always has. So what leaves the building for the accountant
// has to line up with the pay run rather than with the Hub.
//
// A period is two Hub weeks, Sunday to Saturday, and nothing here invents a
// different idea of a week: the first week of a period is a week start like any
// other, and so is the second.
//
// Which fortnight is which comes from one date kept on the restaurant, the start
// of any period anybody can name. Everything after that is counting in
// fourteens, forwards or backwards, so a reference in 2024 answers a question
// about 2027 without anybody typing another date.

import { weekStartOf, addDays, weekDates, shortDate } from '@/lib/dates'

export const PERIOD_DAYS = 14

// The reference is snapped to its own week's Sunday. A date typed into a
// settings box is whatever day somebody happened to pick, and a pay period that
// began on a Wednesday would put every period boundary mid week and leave both
// halves of it belonging to different Hub weeks.
export function anchorOf(reference) {
    return reference ? weekStartOf(reference) : null
}

// How many whole days lie between two dates. Both are plain dates with no time
// on them, so this is exact rather than nearly right.
function daysBetween(from, to) {
    // Both read as UTC midnight, so the clocks going back in October cannot
    // turn fourteen days into thirteen and a half.
    const a = new Date(`${from}T00:00:00Z`)
    const b = new Date(`${to}T00:00:00Z`)
    return Math.round((b - a) / 86400000)
}

// The period a date falls in.
//
// Null when nobody has set the reference yet, which is a real state and not a
// mistake: a restaurant that has never been told when its pay runs cannot be
// asked to guess.
export function periodOf(dateStr, reference) {
    const anchor = anchorOf(reference)
    if (!anchor || !dateStr) return null

    const week = weekStartOf(dateStr)
    // Floor division, so a date before the reference lands in a period with a
    // negative number rather than in the wrong fortnight. Math.floor rather
    // than a truncation, which rounds towards zero and gets the past wrong.
    const steps = Math.floor(daysBetween(anchor, week) / PERIOD_DAYS)
    const start = addDays(anchor, steps * PERIOD_DAYS)

    return {
        start,
        end: addDays(start, PERIOD_DAYS - 1),
        // The two Hub weeks it is made of, in order. Every screen and every
        // block still works a week at a time, so these are what they are given.
        weeks: [start, addDays(start, 7)],
        number: steps,
    }
}

// The fourteen dates, in order.
export function periodDates(start) {
    return [...weekDates(start), ...weekDates(addDays(start, 7))]
}

// Is this date inside this period?
export function inPeriod(start, dateStr) {
    if (!start || !dateStr) return false
    return dateStr >= start && dateStr <= addDays(start, PERIOD_DAYS - 1)
}

// The period before or after.
export function stepPeriod(start, by) {
    return addDays(start, by * PERIOD_DAYS)
}

// **A period is over when its last day is behind us.**
//
// The same rule the timesheet already uses to decide whether to ask about a
// week: nothing is asked about a week that has not finished, so nothing is sent
// for a fortnight that has not finished either.
export function periodIsOver(start, today) {
    if (!start || !today) return false
    return today > addDays(start, PERIOD_DAYS - 1)
}

// "25 Oct to 7 Nov 2026". The same shape weekRange gives a week, including
// what it does when the two ends fall in different years, so a period and a
// week are never written two different ways on the same screen.
export function periodWords(start) {
    if (!start) return ''
    const end = addDays(start, PERIOD_DAYS - 1)
    const from = shortDate(start)
    const to = shortDate(end)

    if (start.slice(0, 4) !== end.slice(0, 4)) {
        return `${from} ${start.slice(0, 4)} to ${to} ${end.slice(0, 4)}`
    }
    return `${from} to ${to} ${end.slice(0, 4)}`
}

// Which of the two weeks a date belongs to, 0 or 1, and null when it is in
// neither. Used to split a person's fourteen days into the two halves the
// summary has a column for.
export function weekIndexOf(start, dateStr) {
    if (!inPeriod(start, dateStr)) return null
    return dateStr < addDays(start, 7) ? 0 : 1
}
