import { useState } from 'react'
import Modal from './Modal'
import ModalSection from './ModalSection'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { modalFooter, removeButton, secondaryButton } from '../lib/controlStyles'
import {
    toRows, fromRows, availabilityProblem, windowShape, copyDay, DAY_GROUPS,
    DAY_START, DAY_END, patternOn,
} from '../lib/availability'
import { todayISO, fullDate, addDays } from '../lib/dates'

// When somebody can work.
//
// Seven rows, and every one of them starts on "any time" rather than empty.
// That is the difference between a screen you can half fill in safely and one
// you cannot: saying something about Sunday has to say nothing about Thursday,
// or the first person somebody types in here starts throwing warnings for the
// six days they never got to.
//
// Two stretches in a day are allowed because that is the shape a student's week
// actually has: free in the morning, in college in the middle, free again in the
// evening. One window covering the whole day would say they can work through the
// lecture.
//
// None of it refuses anything on the roster. It warns, and a manager who knows
// the timetable changed this term rosters straight over it.
const STATES = [
    { value: 'any', label: 'Any time' },
    { value: 'windows', label: 'Set hours' },
    { value: 'none', label: 'Cannot work' },
]

// The three ways a stretch can be said.
//
// Not before one and nothing after six are the two commonest things anybody
// actually says, and both of them only have one time in them. Asking for two
// meant typing an end of the day that was never really being said.
//
// All three are stored the same way underneath, as a pair with the open end
// sitting on the edge of the day, so nothing further down has to know which
// was picked.
const SHAPES = [
    { value: 'between', label: 'Between' },
    { value: 'from', label: 'From' },
    { value: 'until', label: 'Until' },
]

export default function AvailabilityDialog({ employee, onClose, onChanged }) {
    const today = todayISO()

    // The pattern in force today, not whichever column it happens to sit in. A
    // change dated last week has already taken over, and editing "the usual
    // week" then has to mean editing the one they actually work.
    const [rows, setRows] = useState(() => toRows(patternOn(employee, today)))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // A change queued for a day still to come, and the day it starts. A change
    // whose day has passed is not queued any more, it is the usual week, and
    // the rows above are already showing it.
    const queued = employee.availability_from > today
        ? { from: employee.availability_from, pattern: employee.availability_next }
        : null

    // Which of the two weeks is on screen. It opens on the one they work now,
    // which is what somebody is nearly always here for.
    const [mode, setMode] = useState('now')
    const [changing, setChanging] = useState(Boolean(queued))
    const [from, setFrom] = useState(queued?.from || '')
    const [nextRows, setNextRows] = useState(() => toRows(queued?.pattern || patternOn(employee, today)))

    const tomorrow = addDays(today, 1)

    const problem = availabilityProblem(rows)
        || (changing && !from && 'Say which day the new hours start.')
        || (changing && from <= today && 'A change has to start on a day still to come.')
        || (changing && availabilityProblem(nextRows))
    // The row helpers, made against whichever list they are for.
    //
    // They used to be bound to the one list, so the second grid could only
    // have a cut-down copy of them. Two grids with different abilities is the
    // sort of difference nobody notices until they reach for the thing that is
    // not there.
    function helpersFor(list, setList) {
        const patch = (key, change) =>
            setList(l => l.map(r => (r.key === key ? { ...r, ...change } : r)))

        return {
            patch,

            setTime: (key, index, side, value) =>
                setList(l => l.map(r => {
                    if (r.key !== key) return r
                    const windows = r.windows.map((w, i) => {
                        if (i !== index) return w
                        return side === 'from' ? [value, w[1]] : [w[0], value]
                    })
                    return { ...r, windows }
                })),

            // Changing the shape rewrites the pair rather than hiding a box, so
            // what is stored is always what is on screen. The time already
            // typed is kept wherever it still means something.
            setShape: (key, index, shape) =>
                setList(l => l.map(r => {
                    if (r.key !== key) return r
                    const windows = r.windows.map((w, i) => {
                        if (i !== index) return w
                        const [a, b] = w
                        if (shape === 'from') return [a && a !== DAY_START ? a : '13:00', DAY_END]
                        if (shape === 'until') return [DAY_START, b && b !== DAY_END ? b : '13:00']
                        return [a === DAY_START ? '09:00' : a, b === DAY_END ? '17:00' : b]
                    })
                    return { ...r, windows }
                })),

            copyRow: (key, keys) => setList(l => copyDay(l, key, keys)),

            addWindow: key =>
                patch(key, { windows: [...list.find(r => r.key === key).windows, ['17:00', '22:00']] }),

            removeWindow: (key, index) =>
                setList(l => l.map(r => (
                    r.key === key ? { ...r, windows: r.windows.filter((_, i) => i !== index) } : r
                ))),
        }
    }

    const nowRows = helpersFor(rows, setRows)
    const laterRows = helpersFor(nextRows, setNextRows)

    // The pills above the grid, and the ones inside it, are the same control.
    const tabCls = on => `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
        on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
    }`

    async function save() {
        if (problem) return
        setSaving(true)
        setError('')

        // Both columns written every time. A change whose day has passed has
        // already been folded into the rows above, so clearing it here is what
        // stops yesterday's change sitting in the record for ever, quietly
        // winning every comparison.
        const { error: err } = await supabase
            .from('employees')
            .update({
                availability: fromRows(rows),
                availability_next: changing ? fromRows(nextRows) : null,
                availability_from: changing ? from : null,
            })
            .eq('id', employee.id)

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        onChanged?.()
        onClose()
    }

    const timeCls =
        'border border-border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'

    return (
        <Modal title={`When ${employee.full_name} can work`} onClose={onClose} width="max-w-xl">
            {/* One grid, and a switch above it saying which week it is.

                Both at once was two sets of seven days on one screen with
                nothing but a heading telling them apart, which is a good way
                to set the wrong one. */}
            <ModalSection title="When they can work">
                <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1 mb-4" role="group" aria-label="Which week">
                    <button
                        type="button"
                        onClick={() => setMode('now')}
                        aria-pressed={mode === 'now'}
                        className={tabCls(mode === 'now')}
                    >
                        From now on
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('later')}
                        aria-pressed={mode === 'later'}
                        className={tabCls(mode === 'later')}
                    >
                        From a date
                    </button>
                </div>

                {mode === 'now' ? (
                    <>
                        <p className="text-xs text-muted mb-3">
                            Only the days you set say anything. A day left on any time is one the roster
                            will never question, so there is no need to fill in a whole week to record
                            one afternoon off.
                        </p>
                        <DayRows rows={rows} on={nowRows} timeCls={timeCls} />
                    </>
                ) : !changing ? (
                    <div className="text-center py-6">
                        <p className="text-sm text-muted mb-3 max-w-sm mx-auto">
                            For somebody who has told you their hours change on a day still to come.
                            The week above keeps applying right up to it.
                        </p>
                        <button
                            type="button"
                            onClick={() => { setChanging(true); setNextRows(rows) }}
                            className={secondaryButton}
                        >
                            Add a change
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                            <div>
                                <label htmlFor="availability-from" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Starting on
                                </label>
                                <input
                                    id="availability-from"
                                    type="date"
                                    value={from}
                                    min={tomorrow}
                                    onChange={e => setFrom(e.target.value)}
                                    className="border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => { setChanging(false); setFrom('') }}
                                className={removeButton}
                            >
                                Remove this change
                            </button>
                        </div>

                        {from > today && (
                            <p className="text-xs text-muted mb-3">
                                Everything up to {fullDate(from)} uses the week under From now on.
                            </p>
                        )}

                        <DayRows rows={nextRows} on={laterRows} timeCls={timeCls} />
                    </>
                )}
            </ModalSection>

            <ModalSection title="What the roster does with it">
                <ul className="text-sm text-muted space-y-1.5">
                    <li>The hours they cannot work are shaded on the day timeline, before you put anything in.</li>
                    <li>A shift outside them is said in the warnings at the top of the week.</li>
                    <li>It never stops a week going out. If you know something the roster does not, roster it.</li>
                </ul>
            </ModalSection>

            {(problem || error) && (
                <p className="mx-6 mb-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{problem || error}</p>
            )}

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={saving || !!problem}
                    className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>
        </Modal>
    )
}

// The seven days, however they are being set.
//
// Written once and used twice: for the week they work now, and for a change
// that starts on a date. Those two used to be separate blocks and the second
// quietly had fewer features than the first, no copy-to-the-week and no second
// stretch in a day, which is the sort of difference nobody notices until they
// need the thing that is missing.
function DayRows({ rows, on, timeCls }) {
    const { patch, setTime, setShape, copyRow, addWindow, removeWindow } = on

    return (
                <div>
                    {rows.map(row => (
                        <div key={row.key} className="py-2.5 border-b border-border last:border-b-0">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="w-24 text-sm font-medium text-gray-900 flex-shrink-0">
                                    {row.name}
                                </span>
                                <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1" role="group" aria-label={row.name}>
                                    {STATES.map(state => (
                                        <button
                                            key={state.value}
                                            type="button"
                                            onClick={() => patch(row.key, { state: state.value })}
                                            aria-pressed={row.state === state.value}
                                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                                                row.state === state.value
                                                    ? 'bg-white text-gray-900 shadow-sm'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            {state.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Copying a day onto the rest of the week.
                                    Somebody who can only start at one is almost
                                    never saying it about one day, they are
                                    saying it about the college week, and typing
                                    the same thing five times is how the fifth
                                    one ends up different from the other four.

                                    Only on a day that says something, since
                                    there is nothing to copy off a day left on
                                    any time. */}
                                {row.state !== 'any' && (
                                    <span className="flex items-center gap-1 ml-auto">
                                        <span className="text-[0.625rem] text-gray-400 uppercase tracking-wider">
                                            Copy to
                                        </span>
                                        {DAY_GROUPS.map(group => (
                                            <button
                                                key={group.label}
                                                type="button"
                                                onClick={() => copyRow(row.key, group.keys)}
                                                className="px-2 py-1 text-[0.6875rem] font-semibold text-blue-600 rounded-md hover:bg-blue-50"
                                            >
                                                {group.label}
                                            </button>
                                        ))}
                                    </span>
                                )}
                            </div>

                            {row.state === 'windows' && (
                                <div className="mt-2 ml-0 sm:ml-27 space-y-2">
                                    {row.windows.map((window, i) => {
                                        // A window sitting on both edges of the
                                        // day is any time, and it reads as from
                                        // midnight rather than flipping the
                                        // picker to Between and leaving an empty
                                        // box beside it.
                                        const found = windowShape(window)
                                        const shape = found === 'all' ? 'from' : found
                                        return (
                                        <div key={i} className="flex flex-wrap items-center gap-2">
                                            <select
                                                value={shape}
                                                onChange={e => setShape(row.key, i, e.target.value)}
                                                aria-label={`${row.name}, how the hours are set`}
                                                className={timeCls}
                                            >
                                                {SHAPES.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                            {shape !== 'until' && (
                                                <input
                                                    type="time"
                                                    value={window[0]}
                                                    onChange={e => setTime(row.key, i, 'from', e.target.value)}
                                                    aria-label={`${row.name} from`}
                                                    className={timeCls}
                                                />
                                            )}
                                            {shape === 'between' && <span className="text-sm text-gray-500">to</span>}
                                            {shape !== 'from' && (
                                                <input
                                                    type="time"
                                                    value={window[1] === DAY_END ? '' : window[1]}
                                                    onChange={e => setTime(row.key, i, 'to', e.target.value)}
                                                    aria-label={`${row.name} to`}
                                                    className={timeCls}
                                                />
                                            )}
                                            {row.windows.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeWindow(row.key, i)}
                                                    className={removeButton}
                                                    aria-label={`Remove that stretch from ${row.name}`}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                        )
                                    })}
                                    {/* A second stretch is the college day: free
                                        in the morning, in a lecture in the
                                        middle, free again in the evening. One
                                        window across the whole day would say
                                        they can work through it. */}
                                    {row.windows.length < 3 && (
                                        <button
                                            type="button"
                                            onClick={() => addWindow(row.key)}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            Add another stretch
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

    )
}
