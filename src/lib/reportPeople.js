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

// The permissions that have nothing to expire.
//
// An Irish or EU citizen has no permit and never will, so a blank expiry on one
// is not a gap in the records, it is the correct answer. Everything else needs
// a date: a student stamp runs out, and so does an employment permit.
//
// Stamp 4 is lumped in with citizens on the employee form, and a Stamp 4 does
// expire. That is why a date is still checked whenever one has been entered,
// whatever the permission says. This list only decides whether a MISSING date
// is a problem.
const NOTHING_TO_EXPIRE = ['unrestricted']

// Does this person need a right to work expiry date on file?
//
// A permission nobody has recorded at all counts as needing one. We do not know
// what they hold, and not knowing is the thing worth saying.
export function permissionNeedsExpiry(person) {
    return !NOTHING_TO_EXPIRE.includes(person?.work_permission || '')
}

// One kind of paperwork, counted.
//
// Four states, and they are deliberately not two. In date is fine. Running out
// soon still needs doing. Out of date is already a problem. Missing altogether
// is the one nobody thinks to look for, because there is no date to sort by.
//
// `needsDate` decides whether a blank counts as missing at all. Without it this
// read two citizens with nothing to expire as two people with no paperwork,
// which is both wrong and the kind of wrong that trains somebody to ignore the
// line.
export function paperworkState(people, expiryField, asOf, needsDate = () => true) {
    const soon = addDays(asOf, WARN_DAYS)

    const missing = []
    const expired = []
    const expiring = []
    let fine = 0

    for (const person of people) {
        const on = person[expiryField]

        // No date. Either there is nothing to expire, which is fine, or there
        // is and nobody has entered it.
        if (!on) {
            if (needsDate(person)) missing.push(person)
            else fine++
            continue
        }

        // A date that has been entered is always checked, whatever kind of
        // permission it sits against.
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

// The paperwork boiled down to something a mail can carry, and something the
// report can be frozen with.
//
// The section on screen reads the employee list live, which is right for a
// draft and wrong for a report that has gone out: somebody's permit renewed in
// October must not change what a report sent in September said. So on publish
// this shape is frozen into the figures alongside the money, and the mail reads
// the frozen copy rather than the staff table.
//
// Names, not just counts. "Two certificates run out this month" sends somebody
// to the Hub to find out who; the names are the whole reason the line is worth
// sending.
function names(list, field) {
    return list.map(entry => {
        const person = field ? entry.person : entry
        return { name: person.full_name || person.name || 'Somebody', on: field ? entry.on : null }
    })
}

export function paperworkSummary(state) {
    if (!state) return null
    return {
        total: state.total,
        fine: state.fine,
        ok: state.ok,
        missing: names(state.missing),
        expired: names(state.expired, 'on'),
        expiring: names(state.expiring, 'on'),
    }
}
