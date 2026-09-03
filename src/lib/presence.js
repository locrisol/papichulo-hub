// The week as a picture, for a phone.
//
// The week table is 64rem at its narrowest and a phone is about 23. It is not a
// question of squeezing it: seven columns of "08:30 - Closing" cannot be made to
// fit and should not be tried.
//
// So on a small screen the same week becomes a row per person and seven narrow
// cells, and each cell is a bar showing which part of the day that person
// covers. Morning fills the left, evening fills the right, a full day fills it.
//
// That shape is chosen for one question, which is the question the whole staff
// side exists for: who could take this shift off me. A half filled cell is
// somebody already in that day and free for the other half of it, and it is the
// likeliest yes there is. On the table you find that by reading fourteen times.
// Here you find it by looking.
//
// All the arithmetic is here so it can be tested. The drawing is in
// PresenceGrid and has no numbers in it.

import { toMinutes, shiftMinutes } from './roster'

// A day with no opening hours recorded still has to be drawn against something.
const FALLBACK = { from: 8 * 60, to: 24 * 60 }

// The stretch of the day the bars are measured against.
//
// The store's own hours where they are known, and then widened to take in
// anything rostered outside them. An opening shift starts before the doors do
// and a closing one runs past them, and those are the two shifts most worth
// seeing, so a span that clipped them would be hiding the point.
export function daySpan(dayHours, shifts) {
    let from = toMinutes(dayHours?.open)
    let to = toMinutes(dayHours?.close)
    if (from < 0 || to < 0 || to <= from) { from = FALLBACK.from; to = FALLBACK.to }

    for (const shift of shifts || []) {
        const starts = toMinutes(shift.starts_at)
        if (starts < 0) continue
        const ends = starts + shiftMinutes(shift.starts_at, shift.ends_at)
        if (starts < from) from = starts
        if (ends > to) to = ends
    }
    return { from, to }
}

// The one span the whole week is drawn against.
//
// Every day gets the same one, on purpose. Given its own span a four hour
// Tuesday and a twelve hour Saturday would both fill their cell, and the grid
// would say the opposite of what it means. A week measured end to end costs a
// little emptiness on the quiet days and keeps every bar comparable.
export function weekSpan(dayHoursByDate, shifts) {
    let from = Infinity
    let to = -Infinity

    for (const day of Object.values(dayHoursByDate || {})) {
        const open = toMinutes(day?.open)
        const close = toMinutes(day?.close)
        if (open < 0 || close <= open) continue
        from = Math.min(from, open)
        to = Math.max(to, close)
    }

    for (const shift of shifts || []) {
        const starts = toMinutes(shift.starts_at)
        if (starts < 0) continue
        from = Math.min(from, starts)
        to = Math.max(to, starts + shiftMinutes(shift.starts_at, shift.ends_at))
    }

    if (!Number.isFinite(from) || to <= from) return { ...FALLBACK }
    return { from, to }
}

// Where a shift's bar sits in its cell, as two percentages.
//
// A very short shift still gets a visible bar. Two hours out of a sixteen hour
// span is twelve per cent of a cell forty pixels wide, which is five pixels and
// reads as nothing at all, so there is a floor under it.
export function barFor(shift, span, minWidth = 18) {
    const width = span.to - span.from
    if (width <= 0) return null

    const starts = toMinutes(shift?.starts_at)
    if (starts < 0) return null
    const ends = starts + shiftMinutes(shift.starts_at, shift.ends_at)

    const clamp = n => Math.max(0, Math.min(1, n))
    const left = clamp((starts - span.from) / width) * 100
    const right = clamp((ends - span.from) / width) * 100

    const drawn = Math.max(right - left, minWidth)
    return { left: Math.min(left, 100 - drawn), width: drawn }
}

// What somebody's day looks like from a distance.
//
//   off      nothing rostered
//   early    in at the start and gone before the end
//   late     in part way through and there to the end
//   middle   neither end, which happens and has no better name
//   all      the whole of it
//
// The three in the middle are the ones worth spotting. Somebody on an early is
// free in the evening, which is exactly the person to ask about an evening.
export function dayShape(shifts, span) {
    const on = (shifts || []).filter(s => toMinutes(s.starts_at) >= 0)
    if (on.length === 0) return 'off'

    const starts = Math.min(...on.map(s => toMinutes(s.starts_at)))
    const ends = Math.max(...on.map(s =>
        toMinutes(s.starts_at) + shiftMinutes(s.starts_at, s.ends_at)))

    // A quarter of an hour either side counts as reaching the end. Somebody
    // finishing at 21:45 against a nine o'clock close is not on a half day.
    const edge = 15
    const opens = starts <= span.from + edge
    const closes = ends >= span.to - edge

    if (opens && closes) return 'all'
    if (opens) return 'early'
    if (closes) return 'late'
    return 'middle'
}

// The hours of a day that nobody has this person down for, as one stretch
// either side of what they are working. It is what "free after 15:00" is read
// off, and it is only ever the outside of their shifts: a two hour hole in the
// middle of somebody's day is not time you can hand them a shift in.
export function freeEnds(shifts, span) {
    const on = (shifts || []).filter(s => toMinutes(s.starts_at) >= 0)
    if (on.length === 0) return { before: null, after: null }

    const starts = Math.min(...on.map(s => toMinutes(s.starts_at)))
    const ends = Math.max(...on.map(s =>
        toMinutes(s.starts_at) + shiftMinutes(s.starts_at, s.ends_at)))

    return {
        before: starts > span.from ? { from: span.from, to: starts } : null,
        after: ends < span.to ? { from: ends, to: span.to } : null,
    }
}
