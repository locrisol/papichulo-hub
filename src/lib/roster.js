// The arithmetic behind the roster.
//
// No React in here, the same split the rest of lib uses. Everything that could
// be got wrong quietly lives in this file so it can be tested: what a shift is
// worth, what break it earns, and what a week costs.

// The ladder every restaurant starts with.
//
// The bottom two rungs come from the Irish rules on breaks. The hour is this
// company's own addition on top, which is why it is in the same list rather than
// hardcoded somewhere separate: a restaurant can take it out.
//
// The operators are not all the same and that is the whole point. Four and a
// half hours exactly earns nothing, and anything above it earns fifteen minutes.
// A shift from 08:30 to 13:00 is the case that proves it, and it is why each
// rung carries its own operator instead of the list assuming one.
export const DEFAULT_BREAK_RULES = [
    { hours: 8, operator: 'gte', minutes: 60 },
    { hours: 6, operator: 'gte', minutes: 30 },
    { hours: 4.5, operator: 'gt', minutes: 15 },
]

export const OPERATORS = [
    { value: 'gte', label: 'or more' },
    { value: 'gt', label: 'more than' },
]

// "HH:MM" or "HH:MM:SS" to minutes past midnight. Nothing sensible comes back
// as -1 rather than as NaN, so a bad value cannot quietly poison a total.
export function toMinutes(time) {
    if (!time) return -1
    const [h, m] = String(time).split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return -1
    return h * 60 + m
}

export function toTime(minutes) {
    const wrapped = ((minutes % 1440) + 1440) % 1440
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

// How long a shift runs, in minutes.
//
// An end that is at or before the start is treated as the next day, so a shift
// from 22:00 to 02:00 is four hours rather than minus twenty. It has never
// happened at either restaurant and it costs one line.
export function shiftMinutes(startsAt, endsAt) {
    const from = toMinutes(startsAt)
    const to = toMinutes(endsAt)
    if (from < 0 || to < 0) return 0
    return to > from ? to - from : to + 1440 - from
}

// What a shift is worth, in hours.
//
// The break is not subtracted. Breaks here are paid, which is what the
// spreadsheet this replaces actually does: a week of 13, 6.5, 13, 6.5 and 4.5
// comes to 43.50 on the sheet, and 40.50 if the breaks come off. The sheet is
// right and the version built on the web was wrong.
export function shiftHours(shift) {
    return shiftMinutes(shift?.starts_at, shift?.ends_at) / 60
}

// What break a shift of this length earns.
//
// Read top down, first rung that matches wins, so the list has to be longest
// first. Sorted here rather than trusted, because it is edited in a settings
// screen and a rung typed in the wrong order would otherwise silently give
// everybody fifteen minutes.
export function breakFor(hours, rules) {
    const ladder = (rules?.length ? rules : DEFAULT_BREAK_RULES)
        .slice()
        .sort((a, b) => b.hours - a.hours)

    for (const rung of ladder) {
        const matched = rung.operator === 'gt' ? hours > rung.hours : hours >= rung.hours
        if (matched) return rung.minutes
    }
    return 0
}

// The break a shift should have, unless somebody has typed one themselves.
export function breakForShift(shift, rules) {
    if (shift?.break_is_manual) return shift.break_minutes ?? 0
    return breakFor(shiftHours(shift), rules)
}

// How a break reads on the roster.
export function breakLabel(minutes) {
    return minutes > 0 ? `${minutes} minutes` : 'No break'
}

// The store's hours for a given weekday, or nothing if it has never been set.
export function hoursForDay(openingHours, date) {
    if (!openingHours || !date) return null
    const day = openingHours[String(new Date(date + 'T00:00:00').getDay())]
    if (!day?.open || !day?.close) return null
    return day
}

// Does this shift start before the doors open, or finish after they shut?
//
// Both are worth marking. An opening shift is somebody letting themselves in to
// a dark building, and a closing shift is the one that runs long, which is the
// whole reason the end time is not printed.
export function shiftEdges(shift, dayHours) {
    if (!dayHours) return { opening: false, closing: false }
    return {
        opening: toMinutes(shift.starts_at) < toMinutes(dayHours.open),
        closing: toMinutes(shift.ends_at) > toMinutes(dayHours.close),
    }
}

// What to print as the finishing time.
//
// A closing shift says "Closing" and never a number. Somebody reading 21:30 off
// a printed roster will leave at 21:30 with the floor unswept, and then argue
// about it, and they will be right to because it is what the roster said. The
// real time is still underneath for the hours and the cost.
export function endLabel(shift, dayHours) {
    return shiftEdges(shift, dayHours).closing ? 'Closing' : shortTime(shift.ends_at)
}

// Times are stored as 09:00:00 and read as 09:00.
export function shortTime(time) {
    return time ? String(time).slice(0, 5) : ''
}

// Do two shifts on the same day run into each other?
//
// Two shifts in a day is perfectly normal, a split shift is normal, so the
// database does not stop it. What is not normal is the same person in two places
// at once, which is a typo rather than a plan, and it is worth saying so before
// it goes out to the staff.
export function shiftsOverlap(a, b) {
    if (!a || !b || a.shift_date !== b.shift_date) return false
    const aFrom = toMinutes(a.starts_at)
    const bFrom = toMinutes(b.starts_at)
    return aFrom < bFrom + shiftMinutes(b.starts_at, b.ends_at)
        && bFrom < aFrom + shiftMinutes(a.starts_at, a.ends_at)
}

// Every clash in a week, so the screen can name them rather than just refusing.
export function findOverlaps(shifts) {
    const clashes = []
    const list = shifts || []
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            if (list[i].employee_id === list[j].employee_id && shiftsOverlap(list[i], list[j])) {
                clashes.push([list[i], list[j]])
            }
        }
    }
    return clashes
}

// What a set of shifts comes to, in hours and in money.
//
// The rate is looked up per person rather than assumed, because a kitchen porter
// and a manager do not cost the same and a single average would make this figure
// worth nothing. Somebody with no rate set counts their hours and adds no cost,
// rather than being left out of the hours as well.
export function totals(shifts, employeesById) {
    let hours = 0
    let cost = 0
    for (const shift of shifts || []) {
        const h = shiftHours(shift)
        hours += h
        const rate = Number(employeesById?.[shift.employee_id]?.hourly_rate)
        if (!isNaN(rate)) cost += h * rate
    }
    return { hours, cost }
}

// Is every shift in this week published?
//
// Three answers, not two. A week where some are published and some are not is
// the one that matters: it means somebody changed the roster after sending it
// out and the staff are looking at something older than what is on screen.
export function publishState(shifts) {
    const list = shifts || []
    if (list.length === 0) return 'empty'
    const published = list.filter(s => s.published_at).length
    if (published === 0) return 'draft'
    if (published === list.length) return 'published'
    return 'changed'
}

// How the hours read on screen, always to two decimals.
//
// 44.50 and not 44.5, and 8.00 and not 8. These are the numbers that go to the
// accountant and onto a printed roster, and a column where some rows have two
// decimals and some have none is harder to read down and looks unfinished.
export function fmtHours(hours) {
    return (Number(hours) || 0).toFixed(2)
}

// How many people are on at a given minute of the day.
//
// Used for the little chart across the top of the roster, which is the thing
// that actually answers "have I got enough people on at seven": a column of
// hours tells you who is in, and this tells you how many.
export function staffAt(shifts, minute) {
    let count = 0
    for (const shift of shifts || []) {
        const from = toMinutes(shift.starts_at)
        if (minute >= from && minute < from + shiftMinutes(shift.starts_at, shift.ends_at)) count++
    }
    return count
}

// The same across a whole day, one entry per slot.
export function staffPerSlot(shifts, from, to, slot) {
    const out = []
    for (let m = from; m < to; m += slot) out.push(staffAt(shifts, m))
    return out
}

// The key the bank holiday hours are stored under, alongside the seven days.
//
// Every bank holiday at these restaurants opens the same, so it is one setting
// rather than a date somebody has to remember to fill in every August. A day
// only has to be ticked as a bank holiday and it picks these up.
export const BANK_HOLIDAY = 'bh'

// The hours a particular day actually runs.
//
// Three things can decide it, and they are tried in this order:
//
//   1. hours typed for this one day, which win outright
//   2. the bank holiday hours, if the day is ticked as one
//   3. the usual hours for that weekday
//
// The one off wins outright rather than merging, so a day opening late for a
// concert carries its own times and nothing borrowed from the usual. And the
// one off beats the bank holiday too, because a bank holiday with something
// unusual on it is still something unusual.
export function hoursForDate(openingHours, dayNote, date) {
    if (dayNote?.is_closed) return null

    if (dayNote?.opens_at && dayNote?.closes_at) {
        return { open: shortTime(dayNote.opens_at), close: shortTime(dayNote.closes_at) }
    }

    if (dayNote?.is_bank_holiday) {
        const bh = openingHours?.[BANK_HOLIDAY]
        if (bh?.open && bh?.close) return { open: bh.open, close: bh.close }
        // Ticked as a bank holiday with no bank holiday hours set. The usual
        // day is a better guess than nothing, and the settings screen says so.
    }

    return hoursForDay(openingHours, date)
}

// The stretch of the day the timeline draws.
//
// The store's hours with a few hours either side, three by default, which is
// enough to see a delivery at six in the morning and a clean down at midnight
// without the grid being mostly empty. How much is a setting, because a
// restaurant with a bakery starting at four wants more than one that does not.
//
// Then widened again for anything already rostered outside that, because a
// shift you cannot see is worse than a wide grid. Rounded out to whole hours so
// the axis reads in round numbers.
export function timelineRange(dayHours, shifts, padding) {
    const before = (padding?.before ?? 3) * 60
    const after = (padding?.after ?? 3) * 60

    let from = dayHours ? toMinutes(dayHours.open) - before : 7 * 60
    let to = dayHours ? toMinutes(dayHours.close) + after : 23 * 60

    for (const shift of shifts || []) {
        from = Math.min(from, toMinutes(shift.starts_at))
        to = Math.max(to, toMinutes(shift.starts_at) + shiftMinutes(shift.starts_at, shift.ends_at))
    }

    from = Math.max(0, Math.floor(from / 60) * 60)
    to = Math.min(1440, Math.ceil(to / 60) * 60)
    if (to <= from) to = Math.min(1440, from + 60)
    return { from, to }
}

// How often to print an hour along the top of the timeline.
//
// The grid draws a tick every hour whatever happens. The label is a different
// question: a day from six in the morning to midnight is eighteen of them, and
// eighteen do not fit, so they ran into each other and read as 06:0007:0008:00.
//
// This is the narrow answer only. The grid has a smallest width and scrolls
// sideways inside it, so on a phone it is always at that smallest width and the
// hours are always tight. On a wide screen it is far wider than its minimum and
// every hour fits easily, so the ones this drops are drawn there anyway.
export function hourLabelStep(from, to) {
    const hours = Math.max(1, Math.round((to - from) / 60))
    if (hours <= 12) return 1
    if (hours <= 24) return 2
    return 3
}

// The week as a grid: one row per person, one cell per day.
//
// Shaped here rather than in the markup because the same shape feeds four
// different things. The screen draws it, and so do the image, the PDF and the
// spreadsheet, and four of them working it out separately is four chances for
// the printed copy to disagree with the screen.
export function weekRows(employees, shifts, dates) {
    return (employees || []).map(employee => {
        const days = (dates || []).map(date => {
            const mine = (shifts || []).filter(
                s => s.employee_id === employee.id && s.shift_date === date,
            ).sort((a, b) => toMinutes(a.starts_at) - toMinutes(b.starts_at))
            return {
                date,
                shifts: mine,
                hours: mine.reduce((t, s) => t + shiftHours(s), 0),
            }
        })
        return {
            employee,
            days,
            hours: days.reduce((t, d) => t + d.hours, 0),
        }
    })
}

// What each day of the week comes to, for the row along the bottom.
export function dayTotals(shifts, dates, employeesById) {
    return (dates || []).map(date => ({
        date,
        ...totals((shifts || []).filter(s => s.shift_date === date), employeesById),
    }))
}

// A position's colour mixed with white, as a solid colour.
//
// The shift blocks used to be the position colour at fifteen percent, which
// meant the grid lines, the shading and the hour marks all showed straight
// through them and the times sat on top of a striped background. An opaque
// colour is the fix, and mixing rather than picking one keeps every position
// looking like itself.
export function tint(hex, weight = 0.16) {
    const h = String(hex || '').replace('#', '')
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#ffffff'

    const pad = n => n.toString(16).padStart(2, '0')
    const mix = i => {
        const channel = parseInt(h.slice(i, i + 2), 16)
        return Math.round(channel * weight + 255 * (1 - weight))
    }
    return '#' + pad(mix(0)) + pad(mix(2)) + pad(mix(4))
}
