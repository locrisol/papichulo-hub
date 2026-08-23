import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useRestaurant } from '../context/RestaurantContext'
import { friendlyError } from '../lib/errors'
import { numberField } from '../lib/numberInput'
import { DEFAULT_BREAK_RULES, OPERATORS, breakFor } from '../lib/roster'
import { modalFooter } from '../lib/controlStyles'
import ModalSection from './ModalSection'

// The break ladder.
//
// Read top down, and the first rung a shift matches is the one it gets. The
// list is kept longest first, and reordered on save rather than trusted, since
// a rung typed in the wrong place would otherwise quietly give everybody
// fifteen minutes.
//
// Each rung carries its own operator, which is not fussiness. The ladder this
// replaces has eight hours and six hours as "or more" and four and a half as
// "more than", so a shift of exactly four and a half hours earns nothing. One
// shared operator would get that wrong every week.
//
// Breaks are paid and are never taken off the hours. This decides what gets
// printed beside a shift, not what the shift is worth.
export default function BreakRulesModal({ onClose }) {
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()

    const [rules, setRules] = useState(() => {
        const stored = activeRestaurant?.break_rules
        const source = stored?.length ? stored : DEFAULT_BREAK_RULES
        return source
            .slice()
            .sort((a, b) => b.hours - a.hours)
            .map(r => ({ hours: String(r.hours), operator: r.operator, minutes: String(r.minutes) }))
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const set = (i, field, value) =>
        setRules(prev => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)))

    const addRung = () => setRules(prev => [...prev, { hours: '', operator: 'gte', minutes: '' }])
    const removeRung = i => setRules(prev => prev.filter((_, j) => j !== i))

    const clean = rules
        .filter(r => r.hours !== '' && r.minutes !== '')
        .map(r => ({ hours: Number(r.hours), operator: r.operator, minutes: Math.round(Number(r.minutes)) }))
        .sort((a, b) => b.hours - a.hours)

    const problem = (() => {
        if (clean.length === 0) return 'A ladder needs at least one rung.'
        if (clean.some(r => isNaN(r.hours) || r.hours <= 0)) return 'Every rung needs a length in hours.'
        if (clean.some(r => isNaN(r.minutes) || r.minutes < 0)) return 'A break cannot be less than nothing.'
        const lengths = clean.map(r => `${r.hours}-${r.operator}`)
        if (new Set(lengths).size !== lengths.length) {
            return 'Two rungs cannot say the same thing. The lower one would never be reached.'
        }
        return null
    })()

    async function save() {
        if (problem) return
        setSaving(true)
        setError('')

        const { data, error: err } = await supabase
            .from('restaurants')
            .update({ break_rules: clean })
            .eq('id', activeRestaurant.id)
            .select()
            .single()

        setSaving(false)
        if (err) { setError(friendlyError(err)); return }

        setActiveRestaurant(data)
        onClose()
    }

    const fieldCls =
        'border border-border rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent'

    // A few real shifts run through the ladder as it currently stands, so the
    // effect of a change is visible before it is saved rather than turning up
    // on next week's roster.
    const examples = [13, 8, 7, 6, 5, 4.5, 4]

    return (
        <Modal title="Break rules" onClose={onClose} width="max-w-xl">
            <div>
                <ModalSection
                    title="The ladder"
                    description="Read top down, and the first rung a shift is long enough for is the one it gets. Breaks are paid and are never taken off the hours: this decides what is printed beside a shift, not what the shift is worth."
                >

                {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

                <div className="space-y-2 mb-3">
                    {rules.map((rule, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                {...numberField({ value: rule.hours, onChange: v => set(i, 'hours', v) })}
                                className={`${fieldCls} w-16 text-right`}
                                aria-label="Hours"
                                placeholder="8"
                            />
                            <span className="text-sm text-gray-500 whitespace-nowrap">hours</span>
                            <select
                                value={rule.operator}
                                onChange={e => set(i, 'operator', e.target.value)}
                                className={`${fieldCls} flex-1 min-w-0`}
                                aria-label="Operator"
                            >
                                {OPERATORS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                            <input
                                {...numberField({ value: rule.minutes, onChange: v => set(i, 'minutes', v), whole: true })}
                                className={`${fieldCls} w-16 text-right`}
                                aria-label="Minutes"
                                placeholder="60"
                            />
                            <span className="text-sm text-gray-500 whitespace-nowrap">min</span>
                            <button
                                type="button"
                                onClick={() => removeRung(i)}
                                className="px-2 py-2 text-gray-400 hover:text-red-600"
                                aria-label="Remove this rung"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={addRung}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium mb-5"
                >
                    Add a rung
                </button>

                </ModalSection>

                {/* What it does, before it is saved. */}
                <ModalSection title="What that gives">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {examples.map(h => {
                            const minutes = problem ? null : breakFor(h, clean)
                            return (
                                <span key={h} className="text-sm whitespace-nowrap">
                                    <span className="text-gray-500">{h}h</span>
                                    <span className="text-gray-300 mx-1">→</span>
                                    <span className={minutes ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                                        {problem ? '—' : minutes ? `${minutes} min` : 'none'}
                                    </span>
                                </span>
                            )
                        })}
                    </div>
                </ModalSection>

                {problem && (
                    <p className="mx-6 mb-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{problem}</p>
                )}

                <div className={modalFooter}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white"
                    >
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
            </div>
        </Modal>
    )
}
