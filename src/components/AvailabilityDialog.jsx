import { useState } from 'react'
import Modal from './Modal'
import ModalSection from './ModalSection'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { modalFooter, secondaryButton } from '../lib/controlStyles'
import {
    toRows, fromRows, availabilityProblem, windowShape, copyDay, DAY_GROUPS,
    DAY_START, DAY_END,
} from '../lib/availability'

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
    const [rows, setRows] = useState(() => toRows(employee.availability))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const problem = availabilityProblem(rows)

    const patch = (key, change) =>
        setRows(list => list.map(r => (r.key === key ? { ...r, ...change } : r)))

    const setTime = (key, index, side, value) =>
        setRows(list => list.map(r => {
            if (r.key !== key) return r
            const windows = r.windows.map((w, i) => {
                if (i !== index) return w
                return side === 'from' ? [value, w[1]] : [w[0], value]
            })
            return { ...r, windows }
        }))

    // Changing the shape rewrites the pair rather than hiding a box, so what is
    // stored is always what is on screen. The time already typed is kept
    // wherever it still means something.
    const setShape = (key, index, shape) =>
        setRows(list => list.map(r => {
            if (r.key !== key) return r
            const windows = r.windows.map((w, i) => {
                if (i !== index) return w
                const [a, b] = w
                if (shape === 'from') return [a && a !== DAY_START ? a : '13:00', DAY_END]
                if (shape === 'until') return [DAY_START, b && b !== DAY_END ? b : '13:00']
                return [a === DAY_START ? '09:00' : a, b === DAY_END ? '17:00' : b]
            })
            return { ...r, windows }
        }))

    const copyRow = (key, keys) => setRows(list => copyDay(list, key, keys))

    const addWindow = key =>
        patch(key, { windows: [...rows.find(r => r.key === key).windows, ['17:00', '22:00']] })

    const removeWindow = (key, index) =>
        setRows(list => list.map(r => (
            r.key === key ? { ...r, windows: r.windows.filter((_, i) => i !== index) } : r
        )))

    async function save() {
        if (problem) return
        setSaving(true)
        setError('')

        const { error: err } = await supabase
            .from('employees')
            .update({ availability: fromRows(rows) })
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
            <ModalSection
                title="The usual week"
                description="Only the days you set say anything. A day left on any time is one the roster will never question, so there is no need to fill in a whole week to record one afternoon off."
            >
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
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                                            Copy to
                                        </span>
                                        {DAY_GROUPS.map(group => (
                                            <button
                                                key={group.label}
                                                type="button"
                                                onClick={() => copyRow(row.key, group.keys)}
                                                className="px-2 py-1 text-[11px] font-semibold text-blue-600 rounded-md hover:bg-blue-50"
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
                                                    className="text-gray-400 hover:text-red-600 text-sm px-1"
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
