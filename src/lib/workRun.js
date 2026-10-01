import { shiftHours, toMinutes, endMinutes, closeMinutes, shiftEdges } from '@/lib/roster'
import { addDays } from '@/lib/dates'

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
//
// The finish and the close are read as the night they belong to, so a day
// open to midnight can be a full one. See endMinutes.
function coversTheDay(theirShifts, dayHours) {
    if (!dayHours?.open || !dayHours?.close || theirShifts.length === 0) return false

    const starts = Math.min(...theirShifts.map(s => toMinutes(s.starts_at)))
    const ends = Math.max(...theirShifts.map(endMinutes))

    return starts <= toMinutes(dayHours.open) && ends >= closeMinutes(dayHours)
}

// Who closed the night before a date, and the whole of their day.
//
// Said quietly on the day view and nothing more. Closing at eleven and
// opening at half eight is legal and sometimes it is what somebody wants, so
// this does not block it, warn about it or make it any harder to do. It just
// means you are not deciding it blind.
//
// The whole day, for somebody on twice: the first start and the last finish,
// so a split day reads as the day it was rather than as its second half.
// Compared by the minute and not as text, because as text 13:00 comes after
// 00:00 and a day that ran to midnight read as finishing at one.
export function closedTheNightBefore(shifts, date, hoursFor) {
    const yesterday = addDays(date, -1)
    const theirs = (shifts || []).filter(s => s.shift_date === yesterday)
    const hours = hoursFor ? hoursFor(yesterday) : null

    const closed = {}
    for (const s of theirs) {
        if (!shiftEdges(s, hours).closing) continue
        closed[s.employee_id] = { starts_at: s.starts_at, ends_at: s.ends_at }
    }

    for (const s of theirs) {
        const day = closed[s.employee_id]
        if (!day) continue
        const ends = endMinutes(day)
        if (toMinutes(s.starts_at) < toMinutes(day.starts_at)) day.starts_at = s.starts_at
        if (endMinutes(s) > ends) day.ends_at = s.ends_at
    }

    return closed
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
