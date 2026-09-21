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

import { weekDates, todayISO } from '@/lib/dates'
import { spanHours, toSeconds } from '@/lib/clock'
import {
    wholeDayOn, absenceDays, holidayHoursInWeek, kindOf as absenceKind,
} from '@/lib/absences'
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

// Where a row's times came from. The two that came off the clock are defended
// differently from the two that did not: they are never quietly replaced by a
// second import, changing one asks for a comment, and rubbing both times out
// leaves it empty and waiting to be explained rather than deleting it.
export function cameFromTill(entry) {
    return entry?.source === 'import' || entry?.source === 'corrected'
}

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
export function dayCell({
    person, date, entries = [], absences = [], shifts = [], imported = false, asking = true,
}) {
    const mine = entries.filter(e => e.work_date === date)
    // **A whole day, not any time off at all.** Somebody who can work until
    // three is in that morning, and the comment on isPartDay says exactly what
    // happens if a screen forgets: a dentist at half three empties a Tuesday.
    // This used to ask absenceOn, which answers with either, and a part day
    // came out as a day gone with no boxes to type into.
    // A part day never appears here. Somebody who can work until three has a
    // day the timesheet still has to be typed into, and he does not want the
    // restriction repeated on this screen: the roster already says it.
    const absence = wholeDayOn(absences, person.id, date)
    const rostered = shifts.filter(s => s.shift_date === date)
    const holiday = bankHolidayOn(date)

    // An absence that carries hours is a holiday, and its hours are held apart
    // from worked hours the way his HOLIDAY HOURS column always has been.
    //
    // **The hours are for the whole absence, not for each of its days.** A
    // holiday from the 25th to the 27th carrying fifteen hours is five a day,
    // and putting fifteen on all three was worth catching: it tripled a
    // holiday and the total still looked like a number. The roster has always
    // split them evenly, and evenly is right for the reason written on
    // holidayHoursInWeek: what they would have been rostered is a guess, and
    // the even pieces always add back up to what is on the payslip.
    const share = absence && absenceKind(absence.kind).hours && absence.hours != null
        ? Number(absence.hours) / (absenceDays(absence) || 1)
        : 0
    const holidayHours = Number.isFinite(share) ? Math.round(share * 100) / 100 : 0

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
        // Down to work and never clocked in. Worth saying on the screen
        // whatever else is true, because it is the thing somebody reading the
        // day wants to know.
        nothingRegistered: asking && mine.length === 0 && rostered.length > 0 && !absence,
        // The same fact, asked as a question the week has to answer before a
        // report can be drafted. **The till's report answers it.**
        //
        // His, on the week of 6 September: Georgiana was rostered for the
        // Thursday, the file was read in and had nothing for her that day, and
        // the screen still wanted a comment. There is nothing to explain. The
        // file and the timesheet agree, and *the accountant is reading the same
        // Pixel Point report*, so a sentence from him saying she did not clock
        // in tells her something she can already see.
        //
        // Unanswered means nobody has said anything at all. Once the week's
        // file has been read in, somebody has: the clock did.
        //
        // A part day is not an answer either way. She could work until three,
        // so whether she did is still an open question.
        unanswered: asking && !imported && mine.length === 0 && rostered.length > 0 && !absence,
        // Hours on a week whose report has been read in that the report does
        // not have. **Both ways round, because they are the same difference.**
        //
        // A till time somebody moved: the file says one thing and the timesheet
        // says another. A shift typed by hand on an imported week: the file
        // says nothing at all and the timesheet says eight hours. The second
        // one is the bigger difference of the two and it was the one nothing
        // asked about, which is what he found on his own 15th of September.
        //
        // On a week nobody imported, a typed row is the only kind there is and
        // says nothing new by existing, so nothing is asked.
        unexplained: mine.some(e => (
            !String(e.note || '').trim()
            && (e.source === 'corrected' || (imported && e.source === 'typed'))
        )),
    }
}

// One row of the week grid.
//
// There is no Sunday money in here. It was designed in, built, tested and then
// taken out again on his word: the tenner for a Sunday is not something this
// app should be working out, the same call as the one that keeps payroll out
// of it altogether.
export function personWeek({
    person, weekStart, entries = [], absences = [], shifts = [],
    restaurantRate = 0, imported = false, today = todayISO(),
}) {
    const mine = entries.filter(e => e.employee_id === person.id)
    const theirs = shifts.filter(s => s.employee_id === person.id)

    // **A week that has not finished is not missing anything.**
    //
    // Nothing on this screen asks a question about a week that is still being
    // worked. On a Wednesday the roster is full of Thursday, Friday and
    // Saturday, and a banner saying seven people have shifts with nothing said
    // about them is a banner nobody reads by the time it means something.
    //
    // The same line the report draws: a week is written up after it has ended,
    // never while it is running.
    const asking = today > weekDates(weekStart)[6]

    const days = weekDates(weekStart).map(date => dayCell({
        person, date, entries: mine, absences, shifts: theirs, imported, asking,
    }))

    // Bank holiday hours are held apart because that is the whole of what the
    // accountant needs from us. She applies section 21 at her end; the Hub does
    // not work the entitlement out, by his decision, and it does not need to.
    const bankHoliday = days.reduce((t, d) => t + (d.bankHoliday ? d.hours : 0), 0)
    const worked = days.reduce((t, d) => t + d.hours, 0)
    // Asked of the roster's own function rather than added up from the cells,
    // so the two screens cannot disagree and the rounding happens once. It also
    // counts only the days inside this week, which is what makes a holiday
    // running into next Sunday come out right on both sides.
    const holiday = holidayHoursInWeek(absences, person.id, days.map(d => d.date))

    const rate = rateFor(person, restaurantRate)
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
        cost: round(worked * rate),
    }
}

// ---------------------------------------------------------------------------
// What the week comes to
// ---------------------------------------------------------------------------

export function weekTotals(rows) {
    const dates = rows[0]?.days.map(d => d.date) || []
    const round = n => Math.round(n * 100) / 100

    const perDay = dates.map((date, i) => {
        const hours = rows.reduce((t, row) => t + row.days[i].hours, 0)
        const cost = rows.reduce((t, row) => t + row.days[i].hours * row.rate, 0)
        return {
            date,
            hours: round(hours),
            cost: round(cost),
            bankHoliday: bankHolidayOn(date),
        }
    })

    return {
        perDay,
        hours: round(perDay.reduce((t, d) => t + d.hours, 0)),
        cost: round(perDay.reduce((t, d) => t + d.cost, 0)),
        holiday: round(rows.reduce((t, r) => t + r.holiday, 0)),
        bankHoliday: round(rows.reduce((t, r) => t + r.bankHoliday, 0)),
        normal: round(rows.reduce((t, r) => t + r.normal, 0)),
    }
}

// What the week cost as a share of what it took, a day at a time.
//
// The figure the old Labour page was read for, and the one thing it had that
// this screen did not: it is how you see that a Tuesday was overstaffed without
// knowing either figure by heart.
//
// Its rules are the old page's, on purpose, so a week read here and a week read
// in the history are the same number:
//
//   - a closed day has no percentage. A closed day can still have hours on it,
//     for a stock take or a repair, and that cost is real, but there is nothing
//     to measure it against.
//   - a day nobody has entered sales for has none either, rather than a
//     hundred per cent.
//   - the week is the week's cost over the week's sales, never the average of
//     seven percentages, which would weight a wet Monday the same as a Saturday.
//     The cost of a closed day still counts in that total: it was spent.
export function labourPercent(perDay = [], sales = {}) {
    const netOn = date => {
        const day = sales[date]
        if (!day || day.is_closed) return null
        const net = Number(day.net_sales || 0)
        return net > 0 ? net : null
    }

    const days = perDay.map(day => {
        const net = netOn(day.date)
        return {
            date: day.date,
            percent: net == null ? null : Math.round((day.cost / net) * 1000) / 10,
        }
    })

    const cost = perDay.reduce((total, day) => total + day.cost, 0)
    const net = perDay.reduce((total, day) => total + (netOn(day.date) || 0), 0)

    return {
        days,
        week: net > 0 ? Math.round((cost / net) * 1000) / 10 : null,
    }
}

// What the daily rollup gets, so the cost dashboard and the report keep working
// without knowing any of this exists.
//
// `labour_entries` stays. It is what three screens already read for the cost
// percentage, and replacing it would break all three for no gain. The figure
// in it just becomes true: each person at their own rate.
export function labourRollup(rows) {
    return weekTotals(rows).perDay.map(day => ({
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
//
// `covered` is the days the old Labour archive already accounts for. Those are
// answered by history: there is one total a day in labour_entries for every day
// up to September 2026 and no timesheet will ever be typed for them, so a block
// that demanded one would stop every report ever being written about the first
// eight months of the year. His point, and the right one.
// The second half of it, added the day he asked for the first: **a till time
// somebody changed by hand has to say why.** A week typed from nothing is what
// it looks like and needs no comment; a week that came off the clock and was
// then edited does not, and the edit is invisible to everybody except whoever
// made it.
export function unanswered(rows, covered) {
    const already = covered instanceof Set ? covered : new Set(covered || [])
    const out = []
    for (const row of rows) {
        const days = row.days
            .filter(d => d.unanswered && !already.has(d.date))
            .map(d => d.date)
        const changed = row.days.filter(d => d.unexplained).map(d => d.date)
        if (days.length || changed.length) out.push({ person: row.person, days, changed })
    }
    return out
}

export function weekAnswered(rows, covered) {
    return unanswered(rows, covered).length === 0
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

    // A row with no times on it. Either somebody wrote down why nothing was
    // worked, in which case the file and the sentence disagree and that is
    // worth stopping for, or it is a day marked as training or a trial before
    // the times were typed, and the clock is exactly what it was waiting for.
    if (!existing.starts_at) {
        return existing.note
            ? { action: 'ask', why: 'said' }
            : { action: 'replace', why: 'roster' }
    }

    if (existing.source === 'roster') return { action: 'replace', why: 'roster' }
    if (existing.source === 'import') return { action: 'replace', why: 'reimport' }

    const apart = Math.max(
        gap(existing.starts_at, incoming.starts_at),
        gap(existing.ends_at, incoming.ends_at),
    )

    // A time off this same report that somebody moved afterwards. Under an hour
    // it would fall into the quiet path below, which would put the file's
    // figure back and undo the correction without saying so: a correction is
    // usually twenty minutes, which is exactly the range that path covers.
    if (existing.source === 'corrected') {
        return apart === 0 ? { action: 'same', why: 'same' } : { action: 'ask', why: 'corrected' }
    }

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

// What an upload would do, worked out before anything is written.
//
// Nothing here touches the database. It takes what the file holds, what the
// Hub already knows a name means, and what is already on the week, and comes
// back with the whole plan: who it could not place, what it would fill in
// quietly, and the handful worth asking about.
//
// Doing it this way round is the point. The message afterwards is the only
// safety there is on an import that does not stop at every row, so it has to
// be able to say exactly what happened, and a plan that exists before the
// writing starts can.
export function planImport({ shifts = [], mappings = [], entries = [], absences = [] }) {
    const known = new Map((mappings || []).map(m => [m.name, m]))

    const unknown = []
    const ignored = []
    const steps = []

    // Grouped so a split shift lines up with a split shift. Within a day the
    // two lists are paired in clock order, which is the only pairing that does
    // not need the till and the Hub to agree about ids they have never shared.
    const byDay = new Map()

    for (const shift of shifts) {
        const mapping = known.get(shift.name)
        if (!mapping) {
            if (!unknown.includes(shift.name)) unknown.push(shift.name)
            continue
        }
        if (mapping.ignored || !mapping.employee_id) {
            ignored.push(shift)
            continue
        }
        const key = `${mapping.employee_id}|${shift.work_date}`
        if (!byDay.has(key)) byDay.set(key, { employee_id: mapping.employee_id, date: shift.work_date, coming: [] })
        byDay.get(key).coming.push(shift)
    }

    for (const day of byDay.values()) {
        const here = entries
            .filter(e => e.employee_id === day.employee_id && e.work_date === day.date)
            .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
        const coming = day.coming
            .slice()
            .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))

        const absence = wholeDayOn(absences, day.employee_id, day.date)

        coming.forEach((shift, i) => {
            const existing = here[i] || null
            const verdict = importVerdict({ existing, incoming: shift, absence })
            steps.push({ ...verdict, employee_id: day.employee_id, date: day.date, existing, incoming: shift })
        })
    }

    return {
        unknown,
        ignored,
        steps,
        ...summarise(steps),
    }
}
