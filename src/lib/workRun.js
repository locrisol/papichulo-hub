import { shiftHours, toMinutes } from './roster'
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

// A full day is open to close, not a number of hours.
//
// The first version of this drew a line at seven hours, which was a line
// invented rather than a fact read. This is the real one: somebody who was
// there when the doors opened and still there when they shut did a full day,
// whether that shop opens for eight hours or for twelve.
//
// At or before, and at or after. A shift starting exactly on the opening time
// is the opening shift, and shiftEdges deliberately says otherwise because it
// answers a different question, whether the roster should print "Closing"
// instead of a time.
//
// Their earliest start and latest finish, so somebody on twice in a day counts
// as having covered it. A split shift with the middle out is still a day that
// began at opening and ended at closing.
function coversTheDay(theirShifts, dayHours) {
    if (!dayHours?.open || !dayHours?.close || theirShifts.length === 0) return false

    const starts = Math.min(...theirShifts.map(s => toMinutes(s.starts_at)))
    const ends = Math.max(...theirShifts.map(s => toMinutes(s.ends_at)))

    return starts <= toMinutes(dayHours.open) && ends >= toMinutes(dayHours.close)
}

export function shiftsOn(shifts, employeeId, date) {
    return (shifts || []).filter(s => s.employee_id === employeeId && s.shift_date === date)
}

export function dayHoursFor(shifts, employeeId, date) {
    return shiftsOn(shifts, employeeId, date).reduce((total, s) => total + shiftHours(s), 0)
}

// The unbroken run of days worked immediately before a date.
//
// Counted backwards from the day before and stopping at the first day off,
// which is what makes it a run rather than a tally. Bounded, because the
// roster only ever holds a fortnight or so of shifts and a number that quietly
// depends on how much happens to have been fetched is worse than no number.
// hoursFor gives the opening and closing times of a day. Without it nothing can
// be called a full day, so every day comes back as a part one rather than the
// count quietly meaning something else.
export function runBefore(shifts, employeeId, date, { limit = 14, hoursFor } = {}) {
    const days = []

    for (let back = 1; back <= limit; back += 1) {
        const day = addDays(date, -back)
        const theirs = shiftsOn(shifts, employeeId, day)
        if (theirs.length === 0) break

        const hours = theirs.reduce((total, s) => total + shiftHours(s), 0)
        days.push({
            date: day,
            hours,
            full: coversTheDay(theirs, hoursFor ? hoursFor(day) : null),
        })
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
