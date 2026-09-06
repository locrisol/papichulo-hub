// What the Hub already knows about the team's paperwork.
//
// Food safety certificates and the right to work stamp both sit on the person,
// both have a date they run out, and the roster already checks them every week.
// This reads the same fields, so the section costs nothing to fill in and
// cannot disagree with what the roster says.
//
// The thing worth holding either of these for is the expiry. A certificate
// nobody is watching is a certificate that has quietly run out, and finding
// that out during an inspection is the expensive way.

import { addDays } from './dates'

// How far ahead is worth mentioning.
//
// Sixty days matches the roster's own warning, so the report is not raising
// something the roster has been quiet about, or the other way round.
export const WARN_DAYS = 60

// Only people actually on the books in the week being reported on. Somebody who
// left in June should not be dragging down September's count, and somebody
// starting next month is not a gap yet.
export function workingThatWeek(employees, weekStart) {
    const weekEnd = addDays(weekStart, 6)
    return (employees || []).filter(e =>
        (!e.started_on || e.started_on <= weekEnd)
        && (!e.ended_on || e.ended_on >= weekStart))
}

// One kind of paperwork, counted.
//
// Three states, and they are deliberately not two. In date is fine. Running out
// soon still needs doing. Missing altogether is the one nobody thinks to look
// for, because there is no date to sort by, and for anybody handling food that
// is worth knowing on its own.
export function paperworkState(people, expiryField, asOf) {
    const soon = addDays(asOf, WARN_DAYS)

    const missing = []
    const expired = []
    const expiring = []
    let fine = 0

    for (const person of people) {
        const on = person[expiryField]
        if (!on) { missing.push(person); continue }
        if (on < asOf) { expired.push({ person, on }); continue }
        if (on <= soon) { expiring.push({ person, on }); continue }
        fine++
    }

    expiring.sort((a, b) => a.on.localeCompare(b.on))
    expired.sort((a, b) => a.on.localeCompare(b.on))

    return {
        total: people.length,
        fine,
        missing,
        expired,
        expiring,
        ok: missing.length === 0 && expired.length === 0 && expiring.length === 0,
    }
}

// How many days until a date, from a date. Negative is in the past.
export function daysUntil(on, from) {
    return Math.round((new Date(on + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000)
}
