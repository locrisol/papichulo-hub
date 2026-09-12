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
// Full days in a row, ending on the day being rostered.
//
// This is the question a manager is actually asking before putting somebody on
// open to close again: how many of those have they already done without a
// break. Days worked is not it. Four short evenings is not a person who needs
// a day off, and the first version counted them the same.
//
// Today is counted when today is already a full day, so the number moves the
// moment a full shift goes in and moves back if it is taken out again. That is
// the whole use of it: you are deciding whether to make it one more.
//
// A day that is not a full day ends the run, whether it was a half day or a day
// off. The run is of full days.
export function fullDayRun(shifts, employeeId, date, { limit = 21, hoursFor } = {}) {
    let run = 0
    let todayIsFull = false

    for (let back = 0; back <= limit; back += 1) {
        const day = addDays(date, -back)
        const theirs = shiftsOn(shifts, employeeId, day)
        const full = coversTheDay(theirs, hoursFor ? hoursFor(day) : null)

        if (back === 0) {
            todayIsFull = full
            // Today not being a full day does not end the run, it just does
            // not add to it. What came before is still what they have done.
            if (!full) continue
        }

        if (!full) break
        run += 1
    }

    return { run, todayIsFull }
}

// The run in words, or nothing at all.
//
// Silent below the point it is worth knowing. Five full days in a row is an
// ordinary full time week, so saying it every Friday about everybody would
// make it wallpaper by the second week.
export function fullDayWords(run, from = 4) {
    if (!run?.run || run.run < from) return ''

    return run.todayIsFull
        ? `${run.run} full days in a row, counting this one.`
        : `${run.run} full days in a row before this one.`
}
