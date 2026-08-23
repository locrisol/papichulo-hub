// The days somebody is not there.
//
// Availability is the usual week and it lives on the person. This is the other
// half: the dates that are only about themselves. Away the 14th to the 21st,
// off sick on Tuesday, at a wedding on the 3rd.
//
// Every stretch has a last day and that day counts. A single day off has the
// same date at both ends rather than a missing one, so every question here is
// asked the same way whatever the length of it.
//
// None of it refuses anything. A shift landing on somebody's time off is said
// on their row and left there, because somebody back early from a holiday or
// coming in for one shift is a real thing.

import { addDays } from './dates'

// The kinds, and what each one is called on screen.
//
// The colour is the block drawn across the roster row. They are muted on
// purpose: this sits behind a week that already uses colour to say what a
// position is, and time off has to read as the ground rather than as another
// person.
//
// The phrase is there because the label does not fit in a sentence. A warning
// reading "is down as Holiday" is written by a form rather than by a person.
export const ABSENCE_KINDS = [
    { value: 'holiday', label: 'Holiday', phrase: 'on holiday', colour: '#4a7fb5', hours: true },
    { value: 'day_off', label: 'Day off', phrase: 'having the day off', colour: '#6b7f8c', hours: false },
    { value: 'sick', label: 'Off sick', phrase: 'off sick', colour: '#b5654a', hours: false },
    { value: 'event', label: 'Away at something', phrase: 'away at something', colour: '#7a6bb5', hours: false },
    { value: 'lent', label: 'At the other restaurant', phrase: 'at the other restaurant', colour: '#4a9b7f', hours: false },
    { value: 'unpaid', label: 'Unpaid leave', phrase: 'on unpaid leave', colour: '#8c8c8c', hours: false },
]

export function kindOf(value) {
    return ABSENCE_KINDS.find(k => k.value === value) || ABSENCE_KINDS[1]
}

export function kindLabel(value) {
    return kindOf(value).label
}

export function kindPhrase(value) {
    return kindOf(value).phrase
}

// Only a holiday carries hours, and they come off the payslip rather than
// being worked out here. A rostered week and a paid week are different numbers
// and will stay different until the till can say what somebody actually worked.
export function takesHours(value) {
    return kindOf(value).hours
}

// Is this date inside the stretch? Both ends count.
export function coversDate(absence, date) {
    if (!absence?.starts_on || !date) return false
    const to = absence.ends_on || absence.starts_on
    return date >= absence.starts_on && date <= to
}

// What somebody has on, on a given day.
//
// Everything rather than the first one, because two can genuinely overlap: a
// holiday somebody then went sick during is two facts and neither one replaces
// the other.
export function absencesOn(absences, employeeId, date) {
    return (absences || []).filter(a =>
        a.employee_id === employeeId
        && a.status !== 'declined'
        && coversDate(a, date),
    )
}

// The one to draw, when only one can be drawn.
export function absenceOn(absences, employeeId, date) {
    return absencesOn(absences, employeeId, date)[0] || null
}

// Everything touching a stretch of dates, which is how a week asks.
export function absencesInRange(absences, from, to) {
    return (absences || []).filter(a =>
        a.status !== 'declined'
        && (a.ends_on || a.starts_on) >= from
        && a.starts_on <= to,
    )
}

// How many days a stretch runs, counting both ends.
export function absenceDays(absence) {
    if (!absence?.starts_on) return 0
    const to = absence.ends_on || absence.starts_on
    let days = 0
    for (let d = absence.starts_on; d <= to; d = addDays(d, 1)) days++
    return days
}

// How a stretch reads: one date, or two.
export function absenceRange(absence, format) {
    const show = format || (d => d)
    const to = absence?.ends_on || absence?.starts_on
    if (!absence?.starts_on) return ''
    return absence.starts_on === to
        ? show(absence.starts_on)
        : `${show(absence.starts_on)} to ${show(to)}`
}

// Do two stretches of the same person's time off run into each other?
//
// Not refused. Two overlapping is usually somebody going sick in the middle of
// a holiday, which is two true things. It is worth saying so once while it is
// being typed, in case it is the same week entered twice.
export function overlappingAbsence(absences, absence) {
    return (absences || []).find(other =>
        other.id !== absence?.id
        && other.employee_id === absence?.employee_id
        && other.status !== 'declined'
        && (other.ends_on || other.starts_on) >= absence?.starts_on
        && other.starts_on <= (absence?.ends_on || absence?.starts_on),
    ) || null
}

// What is wrong with one before it is saved.
export function absenceProblem(form) {
    if (!form?.employeeId) return 'Pick who it is for.'
    if (!form?.startsOn) return 'Put a first day on it.'
    const to = form.endsOn || form.startsOn
    if (to < form.startsOn) return 'The last day is before the first one.'
    if (form.hours !== '' && form.hours != null && isNaN(Number(form.hours))) {
        return 'The hours have to be a number.'
    }
    return ''
}

// Newest first, which is the order somebody wants to read their own list in.
export function sortAbsences(absences) {
    return (absences || []).slice().sort((a, b) =>
        b.starts_on.localeCompare(a.starts_on),
    )
}

// The short line that goes under a name on the team list, about what is coming
// rather than about everything they ever took.
export function nextAbsence(absences, employeeId, today) {
    return sortAbsences(absences)
        .filter(a => a.employee_id === employeeId && a.status !== 'declined')
        .filter(a => (a.ends_on || a.starts_on) >= today)
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] || null
}
