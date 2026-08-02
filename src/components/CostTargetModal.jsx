import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { weekStartOf, shortDate, todayISO } from '../lib/dates'

// Setting a cost target, permanently or just for a while.
//
// A target is never edited in place. Every change is a new row with an effective
// date, so looking back at an old week shows the target that was really in force
// then. That is why there is a history list at the bottom rather than a single
// value you overwrite.
//
// A temporary target has an end date. When it passes, nothing needs to happen:
// the lookup simply stops matching it and falls back to the last permanent one.

const TYPE_LABELS = {
    food: 'Food',
    packaging: 'Packaging and cleaning',
    labour: 'Labour',
}

export default function CostTargetModal({ targetType, restaurantId, currentValue, onClose, onSaved }) {
    const { user } = useAuth()

    const [value, setValue] = useState(currentValue != null ? String(currentValue) : '')
    const [isTemporary, setIsTemporary] = useState(false)
    const [from, setFrom] = useState(weekStartOf(todayISO()))
    const [until, setUntil] = useState('')
    const [history, setHistory] = useState([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [refresh, setRefresh] = useState(0)

    useEffect(() => {
        async function load() {
            const { data, error: e1 } = await supabase
                .from('cost_target_overrides')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .eq('target_type', targetType)
                .order('effective_from', { ascending: false })

            if (e1) setError(e1.message)
            else setHistory(data || [])
        }
        load()
    }, [restaurantId, targetType, refresh])

    async function handleSave(e) {
        e.preventDefault()
        setError('')

        const pct = parseFloat(value)
        if (isNaN(pct) || pct <= 0 || pct > 100) {
            setError('The target has to be a percentage between 0 and 100')
            return
        }

        // Dates are snapped to the Sunday that starts the week, because targets
        // are applied per week and a mid-week start would be ambiguous.
        const effectiveFrom = weekStartOf(from)
        const effectiveUntil = isTemporary && until ? weekStartOf(until) : null

        if (isTemporary) {
            if (!until) { setError('A temporary target needs an end week'); return }
            if (effectiveUntil < effectiveFrom) { setError('The end week cannot be before the start week'); return }
        }

        setSaving(true)
        const { error: e1 } = await supabase.from('cost_target_overrides').insert({
            restaurant_id: restaurantId,
            target_type: targetType,
            override_value: pct,
            effective_from: effectiveFrom,
            effective_until: effectiveUntil,
            created_by: user.id,
        })
        setSaving(false)

        if (e1) { setError(e1.message); return }
        setRefresh(n => n + 1)
        onSaved()
    }

    const fieldCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    return (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}>

                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">{TYPE_LABELS[targetType]} target</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
                </div>

                <div className="px-6 py-4 overflow-y-auto flex-1">
                    {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

                    <form onSubmit={handleSave}>
                        <div className="mb-3">
                            <label className={labelCls}>Target as a percentage of net sales</label>
                            <input type="number" step="0.1" min="0" max="100" inputMode="decimal"
                                value={value} onChange={e => setValue(e.target.value)}
                                className={`${fieldCls} text-right`} placeholder="30" />
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer mb-3">
                            <input type="checkbox" checked={isTemporary}
                                onChange={e => setIsTemporary(e.target.checked)}
                                className="w-4 h-4 rounded border-border text-accent focus:ring-accent" />
                            <div>
                                <span className="text-sm font-medium text-gray-900">Only for a while</span>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    When it ends, the previous permanent target comes back on its own.
                                </p>
                            </div>
                        </label>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className={labelCls}>From the week of</label>
                                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={fieldCls} />
                                <p className="text-xs text-gray-400 mt-1">{shortDate(weekStartOf(from))}</p>
                            </div>
                            {isTemporary && (
                                <div>
                                    <label className={labelCls}>Until the week of</label>
                                    <input type="date" value={until} onChange={e => setUntil(e.target.value)} className={fieldCls} />
                                    {until && <p className="text-xs text-gray-400 mt-1">{shortDate(weekStartOf(until))}</p>}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end mb-6">
                            <button type="submit" disabled={saving}
                                className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                                {saving ? 'Saving...' : 'Set target'}
                            </button>
                        </div>
                    </form>

                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Previous targets</h3>
                    {history.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">
                            Nothing set yet, so the restaurant default is being used.
                        </p>
                    ) : (
                        <div className="border border-border rounded-lg divide-y divide-border">
                            {history.map(h => (
                                <div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                    <span className="text-gray-900 font-medium">{h.override_value}%</span>
                                    <span className="text-xs text-gray-500">
                                        from {shortDate(h.effective_from)}
                                        {h.effective_until ? ` until ${shortDate(h.effective_until)}` : ', ongoing'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-6 py-3 border-t border-border bg-gray-50 flex justify-end">
                    <button onClick={onClose}
                        className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}