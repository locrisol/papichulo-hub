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

import { weekDates, todayISO, addDays, dayLabel } from '@/lib/dates'
import { num, round2 } from '@/lib/format'
import { spanHours, toSeconds } from '@/lib/clock'
import { toMinutes, shiftMinutes, fmtHours } from '@/lib/roster'
import {
    wholeDayOn, absenceDays, holidayHoursInWeek, isPartDay, kindOf as absenceKind,
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

// A saved row with both times rubbed out. A till shift emptied that way stays
// in the table, so a second import cannot put it back and the comment saying
// why has somewhere to live, but on a day that still has a shift it is not a
// pair of empty boxes (his, on Alfredo's Monday 26 October 2026: clocked out
// by mistake, back in, the two shifts made one and the second left empty).
//
// Null and not just empty: a box being typed holds '' until it is left, and
// a pair that vanished under the cursor would never be saved.
export function takenOut(entry) {
    return Boolean(entry?.id) && entry.starts_at == null && entry.ends_at == null
}

// The pairs of boxes a day draws. A row with no times only when it is all the
// day has, so typing into it fills that row rather than starting another, and
// an empty day still gets one pair to type into.
export function spansToDraw(entries) {
    const drawn = entries.filter(e => !takenOut(e))
    if (drawn.length) return drawn
    return entries.length ? [entries[0]] : [{ id: null, starts_at: '', ends_at: '' }]
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

// ---------------------------------------------------------------------------
// Somebody from another restaurant
// ---------------------------------------------------------------------------

// Somebody on another restaurant's team who worked a shift here (his, 9
// November 2026: a second Camila came over for a week, and the till had her
// under her own name). **A typed name on her rows and nothing more**, as
// decided on 20 September 2026: the other restaurant may not be in the Hub at
// all, and its team is not this one's to read. On screen she is a person like
// anybody else, with an id made from her name so her rows find her, and
// `guest` so the few things that belong to our own team leave her out:
// holiday and sick days, the roster, permission to work.
//
// The function's copy of the timesheet has the same words and colours, and a
// test holds the two together.
export const GUEST_LABEL = 'From another restaurant'
export const GUEST_LOOK = { label: GUEST_LABEL, ink: '#2F7359', wash: '#E6F2ED' }

// Spaces tidied, so "Camila  Valenzuela " and "Camila Valenzuela" are one
// person rather than two lines on the PDF.
export function guestName(text) {
    return String(text ?? '').trim().replace(/\s+/g, ' ')
}

export function guestPerson(name) {
    const full = guestName(name)
    return { id: `guest:${full}`, full_name: full, guest: true, hourly_rate: null }
}

// Whether a row is this person's: by employee for our own, by name for
// somebody from another restaurant.
export function belongsTo(entry, person) {
    if (person?.guest) return !entry?.employee_id && guestName(entry?.person_name) === person.full_name
    return entry?.employee_id === person?.id
}

// What a new row for this person carries.
export function whose(person) {
    return person?.guest
        ? { employee_id: null, person_name: person.full_name }
        : { employee_id: person.id }
}

// Everybody from another restaurant with a row here, once each and in name
// order. Plain code point order rather than localeCompare, so the browser and
// the mail function put them the same way round.
export function guestsIn(entries = []) {
    const names = new Set()
    for (const entry of entries || []) {
        if (entry.employee_id) continue
        const name = guestName(entry.person_name)
        if (name) names.add(name)
    }
    return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(guestPerson)
}

// The team as given, then everybody from another restaurant: those with rows,
// and any added by hand that have none yet. Our own people first.
export function withGuests(people = [], entries = [], extra = []) {
    const found = guestsIn(entries)
    const more = (extra || [])
        .map(guestPerson)
        .filter((g, i, all) => g.full_name && !found.some(f => f.id === g.id) && all.findIndex(o => o.id === g.id) === i)
    return [...(people || []), ...found, ...more]
}

// Who a stretch of days is about: everybody on the team employed at some point
// in it, and everybody from another restaurant with a row in it. The week, the
// send, the mail, the PDF and the Reports list all ask this, so a person
// cannot be on one and missing from another.
export function peopleFor(team = [], entries = [], from, to) {
    const ours = (team || []).filter(p => (
        (!p.ended_on || p.ended_on >= from) && (!p.started_on || p.started_on <= to)
    ))
    return withGuests(ours, (entries || []).filter(e => e.work_date >= from && e.work_date <= to))
}

// What a day can be marked as. Holiday and sick are absences, kept by her own
// restaurant, and a trial is somebody being tried for a job here, who goes in
// Team. Training is hours worked here, so it stays.
export function statesFor(person) {
    return person?.guest ? STATE_KEYS.filter(s => s.value === 'training') : STATE_KEYS
}

// A name to start from, made from what the till calls her. The till puts the
// surnames first in capitals, "VALENZUELA ALVAREZ Camila", and the Hub calls
// people by their first name, so this is the first name and the first surname:
// "Camila Valenzuela", enough to tell her from our Camila. A name not in that
// shape is left as it is.
export function guestFromTill(name) {
    const words = guestName(name).split(' ').filter(Boolean)
    const capitals = w => w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase()
    let i = 0
    while (i < words.length && capitals(words[i])) i++
    if (i === 0 || i === words.length) return guestName(name)
    const surname = words[0].toLowerCase().replace(/(^|['-])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase())
    return `${words.slice(i).join(' ')} ${surname}`
}

// Why a name cannot be used, or '' when it can. **Never the name of somebody
// on the team**, whatever the capitals, or her hours and theirs are one line
// on the PDF. `team` is the whole team, not just this week's: the PDF covers
// a fortnight. `guests` are the other names from other restaurants it could
// be mistaken for, and `self` is the name being changed, which may stay.
export function guestNameProblem(name, { team = [], guests = [], self = '' } = {}) {
    const full = guestName(name)
    if (!full) return 'Type a name.'
    const same = other => guestName(other).toLowerCase() === full.toLowerCase()
    if ((team || []).some(p => same(p.full_name))) {
        return `${full} is already on the team. Add something to tell them apart, like a surname.`
    }
    if ((guests || []).some(g => same(g)) && !same(self)) {
        return 'Somebody else from another restaurant is already called that.'
    }
    return ''
}

// With the day it was worked, so the two nights the clocks change come to the
// hours really worked, the same as the database's own figure.
function hoursOf(entry) {
    if (!entry) return 0
    if (!kindOf(entry.kind).paid) return 0
    return spanHours(entry.starts_at, entry.ends_at, entry.work_date)
}

// One day for one person: everything a cell needs to draw itself, worked out
// once so no component has to.
const byStart = (a, b) => String(a.starts_at).localeCompare(String(b.starts_at))

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
    // In the order they start. A shift is paired with its plan by position
    // (planDrift, the grey times behind the boxes), and the database hands
    // rows back in no promised order: a split shift came out with the morning
    // compared against the evening, "in -513 min" (21 October 2026).
    const rostered = shifts.filter(s => s.shift_date === date).sort(byStart)
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
        //
        // **A trial is never rostered, so it is never "not rostered".**
        // Somebody comes in to try the job before there is anything to put
        // them on a roster for, and the day already carries a label saying
        // exactly that. It is the same rule the team list and the roster
        // rules have always followed for somebody on trial: do not warn about
        // the one thing a trial is not expected to have. A worked span on the
        // same day still counts, because that one was meant to be planned.
        //
        // Nor is somebody from another restaurant: she cannot be on this
        // restaurant's roster at all.
        unplanned: !person.guest && rostered.length === 0 && mine.some(e => e.kind !== 'trial'),
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
        // A clock in with no clock out. It comes to nought hours and the pay
        // mail only carries a shift with both ends, so left alone the day
        // reached the accountant as a day nobody worked. Its own question
        // rather than part of `unanswered`: it matters on a day nobody
        // rostered and on a week the till's report covers, and a comment does
        // not answer it, because the clock in still never reaches her.
        //
        // Saved rows only. A draft is a box still being typed into.
        open: asking && mine.some(e => e.id && e.starts_at && !e.ends_at),
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
    const mine = entries.filter(e => belongsTo(e, person))
    const theirs = person.guest ? [] : shifts.filter(s => s.employee_id === person.id)

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

    return {
        person,
        days,
        rate,
        ownRate: person?.hourly_rate !== null && person?.hourly_rate !== undefined,
        // His format: normal is everything that is not a bank holiday, and the
        // bank holiday hours sit beside it rather than inside it.
        normal: round2(worked - bankHoliday),
        bankHoliday: round2(bankHoliday),
        holiday: round2(holiday),
        worked: round2(worked),
        total: round2(worked + holiday),
        cost: round2(worked * rate),
    }
}

// ---------------------------------------------------------------------------
// What the week comes to
// ---------------------------------------------------------------------------

export function weekTotals(rows) {
    const dates = rows[0]?.days.map(d => d.date) || []

    const perDay = dates.map((date, i) => {
        const hours = rows.reduce((t, row) => t + row.days[i].hours, 0)
        const cost = rows.reduce((t, row) => t + row.days[i].hours * row.rate, 0)
        return {
            date,
            hours: round2(hours),
            cost: round2(cost),
            bankHoliday: bankHolidayOn(date),
        }
    })

    return {
        perDay,
        hours: round2(perDay.reduce((t, d) => t + d.hours, 0)),
        cost: round2(perDay.reduce((t, d) => t + d.cost, 0)),
        holiday: round2(rows.reduce((t, r) => t + r.holiday, 0)),
        bankHoliday: round2(rows.reduce((t, r) => t + r.bankHoliday, 0)),
        normal: round2(rows.reduce((t, r) => t + r.normal, 0)),
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
        // A clock in with no clock out. Not let off by the archive either: a
        // half typed row is something somebody did on the timesheet itself.
        const open = row.days.filter(d => d.open).map(d => d.date)
        if (days.length || changed.length || open.length) {
            out.push({ person: row.person, days, changed, open })
        }
    }
    return out
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
//
// A till name answered as **somebody from another restaurant** comes in as
// `{ name, guest }`, the name she is to have here, and is never remembered
// for good: she came for that week (his, 9 November 2026). What the till
// called her is kept on her rows instead, so the same report read in again
// finds her there and does not ask twice, even after her name was changed.
export function planImport({ shifts = [], mappings = [], entries = [], absences = [] }) {
    const known = new Map((mappings || []).map(m => [m.name, m]))
    // Her rows on this week answer for her till name, over anything
    // remembered: this week's answer is the newer one.
    for (const entry of entries || []) {
        if (entry.employee_id || !entry.till_name || !guestName(entry.person_name)) continue
        known.set(entry.till_name, { name: entry.till_name, guest: guestName(entry.person_name), already: true })
    }

    const unknown = []
    const ignored = []
    const steps = []
    const guests = new Map()

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
        const guest = guestName(mapping.guest)
        if (!guest && (mapping.ignored || !mapping.employee_id)) {
            ignored.push(shift)
            continue
        }
        const who = guest ? guestPerson(guest) : { id: mapping.employee_id }
        if (guest) {
            const one = guests.get(guest) || { name: guest, till: shift.name, shifts: 0, already: Boolean(mapping.already) }
            one.shifts += 1
            guests.set(guest, one)
        }
        const key = `${who.id}|${shift.work_date}`
        if (!byDay.has(key)) byDay.set(key, { who, till: shift.name, date: shift.work_date, coming: [] })
        byDay.get(key).coming.push(shift)
    }

    for (const day of byDay.values()) {
        // Hers by name and ours by employee, so two people from other
        // restaurants on one day, or one of them and one of ours, are never
        // paired with each other's rows.
        const here = entries
            .filter(e => belongsTo(e, day.who) && e.work_date === day.date)
            .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
        const coming = day.coming
            .slice()
            .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))

        // Her days off are her own restaurant's to keep, so none are here.
        const absence = day.who.guest ? null : wholeDayOn(absences, day.who.id, day.date)

        coming.forEach((shift, i) => {
            const existing = here[i] || null
            const verdict = importVerdict({ existing, incoming: shift, absence })
            steps.push({
                ...verdict,
                employee_id: day.who.guest ? null : day.who.id,
                person_name: day.who.guest ? day.who.full_name : null,
                till_name: day.who.guest ? day.till : null,
                date: day.date,
                existing,
                incoming: shift,
            })
        })
    }

    return {
        unknown,
        ignored,
        steps,
        guests: [...guests.values()],
        ...summarise(steps),
    }
}

// The two grounds a person's row alternates between.
//
// Here rather than in either view, because the week grid and the day view show
// the same week two ways and a person banded in one and not the other is a
// person you lose your place on.
export const ROW_BANDS = ['#FDFCFA', '#FAF9F6']

// How far the clock ended up from the plan, and at which end.
//
// **Everywhere, not just how long it ran.** This used to compare the two
// lengths and nothing else, so a shift moved wholesale, in three hours late and
// out three hours late, came out as nought and drew as though it had gone
// exactly to plan. The start, the end and the length are three different ways
// of being out, so all three are measured and the largest is what the day view
// writes on the block and takes its colour from.
export function planDrift(plan, startedAt, ranFor) {
    if (!plan) return null

    const planStart = toMinutes(plan.starts_at)
    const planRan = shiftMinutes(plan.starts_at, plan.ends_at)
    return worstOf(startedAt - planStart, (startedAt + ranFor) - (planStart + planRan), ranFor - planRan)
}

// 'in' first, so a shift that simply moved names the end somebody would look
// at first rather than the one that happens to sort earlier.
function worstOf(lateIn, lateOut, longer) {
    return [
        { where: 'in', minutes: lateIn },
        { where: 'out', minutes: lateOut },
        { where: 'ran', minutes: longer },
    ].reduce((worst, one) => (Math.abs(one.minutes) > Math.abs(worst.minutes) ? one : worst))
}

// What each span the clock registered is set against, by the plans it
// overlaps rather than by position (21 October 2026). Position paired a split
// shift's morning with its evening whenever the rows came back in the other
// order, and one clock time worked straight through a split shift was set
// against the morning half alone: "ran +542 min".
//
// Spans and the plans they overlap are taken together. One clock time across
// both halves of a split shift is set against the whole of it: in against its
// first start, out against its last finish, and the length against the hours
// actually rostered, because the gap between the halves is not rostered work
// (his call). Two clock times inside one plan are set against it together,
// and the difference is written on the later one. A span that overlaps no
// plan takes the nearest plan nothing overlaps, and with none left it was not
// rostered.
//
// spans are { id, start, ran } in minutes, so a block being dragged is asked
// with where it is now. Answers by id: planned, the drift to write on that
// block (null on all but the last of a group), and the group's drift, which
// colours every block in it.
export function driftsFor(spans, rostered) {
    const plans = (rostered || []).map(r => ({ start: toMinutes(r.starts_at), ran: shiftMinutes(r.starts_at, r.ends_at) }))
    const items = (spans || []).filter(s => s && s.id != null)
    const overlaps = (a, b) => a.start < b.start + b.ran && b.start < a.start + a.ran

    // Which spans and plans hang together, through any chain of overlaps.
    const parent = new Map()
    const find = key => {
        while (parent.get(key) !== key) key = parent.get(key)
        return key
    }
    items.forEach((_, i) => parent.set(`s${i}`, `s${i}`))
    plans.forEach((_, j) => parent.set(`p${j}`, `p${j}`))
    items.forEach((span, i) => plans.forEach((plan, j) => {
        if (overlaps(span, plan)) parent.set(find(`s${i}`), find(`p${j}`))
    }))
    const groups = new Map()
    const add = (key, list, value) => {
        const root = find(key)
        if (!groups.has(root)) groups.set(root, { spans: [], plans: [] })
        groups.get(root)[list].push(value)
    }
    items.forEach((span, i) => add(`s${i}`, 'spans', span))
    plans.forEach((plan, j) => add(`p${j}`, 'plans', plan))

    const out = new Map()
    const unplanned = []
    const unused = []
    const total = list => list.reduce((sum, x) => sum + x.ran, 0)
    for (const { spans: these, plans: theirs } of groups.values()) {
        if (these.length && theirs.length) {
            const sorted = [...these].sort((a, b) => a.start - b.start)
            const group = worstOf(
                sorted[0].start - Math.min(...theirs.map(p => p.start)),
                Math.max(...sorted.map(x => x.start + x.ran)) - Math.max(...theirs.map(p => p.start + p.ran)),
                total(sorted) - total(theirs),
            )
            sorted.forEach((span, k) => out.set(span.id, {
                planned: true, drift: k === sorted.length - 1 ? group : null, group,
            }))
        } else if (these.length) unplanned.push(...these)
        else unused.push(...theirs)
    }

    for (const span of unplanned.sort((a, b) => a.start - b.start)) {
        if (!unused.length) {
            out.set(span.id, { planned: false, drift: null, group: null })
            continue
        }
        const nearest = unused.reduce((best, plan, j) => (
            Math.abs(plan.start - span.start) < Math.abs(unused[best].start - span.start) ? j : best
        ), 0)
        const [plan] = unused.splice(nearest, 1)
        const drift = worstOf(span.start - plan.start, (span.start + span.ran) - (plan.start + plan.ran), span.ran - plan.ran)
        out.set(span.id, { planned: true, drift, group: drift })
    }
    return out
}

// **An hour.** It was fifteen minutes, and before that five. Five made nearly
// every real shift orange, which is a screen where orange means nothing;
// fifteen still caught the ordinary few minutes either side of a plan that
// nobody would look twice at. An hour is the point where a difference is worth
// somebody's attention, and it is his figure.
export const NOTICEABLE_MINUTES = 60

// ---------------------------------------------------------------------------
// A pay period, for the paper that goes with the mail
// ---------------------------------------------------------------------------

// How a state is marked on the paper and in the mail.
//
// **Defined here and copied into the function**, which cannot import it because
// only what is inside a function's folder is deployed with it. The test runs
// the two against each other, so the mail and the PDF cannot end up calling the
// same day two different things or drawing it two different colours.
//
// An ink and a pale ground rather than the single colour the screens use. On
// screen these are chips at fourteen pixels with room around them; on paper and
// in a mail they are nine point capitals inside a table, and white on the app's
// own #B08A2E or #8c8c8c is under three to one.
export const AWAY_LOOK = {
    holiday: { label: 'Holiday', ink: '#2F5E8C', wash: '#E7EFF7' },
    day_off: { label: 'Day off', ink: '#4F6270', wash: '#EBEFF2' },
    sick: { label: 'Off sick', ink: '#8E4530', wash: '#F7EBE7' },
    event: { label: 'Away at something', ink: '#584A8C', wash: '#ECE9F5' },
    lent: { label: 'At the other restaurant', ink: '#2F7359', wash: '#E6F2ED' },
    unpaid: { label: 'Unpaid leave', ink: '#5E5E5E', wash: '#EFEFEF' },
}

export const KIND_LOOK = {
    trial: { label: 'Trial', ink: '#82406E', wash: '#F5EBF2' },
    training: { label: 'Training', ink: '#55524A', wash: '#EEEDEA' },
}

// The wash is the app's own BANK_HOLIDAY_WASH, already a pale ground meant to
// sit behind a cell.
export const BANK_LOOK = { label: 'Bank holiday', ink: '#8A6A18', wash: '#FBF4E2' }

// Where somebody stands on permission to work, in four colours: green may
// work, amber needs something doing (a renewal waiting or due), red may not,
// slate nobody knows. The hours mail has a copy.
export const PERMISSION_LOOK = {
    ok: { ink: '#1F7A4C', wash: '#E8F4EC' },
    waiting: { ink: '#8A5300', wash: '#FDF1DC' },
    soon: { ink: '#8A5300', wash: '#FDF1DC' },
    not: { ink: '#B91C1C', wash: '#FDECEC' },
    unknown: { ink: '#475569', wash: '#EDF1F5' },
}

// The two days that change what somebody is paid. A day off and a day away at
// something are worth drawing where they fall, but counting them in a summary
// meant to be keyed into a payroll would be noise.
export const COUNTED_DAYS = ['sick', 'unpaid']

// What a day's mark says. A part day says so, or a day with six hours worked
// on it reads as a day off sick. Copied into the function like the marks are.
export function awayWords(day) {
    const look = AWAY_LOOK[day?.away]
    if (!look) return ''
    return day.part ? `${look.label}, part of the day` : look.label
}

// The same fortnight the mail works out, worked out again here.
//
// **Deliberately a second implementation**, the same as the bank holidays are:
// a function only deploys what is inside its own folder, so the mail cannot
// import this and this cannot import the mail. What keeps them honest is a test
// that runs both over the same rows and demands the same answer, because a PDF
// that disagreed with the mail it was attached to would be worse than no PDF.
//
// `half` is where the second week starts, which is always seven.
export function personPeriod({
    people = [], entries = [], absences = [], dates = [], half = 7,
}) {
    const awayOn = (employeeId, date) => (absences || []).find(a => (
        a.employee_id === employeeId
        && (!a.status || a.status === 'approved')
        && String(a.starts_on) <= date && String(a.ends_on) >= date
    )) || null

    return people.map(person => {
        const mine = entries.filter(e => belongsTo(e, person))

        const days = dates.map((date, i) => {
            const spans = mine
                .filter(e => e.work_date === date && e.starts_at && e.ends_at)
                .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
            const said = mine
                .filter(e => e.work_date === date)
                .map(e => String(e.note || '').trim())
                .filter(Boolean)
            const away = awayOn(person.id, date)
            // A clock in nobody gave a clock out. The send is held while one
            // is on the period, but a test still goes, and a day must never
            // drop out as though nobody worked it.
            const open = mine
                .filter(e => e.work_date === date && e.starts_at && !e.ends_at)
                .map(e => e.starts_at)
                .sort()

            return {
                date,
                week: i < half ? 0 : 1,
                spans: spans.map(e => ({
                    starts_at: e.starts_at,
                    ends_at: e.ends_at,
                    hours: num(e.hours),
                    kind: e.kind,
                })),
                open,
                notes: said,
                hours: spans.reduce((t, e) => t + num(e.hours), 0),
                bankHoliday: Boolean(bankHolidayOn(date)),
                away: away ? away.kind : null,
                part: isPartDay(away),
            }
        }).filter(day => day.spans.length > 0 || day.open.length > 0 || day.notes.length > 0 || day.away)

        // Bank holiday hours are kept out of the weeks and the total, and
        // given on their own (his, 1 November 2026), so Week 1 plus Week 2 is
        // still Worked.
        const inWeek = (w, bank) => days.reduce((t, d) => (d.week === w && d.bankHoliday === bank ? t + d.hours : t), 0)
        const ofKind = kind => days.reduce((t, d) => (
            t + d.spans.reduce((n, s) => (s.kind === kind ? n + num(s.hours) : n), 0)
        ), 0)
        // Whole days and part days apart. Somebody who worked until three and
        // went home sick was paid for six hours and was sick for part of one
        // day, and counting that as a day sick tells payroll she lost the lot.
        const daysOf = (kind, part) => dates.filter(d => {
            const away = awayOn(person.id, d)
            return away && away.kind === kind && isPartDay(away) === part
        }).length

        const week = [inWeek(0, false), inWeek(1, false)]
        const weekBank = [inWeek(0, true), inWeek(1, true)]

        return {
            // Who it is, so a week kept when it was sent can be laid over the
            // same week now person by person (whatChanged). A name is no use
            // for that: names change, and two people can share one.
            id: person.id,
            name: person.full_name,
            // Somebody from another restaurant, marked as such on the paper.
            guest: Boolean(person.guest),
            days,
            week,
            weekBank,
            worked: week[0] + week[1],
            bankHoliday: weekBank[0] + weekBank[1],
            // Sundays with hours on them, a bank holiday Sunday included.
            sundays: days.filter(d => d.hours > 0 && new Date(`${d.date}T00:00:00Z`).getUTCDay() === 0).length,
            holiday: holidayHoursInWeek(absences, person.id, dates),
            trial: ofKind('trial'),
            training: ofKind('training'),
            sickDays: daysOf('sick', false),
            unpaidDays: daysOf('unpaid', false),
            sickParts: daysOf('sick', true),
            unpaidParts: daysOf('unpaid', true),
        }
    }).filter(person => person.days.length > 0 || person.holiday > 0)
}

// ---------------------------------------------------------------------------
// What each email of the hours said, and what has changed since
// ---------------------------------------------------------------------------
//
// **The hours go every week now** (his, 9 November 2026): week 1 on its own,
// for the owners' records and not for the payroll, then the whole pay period
// with the PDF once week 2 has finished. A week changed after it went is "a
// bigger issue", because the owners already have it for their reports, so it
// is shown in red the next time the hours go: on the Timesheet straight away,
// in the send dialog, in the email and above all in the PDF.
//
// The Hub keeps a copy of each week a real email carried (timesheet_sends,
// written by the function after it has sent) and lays the week as it is now
// over it. **Copied into the function** with personPeriod, and the tests run
// the two copies over the same rows.

// The red the report's "This replaces the report sent earlier" band uses, and
// PERMISSION_LOOK.not's: the one colour in these papers that means stop.
export const CHANGED_LOOK = { label: 'Changed after it was sent', ink: '#B91C1C', wash: '#FDECEC' }

// Which shape a kept copy is in. A later change to what personPeriod returns
// bumps it, and a copy in a shape this code does not know is never compared:
// it is said to have been sent, and nothing more.
export const SEND_SHAPE = 1

// One week as an email has it: personPeriod over its seven days, for the
// people of its pay period (peopleFor: the team employed at some point in the
// fortnight, and anybody from another restaurant with a row in it). The same
// people the pay period email lists, so week 1 now and week 1 in the pay
// period email are the same figures.
//
// **Only ever compare this with this.** In the fourteen day personPeriod a
// bank holiday in week 2 sits in weekBank[1]; here it is weekBank[0]. Laying
// one over the other would show red for a figure that never moved.
export function weekAsSent({ team = [], entries = [], absences = [], periodStart, weekStart }) {
    const people = peopleFor(team || [], entries || [], periodStart, addDays(periodStart, 13))
    return personPeriod({ people, entries: entries || [], absences: absences || [], dates: weekDates(weekStart) })
}

// The figures an email shows for each person, in the order a line says them.
const CHANGE_HOURS = ['worked', 'bankHoliday', 'holiday', 'trial', 'training']
const CHANGE_COUNTS = ['sundays', 'sickDays', 'sickParts', 'unpaidDays', 'unpaidParts']
export const CHANGE_FIELDS = [...CHANGE_HOURS, ...CHANGE_COUNTS]

// How each figure is said: an hours figure by its name, a count by what it
// counts, one and many.
export const CHANGE_WORDS = {
    worked: 'worked',
    bankHoliday: 'bank holiday',
    holiday: 'holiday',
    trial: 'trial',
    training: 'training',
    sundays: ['Sunday', 'Sundays'],
    sickDays: ['day sick', 'days sick'],
    sickParts: ['part day sick', 'part days sick'],
    unpaidDays: ['day unpaid', 'days unpaid'],
    unpaidParts: ['part day unpaid', 'part days unpaid'],
}

export const isHoursField = field => CHANGE_HOURS.includes(field)

// What a day comes to, for telling whether it changed. Nothing on it, or only
// a comment, comes to nothing: **a comment on its own is never a change** (his
// call, 9 November 2026), and the week 1 email carries none.
//
// Against a week 1 email only what that email could show counts: the hours,
// trial and training, and a day of holiday, sick or unpaid leave. Its clock
// times and a day off were never in it. Against a pay period email, whose PDF
// had every time and every day, they count too.
function dayKey(day, scope) {
    if (!day) return ''
    const whole = scope === 'period'
    const kindHours = kind => round2((day.spans || []).reduce((t, s) => (s.kind === kind ? t + num(s.hours) : t), 0))
    const counted = whole || day.away === 'holiday' || COUNTED_DAYS.includes(day.away)
    const away = day.away && counted ? day.away : null
    const spans = whole
        ? (day.spans || []).map(s => [String(s.starts_at ?? '').slice(0, 8), String(s.ends_at ?? '').slice(0, 8), round2(s.hours), s.kind || ''])
        : []
    const open = whole ? (day.open || []).map(at => String(at ?? '').slice(0, 8)) : []
    const hours = round2(day.hours)
    const trial = kindHours('trial')
    const training = kindHours('training')
    if (!hours && !away && !trial && !training && !spans.length && !open.length) return ''
    return JSON.stringify([hours, trial, training, away, Boolean(away && day.part), spans, open])
}

// What changed in one week since an email carried it.
//
// `sent` and `now` are both weekAsSent, the copy kept and the week today.
// People are matched by id. Each figure is taken to two places first, because
// hours added up in floats never give the same float twice. **Net, not
// edits**: a change and a change back is no change, the same as the report.
//
// A person is listed when a figure the email showed is different, or, against
// a pay period email, when a day is. Never for a comment, and never for a new
// name: a rename is not hours. Somebody from another restaurant is matched by
// her name (her id is made from it), so a rename reads as one gone and one
// added; a pair with exactly the same days is taken as the rename it is.
//
// Returns the people who changed, in today's order, then anybody who is gone:
// { id, name, guest, added, gone, figures: [{ field, was, now }],
//   days: [{ date, was, now }] }, a day's was or now null where there was
// nothing. The days say which day moved a figure.
export function whatChanged(sent = [], now = [], { scope = 'week' } = {}) {
    const daysOf = (was, is) => {
        const all = [...(was?.days || []), ...(is?.days || [])]
        const dates = [...new Set(all.map(d => d.date))].sort()
        return dates.map(date => {
            const a = (was?.days || []).find(d => d.date === date) || null
            const b = (is?.days || []).find(d => d.date === date) || null
            const before = dayKey(a, scope)
            const after = dayKey(b, scope)
            return before === after ? null : { date, was: before ? a : null, now: after ? b : null }
        }).filter(Boolean)
    }
    const compare = (was, is) => {
        const figures = CHANGE_FIELDS
            .map(field => ({ field, was: round2(was?.[field]), now: round2(is?.[field]) }))
            .filter(f => f.was !== f.now)
        const days = daysOf(was, is)
        return figures.length || (scope === 'period' && days.length) ? { figures, days } : null
    }

    const before = new Map((sent || []).map(p => [p.id, p]))
    const after = new Map((now || []).map(p => [p.id, p]))
    const entry = (person, diff, added, gone) => ({
        id: person.id, name: person.name, guest: Boolean(person.guest), added, gone, ...diff,
    })

    let here = (now || []).map(person => {
        const was = before.get(person.id) || null
        const diff = compare(was, person)
        return diff && entry(person, diff, !was, false)
    }).filter(Boolean)
    const gone = (sent || []).filter(p => !after.has(p.id)).map(person => {
        const diff = compare(person, null)
        return diff && entry(person, diff, false, true)
    }).filter(Boolean)

    const renamed = new Set()
    for (const left of gone.filter(c => c.guest)) {
        const match = here.find(c => c.added && c.guest && !compare(before.get(left.id), after.get(c.id)))
        if (!match) continue
        here = here.filter(c => c !== match)
        renamed.add(left.id)
    }
    return [...here, ...gone.filter(c => !renamed.has(c.id))]
}

const when = stamp => Date.parse(stamp || '') || 0

// Which send each week of a pay period is compared with, and what changed
// since: the latest real email that carried it (his call, 9 November 2026).
//
// `weeks` is [{ weekStart, now }] with now from weekAsSent, `sends` the kept
// copies for those weeks (any order), `filed` each week's filed_at.
//
// - **Held mail is never what a week is compared with.** While mail is held
//   (MAIL_REDIRECT_TO) nobody on the list got it, and the next real email
//   must not say it replaces one they never had. A week filed only by held
//   mail reads as never sent.
// - **A week filed with no copy** was sent by the Hub before it kept copies,
//   or the copy could not be written: it went, and nothing can be said about
//   what changed. A pay period sent before copies stamped both weeks with one
//   time, so the same stamp on both is a pay period; a stamp on week 1 alone
//   is week 1 on its own.
//
// One entry a week, null for a week never sent: { week, weekStart, scope,
// sentAt, changes }, changes null when there is no copy to compare with.
export function earlierSends({ weeks = [], sends = [], filed = {} }) {
    const stamps = weeks.map(w => filed?.[w.weekStart] || null)
    const together = stamps.length === 2 && Boolean(stamps[0]) && when(stamps[0]) === when(stamps[1])
    return weeks.map((w, index) => {
        const mine = (sends || [])
            .filter(s => s.week_start === w.weekStart)
            .sort((a, b) => when(b.sent_at) - when(a.sent_at))
        const real = mine.find(s => !s.held) || null
        const held = mine.find(s => s.held) || null
        const at = stamps[index]

        const uncopied = at && (!real || when(at) > when(real.sent_at)) && !(held && when(held.sent_at) >= when(at))
        if (uncopied) {
            return { week: index, weekStart: w.weekStart, scope: together || index === 1 ? 'period' : 'week', sentAt: at, changes: null }
        }
        if (!real) return null
        const known = real.shape === SEND_SHAPE && Array.isArray(real.people)
        return {
            week: index,
            weekStart: w.weekStart,
            scope: real.scope === 'week' ? 'week' : 'period',
            sentAt: real.sent_at,
            changes: known ? whatChanged(real.people, w.now, { scope: real.scope }) : null,
        }
    })
}

// Which email the Send button makes (his call, 9 November 2026): week 1 on
// its own while the pay period is running and has not gone, the whole pay
// period once it has finished or gone. No new button and no choice to make.
// Week 2 filed is the pay period gone: a week 1 send never files week 2, and
// every pay period send, before copies and after, has.
export function sendScope({ period, today, filed = {} }) {
    if (!period) return 'period'
    if (filed?.[period.weeks[1]]) return 'period'
    return today > period.end ? 'period' : 'week'
}

// Week 1 can only really go once its Saturday is behind us. Sent halfway
// through, every shift after the send would come back in red as added.
export function weekOneOver(period, today) {
    return Boolean(period) && today > addDays(period.start, 6)
}

// One person's change, short enough for a notice on screen: "Camila: worked
// 22.00 h then, 26.50 h now (Thu 5 Nov)." The email and the PDF say it at
// more length, in their own words.
export function changeShort(change) {
    const days = change.days.length ? ` (${change.days.map(d => dayLabel(d.date)).join(', ')})` : ''
    if (change.added) return `${change.name}: added since${days}.`
    if (change.gone) return `${change.name}: taken off since${days}.`
    if (!change.figures.length) return `${change.name}: times changed, the hours are the same${days}.`
    const say = ({ field, was, now }) => {
        const words = CHANGE_WORDS[field]
        if (typeof words === 'string') return `${words} ${fmtHours(was)} h then, ${fmtHours(now)} h now`
        const count = n => (n ? `${n} ${n === 1 ? words[0] : words[1]}` : 'none')
        return `${count(was)} then, ${count(now)} now`
    }
    return `${change.name}: ${change.figures.map(say).join(', ')}${days}.`
}

// Who changed, by name with the day: "Camila (Thu 5 Nov), Cathal Nolan (Wed
// 4 Nov) and Niamh Walsh (added)". For the Timesheet's red line.
export function changeNames(changes = []) {
    const one = c => {
        const said = c.added ? 'added' : c.gone ? 'taken off' : c.days.map(d => dayLabel(d.date)).join(', ')
        return said ? `${c.name} (${said})` : c.name
    }
    const all = changes.map(one)
    return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all[0] || ''
}
