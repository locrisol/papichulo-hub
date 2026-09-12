import { toMinutes, toTime } from './roster'

// The times a person can pick, every quarter of an hour.
//
// Every time box in the app was a native <input type="time">, which offers
// every minute of the day. Nothing here is ever set to 15:07: shifts, opening
// hours, availability and time off all land on the quarter hour, so 1,440
// choices were being offered to make one of 96, and on a phone that means the
// clock dial and two or three fiddly taps per box.
//
// Quarters rather than halves because a 15:15 start is real: a delivery slot,
// somebody coming in after a lecture, a half hour handover split.
//
// THE ONE THAT MATTERS
//
// Whatever is already stored is always in the list, even when it is not on the
// quarter hour. A picker that quietly rounds a saved 15:07 to 15:00 changes
// somebody's pay by seven minutes without anybody asking for it, and it would
// do it just by being opened and closed. So an odd value keeps its place and
// its own label, and it only goes when a person actually picks something else.

const STEP = 15
const DAY = 24 * 60

// The end of the day, which is not 23:45 and is not a time of day at all.
//
// availability stores "until the end of the day" as 24:00, which a native time
// input cannot represent: its maximum is 23:59. The dialog worked around that
// by showing an empty box, so the one state somebody most wants to be sure of,
// they can work right through to close, looked exactly like a box nobody had
// filled in. Drawing the list ourselves means it can say so.
export const END_OF_DAY = '24:00'

function label(time) {
    return time === END_OF_DAY ? 'End of day' : time
}

// Every quarter hour of the day, as minutes past midnight.
function grid() {
    const out = []
    for (let m = 0; m < DAY; m += STEP) out.push(m)
    return out
}

// The list, in the order somebody reads it.
//
// dayStart rotates rather than trims. Trimming to the trading day would be
// tidier and it would be wrong: a shift that finishes at 02:00 is a normal
// Saturday, and a list running 07:00 to midnight has no way to say it. Rotating
// puts the opening hour first, so the times anybody actually wants are at the
// top with nothing to scroll past, and every other time in the day is still
// there, further down, where a late finish belongs.
export function timeOptions({ value = '', dayStart = '', endOfDay = false } = {}) {
    const from = toMinutes(dayStart)
    const start = from >= 0 ? Math.floor(from / STEP) * STEP : 0

    const minutes = grid().map(m => (m + start) % DAY)

    // Sorted back into the order they are shown in, so an odd saved time lands
    // where it belongs rather than at the end.
    const rank = m => ((m - start) % DAY + DAY) % DAY

    const current = toMinutes(value)
    const odd = current >= 0 && current % STEP !== 0 && value !== END_OF_DAY

    if (odd) {
        minutes.push(current)
        minutes.sort((a, b) => rank(a) - rank(b))
    }

    const options = minutes.map(m => ({ value: toTime(m), label: toTime(m) }))

    // Last, because it is the far edge of the day whatever the list starts at.
    if (endOfDay) options.push({ value: END_OF_DAY, label: label(END_OF_DAY) })

    return options
}

// Is this a time the picker would offer on its own?
//
// Used to decide whether a saved value needs carrying, and by the tests. A
// blank is not off the grid, it is nothing at all.
export function onTheGrid(value) {
    if (!value) return true
    if (value === END_OF_DAY) return true
    const m = toMinutes(value)
    return m >= 0 && m % STEP === 0
}
