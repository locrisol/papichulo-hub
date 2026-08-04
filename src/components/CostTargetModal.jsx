import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { weekStartOf, shortDate, todayISO } from '../lib/dates'
import { describeTargets } from '../lib/costTargets'
import { friendlyError } from '../lib/errors'

// Setting a cost target, and seeing what has been set before.
//
// A target is never edited in place. Every change is a new row with a start
// week, so looking back at an old week shows the target that was really in
// force then. That is why there is a history at the bottom rather than one
// value you overwrite.
//
// A target with no end week runs until the next one starts. One with an end
// week stops on its own, and whatever was running before comes back.

const TYPE_LABELS = {
    food: 'Food',
    packaging: 'Packaging and cleaning',
    labour: 'Labour',
}

export default function CostTargetModal({ targetType, restaurantId, currentValue, weekStart, onClose, onSaved }) {
    const { user } = useAuth()
    const week = weekStart || weekStartOf(todayISO())

    const [value, setValue] = useState(currentValue != null ? String(currentValue) : '')
    const [isTemporary, setIsTemporary] = useState(false)
    // Defaults to the week you were looking at when you pressed Edit target.
    const [from, setFrom] = useState(week)
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

            if (e1) setError(friendlyError(e1))
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

        // Dates snap to the Sunday that starts the week, because targets apply
        // per week and a mid-week start would be ambiguous.
        const effectiveFrom = weekStartOf(from)
        const effectiveUntil = isTemporary && until ? weekStartOf(until) : null

        if (isTemporary) {
            if (!until) { setError('A target that only runs for a while needs an end week'); return }
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

        if (e1) { setError(friendlyError(e1)); return }
        setRefresh(n => n + 1)
        onSaved()
    }

    // Deleting a target really removes it. Without this there is no way to undo
    // a mistake, and it is easy to end up with several set on the same week
    // that never applied to anything.
    async function handleDelete(t) {
        const ok = window.confirm(
            `Delete the ${t.value}% target starting the week of ${shortDate(t.from)}?\n\n` +
            'Weeks that were using it will fall back to whatever was set before.'
        )
        if (!ok) return

        const { error: e1 } = await supabase
            .from('cost_target_overrides')
            .delete()
            .eq('id', t.id)

        if (e1) { setError(friendlyError(e1)); return }
        setRefresh(n => n + 1)
        onSaved()
    }

    const timeline = describeTargets(history, targetType, week)

    const fieldCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    const badge = {
        current: { text: 'In force this week', cls: 'bg-green-100 text-green-800' },
        upcoming: { text: 'Starts later', cls: 'bg-blue-50 text-blue-700' },
        finished: { text: 'Finished', cls: 'bg-gray-100 text-gray-500' },
        never: { text: 'Never applied', cls: 'bg-amber-50 text-amber-700' },
    }

    function describeDates(t) {
        if (t.status === 'never') {
            return `Set for the week of ${shortDate(t.from)}, but another target was set for the same week straight after, so this one never applied.`
        }
        if (!t.until) {
            return `From the week of ${shortDate(t.from)}, with nothing after it yet.`
        }
        if (t.ended === 'set') {
            return `From the week of ${shortDate(t.from)} to the week of ${shortDate(t.until)}, then it stops on its own.`
        }
        return `From the week of ${shortDate(t.from)} to the week of ${shortDate(t.until)}, when the next one took over.`
    }

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
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
                                    When it ends, whatever was running before comes back on its own.
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

                    {/* A timeline rather than a list. A target with no end week is
                        really ended by the next one that starts, so each gets a
                        real range instead of everything saying ongoing. */}
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Target history</h3>
                    {timeline.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">
                            Nothing set yet, so the restaurant default is being used.
                        </p>
                    ) : (
                        <div className="border border-border rounded-lg divide-y divide-border">
                            {timeline.map(t => (
                                <div key={t.id} className={`px-3 py-2 ${t.status === 'current' ? 'bg-green-50' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`text-sm font-medium ${t.status === 'current' ? 'text-green-800' : 'text-gray-900'}`}>
                                            {t.value}%
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge[t.status].cls}`}>
                                                {badge[t.status].text}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(t)}
                                                className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                                                aria-label={`Delete the ${t.value}% target`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">{describeDates(t)}</p>
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