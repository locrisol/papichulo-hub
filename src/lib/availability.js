// When somebody can work.
//
// The column has been sitting on the employees table since the team list was
// built, described and unused. This is what reads it.
//
// The shape is one entry per weekday, keyed the way JavaScript keys them with
// Sunday as 0, and the rule for a missing key is the part that matters:
//
//   no key at all    no restriction, they can work whenever
//   an empty list    they cannot work that day
//   a list of pairs  they can work inside those hours and nowhere else
//
// It is that way round on purpose. Nothing recorded has to mean no restriction,
// because everybody on both team lists has nothing recorded and the roster must
// not suddenly start complaining about all of them. It also means half filling
// this in is safe: setting Sunday says something about Sunday and says nothing
// about the rest of the week.
//
// None of it refuses anything. A manager who knows somebody swapped their
// college hours this term can roster straight over it, and the roster says so
// once rather than standing in the way.

import { toMinutes, shiftMinutes } from './roster'

// The two edges of a day.
//
// A window with nothing before it or nothing after it is the commonest thing
// somebody actually says: not before one, or nothing after six. It is still
// stored as a pair, with the open end sitting on the edge of the day, so there
// is one shape to read rather than three.
//
// The end of the day is 24:00 and not 23:59. A shift finishing at midnight is
// counted as 1440 minutes in, so a minute short here would refuse every closing
// shift for somebody who can work any evening.
export const DAY_START = '00:00'
export const DAY_END = '24:00'

// Sunday first, because the roster week starts on Sunday and this is read
// alongside it.
export const WEEKDAYS = [
    { key: '0', name: 'Sunday' },
    { key: '1', name: 'Monday' },
    { key: '2', name: 'Tuesday' },
    { key: '3', name: 'Wednesday' },
    { key: '4', name: 'Thursday' },
    { key: '5', name: 'Friday' },
    { key: '6', name: 'Saturday' },
]

export function dayKeyOf(date) {
    if (!date) return null
    const d = new Date(String(date) + 'T00:00:00')
    return isNaN(d) ? null : String(d.getDay())
}

export function dayNameOf(date) {
    const key = dayKeyOf(date)
    return WEEKDAYS.find(d => d.key === key)?.name || ''
}

// A pair of times is only a window if both are readable and the second is after
// the first. Anything else is thrown away here rather than being allowed to
// decide something further down.
function cleanWindows(list) {
    if (!Array.isArray(list)) return []
    return list
        .filter(w => Array.isArray(w) && w.length === 2)
        .filter(w => toMinutes(w[0]) >= 0 && toMinutes(w[1]) > toMinutes(w[0]))
        .map(w => [String(w[0]).slice(0, 5), String(w[1]).slice(0, 5)])
}

// What is recorded for one weekday, by its key.
//
// null means nothing is recorded, which is not the same as an empty list. One
// says we do not know, the other says no.
export function windowsForKey(availability, key) {
    if (!availability || typeof availability !== 'object') return null
    if (!Object.prototype.hasOwnProperty.call(availability, key)) return null
    if (!Array.isArray(availability[key])) return null
    return cleanWindows(availability[key])
}

export function windowsFor(availability, date) {
    const key = dayKeyOf(date)
    return key === null ? null : windowsForKey(availability, key)
}

// The three answers a day can give, in one word each.
export function dayState(availability, date) {
    const windows = windowsFor(availability, date)
    if (windows === null) return 'any'
    return windows.length === 0 ? 'none' : 'windows'
}

// Where a shift falls outside what somebody said they can work.
//
// Nothing back when it fits. A shift has to sit inside a single window rather
// than across two, because two windows are two separate stretches with
// something in the middle they said they cannot do.
export function outsideAvailability(availability, shift) {
    const windows = windowsFor(availability, shift?.shift_date)
    if (windows === null) return null
    if (windows.length === 0) return { kind: 'day', windows }

    const from = toMinutes(shift.starts_at)
    if (from < 0) return null
    const to = from + shiftMinutes(shift.starts_at, shift.ends_at)

    const fits = windows.some(w => from >= toMinutes(w[0]) && to <= toMinutes(w[1]))
    return fits ? null : { kind: 'time', windows }
}

// The hours of a day somebody is not available, as stretches to shade on the
// timeline. Given the piece of the day the grid is actually drawing, so a
// window running to midnight does not paint past the end of it.
export function unavailableSpans(availability, date, from, to) {
    const windows = windowsFor(availability, date)
    if (windows === null) return []
    if (windows.length === 0) return [[from, to]]

    const sorted = windows
        .map(w => [toMinutes(w[0]), toMinutes(w[1])])
        .sort((a, b) => a[0] - b[0])

    const spans = []
    let at = from
    for (const [start, end] of sorted) {
        if (start > at) spans.push([at, Math.min(start, to)])
        at = Math.max(at, end)
    }
    if (at < to) spans.push([at, to])
    return spans.filter(([a, b]) => b > a)
}

// Which of the four shapes a window has, read off its two ends.
export function windowShape(window) {
    const from = toMinutes(window?.[0])
    const to = toMinutes(window?.[1])
    const openStart = from <= 0
    const openEnd = to >= 1440
    if (openStart && openEnd) return 'all'
    if (openStart) return 'until'
    if (openEnd) return 'from'
    return 'between'
}

// What one window reads as on its own.
export function windowLabel(window) {
    const shape = windowShape(window)
    if (shape === 'all') return 'any time'
    if (shape === 'from') return `from ${window[0]}`
    if (shape === 'until') return `until ${window[1]}`
    return `${window[0]} to ${window[1]}`
}

export function windowsLabel(windows) {
    if (!windows || windows.length === 0) return 'nothing that day'
    return windows.map(windowLabel).join(' and ')
}

// The one line that goes under somebody's name on the team list.
//
// Only ever about the days that say something. A week with Sunday off and
// nothing else set reads as one thing rather than as six.
export function availabilitySummary(availability) {
    const set = WEEKDAYS
        .map(d => ({ ...d, windows: windowsForKey(availability, d.key) }))
        .filter(d => d.windows !== null)
    if (set.length === 0) return ''

    const cannot = set.filter(d => d.windows.length === 0)
    const limited = set.length - cannot.length

    const parts = []
    if (cannot.length) parts.push(`no ${cannot.map(d => d.name + 's').join(', ')}`)
    if (limited) parts.push(`${limited} ${limited === 1 ? 'day' : 'days'} with set hours`)
    return parts.join(', ')
}

// The seven rows the dialog edits, filled in from what is stored.
//
// A day with nothing recorded still carries a pair of times, so turning it on
// has something sensible in the boxes rather than two empty ones.
export function toRows(availability) {
    return WEEKDAYS.map(day => {
        const windows = windowsForKey(availability, day.key)
        return {
            ...day,
            state: windows === null ? 'any' : windows.length === 0 ? 'none' : 'windows',
            windows: windows?.length ? windows.map(w => [...w]) : [['09:00', '17:00']],
        }
    })
}

// And back again, ready for the database.
//
// A week where nothing is set is stored as nothing at all rather than as an
// empty object, so the difference between never filled in and deliberately
// cleared does not have to be guessed at later.
export function fromRows(rows) {
    const out = {}
    for (const row of rows || []) {
        if (row.state === 'any') continue
        if (row.state === 'none') { out[row.key] = []; continue }

        const windows = cleanWindows(row.windows)
        // A day set to hours with no usable hours in it is left unrecorded
        // rather than saved as an empty list, which would quietly turn "between
        // these times" into "not at all".
        if (windows.length) out[row.key] = windows
    }
    return Object.keys(out).length ? out : null
}

// The three sets of days worth copying onto in one go.
//
// Monday to Friday is the one this exists for. Somebody who can only start at
// one is almost never saying it about one day, they are saying it about the
// college week, and typing the same thing five times is how the fifth one ends
// up different from the other four.
export const DAY_GROUPS = [
    { label: 'Mon to Fri', keys: ['1', '2', '3', '4', '5'] },
    { label: 'Sat and Sun', keys: ['0', '6'] },
    { label: 'Every day', keys: ['0', '1', '2', '3', '4', '5', '6'] },
]

// One day's answer put onto several others.
//
// The hours are copied rather than shared, or editing Tuesday afterwards would
// quietly change Monday as well.
export function copyDay(rows, fromKey, toKeys) {
    const source = (rows || []).find(r => r.key === fromKey)
    if (!source) return rows || []

    const targets = new Set(toKeys || [])
    return rows.map(row => (
        targets.has(row.key)
            ? { ...row, state: source.state, windows: source.windows.map(w => [...w]) }
            : row
    ))
}

// What is wrong with the rows, before any of it is saved.
export function availabilityProblem(rows) {
    for (const row of rows || []) {
        if (row.state !== 'windows') continue
        for (const window of row.windows || []) {
            const [a, b] = window
            // Only the ends that are actually being said. A window running from
            // one o'clock has no finishing time to be missing.
            const shape = windowShape(window)
            if (shape !== 'until' && !a) return `${row.name} has a start time missing.`
            if (shape !== 'from' && !b) return `${row.name} has a finishing time missing.`
            if (a && b && toMinutes(b) <= toMinutes(a)) {
                return `${row.name} finishes at ${b}, which is not after ${a}.`
            }
        }
    }
    return ''
}
