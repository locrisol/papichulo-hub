import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import SalesPlatformsModal from '../../components/SalesPlatformsModal'
import CostTargetModal from '../../components/CostTargetModal'
import { RECEIPT_ROWS, resolveRowOrder } from '../sales/WeeklySalesPage'
import { todayISO, weekStartOf, shortDate } from '../../lib/dates'
import { resolveTarget, describeTargets } from '../../lib/costTargets'
import { friendlyError } from '../../lib/errors'
import PageContainer from '../../components/layout/PageContainer'

// Restaurant settings.
//
// Cost targets are set through the same modal the cost dashboard uses, so there
// is one place a target is ever changed and the two screens cannot drift apart.
//
// A target is never edited in place. Each change is a new row with a start week,
// so a change made today does not rewrite how June was judged. That is why the
// hourly rate and the forecasting flag are the only things saved straight onto
// the restaurant here: the rate is copied onto every labour entry when it is
// saved, so past weeks already keep what was really paid.

const TARGET_TYPES = [
    { key: 'food', label: 'Food cost', column: 'food_cost_target' },
    { key: 'labour', label: 'Labour cost', column: 'labour_cost_target' },
    { key: 'packaging', label: 'Packaging and cleaning', column: 'packaging_cost_target' },
]

export default function RestaurantPage() {
    const { user } = useAuth()
    const { activeRestaurant, setActiveRestaurant } = useRestaurant()

    const [formData, setFormData] = useState({
        hourly_rate: '',
        forecasting_enabled: false,
    })

    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState('')
    const [error, setError] = useState('')
    const [overrides, setOverrides] = useState([])
    const [showPlatformsModal, setShowPlatformsModal] = useState(false)
    const [editingTarget, setEditingTarget] = useState(null)
    const [refresh, setRefresh] = useState(0)

    // Order of the till receipt rows in the weekly sales grid.
    const [rowOrder, setRowOrder] = useState(RECEIPT_ROWS.map(r => r.key))
    const [orderSaving, setOrderSaving] = useState(false)

    const week = weekStartOf(todayISO())

    useEffect(() => {
        if (!activeRestaurant) return
        setFormData({
            hourly_rate: parseFloat(activeRestaurant.hourly_rate).toFixed(2) || '',
            forecasting_enabled: activeRestaurant.forecasting_enabled || false,
        })
        setRowOrder(resolveRowOrder(activeRestaurant.sales_row_order).map(r => r.key))
    }, [activeRestaurant])

    useEffect(() => {
        if (!activeRestaurant) return

        // All of them, not just what applies today. Without the full list there
        // is no way to work out when one target really ended.
        async function load() {
            const { data, error: e1 } = await supabase
                .from('cost_target_overrides')
                .select('*')
                .eq('restaurant_id', activeRestaurant.id)

            if (e1) setError(friendlyError(e1))
            else setOverrides(data || [])
        }
        load()
    }, [activeRestaurant, refresh])

    // Swap a row with its neighbour. Arrows rather than drag and drop: this is
    // set once and rarely revisited, and arrows work on touch without a library.
    function moveRow(index, direction) {
        const target = index + direction
        if (target < 0 || target >= rowOrder.length) return
        const next = [...rowOrder]
        const [moved] = next.splice(index, 1)
        next.splice(target, 0, moved)
        setRowOrder(next)
    }

    async function saveRowOrder() {
        setOrderSaving(true)
        setError('')
        setSuccess('')
        const { error: e1 } = await supabase
            .from('restaurants')
            .update({ sales_row_order: rowOrder })
            .eq('id', activeRestaurant.id)
        setOrderSaving(false)
        if (e1) setError(friendlyError(e1))
        else setSuccess('Sales row order saved. Reload the weekly sales page to see it.')
    }

    async function handleSave(e) {
        e.preventDefault()
        setLoading(true)
        setError('')
        setSuccess('')

        const { data, error: e1 } = await supabase
            .from('restaurants')
            .update({
                hourly_rate: parseFloat(formData.hourly_rate),
                forecasting_enabled: formData.forecasting_enabled,
            })
            .eq('id', activeRestaurant.id)
            .select()
            .single()

        setLoading(false)
        if (e1) setError(friendlyError(e1))
        else {
            setActiveRestaurant(data)
            setSuccess('Settings saved.')
        }
    }

    // What is in force this week for one target, and how long it runs.
    function targetSummary(type) {
        const timeline = describeTargets(overrides, type.key, week)
        const current = timeline.find(t => t.status === 'current')
        const upcoming = timeline.filter(t => t.status === 'upcoming')
        const fallback = Number(activeRestaurant?.[type.column])
        const value = resolveTarget(overrides, type.key, week, fallback)
        return { current, upcoming, value, count: timeline.length }
    }

    return (
        <PageContainer width="form">
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Restaurant Settings</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Cost targets and settings for {activeRestaurant?.name}
                </p>
                {activeRestaurant?.updated_at && (
                    <p className="text-xs text-gray-400 mt-1">
                        Last updated: {new Date(activeRestaurant.updated_at).toLocaleDateString('en-IE', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        })}
                    </p>
                )}
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {/* Two columns once there is room for them. On the left is what
                you change most, the targets and the pay rate, finishing with
                Save settings. On the right is the setup you touch once and
                leave alone. It stacks back into one column on a phone. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div>
                    {/* Cost targets. Changed through the same modal the dashboard uses,
                        so a target is only ever set in one place. */}
                    <div className="bg-white rounded-xl border border-border p-6 mb-4">
                        <h3 className="text-sm font-semibold text-gray-900">Cost targets</h3>
                        <p className="text-xs text-gray-500 mt-1 mb-4">
                            What each target is for the week of {shortDate(week)}. Setting a new one starts from the week you
                            choose, so past weeks keep the target that was really in force at the time.
                        </p>

                        <div className="border border-border rounded-lg divide-y divide-border">
                            {TARGET_TYPES.map(type => {
                                const s = targetSummary(type)
                                return (
                                    <div key={type.key} className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900">{type.label}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {s.current ? (
                                                        s.current.until
                                                            ? `Running since the week of ${shortDate(s.current.from)}, until the week of ${shortDate(s.current.until)}`
                                                            : `Running since the week of ${shortDate(s.current.from)}`
                                                    ) : (
                                                        'The restaurant default. Nothing has been set for a particular week'
                                                    )}
                                                </p>
                                                {s.upcoming.length > 0 && (
                                                    <p className="text-xs text-blue-600 mt-0.5">
                                                        {s.upcoming.length === 1
                                                            ? `Changes to ${s.upcoming[s.upcoming.length - 1].value}% from the week of ${shortDate(s.upcoming[s.upcoming.length - 1].from)}`
                                                            : `${s.upcoming.length} more changes already set for later weeks`}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <span className="font-serif text-xl font-bold text-gray-900">
                                                    {s.value != null ? `${s.value}%` : '-'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTarget(type.key)}
                                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Everything saved straight onto the restaurant row */}
                    <form onSubmit={handleSave}>
                        <div className="bg-white rounded-xl border border-border p-6 mb-4">
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Pay</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                        Hourly rate (€)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.hourly_rate}
                                        onChange={e => setFormData({ ...formData, hourly_rate: e.target.value })}
                                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                        required
                                    />
                                    {/* Safe to change without a date, because the rate is
                                        copied onto each labour entry when it is saved. */}
                                    <p className="text-xs text-gray-400 mt-1">
                                        The average rate used to work out labour cost. Changing it does not alter weeks already
                                        entered, since each one keeps the rate it was saved with.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {user?.role === 'super_admin' && (
                            <div className="bg-white rounded-xl border border-border p-6 mb-4">
                                <h3 className="text-sm font-semibold text-gray-900 mb-4">Forecasting</h3>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.forecasting_enabled}
                                        onChange={e => setFormData({ ...formData, forecasting_enabled: e.target.checked })}
                                        className="w-4 h-4 accent-accent"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">Enable demand forecasting</p>
                                        <p className="text-xs text-gray-500">Only for restaurants near a large event venue</p>
                                    </div>
                                </label>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-accent hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
                        >
                            {loading ? 'Saving...' : 'Save settings'}
                        </button>
                    </form>
                </div>

                <div>
                    {/* Sales platforms management */}
                    <div className="bg-white rounded-xl border border-border p-6 mb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Sales platforms</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    The delivery and catering platforms used for sales entry.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPlatformsModal(true)}
                                className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                            >
                                Manage platforms
                            </button>
                        </div>
                    </div>

                    {/* Order of the receipt rows in the weekly sales grid */}
                    <div className="bg-white rounded-xl border border-border p-6">
                        <h3 className="text-sm font-semibold text-gray-900">Weekly sales row order</h3>
                        <p className="text-xs text-gray-500 mt-1 mb-4">
                            Arrange the till receipt rows to match how you read the POS receipt. Platform rows are ordered
                            separately, in Manage platforms.
                        </p>

                        <ul className="border border-border rounded-lg divide-y divide-border mb-3">
                            {rowOrder.map((key, i) => {
                                const row = RECEIPT_ROWS.find(r => r.key === key)
                                if (!row) return null
                                return (
                                    <li key={key} className="flex items-center justify-between px-3 py-2">
                                        <span className="text-sm text-gray-700">{row.label}</span>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => moveRow(i, -1)}
                                                disabled={i === 0}
                                                className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                                                aria-label={`Move ${row.label} up`}
                                            >
                                                &uarr;
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveRow(i, 1)}
                                                disabled={i === rowOrder.length - 1}
                                                className="px-2 py-1 border border-border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                                                aria-label={`Move ${row.label} down`}
                                            >
                                                &darr;
                                            </button>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>

                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setRowOrder(RECEIPT_ROWS.map(r => r.key))}
                                className="px-4 py-2 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Reset to default
                            </button>
                            <button
                                type="button"
                                onClick={saveRowOrder}
                                disabled={orderSaving}
                                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                            >
                                {orderSaving ? 'Saving...' : 'Save order'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {editingTarget && (
                <CostTargetModal
                    targetType={editingTarget}
                    restaurantId={activeRestaurant.id}
                    weekStart={week}
                    currentValue={targetSummary(TARGET_TYPES.find(t => t.key === editingTarget)).value}
                    onClose={() => setEditingTarget(null)}
                    onSaved={() => setRefresh(n => n + 1)}
                />
            )}

            {showPlatformsModal && (
                <SalesPlatformsModal
                    onClose={() => setShowPlatformsModal(false)}
                />
            )}
        </PageContainer>
    )
}