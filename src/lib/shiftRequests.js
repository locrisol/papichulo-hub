// Asking somebody to take a shift.
//
// A request is a give and a take. You give some of a shift of yours and you
// take some of a shift of theirs, and either half can be empty. That one shape
// covers a straight cover, a swap, half a shift for half a shift, and an uneven
// trade across two different days, which is what people actually ask for.
//
// Nothing here writes anything. It works out what the week would look like, and
// the manager's screen is the only thing allowed to make it true.

import { toMinutes, shiftHours, breakFor } from './roster'
import { wholeDayOn } from './absences'

export const REQUEST_STATES = {
    asked: { label: 'Waiting on them', tone: 'wait' },
    accepted: { label: 'Waiting on a manager', tone: 'wait' },
    declined: { label: 'Turned down', tone: 'no' },
    withdrawn: { label: 'Taken back', tone: 'no' },
    approved: { label: 'Done', tone: 'yes' },
    refused: { label: 'Not approved', tone: 'no' },
}

// Still going somewhere. Anything else is history and belongs under a heading
// that says so.
export const LIVE_STATES = ['asked', 'accepted']

export function stateOf(status) {
    return REQUEST_STATES[status] || { label: status || '', tone: 'wait' }
}

// The hours a request is actually about: the times written on it, or the whole
// shift when it has none.
export function windowOf(shift, from, to) {
    if (!shift) return null
    return { from: from || shift.starts_at, to: to || shift.ends_at }
}

export function isWholeShift(shift, from, to) {
    const window = windowOf(shift, from, to)
    if (!window) return false
    // By the minute rather than by the string. The database hands back
    // 09:00:00 and a time field hands back 09:00, and those are the same
    // moment however differently they read.
    return toMinutes(window.from) === toMinutes(shift.starts_at)
        && toMinutes(window.to) === toMinutes(shift.ends_at)
}

function overlaps(a, b) {
    return toMinutes(a.from) < toMinutes(b.to) && toMinutes(b.from) < toMinutes(a.to)
}

// What is left of a shift once a window is taken out of it. Nothing, one piece,
// or two if the window was somewhere in the middle.
function pieces(shift, window) {
    const out = []
    if (toMinutes(window.from) > toMinutes(shift.starts_at)) {
        out.push({ starts_at: shift.starts_at, ends_at: window.from })
    }
    if (toMinutes(window.to) < toMinutes(shift.ends_at)) {
        out.push({ starts_at: window.to, ends_at: shift.ends_at })
    }
    return out
}

const dayKey = (employeeId, date) => `${employeeId}|${date}`

// Shifts on one day for one person, joined where they meet.
//
// This is the reason approval is not just a change of name on a row. Two four
// hour shifts earn no break each; the same eight hours as one shift earns an
// hour. Somebody who covers the second half of a day they were already on has
// worked a full day and is owed the full day's break, and leaving the two rows
// side by side quietly underpays them.
//
// Rows keep their ids where there are ids to go round. Anything left over is
// handed back so the caller knows what to delete.
function joinUp(rows, breakRules) {
    const spare = rows.map(r => r.id).filter(Boolean)
    const out = []

    for (const row of rows) {
        const last = out[out.length - 1]
        if (last && toMinutes(row.starts_at) <= toMinutes(last.ends_at)) {
            if (toMinutes(row.ends_at) > toMinutes(last.ends_at)) last.ends_at = row.ends_at
            continue
        }
        out.push({ ...row, id: null })
    }

    for (const row of out) {
        row.id = spare.shift() || null
        // Worked out again rather than carried over. A break that was typed by
        // hand was typed for a shift that no longer exists.
        row.break_minutes = breakFor(shiftHours(row), breakRules)
        row.break_is_manual = false
    }

    return { rows: out, spare }
}

// What the week would look like if this request went through.
//
// The whole list back rather than a patch, because the two questions asked of
// it are "how many hours would we each have" and "what has to be written", and
// both are easier to answer from the finished thing.
export function weekAfter(request, shifts, breakRules) {
    const all = (shifts || []).map(s => ({ ...s }))
    const dirty = new Set()

    const sides = [
        {
            id: request?.give_shift_id,
            from: request?.give_from,
            to: request?.give_to,
            taker: request?.to_employee_id,
        },
        {
            id: request?.take_shift_id,
            from: request?.take_from,
            to: request?.take_to,
            taker: request?.from_employee_id,
        },
    ]

    for (const side of sides) {
        if (!side.id || !side.taker) continue
        const shift = all.find(s => s.id === side.id)
        if (!shift) continue

        const window = windowOf(shift, side.from, side.to)
        const keep = pieces(shift, window)

        dirty.add(dayKey(shift.employee_id, shift.shift_date))
        dirty.add(dayKey(side.taker, shift.shift_date))

        if (keep.length === 0) {
            // The whole shift, so the row itself changes hands. One update.
            shift.employee_id = side.taker
            continue
        }

        shift.starts_at = keep[0].starts_at
        shift.ends_at = keep[0].ends_at
        for (const extra of keep.slice(1)) {
            all.push({ ...shift, id: null, starts_at: extra.starts_at, ends_at: extra.ends_at })
        }
        all.push({
            ...shift,
            id: null,
            employee_id: side.taker,
            starts_at: window.from,
            ends_at: window.to,
        })
    }

    if (dirty.size === 0) return { shifts: all, removedIds: [] }

    const out = all.filter(s => !dirty.has(dayKey(s.employee_id, s.shift_date)))
    const removedIds = []

    for (const key of dirty) {
        const [employeeId, date] = key.split('|')
        const mine = all
            .filter(s => s.employee_id === employeeId && s.shift_date === date)
            .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))
        const joined = joinUp(mine, breakRules)
        out.push(...joined.rows)
        removedIds.push(...joined.spare)
    }

    return { shifts: out, removedIds }
}

export function hoursFor(shifts, employeeId) {
    return (shifts || [])
        .filter(s => s.employee_id === employeeId)
        .reduce((t, s) => t + shiftHours(s), 0)
}

// What a request does to the two people's weeks, before and after.
//
// He asked for this by name: when you swap with somebody you want to see the
// week, and you want to see what the two of you end up working. A cover that
// takes you to fifty hours is a different answer from one that takes you to
// thirty.
export function hoursChange(request, shifts, breakRules) {
    const after = weekAfter(request, shifts, breakRules)
    const both = [request?.from_employee_id, request?.to_employee_id]
    return both.map(id => ({
        employeeId: id,
        before: hoursFor(shifts, id),
        after: hoursFor(after.shifts, id),
    }))
}

// Who to ask, and it is the whole day's column rather than the empty cells in
// it.
//
// The obvious answer is "ask whoever is off that day" and it is the wrong one.
// Somebody already in on Wednesday morning is the likeliest yes there is: they
// are coming in anyway, they know the day, and taking your evening turns a half
// day into a full one, which is usually what they want. An empty cell is
// somebody with the day off, and asking them to give it up is a bigger ask.
//
// So three groups, in the order worth reading them:
//
//   finishing   in that day and free for the hours you are giving
//   free        nothing on at all
//   cannot      already working those hours, or down as away
export function shortlist({ date, window, employees, shifts, absences, askerId }) {
    const groups = { finishing: [], free: [], cannot: [] }

    for (const person of employees || []) {
        if (person.id === askerId) continue

        const theirs = (shifts || [])
            .filter(s => s.employee_id === person.id && s.shift_date === date)
            .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))

        const away = !!wholeDayOn(absences, person.id, date)
        const clash = window
            ? theirs.some(s => overlaps({ from: s.starts_at, to: s.ends_at }, window))
            : false

        if (away || clash) {
            groups.cannot.push({ person, shifts: theirs, why: away ? 'away' : 'clash' })
        } else if (theirs.length === 0) {
            groups.free.push({ person, shifts: theirs })
        } else {
            groups.finishing.push({ person, shifts: theirs, gap: gapTo(theirs, window) })
        }
    }

    // Closest first. Somebody finishing at three, offered a shift that starts
    // at three, is one shift rather than two and is the best answer on the
    // list.
    groups.finishing.sort((a, b) => a.gap - b.gap)
    return groups
}

// How far somebody's day is from the hours being offered, in minutes. Zero
// means their shift and the offer meet.
export function gapTo(shifts, window) {
    if (!window || !shifts?.length) return Infinity
    let best = Infinity
    for (const s of shifts) {
        const before = toMinutes(window.from) - toMinutes(s.ends_at)
        const after = toMinutes(s.starts_at) - toMinutes(window.to)
        const gap = Math.min(before >= 0 ? before : Infinity, after >= 0 ? after : Infinity)
        if (gap < best) best = gap
    }
    return best
}

// Is this request waiting on me, and for what.
export function waitingOn(request, meId, isManager) {
    if (request.status === 'asked') return request.to_employee_id === meId ? 'answer' : null
    if (request.status === 'accepted') return isManager ? 'approve' : null
    return null
}

// Everything about a shift that somebody has already asked about, so the week
// can mark it rather than leaving two people to ask the same person twice.
export function requestsOnShift(requests, shiftId) {
    if (!shiftId) return []
    return (requests || []).filter(r =>
        LIVE_STATES.includes(r.status)
        && (r.give_shift_id === shiftId || r.take_shift_id === shiftId))
}

// What has to be written for a request to become true.
//
// Three lists, because that is what the database takes. Rows that changed keep
// their ids and are updated; rows that have to exist are inserted; rows that
// were merged away or given up entirely are removed.
//
// published_at is deliberately left alone. An approved change alters the week
// that already went out rather than pulling it back for a re-publish: the swap
// is the roster now, and marking the week unpublished would tell everybody the
// thing they just agreed had been undone.
export function writesFor(request, shifts, breakRules) {
    const { shifts: after, removedIds } = weekAfter(request, shifts, breakRules)
    const before = new Map((shifts || []).map(s => [s.id, s]))

    const same = (a, b) =>
        a.employee_id === b.employee_id
        && a.shift_date === b.shift_date
        && toMinutes(a.starts_at) === toMinutes(b.starts_at)
        && toMinutes(a.ends_at) === toMinutes(b.ends_at)
        && (a.break_minutes ?? 0) === (b.break_minutes ?? 0)

    return {
        updates: after.filter(s => s.id && before.has(s.id) && !same(before.get(s.id), s)),
        inserts: after.filter(s => !s.id),
        removes: removedIds,
    }
}

// Two lists of findings, and only what is new in the second one.
//
// Approving re-runs the checks, but a week that already had a warning on it
// should not read as though the swap caused it. Only what the swap actually
// broke is worth putting in front of somebody about to press Approve.
export function newFindings(before, after) {
    const had = new Set((before || []).map(f => `${f.kind}|${f.employeeId}|${f.text}`))
    return (after || []).filter(f => !had.has(`${f.kind}|${f.employeeId}|${f.text}`))
}
