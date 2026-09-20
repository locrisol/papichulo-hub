import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useConfirm } from '@/context/confirm'
import { useRestaurant } from '@/context/restaurant'
import { friendlyError } from '@/lib/errors'
import { todayISO, weekStartOf, weekDates, addDays, shortDate, fullDate } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { settleTime } from '@/lib/clock'
import { personWeek, weekTotals, unanswered, cameFromTill, STATE_KEYS } from '@/lib/timesheet'
import { kindLabel as absenceLabel } from '@/lib/absences'
import {
    card, cardEdge, pageTitle, segmentTrack, segmentButton, dateField, secondaryButton,
} from '@/lib/controlStyles'
import JumpButton from '@/components/ui/JumpButton'
import DateStepper from '@/components/ui/DateStepper'
import ErrorBanner from '@/components/ui/ErrorBanner'
import TimesheetWeek from '@/components/timesheet/TimesheetWeek'
import TimesheetPhone from '@/components/timesheet/TimesheetPhone'
import TimesheetDay from '@/components/timesheet/TimesheetDay'
import TouchBar from '@/components/timesheet/TouchBar'
import DayEditModal from '@/components/timesheet/DayEditModal'
import ImportDialog from '@/components/timesheet/ImportDialog'

// What people actually worked.
//
// This replaces the Labour page, which held one total a day at one rate for
// everybody and could not say who. The table it wrote to is still there and
// still read, frozen, for the eight months before this existed: see the
// labour_by_day view. Nothing writes to it any more.
//
// Three views of the same week, the way the roster has Day and Week. The wide
// grid is his spreadsheet and it is what a computer and a big tablet get. The
// phone gets hours with a day opening to be typed, because fourteen clock times
// will not go across four hundred pixels. The day view is the reading, where a
// shift that ran long is a bar sticking out rather than a subtraction.

const VIEWS = [
    { id: 'week', label: 'Week' },
    { id: 'day', label: 'Day' },
]

// A list of people, read out the way somebody would say it.
function names(waiting) {
    const all = waiting.map(w => w.person.full_name)
    if (all.length <= 1) return all.join('')
    return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

export default function TimesheetPage() {
    const { user } = useAuth()
    const confirm = useConfirm()
    const { activeRestaurant } = useRestaurant()

    // Last week, not this one. A timesheet is filled in once the week has
    // finished and the till's report exists for it, so opening on the week that
    // is still running means stepping back every single time. The roster is the
    // other way round and opens on this week, because a roster is written
    // forwards. Same button, opposite jobs.
    const [weekStart, setWeekStart] = useState(addDays(weekStartOf(todayISO()), -7))
    const [pickerDate, setPickerDate] = useState(weekStart)
    const [view, setView] = useState('week')
    const [openDay, setOpenDay] = useState(weekStart)
    // Which person and day the phone has open to be typed. Held as ids rather
    // than as the row, so it survives the rows being worked out again after a
    // save and does not go stale halfway through.
    const [editing, setEditing] = useState(null)
    const [importing, setImporting] = useState(false)
    // Bumped to ask for the week again. Setting weekStart to the value it
    // already holds is a no-op, so it cannot be used to reload: the same trap
    // the Labour page carried a note about.
    const [refresh, setRefresh] = useState(0)

    const [people, setPeople] = useState([])
    const [entries, setEntries] = useState([])
    // A cell nobody has saved anything into yet.
    //
    // The boxes are controlled, so their value comes from an entry. A cell with
    // no entry had nothing to hold what was being typed, React put the empty
    // value straight back on every keystroke, and **nothing could be typed into
    // an empty cell at all**. One pending row per person per day, which is as
    // many as anybody can be typing into at once, and it becomes a real entry
    // the moment there is a start time to save.
    const [drafts, setDrafts] = useState({})
    const [absences, setAbsences] = useState([])
    const [shifts, setShifts] = useState([])
    // Whether the till's report covering this week has been read in. It decides
    // one thing: a rostered shift with nothing against it is a question on a
    // week nobody has imported and an answer on a week somebody has.
    const [imported, setImported] = useState(false)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    // A write that was refused, kept apart from `error` on purpose.
    //
    // A refused write reloads the week, so the figure on screen goes back to
    // what is stored. Reloading starts by clearing the error, which wiped the
    // one line saying why a moment after it appeared: the time snapped back and
    // the screen said nothing at all. This one survives the reload it causes
    // and clears when something saves.
    const [problem, setProblem] = useState('')
    const [saving, setSaving] = useState(false)
    // When the last write landed. The report page says the same thing in the
    // same words, and this screen saves the same way: there is no Save button
    // on either of them, so this line is the only thing that says it happened.
    const [savedAt, setSavedAt] = useState(null)

    const grid = useRef(null)
    // Which restaurant and week the state holds, so a context re-render does
    // not reload and wipe what is being typed. Same guard the Labour page had.
    const loadedKey = useRef(null)

    const restaurantId = activeRestaurant?.id
    const dates = weekDates(weekStart)
    const weekEnd = addDays(weekStart, 6)
    const restaurantRate = Number(activeRestaurant?.hourly_rate ?? 0)

    useEffect(() => {
        if (!restaurantId) return
        const key = `${restaurantId}:${weekStart}:${refresh}`
        if (loadedKey.current === key) return

        async function load() {
            setLoading(true)
            setError('')

            const [team, worked, away, rostered, week] = await Promise.all([
                supabase.from('employees')
                    .select('id, full_name, hourly_rate, sort_order, started_on, ended_on')
                    .eq('restaurant_id', restaurantId)
                    .order('sort_order'),
                supabase.from('timesheet_entries')
                    .select('*')
                    .eq('restaurant_id', restaurantId)
                    .gte('work_date', weekStart).lte('work_date', weekEnd),
                supabase.from('absences')
                    .select('*')
                    .eq('restaurant_id', restaurantId)
                    .lte('starts_on', weekEnd).gte('ends_on', weekStart),
                supabase.from('roster_shifts')
                    .select('id, employee_id, shift_date, starts_at, ends_at')
                    .eq('restaurant_id', restaurantId)
                    .gte('shift_date', weekStart).lte('shift_date', weekEnd),
                supabase.from('timesheet_weeks')
                    .select('imported_at')
                    .eq('restaurant_id', restaurantId)
                    .eq('week_start', weekStart)
                    .maybeSingle(),
            ])

            const failed = team.error || worked.error || away.error || rostered.error
            if (failed) { setError(friendlyError(failed)); setLoading(false); return }

            // Somebody who left before this week, or starts after it, is not on
            // it. A leaver still shows on the weeks they worked, which is the
            // whole point of keeping the date rather than a flag.
            setPeople((team.data || []).filter(p => (
                (!p.ended_on || p.ended_on >= weekStart)
                && (!p.started_on || p.started_on <= weekEnd)
            )))
            setEntries(worked.data || [])
            setDrafts({})
            setAbsences(away.data || [])
            setShifts(rostered.data || [])
            setImported(Boolean(week.data?.imported_at))
            loadedKey.current = key
            setLoading(false)
        }

        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, weekStart, refresh])

    // What is saved, plus what is being typed. The grid cannot tell them apart
    // and does not need to: a draft is an entry with no id yet.
    const shown = useMemo(
        () => [...entries, ...Object.values(drafts)],
        [entries, drafts],
    )

    const rows = useMemo(() => people.map(person => personWeek({
        person, weekStart, entries: shown, absences, shifts,
        restaurantRate, imported,
    })), [people, weekStart, shown, absences, shifts, restaurantRate, imported])

    const totals = weekTotals(rows)
    const waiting = unanswered(rows)

    // Looked up fresh each render, so the dialog is always showing what the
    // rows hold rather than a copy taken when it opened.
    const open = editing && (() => {
        const row = rows.find(r => r.person.id === editing.personId)
        const cell = row?.days.find(d => d.date === editing.date)
        return row && cell ? { row, cell } : null
    })()

    // ---- writing -----------------------------------------------------------

    // Every write on this page ends here, whether it worked or not.
    //
    // One place that clears the saving flag and stamps the time, so a handler
    // written later cannot save something and leave the screen saying nothing
    // happened. The report page has the same rule for the same reason, and
    // this screen needs it more: it writes when you leave a box rather than
    // when you press anything.
    function finish(failed, said) {
        setSaving(false)
        if (failed || said) {
            setProblem(said || friendlyError(failed))
            return true
        }
        setProblem('')
        setSavedAt(new Date())
        return false
    }

    const keyFor = (person, cell) => `${person.id}|${cell.date}`

    // Typing only moves what is on screen. Nothing reaches the database until
    // the box is left, so a half typed time is never saved and a week is not
    // written thirty times while somebody thinks.
    function type(person, cell, entry, field, value) {
        if (entry.id) {
            setEntries(was => was.map(e => (e.id === entry.id ? { ...e, [field]: value } : e)))
            return
        }
        // Nothing saved here yet, so it goes in the draft for this cell. This
        // is the line that was missing: without it the box had nowhere to put
        // what was typed and went straight back to empty.
        const key = keyFor(person, cell)
        setDrafts(was => ({
            ...was,
            [key]: {
                ...(was[key] || { starts_at: '', ends_at: '' }),
                id: null,
                employee_id: person.id,
                work_date: cell.date,
                kind: 'worked',
                source: 'typed',
                [field]: value,
            },
        }))
    }

    function forget(person, cell) {
        const key = keyFor(person, cell)
        setDrafts(was => {
            if (!(key in was)) return was
            const next = { ...was }
            delete next[key]
            return next
        })
    }

    async function settle(person, cell, entry, field, raw) {
        const value = settleTime(raw) || null
        setError('')

        // An entry that exists is updated, or deleted once both ends are empty.
        // Unless it carries a note: then it is a day somebody said something
        // about, the times were the part that was wrong, and throwing the
        // sentence away because a time was rubbed out would lose the only
        // thing on that row anybody wrote.
        if (entry.id) {
            const next = { ...entry, [field]: value }
            if (!next.starts_at && !next.ends_at) {
                // **A shift the till reported is emptied, never deleted.**
                //
                // Changing one of those times by hand is marked as a correction
                // and the week waits for a comment. Rubbing both of them out
                // used to escape that: the row went, nothing was left to carry
                // the mark, and on a week whose report has been read in nothing
                // asked. The week would go to the accountant lighter than the
                // report she is holding with nothing saying why, which is a
                // small change asking for an explanation and a big one not.
                //
                // Same for a row carrying a comment: the times were the part
                // that was wrong, and throwing the sentence away with them
                // would lose the only thing on that row anybody wrote.
                if (entry.note || cameFromTill(entry)) {
                    return save(entry.id, { starts_at: null, ends_at: null, ...changedByHand(entry) })
                }
                return remove(entry)
            }
            if (entry[field] === value) return
            return save(entry.id, { [field]: value, ...changedByHand(entry) })
        }

        const draft = drafts[keyFor(person, cell)] || {}
        const start = field === 'starts_at' ? value : draft.starts_at
        const end = field === 'ends_at' ? value : draft.ends_at

        // Nothing typed at all, so there is nothing to keep.
        if (!start && !end) { forget(person, cell); return }

        // A row needs a start. Typing the out time first is legitimate and
        // rare, so the draft holds it and waits rather than inventing one.
        if (!start) {
            setDrafts(was => ({ ...was, [keyFor(person, cell)]: { ...draft, id: null, employee_id: person.id, work_date: cell.date, kind: 'worked', source: 'typed', ends_at: end } }))
            return
        }

        forget(person, cell)
        await create({
            employee_id: person.id,
            work_date: cell.date,
            starts_at: start,
            ends_at: end || null,
            source: 'typed',
        })
    }

    // A time that came off the till and is being moved by hand stops being a
    // till time. **His rule, and it is the right one**: a week typed from
    // nothing is what it looks like, and so is a week off the clock, but a
    // clock time somebody has edited looks exactly like a clock time and only
    // they know what happened. So it is marked, it has to say why before the
    // week can go anywhere, and a later import of the same file never quietly
    // puts the old figure back.
    function changedByHand(entry) {
        return entry.source === 'import' ? { source: 'corrected' } : {}
    }

    // An end dragged in the day view. It is the same act as typing over a time,
    // so it goes through the same door: a till time moved this way is corrected
    // like any other, and the week then wants a comment saying why.
    //
    // Dragging lands on a five minute mark, which means the seconds go to
    // nought. That is right for a correction: the second the clock recorded is
    // the thing being corrected away from, and the exact figure is typed in the
    // grid or in the day's own dialog.
    async function correct(person, cell, entry, startsAt, endsAt) {
        if (!entry?.id) return
        setError('')
        await save(entry.id, {
            starts_at: settleTime(startsAt),
            ends_at: settleTime(endsAt),
            ...changedByHand(entry),
        })
    }

    async function create(row) {
        setSaving(true)
        const { data, error: failed } = await supabase.from('timesheet_entries')
            .insert({ ...row, restaurant_id: restaurantId, created_by: user?.id })
            .select()
        if (finish(failed)) return
        // The same trap the nearby keep fell into: a write that changed nothing
        // reads as success unless the rows come back.
        if (!data?.length) { finish(null, 'That could not be saved, so nothing has changed.'); return }
        setEntries(was => [...was, data[0]])
    }

    async function save(id, patch) {
        setSaving(true)
        const { data, error: failed } = await supabase.from('timesheet_entries')
            .update(patch).eq('id', id).select()

        // **A refused save must not leave its figure on the screen.** Typing
        // moves the cell before anything is written, so a database that says no
        // used to leave the new time sitting there looking saved, with one line
        // of red above the fold that scrolls away. The week is read again, so
        // what is on the screen is what is in the database, which is the only
        // thing this page is allowed to show.
        if (finish(failed)) { setRefresh(n => n + 1); return }
        if (!data?.length) {
            finish(null, 'That could not be saved, so nothing has changed.')
            setRefresh(n => n + 1)
            return
        }
        setEntries(was => was.map(e => (e.id === id ? data[0] : e)))
    }

    async function remove(entry) {
        setSaving(true)
        const { error: failed } = await supabase.from('timesheet_entries').delete().eq('id', entry.id)
        if (finish(failed)) { setRefresh(n => n + 1); return }
        setEntries(was => was.filter(e => e.id !== entry.id))
    }

    // A letter sets the state of the whole day. Holiday and off sick are
    // absences rather than timesheet rows, because that is where the app has
    // always kept them: somebody filling in Friday afternoon is recording that
    // she was off sick, not asking for leave.
    async function setState(person, cell, key) {
        const state = STATE_KEYS.find(s => s.key === key)
        if (!state) return
        setError('')

        if (state.absence) {
            for (const entry of cell.entries) await remove(entry)
            setSaving(true)
            const { data, error: failed } = await supabase.from('absences').insert({
                restaurant_id: restaurantId,
                employee_id: person.id,
                kind: state.value,
                starts_on: cell.date,
                ends_on: cell.date,
                // Left empty on purpose. A holiday carries the hours it
                // comes to off the payslip and the Hub has no way of knowing
                // them: eight would be a made up figure going to an
                // accountant. The roster's own dialog leaves it empty too.
                hours: null,
                status: 'approved',
                created_by: user?.id,
                decided_by: user?.id,
                decided_at: new Date().toISOString(),
            }).select()
            if (finish(failed)) return
            if (data?.length) setAbsences(was => [...was, data[0]])
            return
        }

        // Training and a trial are worked time, so they keep whatever times are
        // there and only change what the day is called. With no times yet the
        // row is the mark and nothing else: it used to be given midnight to get
        // past the database, which put 00:00 in a box somebody then had to
        // clear before they could type the real one.
        const first = cell.entries[0]
        if (first) return save(first.id, { kind: state.value })
        await create({
            employee_id: person.id,
            work_date: cell.date,
            starts_at: null,
            kind: state.value,
            source: 'typed',
        })
    }

    // Asked first, both ways round. **Time off is not a timesheet record**: it
    // is the same row the roster and the team page read, and deleting it here
    // takes it off those as well. Worth a sentence before it goes.
    async function clear(person, cell) {
        setError('')

        if (cell.absence) {
            const ok = await confirm({
                title: 'Delete this time off?',
                message: `${absenceLabel(cell.absence.kind)} for ${person.full_name}, `
                    + `${fullDate(cell.absence.starts_on)}`
                    + `${cell.absence.ends_on !== cell.absence.starts_on ? ` to ${fullDate(cell.absence.ends_on)}` : ''}. `
                    + 'It goes from the roster and the team page too, not just from here.',
                confirmLabel: 'Delete',
                tone: 'danger',
            })
            if (!ok) return

            setSaving(true)
            const { error: failed } = await supabase.from('absences').delete().eq('id', cell.absence.id)
            if (finish(failed)) return
            setAbsences(was => was.filter(a => a.id !== cell.absence.id))
            return
        }

        if (!cell.entries.length) { forget(person, cell); return }

        // A day can hold a reason and no times at all, and being asked whether
        // to delete "these times" when there are none is the kind of question
        // somebody answers yes to without reading.
        const typed = cell.entries.some(e => e.starts_at)
        const ok = await confirm({
            title: typed ? 'Delete these times?' : 'Delete what is written here?',
            message: `${person.full_name}, ${fullDate(cell.date)}. `
                + `${!typed ? 'What was written about this day goes'
                    : cell.entries.length === 1 ? 'The clock in and out go' : 'Both shifts go'} for good.`,
            confirmLabel: 'Delete',
            tone: 'danger',
        })
        if (!ok) return

        for (const entry of cell.entries) await remove(entry)
        forget(person, cell)
    }

    // The hours a holiday came to, typed in the cell rather than guessed. One
    // figure for the whole run, which is how absences has always held it, so
    // typing it on any day of a holiday sets it for all of them.
    async function setHolidayHours(cell, value) {
        if (!cell.absence) return
        const hours = value === '' ? null : Number(value)
        if (value !== '' && !Number.isFinite(hours)) return

        setAbsences(was => was.map(a => (a.id === cell.absence.id ? { ...a, hours } : a)))
        setSaving(true)
        const { data, error: failed } = await supabase.from('absences')
            .update({ hours }).eq('id', cell.absence.id).select()
        if (finish(failed)) return
        if (!data?.length) { finish(null, 'That could not be saved, so nothing has changed.'); return }
    }

    // Why a shift is what it is, in his words, going out with the week. Saved
    // when the box is left rather than on every key, the same as a time.
    //
    // **A note with no times is a row of its own.** That is the second way of
    // answering a rostered shift, which the report block has always asked for
    // and nothing could give: a shift swapped after the roster went up, or
    // somebody who did not turn up, was not a holiday and not a sick day and
    // had nowhere at all to be written down. The database took a start time
    // away from it, and this is what fills it in.
    async function setNote(person, cell, entry, text) {
        const note = String(text || '').trim() || null

        if (entry?.id) {
            if (note === (entry.note ?? null)) return
            return save(entry.id, { note })
        }

        // An empty box on a day with nothing on it is nothing to save.
        if (!note) return

        // Whatever was half typed into the boxes goes in with it rather than
        // being thrown away.
        const draft = drafts[keyFor(person, cell)] || {}
        forget(person, cell)
        await create({
            employee_id: person.id,
            work_date: cell.date,
            starts_at: settleTime(draft.starts_at) || null,
            ends_at: settleTime(draft.ends_at) || null,
            note,
            source: 'typed',
        })
    }

    function addSpan(person, cell) {
        // A second span appears as an empty pair. It only becomes a row once
        // somebody types a start into it, which is the same path a first span
        // takes and means an abandoned one leaves nothing behind.
        setDrafts(was => ({
            ...was,
            [keyFor(person, cell)]: {
                id: null,
                employee_id: person.id,
                work_date: cell.date,
                starts_at: '',
                ends_at: '',
                kind: 'worked',
                source: 'typed',
            },
        }))
    }

    // The touch bar acts on whatever box has the cursor, so it needs to turn a
    // DOM element back into the person and the day it belongs to.
    function stateFromBar(box, key) {
        if (!box) return
        const row = rows[Number(box.dataset.r)]
        const cell = row?.days[Number(box.dataset.d)]
        if (cell) setState(row.person, cell, key)
    }

    function goToWeek(date) {
        const start = weekStartOf(date)
        setWeekStart(start)
        setPickerDate(start)
        if (openDay < start || openDay > addDays(start, 6)) setOpenDay(start)
    }

    if (!restaurantId) {
        return <p className="text-sm text-muted">Pick a restaurant first.</p>
    }

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className={pageTitle}>Timesheet</h2>
                <div className={segmentTrack}>
                    {VIEWS.map(v => (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => setView(v.id)}
                            className={segmentButton(view === v.id)}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>

            {(error || problem) && <ErrorBanner className="mb-3">{error || problem}</ErrorBanner>}

            <div className={`${cardEdge} bg-white p-3 mb-4 flex flex-wrap items-center gap-3`}>
                <DateStepper
                    onBack={() => goToWeek(addDays(weekStart, -7))}
                    onNext={() => goToWeek(addDays(weekStart, 7))}
                    backLabel="Previous week"
                    nextLabel="Next week"
                    jump={(
                        <JumpButton
                            isCurrent={weekStart === weekStartOf(todayISO())}
                            onClick={() => goToWeek(todayISO())}
                        />
                    )}
                >
                    <span className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                        {shortDate(weekStart)} to {shortDate(weekEnd)}
                    </span>
                </DateStepper>

                {/* Pick any date; it snaps to that week's Sunday. The same
                    control Weekly Sales and the cost dashboard have beside
                    their arrows, and named the same, for the same job: going
                    back two months is eight presses of an arrow or one of
                    these. The roster has none, because a roster is worked a
                    week at a time and never far from today. */}
                <input
                    type="date"
                    aria-label="Jump to week"
                    className={`${dateField} w-full sm:w-auto`}
                    value={pickerDate}
                    onChange={e => e.target.value && goToWeek(e.target.value)}
                />

                <button
                    type="button"
                    onClick={() => setImporting(true)}
                    className={`${secondaryButton} ml-auto`}
                >
                    Upload the till&apos;s report
                </button>

                <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">
                        {totals.hours.toFixed(2)} h &middot; {fmtMoney(totals.cost)}
                    </p>
                    {/* The same three states the report shows, in the same
                        words, because it is the same promise: no Save button,
                        it writes when you leave a box, and this line is what
                        says so. */}
                    <span
                        className={`block text-xs ${problem ? 'font-bold text-red-700' : 'text-muted'}`}
                        aria-live="polite"
                    >
                        {/* **Not saved** is the state that matters and it was
                            the one this line could not say. The words were up
                            at the top of the page, above a table you have
                            scrolled past by the time you are typing into it,
                            so a refused write looked like nothing happening. */}
                        {problem
                            ? 'Not saved'
                            : saving
                                ? 'Saving'
                                : savedAt
                                    ? `Saved at ${savedAt.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}`
                                    : 'Saves as you type'}
                    </span>
                </div>
            </div>

            {waiting.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800 space-y-1">
                    {/* Two different things to answer, said separately because
                        they want different answers. One is a shift nobody has
                        accounted for; the other is a till time somebody moved
                        and has not explained. */}
                    {waiting.some(w => w.days.length) && (
                        <p>
                            <strong className="font-bold">
                                {names(waiting.filter(w => w.days.length))} {waiting.filter(w => w.days.length).length === 1
                                    ? 'has a rostered shift' : 'have rostered shifts'} with nothing said about it.
                            </strong>{' '}
                            A report cannot be drafted for this week until each one has times, time
                            off, or a comment saying why nothing was worked. Open the day, or
                            press <strong className="font-bold">+ comment</strong> on the cell.
                        </p>
                    )}
                    {waiting.some(w => w.changed.length) && (
                        <p>
                            <strong className="font-bold">
                                {names(waiting.filter(w => w.changed.length))} {waiting.filter(w => w.changed.length).length === 1
                                    ? 'has hours' : 'have hours'} the till&apos;s report does not have, with nothing
                                said about them.
                            </strong>{' '}
                            A time off the report that was moved, or a shift typed onto a day the
                            report says nothing about. Either way the accountant is reading a
                            different figure, so the week needs a comment saying why.
                        </p>
                    )}
                </div>
            )}

            {loading ? (
                <p className="text-sm text-muted">Loading...</p>
            ) : view === 'day' ? (
                <div className={`${card} overflow-hidden`}>
                    <div className="flex flex-wrap gap-1 p-2 border-b border-border">
                        {dates.map(date => (
                            <button
                                key={date}
                                type="button"
                                onClick={() => setOpenDay(date)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                    openDay === date
                                        ? 'bg-accent-light border-accent text-accent-ink'
                                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {shortDate(date)}
                            </button>
                        ))}
                    </div>
                    {/* Pressing a block opens the same dialog the grid opens,
                        where a time can be typed to the second. Dragging an end
                        is the quick way to fix a clock-in that is plainly
                        wrong, and both end up in the same place. */}
                    <TimesheetDay
                        rows={rows}
                        date={openDay}
                        onOpenDay={(person, cell) => setEditing({ personId: person.id, date: cell.date })}
                        onCorrect={correct}
                    />
                </div>
            ) : (
                <div className={`${card} overflow-hidden`} ref={grid}>
                    {/* The wide grid on anything that can hold it, the hours
                        view on a phone. Both are always rendered and one is
                        hidden, so a rotation does not reload anything. */}
                    <div className="hidden md:block">
                        <TimesheetWeek
                            rows={rows}
                            dates={dates}
                            onType={type}
                            onSettle={settle}
                            onState={setState}
                            onClear={clear}
                            onAdd={addSpan}
                            onOpen={(person, cell) => setEditing({ personId: person.id, date: cell.date })}
                        />
                    </div>
                    <div className="md:hidden">
                        {/* Tapping a day opens it to be typed. It used to
                            jump to the day view, which is a reading and not an
                            entry screen, so a phone had nowhere to type a time
                            at all. */}
                        <TimesheetPhone
                            rows={rows}
                            dates={dates}
                            onOpenDay={(person, cell) => setEditing({ personId: person.id, date: cell.date })}
                        />
                    </div>
                    <TouchBar gridRef={grid} onState={stateFromBar} />
                </div>
            )}

            {open && (
                <DayEditModal
                    person={open.row.person}
                    cell={open.cell}
                    onClose={() => setEditing(null)}
                    onType={(entry, field, value) => type(open.row.person, open.cell, entry, field, value)}
                    onSettle={(entry, field, value) => settle(open.row.person, open.cell, entry, field, value)}
                    onState={key => setState(open.row.person, open.cell, key)}
                    onClear={() => { clear(open.row.person, open.cell); setEditing(null) }}
                    onAdd={() => addSpan(open.row.person, open.cell)}
                    onHours={value => setHolidayHours(open.cell, value)}
                    onNote={(entry, text) => setNote(open.row.person, open.cell, entry, text)}
                />
            )}

            {importing && (
                <ImportDialog
                    restaurantId={restaurantId}
                    restaurantName={activeRestaurant?.name}
                    weekStart={weekStart}
                    weekEnd={weekEnd}
                    people={people}
                    entries={entries}
                    absences={absences}
                    onClose={() => setImporting(false)}
                    onDone={() => setRefresh(n => n + 1)}
                />
            )}
        </>
    )
}
