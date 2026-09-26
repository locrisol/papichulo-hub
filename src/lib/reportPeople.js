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

import { addDays } from '@/lib/dates'
import { permissionFor } from '@/lib/workRules'

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

// Who the paperwork is checked for: on the books in the week, and not gone by
// the day it is checked.
//
// Somebody who did one trial shift on the Thursday and left the same day was on
// the books that week, and the report checked the Monday after still listed him
// with no certificate. The team page treats a leaver as history rather than a
// job to do (gapsFor), and so does this: nobody chases paperwork for somebody
// who is not coming back. A last day still ahead is somebody still here.
export function checkedPeople(employees, weekStart, asOf) {
    return workingThatWeek(employees, weekStart)
        .filter(e => !e.ended_on || e.ended_on >= asOf)
}

// Does this person need a right to work expiry date on file?
//
// An Irish or EU citizen has no permit and never will, so a blank expiry on one
// is not a gap in the records, it is the correct answer. Everything else needs
// a date: a student stamp runs out, and so does an employment permit. Which is
// which is `expires` on WORK_PERMISSIONS, the list the team page reads too.
//
// Stamp 4 is lumped in with citizens on the employee form, and a Stamp 4 does
// expire. That is why a date is still checked whenever one has been entered,
// whatever the permission says. This only decides whether a MISSING date is a
// problem.
export function permissionNeedsExpiry(person) {
    return permissionFor(person?.work_permission).expires
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
// `renewals` says this kind of paperwork is something you apply to renew.
//
// A right to work stamp is. A food safety certificate is not: you sit the
// course again. So the key is only put on the entries it means something for,
// and its absence is how the mail tells the two apart. **Absent and null are
// different answers here** and both have to survive the round trip through
// JSON, which is why nothing at all is written for food rather than a null:
// undefined is "this does not have renewals", null is "it does and nobody has
// applied", and JSON.stringify drops the first and keeps the second.
//
// `trial` says so beside the name of anybody on trial. His rule, 27 September:
// somebody on trial is still listed with no certificate, but as on trial,
// because nobody books the course for somebody who might do one shift, and an
// owner reading three names needs to know which one is a job to do. Written
// into the name rather than carried as a flag, so the page and the mail say the
// same words and a mail function deployed before this still says it. The ones
// on trial go after everybody else, for the same reason.
function names(list, field, { renewals = false, trial = false } = {}) {
    const personOf = entry => (field ? entry.person : entry)
    const onTrial = entry => (trial && personOf(entry).on_trial ? 1 : 0)
    return list
        .map((entry, at) => ({ entry, at }))
        .sort((a, b) => onTrial(a.entry) - onTrial(b.entry) || a.at - b.at)
        .map(({ entry }) => {
            const person = personOf(entry)
            const name = person.full_name || person.name || 'Somebody'
            return {
                name: onTrial(entry) ? `${name} (on trial)` : name,
                on: field ? entry.on : null,
                ...(renewals ? { applied: person.permission_renewal_applied || null } : {}),
            }
        })
}

export function paperworkSummary(state, { renewals = false, trial = false } = {}) {
    if (!state) return null
    return {
        total: state.total,
        fine: state.fine,
        ok: state.ok,
        // Nothing on file has no renewal to talk about. You cannot have applied
        // to renew a permission nobody has recorded.
        missing: names(state.missing, null, { trial }),
        expired: names(state.expired, 'on', { renewals, trial }),
        expiring: names(state.expiring, 'on', { renewals, trial }),
    }
}

// Both kinds of paperwork, the way the page shows them and the mail sends them.
//
// One function for both, so the page and the mail cannot disagree about who is
// on the list or what is said about them. Food safety says who is on trial; a
// work permit does not, because working without one is the same offence
// either way. The right to work carries whether a renewal was applied for,
// because that is the difference between somebody who cannot legally be on
// next week's roster and somebody who is waiting on the post.
export function paperworkFor(employees, weekStart, asOf) {
    const people = checkedPeople(employees, weekStart, asOf)
    return {
        people: people.length,
        food: paperworkSummary(paperworkState(people, 'food_safety_expires', asOf), { trial: true }),
        permits: paperworkSummary(
            paperworkState(people, 'work_permission_expires', asOf, permissionNeedsExpiry),
            { renewals: true }),
    }
}
