// What a week of hours actually comes to.
//
// This is the half the app never had. The roster says what was meant to happen;
// `labour_entries` said one total a day at one rate for everybody. Neither of
// them could tell you that Thursday ran forty minutes long on every shift, and
// there is a comment in absences.js, written long before any of this was asked
// for, that says as much: *a rostered week and a paid week are different
// numbers and will stay different until the till can say what somebody actually
// worked*. This is the till saying.
//
// **Holiday and sick are not stored here.** They are already a record, in
// `absences`, with an approval behind them and a colour the roster draws. The
// timesheet reads them. Storing them a second time is how the same fact ends up
// disagreeing with itself in two screens, and the roster would keep the old
// answer.
//
// So a week is three sources laid over each other: what the roster planned,
// what the absences say, and what the clock recorded.

import { weekDates } from '@/lib/dates'
import { spanHours, toSeconds } from '@/lib/clock'
import { absenceOn, kindOf as absenceKind } from '@/lib/absences'
import { bankHolidayOn } from '@/lib/bankHolidays'

// What a timesheet entry can be. Holiday and off sick are deliberately absent:
// see above.
//
// `times` is whether it holds a clock in and out. `paid` is whether the hours
// count towards what the week cost. Training and a trial are both, which is the
// thing the first version of this got wrong: a training day is worked time, and
// reporting it as nought hours would have been a quiet way to underpay.
export const KINDS = [
    { value: 'worked', label: 'Worked', times: true, paid: true, colour: null },
    { value: 'training', label: 'Training', times: true, paid: true, colour: '#6E6A60' },
    { value: 'trial', label: 'Trial', times: true, paid: true, colour: '#A65A8E' },
]

// The keys that set a state from the keyboard, and the buttons on the touch
// bar. Holiday and sick are here because they can be *set* from the grid even
// though they are stored as absences: somebody filling in Friday afternoon is
// recording that she was off sick, not requesting leave.
export const STATE_KEYS = [
    { key: 'h', value: 'holiday', label: 'Holiday', absence: true },
    { key: 's', value: 'sick', label: 'Off sick', absence: true },
    { key: 't', value: 'training', label: 'Training', absence: false },
    { key: 'r', value: 'trial', label: 'Trial', absence: false },
]

// A bank holiday is not a state somebody types. It is a fact about the date,
// so it is never in KINDS and never in STATE_KEYS.
export const BANK_HOLIDAY_COLOUR = '#B08A2E'

export function kindOf(value) {
    return KINDS.find(k => k.value === value) || KINDS[0]
}

export function kindLabel(value) {
    return kindOf(value).label
}

// The colour for a cell. An absence brings its own from the roster's list, so
// a holiday is the same blue in both screens and nobody has to learn it twice.
export function cellColour({ kind, absence }) {
    if (absence) return absenceKind(absence.kind).colour
    return kindOf(kind).colour
}

// ---------------------------------------------------------------------------
// What one person's week comes to
// ---------------------------------------------------------------------------

// Their own rate if they have one, the restaurant's if they do not. A rate of
// nought is a rate somebody set, so only null and undefined fall through.
export function rateFor(person, restaurantRate) {
    const own = Number(person?.hourly_rate)
    if (person?.hourly_rate !== null && person?.hourly_rate !== undefined && Number.isFinite(own)) {
        return own
    }
    const fallback = Number(restaurantRate)
    return Number.isFinite(fallback) ? fallback : 0
}

function hoursOf(entry) {
    if (!entry) return 0
    if (!kindOf(entry.kind).paid) return 0
    return spanHours(entry.starts_at, entry.ends_at)
}

// One day for one person: everything a cell needs to draw itself, worked out
// once so no component has to.
export function dayCell({ person, date, entries = [], absences = [], shifts = [] }) {
    const mine = entries.filter(e => e.work_date === date)
    const absence = absenceOn(absences, person.id, date)
    const rostered = shifts.filter(s => s.shift_date === date)
    const holiday = bankHolidayOn(date)

    // An absence that carries hours is a holiday, and its hours are held apart
    // from worked hours the way his HOLIDAY HOURS column always has been.
    const holidayHours = absence && absenceKind(absence.kind).hours
        ? Number(absence.hours) || 0
        : 0

    const hours = mine.reduce((total, entry) => total + hoursOf(entry), 0)

    return {
        date,
        entries: mine,
        absence,
        rostered,
        bankHoliday: holiday,
        hours: Math.round(hours * 100) / 100,
        holidayHours,
        // Somebody worked a day nobody planned. Worth saying on the cell: it is
        // the only way unplanned hours ever become visible.
        unplanned: mine.length > 0 && rostered.length === 0,
        // Rostered and nothing said about it. This is what the report block
        // counts, and it is the thing that catches a shift nobody filled in.
        unanswered: mine.length === 0 && rostered.length > 0 && !absence,
    }
}

// Ten euro to each person who works a Sunday. Per person per Sunday, never per
// shift: somebody doing a split Sunday gets the tenner once.
//
// It is cost and it is never hours, so it never touches an hours total and it
// never touches the rate.
export function sundayPremiumFor(days, premium) {
    const rate = Number(premium)
    if (!Number.isFinite(rate) || rate <= 0) return 0
    const sundays = days.filter(day => day.hours > 0 && new Date(`${day.date}T00:00:00`).getDay() === 0)
    return Math.round(sundays.length * rate * 100) / 100
}

// One row of the week grid.
export function personWeek({
    person, weekStart, entries = [], absences = [], shifts = [],
    restaurantRate = 0, sundayPremium = 0,
}) {
    const mine = entries.filter(e => e.employee_id === person.id)
    const theirs = shifts.filter(s => s.employee_id === person.id)

    const days = weekDates(weekStart).map(date => dayCell({
        person, date, entries: mine, absences, shifts: theirs,
    }))

    // Bank holiday hours are held apart because that is the whole of what the
    // accountant needs from us. She applies section 21 at her end; the Hub does
    // not work the entitlement out, by his decision, and it does not need to.
    const bankHoliday = days.reduce((t, d) => t + (d.bankHoliday ? d.hours : 0), 0)
    const worked = days.reduce((t, d) => t + d.hours, 0)
    const holiday = days.reduce((t, d) => t + d.holidayHours, 0)

    const rate = rateFor(person, restaurantRate)
    const premium = sundayPremiumFor(days, sundayPremium)
    const round = n => Math.round(n * 100) / 100

    return {
        person,
        days,
        rate,
        ownRate: person?.hourly_rate !== null && person?.hourly_rate !== undefined,
        // His format: normal is everything that is not a bank holiday, and the
        // bank holiday hours sit beside it rather than inside it.
        normal: round(worked - bankHoliday),
        bankHoliday: round(bankHoliday),
        holiday: round(holiday),
        worked: round(worked),
        total: round(worked + holiday),
        premium,
        cost: round(worked * rate + premium),
    }
}

// ---------------------------------------------------------------------------
// What the week comes to
// ---------------------------------------------------------------------------

export function weekTotals(rows, sundayPremium = 0) {
    const dates = rows[0]?.days.map(d => d.date) || []
    const round = n => Math.round(n * 100) / 100

    const perDay = dates.map((date, i) => {
        const hours = rows.reduce((t, row) => t + row.days[i].hours, 0)
        const cost = rows.reduce((t, row) => t + row.days[i].hours * row.rate, 0)
        const heads = rows.filter(row => row.days[i].hours > 0).length
        const sunday = new Date(`${date}T00:00:00`).getDay() === 0
            ? round(heads * (Number(sundayPremium) || 0))
            : 0
        return {
            date,
            hours: round(hours),
            cost: round(cost + sunday),
            premium: sunday,
            bankHoliday: bankHolidayOn(date),
        }
    })

    return {
        perDay,
        hours: round(perDay.reduce((t, d) => t + d.hours, 0)),
        cost: round(perDay.reduce((t, d) => t + d.cost, 0)),
        premium: round(perDay.reduce((t, d) => t + d.premium, 0)),
        holiday: round(rows.reduce((t, r) => t + r.holiday, 0)),
        bankHoliday: round(rows.reduce((t, r) => t + r.bankHoliday, 0)),
        normal: round(rows.reduce((t, r) => t + r.normal, 0)),
    }
}

// What the daily rollup gets, so the cost dashboard and the report keep working
// without knowing any of this exists.
//
// `labour_entries` stays. It is what three screens already read for the cost
// percentage, and replacing it would break all three for no gain. The figure
// in it just becomes true: each person's own rate, plus the Sunday tenner.
export function labourRollup(rows, sundayPremium = 0) {
    return weekTotals(rows, sundayPremium).perDay.map(day => ({
        entry_date: day.date,
        total_hours: day.hours,
        labour_cost: day.cost,
        staff_count: rows.filter(row => row.days.find(d => d.date === day.date)?.hours > 0).length,
    }))
}

// ---------------------------------------------------------------------------
// Whether the week can go anywhere yet
// ---------------------------------------------------------------------------

// A report cannot be drafted until the week is answered. The useful reading of
// that is not "every cell filled", because a blank day legitimately means that
// person did not work. It is **every rostered shift has been answered**: either
// there are times, or something says why not.
//
// It names people rather than refusing quietly, because a block that does not
// say what it wants is a block somebody works around.
export function unanswered(rows) {
    const out = []
    for (const row of rows) {
        const days = row.days.filter(d => d.unanswered).map(d => d.date)
        if (days.length) out.push({ person: row.person, days })
    }
    return out
}

export function weekAnswered(rows) {
    return unanswered(rows).length === 0
}

// ---------------------------------------------------------------------------
// Bringing a file in
// ---------------------------------------------------------------------------

// An hour. Below it, the file just wins and the change is counted rather than
// asked about: the same shift, recorded more exactly. At or above it, that is
// not a clock drifting, it is a different shift.
export const ASK_ABOVE_SECONDS = 3600

// What happens to one incoming shift.
//
// Where the figure came from decides it before any threshold does. A time
// somebody accepted off the roster is a placeholder waiting for exactly this
// file, and asking whether to replace it is asking them to approve the thing
// they imported the file to get. Only something a person typed is defended.
export function importVerdict({ existing, incoming, absence }) {
    // A shift landing on a day marked as time off is the one worth stopping
    // for. Either the holiday is wrong or somebody worked one, and both of
    // those are things to know.
    if (absence) return { action: 'ask', why: 'absence' }

    if (!existing) return { action: 'fill', why: 'empty' }

    if (existing.source === 'roster') return { action: 'replace', why: 'roster' }
    if (existing.source === 'import') return { action: 'replace', why: 'reimport' }

    const apart = Math.max(
        gap(existing.starts_at, incoming.starts_at),
        gap(existing.ends_at, incoming.ends_at),
    )
    if (apart >= ASK_ABOVE_SECONDS) return { action: 'ask', why: 'far', apart }
    if (apart === 0) return { action: 'same', why: 'same' }
    return { action: 'replace', why: 'near', apart }
}

// How far apart two clock times are, in seconds.
//
// Measured in seconds and not in hours. spanHours rounds to two places, which
// is thirty six second granularity, and a rule that asks "are these an hour
// apart" cannot be built on a figure that has already been rounded.
function gap(a, b) {
    const one = toSeconds(a)
    const two = toSeconds(b)
    if (one < 0 || two < 0) return Infinity
    return Math.abs(one - two)
}

// Everything the upload did, in the shape the message afterwards reads from.
// Counted rather than listed, except the ones that need a person.
export function summarise(verdicts) {
    const count = why => verdicts.filter(v => v.why === why).length
    return {
        filled: count('empty'),
        rosterReplaced: count('roster') + count('reimport'),
        nudged: count('near'),
        unchanged: count('same'),
        asks: verdicts.filter(v => v.action === 'ask'),
    }
}
