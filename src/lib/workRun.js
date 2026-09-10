import { shiftHours } from './roster'
import { addDays } from './dates'

// How hard somebody has been going, in the days right before this one.
//
// The roster already says who closed last night, which is the one fact that
// decides whether opening them at half eight is a good idea. This is the rest
// of the same question: was that a full day or a couple of hours, and is it the
// first one or the fifth in a row.
//
// None of it stops anything. It is the same principle as the closing time: a
// manager who can see it is deciding, and a manager who cannot is guessing.

// A day of seven hours or more counts as a full one.
//
// There is no such thing as a standard day recorded anywhere, so this is a
// line drawn rather than a fact read. Seven rather than eight because a shift
// that came in at seven and a half is nobody's idea of a half day, and calling
// it one is the answer that would make somebody stop trusting the line.
export const FULL_DAY_HOURS = 7

export function dayHoursFor(shifts, employeeId, date) {
    return (shifts || [])
        .filter(s => s.employee_id === employeeId && s.shift_date === date)
        .reduce((total, s) => total + shiftHours(s), 0)
}

// The unbroken run of days worked immediately before a date.
//
// Counted backwards from the day before and stopping at the first day off,
// which is what makes it a run rather than a tally. Bounded, because the
// roster only ever holds a fortnight or so of shifts and a number that quietly
// depends on how much happens to have been fetched is worse than no number.
export function runBefore(shifts, employeeId, date, limit = 14) {
    const days = []

    for (let back = 1; back <= limit; back += 1) {
        const day = addDays(date, -back)
        const hours = dayHoursFor(shifts, employeeId, day)
        if (hours <= 0) break
        days.push({ date: day, hours, full: hours >= FULL_DAY_HOURS })
    }

    return {
        days: days.length,
        full: days.filter(d => d.full).length,
        // The day before, which is the one the closing time is also about.
        last: days[0] || null,
        // True where the run reached as far back as it was allowed to look, so
        // a reader knows the number is "at least" rather than exactly.
        capped: days.length === limit,
    }
}

// The run in words, or nothing at all.
//
// Nothing for one ordinary day, because "worked yesterday" said under somebody
// every single morning is a line that stops being read by Wednesday. It speaks
// when the day before was a full one, or when a run is long enough to be worth
// knowing about.
//
// Short on purpose. It sits in a column ten rem wide under a name and whatever
// else that row has to say, and three lines of text where the grid expects one
// is what broke the day view the first time this went in.
//
// toldAboutYesterday is for the caller that has already said something about
// last night, the closing time being the obvious one. Saying "closed 21:30 last
// night" and then "full day yesterday" underneath is the same fact twice.
export function runWords(run, { longRun = 4, toldAboutYesterday = false } = {}) {
    if (!run?.days) return ''

    const bits = []
    if (!toldAboutYesterday) {
        if (run.last?.full) bits.push('Full day yesterday')
        else if (run.days >= longRun) bits.push('Part day yesterday')
    }

    if (run.days >= longRun) {
        bits.push(`${run.capped ? `${run.days}+` : run.days} in a row`)
    }

    return bits.join(', ')
}
