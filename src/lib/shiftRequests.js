// Asking somebody to take a shift.
//
// A request is a give and a take. You give some of a shift of yours and you
// take some of a shift of theirs, and either half can be empty. That one shape
// covers a straight cover, a swap, half a shift for half a shift, and an uneven
// trade across two different days, which is what people actually ask for.
//
// Nothing here writes anything. It works out what the week would look like, and
// the manager's screen is the only thing allowed to make it true.

import { toMinutes, endMinutes, shiftHours, shiftMinutes, breakFor } from '@/lib/roster'
import { wholeDayOn } from '@/lib/absences'

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

// What is wrong with the hours a request names, or nothing.
//
// Part of a shift has to be part of it. Nothing used to check, and approving
// keeps whatever sits either side of the hours named: Ana on 12:00 to 17:00
// giving 15:00 to 19:00 came out as Ana 12:00 to 15:00 and Ben 15:00 to 19:00,
// seven hours where there had been five.
//
// Measured in minutes from the shift's own start rather than from midnight, so
// a shift that runs to midnight or past it is measured the way it runs, and
// its last hours are inside it. A finish at the shift's start is a whole day
// later, which is never inside anything.
//
//   outside   the hours start or finish beyond the shift
//   order     they finish before they start
export function windowProblem(shift, from, to) {
    const window = windowOf(shift, from, to)
    if (!window) return 'outside'

    const start = toMinutes(shift.starts_at)
    const a = toMinutes(window.from)
    const b = toMinutes(window.to)
    if (start < 0 || a < 0 || b < 0) return 'outside'

    const runs = shiftMinutes(shift.starts_at, shift.ends_at)
    const into = t => (t - start + 1440) % 1440
    const begins = into(a)
    const ends = into(b) || 1440

    if (begins >= runs || ends > runs) return 'outside'
    if (ends <= begins) return 'order'
    return ''
}

export function windowFits(shift, from, to) {
    return windowProblem(shift, from, to) === ''
}

// Whether both halves of a request still name hours inside their shifts.
//
// Asked again on the desk and when approving, not only when the ask is sent,
// because a manager can change a shift after the two of them agreed and a
// window that fitted then can hang off the end of it now. A whole shift has
// nothing to check, and a shift not in hand says nothing either way, the same
// as shiftsMoved.
export function windowsFit(request, findShift) {
    const fits = (id, from, to) => {
        if (!id || (!from && !to)) return true
        const shift = findShift(id)
        return !shift || windowFits(shift, from, to)
    }
    return fits(request?.give_shift_id, request?.give_from, request?.give_to)
        && fits(request?.take_shift_id, request?.take_from, request?.take_to)
}

// A stretch of hours as minutes from the start of its day, with a finish at or
// before the start read as that night. 17:00 to 00:00 is 1020 to 1440, not
// 1020 to nought, which is a stretch that finishes before it starts. See
// endMinutes, which does the same for a shift.
function span(from, to) {
    const start = toMinutes(from)
    return [start, start + shiftMinutes(from, to)]
}

function overlaps(a, b) {
    const [aFrom, aTo] = span(a.from, a.to)
    const [bFrom, bTo] = span(b.from, b.to)
    return aFrom < bTo && bFrom < aTo
}

// What is left of a shift once a window is taken out of it. Nothing, one piece,
// or two if the window was somewhere in the middle.
//
// The window is placed on the shift's own night, so the last hours of a shift
// that runs past midnight are after its start rather than before it.
function pieces(shift, window) {
    const [start, end] = span(shift.starts_at, shift.ends_at)
    let from = toMinutes(window.from)
    if (from < start) from += 1440
    const to = from + shiftMinutes(window.from, window.to)

    const out = []
    if (from > start) out.push({ starts_at: shift.starts_at, ends_at: window.from })
    if (to < end) out.push({ starts_at: window.to, ends_at: shift.ends_at })
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
//
// Which id a merged row keeps is not arbitrary, and that took a while to see.
// shift_requests points at the two shifts it is about and both foreign keys are
// ON DELETE CASCADE, so deleting the wrong one deletes the request itself: the
// manager presses Approve, the shifts merge, the row that says who agreed what
// is gone, and the status update written a moment later hits nothing at all.
// The ids a request points at are kept first for that reason.
//
// It is not a guarantee. Three rows merging into one still has to lose two, and
// if both halves of a request land on the same person on the same day one of
// them goes. That swap is not a swap anybody would ask for.
function joinUp(rows, breakRules, keepIds) {
    const spare = rows.map(r => r.id).filter(Boolean)
    if (keepIds?.size) spare.sort((a, b) => (keepIds.has(b) ? 1 : 0) - (keepIds.has(a) ? 1 : 0))
    const out = []

    // Finishes compared as the night they belong to. As plain minutes a shift
    // to midnight finished at nought, so joining it to the afternoon before it
    // kept the afternoon's finish and the evening was gone.
    for (const row of rows) {
        const last = out[out.length - 1]
        if (last && toMinutes(row.starts_at) <= endMinutes(last)) {
            if (endMinutes(row) > endMinutes(last)) last.ends_at = row.ends_at
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
        // The position comes across, because it is the same work. The note
        // does not: it was written about the giver's shift, and what is left
        // of that shift still carries it.
        all.push({
            ...shift,
            id: null,
            employee_id: side.taker,
            starts_at: window.from,
            ends_at: window.to,
            note: null,
        })
    }

    if (dirty.size === 0) return { shifts: all, removedIds: [] }

    const out = all.filter(s => !dirty.has(dayKey(s.employee_id, s.shift_date)))
    const removedIds = []

    // The two rows this request hangs off. See joinUp: deleting one of them
    // deletes the request with it.
    const keepIds = new Set([request?.give_shift_id, request?.take_shift_id].filter(Boolean))

    for (const key of dirty) {
        const [employeeId, date] = key.split('|')
        const mine = all
            .filter(s => s.employee_id === employeeId && s.shift_date === date)
            .sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))
        const joined = joinUp(mine, breakRules, keepIds)
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
    const [from, to] = span(window.from, window.to)
    let best = Infinity
    for (const s of shifts) {
        const before = from - endMinutes(s)
        const after = toMinutes(s.starts_at) - to
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

// Whether I can still take a request back: my own, and only while nobody has
// answered it. The database refuses it after that, so the button was one that
// could never work, and on an approved swap it read as an undo.
export function canTakeBack(request, meId) {
    return !!meId && request?.from_employee_id === meId && request?.status === 'asked'
}

// Whether a shift the request names now belongs to somebody outside the two
// people in it.
//
// The database checks whose shift is whose when a request is made. A manager
// can still move one afterwards, and approving moves whichever shift the
// request points at, so approving then would hand a third person's shift over.
//
// A shift already with the person taking it is fine. That is how an approval
// looks when it moved the shifts and then failed to mark itself approved, and
// pressing Approve again is what finishes it. A shift not in hand says nothing
// either way.
export function shiftsMoved(request, findShift) {
    const two = [request?.from_employee_id, request?.to_employee_id]
    const elsewhere = id => {
        const shift = id ? findShift(id) : null
        return !!shift && !two.includes(shift.employee_id)
    }
    return elsewhere(request?.give_shift_id) || elsewhere(request?.take_shift_id)
}

// Everything about a shift that somebody has already asked about, so the week
// can mark it rather than leaving two people to ask the same person twice.
export function requestsOnShift(requests, shiftId) {
    if (!shiftId) return []
    return (requests || []).filter(r =>
        LIVE_STATES.includes(r.status)
        && (r.give_shift_id === shiftId || r.take_shift_id === shiftId))
}

// The shifts a set of requests points at.
//
// Both screens fetch a week at a time, which is right for a roster and wrong
// for a request: something waiting on you is not waiting only while you happen
// to be looking at the right seven days. So the requests are fetched by who
// they are about, and then the two shifts each one names are fetched by id,
// whatever week those turn out to be in. Two small queries rather than three
// weeks of somebody else's roster.
export function shiftIdsOf(requests) {
    const ids = new Set()
    for (const request of requests || []) {
        if (request?.give_shift_id) ids.add(request.give_shift_id)
        if (request?.take_shift_id) ids.add(request.take_shift_id)
    }
    return [...ids]
}

// The day a request is about: the earlier of the two shifts it names.
//
// Null when neither shift is in hand, which is not an error. A screen that
// cannot say when something is should say it cannot, rather than draw a row
// with a gap where the date goes.
export function requestDate(request, shiftById) {
    const dates = [request?.give_shift_id, request?.take_shift_id]
        .map(id => (id ? shiftById?.(id)?.shift_date : null))
        .filter(Boolean)
        .sort()
    return dates[0] || null
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
//
// A new row comes back holding only columns roster_shifts has, ready to send
// once the page adds where and who. The page used to pick them out itself and
// sent notes where the table has note, so the insert was refused after the
// giver's shift had already been cut short, and it left the position behind.
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
        inserts: after.filter(s => !s.id).map(s => ({
            employee_id: s.employee_id,
            shift_date: s.shift_date,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            position_id: s.position_id ?? null,
            break_minutes: s.break_minutes,
            break_is_manual: s.break_is_manual ?? false,
            note: s.note ?? null,
            published_at: s.published_at ?? null,
        })),
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
