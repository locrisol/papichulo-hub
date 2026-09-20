import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import ClockField from '@/components/ui/ClockField'
import ErrorBanner from '@/components/ui/ErrorBanner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { shortDate, weekDates, weekStartOf, addDays, weekMonthLabel, todayISO } from '@/lib/dates'
import { DAY_NAMES } from '@/lib/events'
import { friendlyError } from '@/lib/errors'
import {
    weekGrid, sortExtras, toggleExtra, setExtraTime, removeExtra, extrasFor,
} from '@/lib/dayExtras'
import {
    modalFooter, secondaryButton, primaryButton, fieldClass, labelClass, hintClass,
} from '@/lib/controlStyles'
import JumpButton from '@/components/ui/JumpButton'

// The Feedr schedule, in one go.
//
// It arrives every Thursday and the Lunch Team one every Friday, and each of
// them is about one delivery across a week. Putting that in a day at a time
// means opening seven days to type three times, and the one day the time is
// different is the easiest thing in the world to miss.
//
// A cell holds the time rather than a tick. The time is the half that varies,
// so showing it costs the same as showing a tick and it answers the question
// the tick raises: Feedr at 11:30 on the Friday is exactly what those emails
// say.

// On a phone this is turned ninety degrees, and the reason is the email rather
// than the screen. Seven columns on a phone means scrolling sideways with the
// names scrolling away too, so you end up looking at four times with no idea
// which delivery they belong to. The email is about one delivery across a week,
// so the phone asks which one and then shows its week down the screen.
function PhoneShape({ rows, dates, picked, onPick, onSet }) {
    const row = rows.find(r => r.name === picked) || rows[0]

    return (
        <div className="sm:hidden">
            {/* The count is what stops a job being half done. You came in to do
                Feedr, and the number beside Lunch Team says whether Friday's
                email has been entered without you going to look. */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
                {rows.map(r => (
                    <button
                        key={r.name}
                        type="button"
                        onClick={() => onPick(r.name)}
                        aria-pressed={r.name === row?.name}
                        className={`flex-none inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border whitespace-nowrap transition-colors ${
                            r.name === row?.name
                                ? 'bg-sidebar border-sidebar text-white'
                                : 'bg-white border-gray-300 text-gray-700'
                        }`}
                    >
                        {r.name}
                        <span className={`text-xs font-bold rounded-full px-1.5 ${
                            r.name === row?.name ? 'bg-white/25' : 'bg-gray-200 text-gray-700'
                        }`}>
                            {r.count}
                        </span>
                    </button>
                ))}
            </div>

            {row && (
                <div className="border border-border rounded-lg overflow-hidden mt-2">
                    <div className="px-3 py-2 bg-app-bg border-b border-border">
                        <p className="text-sm font-bold text-gray-900">{row.name}</p>
                        <p className="text-xs text-muted">
                            {row.usualTime ? `Usually ${row.usualTime}` : 'No usual time'}
                        </p>
                    </div>

                    {dates.map((date, i) => {
                        const at = row.onDay[date]
                        const on = at !== null && at !== undefined

                        return (
                            <div key={date} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0">
                                <span className={`flex-none w-20 text-sm font-semibold ${on ? 'text-gray-800' : 'text-muted'}`}>
                                    {DAY_NAMES[i]} {shortDate(date).split(' ')[0]}
                                </span>

                                {on ? (
                                    <>
                                        <ClockField
                                            value={at}
                                            onChange={v => onSet(date, row.name, v)}
                                            compact
                                            aria-label={`${row.name} time on ${date}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onSet(date, row.name, null)}
                                            aria-label={`Take ${row.name} off ${date}`}
                                            className="ml-auto text-muted text-lg leading-none px-2"
                                        >
                                            &times;
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onSet(date, row.name, row.usualTime || '')}
                                        className="text-sm font-semibold text-muted border border-dashed border-gray-300 rounded-lg px-3 py-1"
                                    >
                                        + put it on
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// On a computer the whole week is one grid, because seeing all three deliveries
// against all seven days at once is the entire advantage of a wide screen.
function GridShape({ rows, dates, onSet }) {
    return (
        <div className="hidden sm:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="bg-sidebar">
                        <th className="text-left px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                            &nbsp;
                        </th>
                        {dates.map((date, i) => (
                            <th key={date} className="px-1 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                                {DAY_NAMES[i]} {shortDate(date).split(' ')[0]}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.name} className="border-b border-border last:border-b-0">
                            <td className="px-2 py-1.5 bg-app-bg border-r border-border whitespace-nowrap">
                                <span className="font-bold text-gray-800">{row.name}</span>
                                <span className="block text-xs text-muted">
                                    {row.usualTime ? `usually ${row.usualTime}` : 'no usual time'}
                                </span>
                            </td>
                            {dates.map(date => {
                                const at = row.onDay[date]
                                const on = at !== null && at !== undefined

                                return (
                                    <td key={date} className="px-1 py-1 text-center border-r border-border last:border-r-0">
                                        {on ? (
                                            <span className="inline-flex items-center gap-1">
                                                <ClockField
                                                    value={at}
                                                    onChange={v => onSet(date, row.name, v)}
                                                    compact
                                                    aria-label={`${row.name} time on ${date}`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => onSet(date, row.name, null)}
                                                    aria-label={`Take ${row.name} off ${date}`}
                                                    className="text-muted text-base leading-none px-0.5"
                                                >
                                                    &times;
                                                </button>
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onSet(date, row.name, row.usualTime || '')}
                                                aria-label={`Put ${row.name} on ${date}`}
                                                className="w-full py-1.5 text-muted hover:text-accent-ink hover:bg-gray-50 rounded transition-colors"
                                            >
                                                &middot;
                                            </button>
                                        )}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default function WeekExtrasModal({
    startOn, restaurant, onClose, onSaved, canStepWeeks = true,
}) {
    const { user } = useAuth()

    // It carries its own week and fetches its own days.
    //
    // This was lifted from the roster, where the page has exactly one week on
    // screen and could simply hand it over. The calendar has a month, a week
    // and a list, so there is no week to hand over, and the first version made
    // you go and click a date before the button would do anything useful.
    // Which week you are on belongs to this screen, so this screen holds it.
    const [week, setWeek] = useState(() => weekStartOf(startOn || todayISO()))
    const dates = weekDates(week)

    const [notes, setNotes] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!restaurant?.id) return undefined
        let alive = true

        async function load() {
            setLoading(true)
            const days = weekDates(week)
            const { data } = await supabase
                .from('day_notes').select('note_date, extras')
                .eq('restaurant_id', restaurant.id)
                .gte('note_date', days[0]).lte('note_date', days[6])

            if (!alive) return
            // Worked on here and written once at the end, rather than a round
            // trip per tick. A schedule is entered in one pass and should be
            // saved in one.
            setNotes(days.map(date => ({
                note_date: date,
                extras: extrasFor((data || []).find(n => n.note_date === date)),
            })))
            setLoading(false)
        }

        load()
        return () => { alive = false }
    }, [restaurant?.id, week])
    // Named here but on no day yet, because naming a thing and saying when it
    // is are two decisions, and putting it on every day would be a guess. The
    // grid only knows about names on the usual list or already on a day, so
    // these ride along until one of the two is true.
    // Days somebody took something off. Without this an emptied day is
    // indistinguishable from one that never had anything, and the change
    // would not be written.
    const [touched, setTouched] = useState(() => new Set())
    const [oneOffs, setOneOffs] = useState([])
    const [picked, setPicked] = useState(null)
    const [adding, setAdding] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const rows = weekGrid([...(restaurant?.usual_extras || []), ...oneOffs], notes, dates)

    // null takes it off the day. Anything else puts it on, at that time or at
    // no time, which are two different answers.
    function onSet(date, name, time) {
        setTouched(was => new Set(was).add(date))
        setNotes(list => list.map(note => {
            if (note.note_date !== date) return note
            if (time === null) return { ...note, extras: removeExtra(note.extras, name) }

            const already = note.extras.some(e => e.name.toLowerCase() === name.toLowerCase())
            return {
                ...note,
                extras: already
                    ? setExtraTime(note.extras, name, time)
                    : toggleExtra(note.extras, { name, time }),
            }
        }))
    }

    function addOneOff() {
        const name = adding.trim()
        if (!name) return
        setAdding('')
        setPicked(name)
        setOneOffs(list => (
            list.some(o => o.name.toLowerCase() === name.toLowerCase())
                ? list
                : [...list, { name, time: '' }]
        ))
    }

    async function save() {
        setSaving(true)
        setError('')

        // A day_notes row exists only for a day that differs from the usual
        // week, which is what the table is for. So a day that had no row and
        // still has nothing on it is left alone: writing an empty row would
        // quietly fill the table with days that are perfectly ordinary.
        //
        // A day that already had a row is always written, because taking the
        // last delivery off it is a change and has to be saved.
        // Everything in the week. The screen fetched the days itself, so it
        // cannot tell which of them had a row before, and writing an empty one
        // for a day that never had anything would fill day_notes with days that
        // are perfectly ordinary. Upsert only the days that carry something,
        // and for the rest write the empty on the ones that are on screen as
        // having had something taken off.
        const rowsToSave = notes
            .filter(note => note.extras.length > 0 || touched.has(note.note_date))
            .map(note => ({
                restaurant_id: restaurant.id,
                note_date: note.note_date,
                extras: note.extras.length ? sortExtras(note.extras) : null,
                updated_by: user?.id,
            }))

        if (rowsToSave.length) {
            const { error: err } = await supabase
                .from('day_notes')
                .upsert(rowsToSave, { onConflict: 'restaurant_id,note_date' })

            if (err) {
                setError(friendlyError(err))
                setSaving(false)
                return
            }
        }
        onSaved()
    }

    return (
        <Modal title="Corporate orders, the whole week" onClose={onClose} width="max-w-4xl">
            <div className="px-6 py-4">
                {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                        <p className="text-sm font-bold text-gray-900">{weekMonthLabel(week)}</p>
                        <p className="text-xs text-muted">{restaurant?.name}</p>
                    </div>
                    {/* Only where the caller does not already have a week on
                        screen.
                        Opened from the roster it is the week you are looking
                        at, and stepping away from it inside here would let you
                        save changes to a week that is not on screen, close,
                        and find the roster apparently unchanged. Opened from
                        the calendar there is no week to disagree with, and
                        month and list views have none at all, so the stepper is
                        the only way to say which one you mean. */}
                    {canStepWeeks && (
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setWeek(w => addDays(w, -7))}
                                className={secondaryButton} aria-label="The week before">&#8249;</button>
                            {/* Not a button that says This week wherever you
                                are. Standing on week 31 and being offered
                                "This week" says nothing about what pressing it
                                does, and the colour alone is something you have
                                to already know the meaning of. */}
                            <JumpButton
                                isCurrent={week === weekStartOf(todayISO())}
                                onClick={() => setWeek(weekStartOf(todayISO()))}
                            />
                            <button type="button" onClick={() => setWeek(w => addDays(w, 7))}
                                className={secondaryButton} aria-label="The week after">&#8250;</button>
                        </div>
                    )}
                </div>

                <p className={`${hintClass} mb-3 mt-0`}>
                    The schedule arrives as a week, so it goes in as a week. Tap a day to put
                    something on it, and tap the time to change it.
                </p>

                {/* Anything typed and not saved is lost on a week step, which
                    is why the step is beside the heading and not beside the
                    grid: it reads as changing what you are looking at rather
                    than as part of filling it in. */}
                {loading ? (
                    <p className="text-sm text-muted">Loading the week...</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-muted italic">
                        Nothing on the usual list yet. Add one below, or set the usual ones up in
                        the restaurant settings.
                    </p>
                ) : (
                    <>
                        <GridShape rows={rows} dates={dates} onSet={onSet} />
                        <PhoneShape
                            rows={rows}
                            dates={dates}
                            picked={picked}
                            onPick={setPicked}
                            onSet={onSet}
                        />
                    </>
                )}

                <div className="mt-4 pt-3 border-t border-border">
                    <label className={labelClass} htmlFor="week-extras-add">
                        Something once, that is not on the usual list
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="week-extras-add"
                            className={fieldClass}
                            value={adding}
                            onChange={e => setAdding(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOneOff() } }}
                        />
                        <button
                            type="button"
                            onClick={addOneOff}
                            disabled={!adding.trim()}
                            className={secondaryButton}
                        >
                            Add
                        </button>
                    </div>
                </div>
            </div>

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="button" onClick={save} disabled={saving} className={primaryButton()}>
                    {saving ? 'Saving...' : 'Save the week'}
                </button>
            </div>
        </Modal>
    )
}
