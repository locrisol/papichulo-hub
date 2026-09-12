// Asking for time off, and what it costs the week.
//
// The dates and kinds themselves live in absences.js, which has been there
// since managers wrote time off down by hand. This is only the part that comes
// from staff asking for it: how much notice a holiday needs, what part of a day
// somebody can still work, which shifts a request would land on, and what is
// left uncovered after a day is freed.
//
// No React in here, so all of it can be tested.

import { toMinutes, shortTime } from './roster'
import { coversDate, isPartDay } from './absences'

// Part of a day rather than the whole of it. It lives with the other questions
// about an absence row and is passed through here so anything reading this file
// does not have to know that.
export { isPartDay } from './absences'

// A month, near enough, and it is the number he asked for. Set it to 0 in the
// roster rules and no notice is asked for at all.
export const NOTICE_DEFAULT = 30

export function noticeDays(rules) {
    const n = Number(rules?.holidayNoticeDays)
    return Number.isFinite(n) && n >= 0 ? n : NOTICE_DEFAULT
}

// Off, somebody short of notice is warned and can send it anyway. On, they
// cannot send it. Off by default, because you may have agreed something in
// person and a form that refuses just sends the ask back to WhatsApp.
export function noticeBlocks(rules) {
    return rules?.holidayNoticeBlocks === true
}

// Whole days between today and the first day off. Today itself is zero.
export function daysBefore(startsOn, today) {
    if (!startsOn || !today) return null
    const from = new Date(today + 'T00:00:00')
    const to = new Date(startsOn + 'T00:00:00')
    if (isNaN(from) || isNaN(to)) return null
    return Math.round((to - from) / 86400000)
}

// Short notice, or nothing to say.
//
// Only a holiday. A day off tomorrow because something came up is the ordinary
// case and not something to be told off about, and part of a day even more so.
export function noticeProblem(kind, startsOn, rules, today) {
    if (kind !== 'holiday') return null

    const needed = noticeDays(rules)
    if (needed <= 0) return null

    const actual = daysBefore(startsOn, today)
    if (actual == null || actual >= needed) return null

    return { needed, actual, blocks: noticeBlocks(rules) }
}

// What to call it on a list. A part day is a day off with hours on it, so the
// kind alone would say "Day off" for something that is not one.
export function requestLabel(absence) {
    if (isPartDay(absence)) return 'Part of a day'
    return absence?.kind === 'holiday' ? 'Holiday' : 'Day off'
}

// The hours in plain words, the way somebody would say them out loud.
//
//   can work until 15:00
//   can work from 15:00
//   can work 12:00 to 16:00
//
// Nothing for a whole day, because there is nothing to add.
export function partWords(absence) {
    if (!isPartDay(absence)) return ''
    const from = absence.can_work_from
    const to = absence.can_work_to
    if (from && to) return `can work ${shortTime(from)} to ${shortTime(to)}`
    if (to) return `can work until ${shortTime(to)}`
    return `can work from ${shortTime(from)}`
}

// The hours a part day takes out, as spans on a day's timeline.
//
// The same shape unavailableSpans gives back for somebody's usual availability,
// and on purpose: "cannot work these hours" is one idea and the roster should
// draw it one way, whether it comes from their usual week or from a Tuesday
// they asked about. from and to are the ends of the day being drawn.
export function partDaySpans(absence, from, to) {
    if (!isPartDay(absence)) return []

    const canFrom = absence.can_work_from ? toMinutes(absence.can_work_from) : null
    const canTo = absence.can_work_to ? toMinutes(absence.can_work_to) : null

    const spans = []
    if (canFrom != null && canFrom > from) spans.push([from, Math.min(canFrom, to)])
    if (canTo != null && canTo < to) spans.push([Math.max(canTo, from), to])
    return spans.filter(([a, b]) => b > a)
}

// Does this request land on that shift?
//
// For a whole day it is the date and nothing else. For part of a day the shift
// also has to run into the hours they cannot work, because somebody finishing
// at three does not clash with a shift that ended at one.
export function hitsShift(absence, shift) {
    if (!absence || !shift) return false
    if (!coversDate(absence, shift.shift_date)) return false
    if (!isPartDay(absence)) return true

    const starts = toMinutes(shift.starts_at)
    const ends = toMinutes(shift.ends_at)
    if (starts < 0 || ends < 0) return false

    const canFrom = absence.can_work_from ? toMinutes(absence.can_work_from) : -Infinity
    const canTo = absence.can_work_to ? toMinutes(absence.can_work_to) : Infinity

    // Anything outside the window they can work is a clash.
    return starts < canFrom || ends > canTo
}

// The shifts a request would land on, in date order.
export function shiftsHit(absence, shifts) {
    return (shifts || [])
        .filter(s => s.employee_id === absence?.employee_id && hitsShift(absence, s))
        .slice()
        .sort((a, b) => (a.shift_date + a.starts_at).localeCompare(b.shift_date + b.starts_at))
}

// A shift written down as it was, for keeping after it is taken off the roster.
export function asCleared(shift) {
    return { date: shift.shift_date, starts_at: shift.starts_at, ends_at: shift.ends_at }
}

// Is anybody on over these hours now?
//
// Anybody at all, and not the same length either. Somebody covering four of the
// six hours is a manager's judgement to make and not a thing to keep shouting
// about, so any overlap on the day counts as covered.
export function isCovered(gap, shifts) {
    const starts = toMinutes(gap.starts_at)
    const ends = toMinutes(gap.ends_at)

    return (shifts || []).some(s => {
        if (s.shift_date !== gap.date) return false
        const from = toMinutes(s.starts_at)
        const to = toMinutes(s.ends_at)
        if (from < 0 || to < 0) return false
        return from < ends && to > starts
    })
}

// What a freed day left behind and nobody has picked up.
//
// Read off the approved absences themselves rather than kept as its own list,
// so it cannot go stale and there is nothing to tick off. A line disappears the
// moment anybody is rostered over those hours.
export function openGaps(absences, shifts, dates) {
    const wanted = new Set(dates || [])
    const out = []

    for (const absence of absences || []) {
        if (absence.status !== 'approved') continue
        for (const gap of absence.cleared_shifts || []) {
            if (wanted.size > 0 && !wanted.has(gap.date)) continue
            if (isCovered(gap, shifts)) continue
            out.push({ ...gap, employeeId: absence.employee_id, absenceId: absence.id })
        }
    }

    return out.sort((a, b) => (a.date + a.starts_at).localeCompare(b.date + b.starts_at))
}

// The requests still waiting on somebody, oldest first, because the one that
// has been sitting longest is the one somebody is waiting on hardest.
export function waiting(absences) {
    return (absences || [])
        .filter(a => a.status === 'requested')
        .slice()
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

// Is there a request waiting that covers this day for this person? Drawn on the
// roster as an edge round the cell, so the week says "asked for, not agreed".
export function askedOff(absences, employeeId, date) {
    return (absences || []).some(a =>
        a.status === 'requested'
        && a.employee_id === employeeId
        && coversDate(a, date))
}
