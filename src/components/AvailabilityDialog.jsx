import { useState } from 'react'
import Modal from './Modal'
import ModalSection from './ModalSection'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { modalFooter, secondaryButton } from '../lib/controlStyles'
import { toRows, fromRows, availabilityProblem } from '../lib/availability'

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
    { value: 'windows', label: 'Only between' },
    { value: 'none', label: 'Cannot work' },
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
                            </div>

                            {row.state === 'windows' && (
                                <div className="mt-2 ml-0 sm:ml-27 space-y-2">
                                    {row.windows.map((window, i) => (
                                        <div key={i} className="flex flex-wrap items-center gap-2">
                                            <input
                                                type="time"
                                                value={window[0]}
                                                onChange={e => setTime(row.key, i, 'from', e.target.value)}
                                                aria-label={`${row.name} from`}
                                                className={timeCls}
                                            />
                                            <span className="text-sm text-gray-500">to</span>
                                            <input
                                                type="time"
                                                value={window[1]}
                                                onChange={e => setTime(row.key, i, 'to', e.target.value)}
                                                aria-label={`${row.name} to`}
                                                className={timeCls}
                                            />
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
                                    ))}
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
