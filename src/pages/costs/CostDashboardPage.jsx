import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { todayISO, weekStartOf, weekDates, shortDate, addDays } from '../../lib/dates'
import { resolveTarget } from '../../lib/costTargets'
import CostTargetModal from '../../components/CostTargetModal'

// The cost dashboard. Everything else in the Hub feeds this: sales give the
// denominator, invoices give food and packaging, labour gives hours times rate,
// waste gives what was thrown out.
//
// Every percentage is against net sales, not gross, because that is what the
// business actually keeps.
//
// Targets are looked up for the week being shown rather than taken from today's
// settings, so a target changed in September does not change how a July week is
// judged.

// Waste has no configurable target: the check constraint on
// cost_target_overrides only allows food, labour and packaging. Five percent is
// used as the bar's ceiling so the card still reads like the others.
const WASTE_GOOD_BELOW = 3
const WASTE_WARN_BELOW = 5

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function num(v) {
    if (v == null) return 0
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

// One cost, as a percentage of net sales, against its target.
//
// The bar fills toward the target rather than toward 100%, so being at 29 of 30
// looks nearly full and being at 40 of 30 is pinned at the end and red. That
// reads faster than the number alone.
function KpiCard({ label, pct, target, amount, status, onEdit, temporaryUntil, footnote }) {
    const colour = {
        green: 'text-green-700',
        amber: 'text-amber-600',
        red: 'text-red-600',
        none: 'text-gray-400',
    }[status]

    const barColour = {
        green: 'bg-green-700',
        amber: 'bg-amber-500',
        red: 'bg-red-600',
        none: 'bg-gray-300',
    }[status]

    const badge = {
        green: { text: 'On track', cls: 'bg-green-50 text-green-700' },
        amber: { text: 'Near limit', cls: 'bg-amber-50 text-amber-700' },
        red: { text: 'Over target', cls: 'bg-red-50 text-red-700' },
        none: { text: 'No data', cls: 'bg-gray-100 text-gray-500' },
    }[status]

    const fill = pct != null && target ? Math.min((pct / target) * 100, 100) : 0

    return (
        <div className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</p>
                {onEdit && (
                    <button onClick={onEdit} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        Edit target
                    </button>
                )}
            </div>

            <div className="flex items-baseline gap-2 mb-1">
                <span className={`font-serif text-3xl font-bold ${colour}`}>
                    {pct == null ? '-' : `${pct.toFixed(1)}%`}
                </span>
                {target ? (
                    <span className="text-sm text-muted">/ {target}% target</span>
                ) : (
                    <span className="text-sm text-muted">{footnote}</span>
                )}
            </div>

            <p className="text-sm text-muted mb-3">{fmtMoney(amount)} this week</p>

            <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${barColour}`} style={{ width: `${fill}%` }} />
            </div>

            <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                    {badge.text}
                </span>
                {temporaryUntil && (
                    <span className="text-xs text-amber-600">
                        temporary, ends after {shortDate(temporaryUntil)}
                    </span>
                )}
            </div>
        </div>
    )
}

export default function CostDashboardPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

    const isManager = ['super_admin', 'store_manager'].includes(user?.role)

    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    const [pickerDate, setPickerDate] = useState(weekStart)

    // Kept as rows as well as totals, because the day by day list needs them.
    const [salesRows, setSalesRows] = useState([])
    const [foodCost, setFoodCost] = useState(0)
    const [packagingCost, setPackagingCost] = useState(0)
    const [labourCost, setLabourCost] = useState(0)
    const [wasteCost, setWasteCost] = useState(0)
    const [overrides, setOverrides] = useState([])

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [refresh, setRefresh] = useState(0)
    const [editing, setEditing] = useState(null)

    const restaurantId = activeRestaurant?.id
    const dates = weekDates(weekStart)

    useEffect(() => {
        if (!restaurantId) return

        async function load() {
            setLoading(true)
            setError('')

            const end = addDays(weekStart, 6)

            const { data: sales, error: sErr } = await supabase
                .from('sales_records')
                .select('sale_date, net_sales, gross_sales, cash_sales, card_sales, kiosk_sales, online_sales, catering_sales, is_closed')
                .eq('restaurant_id', restaurantId)
                .gte('sale_date', weekStart)
                .lte('sale_date', end)

            if (sErr) { setError(sErr.message); setLoading(false); return }
            setSalesRows(sales || [])

            const { data: invoices, error: iErr } = await supabase
                .from('invoices')
                .select('total_amount, category')
                .eq('restaurant_id', restaurantId)
                .gte('invoice_date', weekStart)
                .lte('invoice_date', end)

            if (iErr) { setError(iErr.message); setLoading(false); return }

            setFoodCost((invoices || [])
                .filter(i => i.category === 'food')
                .reduce((t, i) => t + num(i.total_amount), 0))

            // Packaging and cleaning are added together, matching the weekly
            // report. They are stored apart, so splitting them later is a
            // change here rather than a migration.
            setPackagingCost((invoices || [])
                .filter(i => i.category === 'packaging' || i.category === 'cleaning')
                .reduce((t, i) => t + num(i.total_amount), 0))

            const { data: labour, error: lErr } = await supabase
                .from('labour_entries')
                .select('labour_cost')
                .eq('restaurant_id', restaurantId)
                .gte('entry_date', weekStart)
                .lte('entry_date', end)

            if (lErr) { setError(lErr.message); setLoading(false); return }
            setLabourCost((labour || []).reduce((t, l) => t + num(l.labour_cost), 0))

            const { data: waste, error: wErr } = await supabase
                .from('waste_logs')
                .select('waste_value')
                .eq('restaurant_id', restaurantId)
                .gte('log_date', weekStart)
                .lte('log_date', end)

            if (wErr) { setError(wErr.message); setLoading(false); return }
            setWasteCost((waste || []).reduce((t, w) => t + num(w.waste_value), 0))

            const { data: overrideRows, error: oErr } = await supabase
                .from('cost_target_overrides')
                .select('*')
                .eq('restaurant_id', restaurantId)

            if (oErr) { setError(oErr.message); setLoading(false); return }
            setOverrides(overrideRows || [])

            setLoading(false)
        }

        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, weekStart, refresh])

    // Closed days are left out of every total: they have no sales and would only
    // drag the denominator down.
    const trading = salesRows.filter(s => !s.is_closed)
    const netSales = trading.reduce((t, s) => t + num(s.net_sales), 0)
    const grossSales = trading.reduce((t, s) => t + num(s.gross_sales), 0)
    const cashSales = trading.reduce((t, s) => t + num(s.cash_sales), 0)
    const cardSales = trading.reduce((t, s) => t + num(s.card_sales), 0)
    const kioskSales = trading.reduce((t, s) => t + num(s.kiosk_sales), 0)
    const onlineSales = trading.reduce((t, s) => t + num(s.online_sales), 0)
    const cateringSales = trading.reduce((t, s) => t + num(s.catering_sales), 0)

    function pct(amount) {
        return netSales > 0 ? (amount / netSales) * 100 : null
    }

    const foodTarget = resolveTarget(overrides, 'food', weekStart, num(activeRestaurant?.food_cost_target))
    const packagingTarget = resolveTarget(overrides, 'packaging', weekStart, num(activeRestaurant?.packaging_cost_target))
    const labourTarget = resolveTarget(overrides, 'labour', weekStart, num(activeRestaurant?.labour_cost_target))

    // Green at or under target, amber within two points over, red beyond that.
    function statusFor(actual, target) {
        if (actual == null || !target) return 'none'
        if (actual <= target) return 'green'
        if (actual <= target + 2) return 'amber'
        return 'red'
    }

    function wasteStatus(actual) {
        if (actual == null) return 'none'
        if (actual < WASTE_GOOD_BELOW) return 'green'
        if (actual <= WASTE_WARN_BELOW) return 'amber'
        return 'red'
    }

    // Is the target in force this week a temporary one, and when does it end?
    function temporaryUntil(targetType) {
        const match = overrides.find(o =>
            o.target_type === targetType &&
            o.effective_until != null &&
            o.effective_from <= weekStart &&
            o.effective_until >= weekStart
        )
        return match ? match.effective_until : null
    }

    function goToWeek(newStart) {
        setWeekStart(newStart)
        setPickerDate(newStart)
    }

    function shiftWeek(weeks) {
        goToWeek(addDays(weekStart, weeks * 7))
    }

    const totalCost = foodCost + packagingCost + labourCost + wasteCost
    const grossProfit = netSales - totalCost

    const salesByDate = {}
    for (const s of salesRows) salesByDate[s.sale_date] = s

    const isThisWeek = weekStart === weekStartOf(todayISO())

    return (
        <div className="max-w-5xl">
            {/* Header: the week, and what it has done so far */}
            <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
                <div>
                    <p className="font-serif text-base text-gray-900">
                        {shortDate(dates[0])} to {shortDate(dates[6])}
                    </p>
                    <p className="text-sm text-muted mt-1">
                        {activeRestaurant?.name} · net sales{' '}
                        <strong className="text-gray-900">{fmtMoney(netSales)}</strong>
                        {isThisWeek && <span className="text-muted"> so far</span>}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => shiftWeek(-1)}
                        className="px-3 py-2 border border-border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                        ‹ Previous
                    </button>
                    <button type="button" onClick={() => goToWeek(weekStartOf(todayISO()))}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border ${isThisWeek
                            ? 'border-accent text-accent bg-orange-50'
                            : 'border-border text-gray-600 hover:bg-gray-50'}`}>
                        This week
                    </button>
                    <button type="button" onClick={() => shiftWeek(1)}
                        className="px-3 py-2 border border-border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                        Next ›
                    </button>
                    <input type="date" value={pickerDate}
                        onChange={e => {
                            const v = e.target.value
                            if (!v) return
                            setPickerDate(v)
                            setWeekStart(weekStartOf(v))
                        }}
                        className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        aria-label="Jump to week" />
                </div>
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

            {!loading && netSales === 0 && (
                <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-4 mb-4">
                    No sales are recorded for this week, so the percentages cannot be worked out. Enter the week's
                    sales and everything here fills in.
                </div>
            )}

            {/* The four costs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KpiCard
                    label="Food cost"
                    pct={pct(foodCost)}
                    target={foodTarget}
                    amount={foodCost}
                    status={statusFor(pct(foodCost), foodTarget)}
                    onEdit={isManager ? () => setEditing('food') : null}
                    temporaryUntil={temporaryUntil('food')}
                />
                <KpiCard
                    label="Labour cost"
                    pct={pct(labourCost)}
                    target={labourTarget}
                    amount={labourCost}
                    status={statusFor(pct(labourCost), labourTarget)}
                    onEdit={isManager ? () => setEditing('labour') : null}
                    temporaryUntil={temporaryUntil('labour')}
                />
                <KpiCard
                    label="Packaging and cleaning"
                    pct={pct(packagingCost)}
                    target={packagingTarget}
                    amount={packagingCost}
                    status={statusFor(pct(packagingCost), packagingTarget)}
                    onEdit={isManager ? () => setEditing('packaging') : null}
                    temporaryUntil={temporaryUntil('packaging')}
                />
                <KpiCard
                    label="Waste"
                    pct={pct(wasteCost)}
                    target={WASTE_WARN_BELOW}
                    amount={wasteCost}
                    status={wasteStatus(pct(wasteCost))}
                    onEdit={null}
                    footnote={`under ${WASTE_GOOD_BELOW}% is healthy`}
                />
            </div>

            {/* How the week was taken. Not costs: this is the same money as net
                sales, split by how it came in, straight from what was entered on
                the weekly sales grid. */}
            <div className="bg-white rounded-xl border border-border p-6 mb-6">
                <h3 className="font-serif text-base font-bold text-gray-900 mb-1">How the week was taken</h3>
                <p className="text-xs text-muted mb-4">
                    Shares of gross sales. Online Sales and Outside Catering are what came through third parties.
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                        { label: 'Cash', amount: cashSales },
                        { label: 'Card', amount: cardSales },
                        { label: 'Kiosk', amount: kioskSales },
                        { label: 'Online Sales', amount: onlineSales },
                        { label: 'Outside Catering', amount: cateringSales },
                    ].map(c => (
                        <div key={c.label}>
                            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{c.label}</p>
                            <p className="font-serif text-2xl font-bold text-gray-900 mt-1">
                                {grossSales > 0 ? `${((c.amount / grossSales) * 100).toFixed(1)}%` : '-'}
                            </p>
                            <p className="text-sm text-muted">{fmtMoney(c.amount)}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Gross profit and the week day by day */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-border p-6">
                    <h3 className="font-serif text-base font-bold text-gray-900 mb-4">Gross profit this week</h3>
                    <div className="flex flex-col">
                        <div className="flex justify-between text-sm py-2 border-b border-border">
                            <span className="text-muted">Net sales</span>
                            <span className="font-semibold text-gray-900">{fmtMoney(netSales)}</span>
                        </div>
                        {[
                            { label: 'Food purchases', value: foodCost },
                            { label: 'Packaging and cleaning', value: packagingCost },
                            { label: 'Labour', value: labourCost },
                            { label: 'Waste', value: wasteCost },
                        ].map(r => (
                            <div key={r.label} className="flex justify-between text-sm py-2 border-b border-border">
                                <span className="text-muted">{r.label}</span>
                                <span className="font-semibold text-red-600">− {fmtMoney(r.value)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between text-base py-3 font-bold">
                            <span className="text-gray-900">Gross profit</span>
                            <span className={grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}>
                                {fmtMoney(grossProfit)}
                                {pct(grossProfit) != null && (
                                    <span className="font-normal text-sm ml-2">({pct(grossProfit).toFixed(0)}%)</span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-border p-6">
                    <h3 className="font-serif text-base font-bold text-gray-900 mb-4">Sales day by day</h3>
                    {dates.map((d, i) => {
                        const row = salesByDate[d]
                        return (
                            <div key={d} className="flex justify-between items-center py-1.5 border-b border-border text-sm last:border-0">
                                <span className="text-muted w-24">{DAY_NAMES[i]} {shortDate(d)}</span>
                                {!row ? (
                                    <span className="text-gray-300 italic text-xs">nothing entered yet</span>
                                ) : row.is_closed ? (
                                    <span className="text-gray-400 text-xs">closed</span>
                                ) : (
                                    <>
                                        <span className="text-gray-900 font-medium">{fmtMoney(row.net_sales)}</span>
                                        <span className="text-muted text-xs">gross {fmtMoney(row.gross_sales)}</span>
                                    </>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {editing && (
                <CostTargetModal
                    targetType={editing}
                    restaurantId={restaurantId}
                    weekStart={weekStart}
                    currentValue={
                        editing === 'food' ? foodTarget
                            : editing === 'packaging' ? packagingTarget
                                : labourTarget
                    }
                    onClose={() => setEditing(null)}
                    onSaved={() => setRefresh(n => n + 1)}
                />
            )}
        </div>
    )
}