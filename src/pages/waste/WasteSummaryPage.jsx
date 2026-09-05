import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney, fmtQty } from '../../lib/format'
import { todayISO, weekStartOf, shortDate, addDays } from '../../lib/dates'
import { REASONS, reasonLabel } from '../../lib/wasteReasons'
import { secondaryButton, tableHeadRow, card, jumpButton } from '../../lib/controlStyles'
import DateStepper from '../../components/DateStepper'
import { friendlyError } from '../../lib/errors'

// Waste for a week, grouped by product.
//
// The log screen shows one day, which is what you want while logging. This is
// the other question: what did we throw out this week, and what did it cost as a
// share of what we sold.
//
// Waste as a percentage of net sales is the number that matters. Fifty euro of
// waste is fine on a busy Saturday and terrible on a quiet Monday, so the raw
// figure on its own tells you very little.

// Bands from the issue. Under 3% is fine, 3 to 5 is worth a look, above 5 is a
// problem. These are not the configurable cost targets: waste has no target in
// restaurant settings, so they are fixed here for now.
const GOOD_BELOW = 3
const WARN_BELOW = 5

export default function WasteSummaryPage() {
    const navigate = useNavigate()
    const { activeRestaurant } = useRestaurant()

    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    const [pickerDate, setPickerDate] = useState(weekStart)
    const [reasonFilter, setReasonFilter] = useState('')

    const [entries, setEntries] = useState([])
    const [netSales, setNetSales] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const restaurantId = activeRestaurant?.id

    useEffect(() => {
        if (!restaurantId) return

        async function load() {
            setLoading(true)
            setError('')

            const end = addDays(weekStart, 6)

            const { data: logs, error: wErr } = await supabase
                .from('waste_logs')
                .select('*, products(name, unit)')
                .eq('restaurant_id', restaurantId)
                .gte('log_date', weekStart)
                .lte('log_date', end)

            if (wErr) { setError(friendlyError(wErr)); setLoading(false); return }
            setEntries(logs || [])

            // Closed days are left out: they have no sales, so including them
            // would only pull the denominator down.
            const { data: sales, error: sErr } = await supabase
                .from('sales_records')
                .select('net_sales, is_closed')
                .eq('restaurant_id', restaurantId)
                .gte('sale_date', weekStart)
                .lte('sale_date', end)

            if (sErr) { setError(friendlyError(sErr)); setLoading(false); return }
            setNetSales(
                (sales || [])
                    .filter(s => !s.is_closed)
                    .reduce((sum, s) => sum + Number(s.net_sales || 0), 0)
            )

            setLoading(false)
        }

        load()
    }, [restaurantId, weekStart])

    const filtered = reasonFilter
        ? entries.filter(e => e.reason === reasonFilter)
        : entries

    // One row per product, with the reasons underneath, because the same thing
    // gets thrown out for different reasons across a week and the split is the
    // interesting part.
    const byProduct = []
    const index = {}
    for (const e of filtered) {
        const id = e.product_id
        if (!index[id]) {
            index[id] = {
                id,
                name: e.products?.name || 'Unknown product',
                unit: e.products?.unit || '',
                quantity: 0,
                value: 0,
                reasons: {},
                anyMissingPrice: false,
            }
            byProduct.push(index[id])
        }
        const row = index[id]
        row.quantity += Number(e.quantity_wasted || 0)
        row.value += Number(e.waste_value || 0)
        if (e.waste_value == null) row.anyMissingPrice = true
        row.reasons[e.reason] = (row.reasons[e.reason] || 0) + Number(e.quantity_wasted || 0)
    }
    // Worst first: the expensive ones are the ones worth doing something about.
    byProduct.sort((a, b) => b.value - a.value)

    const totalValue = byProduct.reduce((sum, r) => sum + r.value, 0)
    const wastePct = netSales > 0 ? (totalValue / netSales) * 100 : null

    function pctColour(pct) {
        if (pct == null) return 'text-gray-400'
        if (pct < GOOD_BELOW) return 'text-green-700'
        if (pct <= WARN_BELOW) return 'text-amber-600'
        return 'text-red-600'
    }

    function goToWeek(newStart) {
        setWeekStart(newStart)
        setPickerDate(newStart)
    }

    function shiftWeek(weeks) {
        goToWeek(addDays(weekStart, weeks * 7))
    }

    const dates = [weekStart, addDays(weekStart, 6)]

    return (
        <>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Waste summary</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name}</p>
                </div>
                <button
                    onClick={() => navigate('/waste')}
                    className={secondaryButton}
                >
                    Log waste
                </button>
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

            {/* Week and filter */}
            <div className={`${card} p-4 mb-4`}>
                <div className="flex items-center gap-2 flex-wrap">
                    <DateStepper
                        onBack={() => shiftWeek(-1)}
                        onNext={() => shiftWeek(1)}
                        backLabel="Previous week"
                        nextLabel="Next week"
                        jump={(
                            <button
                                type="button"
                                onClick={() => goToWeek(weekStartOf(todayISO()))}
                                className={jumpButton(weekStart === weekStartOf(todayISO()))}
                            >
                                This week
                            </button>
                        )}
                    >
                        <span className="text-sm font-medium text-gray-900 text-center whitespace-nowrap">
                            {shortDate(dates[0])} - {shortDate(dates[1])}
                        </span>
                    </DateStepper>

                    {/* The reason filter is pushed to the far right on a wide
                        screen, which is where you expect a filter to be. On a
                        phone that rule left it stranded on a line of its own
                        with the date box orphaned underneath, so it only
                        applies from the small breakpoint up. Both controls take
                        the full width on a phone instead. */}
                    <select
                        value={reasonFilter}
                        onChange={e => setReasonFilter(e.target.value)}
                        className="w-full sm:w-auto sm:ml-auto border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                    >
                        <option value="">All reasons</option>
                        {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    <input
                        type="date"
                        value={pickerDate}
                        onChange={e => {
                            const v = e.target.value
                            if (!v) return
                            setPickerDate(v)
                            setWeekStart(weekStartOf(v))
                        }}
                        className="w-full sm:w-auto border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        aria-label="Jump to week"
                    />
                </div>
            </div>

            {/* The headline numbers. Two across on a phone, so the third one
                takes a full row of its own. Three across gave each about 100px
                and "Waste as % of sales" came out over three lines. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <div className={`${card} p-4`}>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Waste this week</p>
                    <p className="text-xl font-semibold text-gray-900 mt-1">{fmtMoney(totalValue)}</p>
                </div>
                <div className={`${card} p-4`}>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Net sales</p>
                    <p className="text-xl font-semibold text-gray-900 mt-1">{fmtMoney(netSales)}</p>
                </div>
                <div className={`${card} p-4`}>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Waste as % of sales</p>
                    <p className={`text-xl font-semibold mt-1 ${pctColour(wastePct)}`}>
                        {wastePct == null ? '-' : `${wastePct.toFixed(1)}%`}
                    </p>
                    {wastePct == null && (
                        <p className="text-xs text-gray-400 mt-1">No sales entered for this week</p>
                    )}
                </div>
            </div>

            {/* By product */}
            <div className={`${card} p-5`}>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    By product{reasonFilter ? `, ${reasonLabel(reasonFilter).toLowerCase()} only` : ''}
                </h3>

                {loading ? (
                    <p className="text-sm text-gray-400">Loading...</p>
                ) : byProduct.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Nothing logged for this week.</p>
                ) : (
                    // Inside a padded card, so it needs its own scrolling
                    // wrapper. The reason breakdown under each product name can
                    // get long, which pushes Quantity and Value off a phone.
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className={tableHeadRow}>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Quantity</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {byProduct.map(row => (
                                <tr key={row.id} className="border-b border-border">
                                    <td className="px-3 py-2">
                                        <div className="text-gray-900">{row.name}</div>
                                        <div className="text-xs text-gray-400">
                                            {Object.entries(row.reasons)
                                                .map(([r, q]) => `${reasonLabel(r)} ${fmtQty(q)}`)
                                                .join(' · ')}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-900 whitespace-nowrap">
                                        {fmtQty(row.quantity)} {row.unit}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-900 font-medium whitespace-nowrap">
                                        {fmtMoney(row.value)}
                                        {row.anyMissingPrice && (
                                            <span className="block text-xs text-amber-600">price missing</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-border bg-gray-50">
                                <td className="px-3 py-3 font-semibold text-gray-900">Total</td>
                                <td className="px-3 py-3 text-right text-gray-400">-</td>
                                <td className="px-3 py-3 text-right font-semibold text-gray-900">{fmtMoney(totalValue)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    </div>
                )}
            </div>

            <p className="text-xs text-gray-400 mt-3">
                Under {GOOD_BELOW}% of net sales is healthy, {GOOD_BELOW} to {WARN_BELOW}% is worth a look, above
                {' '}{WARN_BELOW}% needs attention. Quantities are not totalled across products, since kilos and units
                do not add up together.
            </p>
        </>
    )
}