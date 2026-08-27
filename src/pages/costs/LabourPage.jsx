import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { resolveTarget } from '../../lib/costTargets'
import { fmtMoney, fmtQty } from '../../lib/format'
import { todayISO, weekStartOf, weekDates, shortDate, addDays, fullDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import PageContainer from '../../components/layout/PageContainer'
import { dateField, jumpButton, tableHeadRow, card } from '../../lib/controlStyles'
import DateStepper from '../../components/DateStepper'
import { numberField } from '../../lib/numberInput'

// Labour hours, entered a week at a time.
//
// Hours come off the roster, and a roster is a weekly document, so you sit down
// at the end of the week and fill in seven days in one go. That is why this is a
// grid rather than a form for one day.
//
// staff_count is a head count of people who worked at some point that day. It
// feeds nothing: labour cost is hours times rate, and the percentage is cost
// over net sales. Someone doing 9 to 15 and someone doing 15 to 21 both count as
// one person each, and the overlap does not distort anything. Working out proper
// coverage needs hourly sales, which needs the new POS, so that is future work.
//
// labour_cost is a generated column in Postgres, worked out from hours and rate,
// so it is never sent on save. Sending it would have the insert rejected.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function num(v) {
    if (v === '' || v == null) return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
}

export default function LabourPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    const [pickerDate, setPickerDate] = useState(weekStart)

    const [days, setDays] = useState({})
    const [sales, setSales] = useState({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [overrides, setOverrides] = useState([])

    // Bumped after saving so the effect below runs again. A ref alone cannot do
    // this: refs do not cause renders, and setting state to the value it already
    // holds is a no-op, so neither would reload anything.
    const [refresh, setRefresh] = useState(0)

    // Which restaurant, week and refresh `days` holds, so a context re-render
    // does not reload and wipe what you are typing.
    const loadedKey = useRef(null)

    const dates = weekDates(weekStart)
    const restaurantId = activeRestaurant?.id

    // The rate is stored on every entry, not looked up when reporting, so
    // changing it later leaves past weeks showing what was really paid.
    const currentRate = num(activeRestaurant?.hourly_rate)

    useEffect(() => {
        if (!restaurantId) return
        const key = `${restaurantId}:${weekStart}:${refresh}`
        if (loadedKey.current === key) return

        async function load() {
            setLoading(true)
            setError('')

            const end = addDays(weekStart, 6)

            const { data: entries, error: lErr } = await supabase
                .from('labour_entries')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .gte('entry_date', weekStart)
                .lte('entry_date', end)

            if (lErr) { setError(friendlyError(lErr)); setLoading(false); return }

            // Net sales for the same week, so each day can be read against what
            // it actually took.
            const { data: salesRows, error: sErr } = await supabase
                .from('sales_records')
                .select('sale_date, net_sales, is_closed')
                .eq('restaurant_id', restaurantId)
                .gte('sale_date', weekStart)
                .lte('sale_date', end)

            if (sErr) { setError(friendlyError(sErr)); setLoading(false); return }

            // Targets can change over time, so fetch the overrides and work out
            // which one applied to this week rather than using today's default.
            const { data: overrideRows, error: oErr } = await supabase
                .from('cost_target_overrides')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .eq('target_type', 'labour')

            if (oErr) { setError(friendlyError(oErr)); setLoading(false); return }
            setOverrides(overrideRows || [])

            const byDate = {}
            for (const e of entries || []) byDate[e.entry_date] = e

            const salesByDate = {}
            for (const s of salesRows || []) salesByDate[s.sale_date] = s

            const next = {}
            for (const d of dates) {
                const e = byDate[d]
                next[d] = {
                    id: e?.id ?? null,
                    staff: e?.staff_count != null ? String(e.staff_count) : '',
                    hours: e?.total_hours != null ? String(e.total_hours) : '',
                    // Only an existing entry carries a rate. New rows fall back
                    // to the current rate when the cost is worked out, so
                    // changing it in settings takes effect straight away.
                    rate: e?.hourly_rate != null ? Number(e.hourly_rate) : null,
                    notes: e?.notes ?? '',
                }
            }

            setDays(next)
            setSales(salesByDate)
            setDirty(false)
            loadedKey.current = key
            setLoading(false)
        }

        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, weekStart, refresh])

    function setField(date, field, value) {
        setDirty(true)
        setDays(prev => ({ ...prev, [date]: { ...prev[date], [field]: value } }))
    }

    function goToWeek(newStart) {
        setWeekStart(newStart)
        setPickerDate(newStart)
    }

    function shiftWeek(weeks) {
        goToWeek(addDays(weekStart, weeks * 7))
    }

    // ---- derived ---------------------------------------------------------

    function costFor(date) {
        const day = days[date]
        if (!day) return 0
        return num(day.hours) * (day.rate ?? currentRate)
    }

    function netSalesFor(date) {
        const s = sales[date]
        if (!s || s.is_closed) return null
        return Number(s.net_sales || 0)
    }

    // Blank on a closed day or a day with no sales record. A closed day can
    // still have hours on it, for inventory or a repair job, and that cost
    // counts, but there is nothing to measure it against.
    function pctFor(date) {
        const net = netSalesFor(date)
        if (net == null || net === 0) return null
        return (costFor(date) / net) * 100
    }

    const weekHours = dates.reduce((sum, d) => sum + num(days[d]?.hours), 0)
    const weekCost = dates.reduce((sum, d) => sum + costFor(d), 0)
    const weekNet = dates.reduce((sum, d) => sum + (netSalesFor(d) || 0), 0)
    // Total cost over total sales, not an average of the daily percentages,
    // which would weight a quiet day the same as a busy one.
    const weekPct = weekNet > 0 ? (weekCost / weekNet) * 100 : null

    const target = resolveTarget(overrides, 'labour', weekStart, num(activeRestaurant?.labour_cost_target))

    function pctColour(pct) {
        if (pct == null) return 'text-gray-400'
        if (!target) return 'text-gray-900'
        if (pct <= target) return 'text-green-700'
        if (pct <= target + 2) return 'text-amber-600'
        return 'text-red-600'
    }

    // ---- saving ----------------------------------------------------------

    async function handleSave() {
        setError(''); setSuccess('')
        setSaving(true)

        const toInsert = []
        const toUpdate = []

        for (const date of dates) {
            const day = days[date]
            if (!day) continue

            const hasValue = day.hours !== '' || day.staff !== '' || day.notes !== ''
            if (!hasValue && !day.id) continue

            // labour_cost is left out on purpose: Postgres generates it.
            const payload = {
                restaurant_id: restaurantId,
                entry_date: date,
                staff_count: day.staff === '' ? null : parseInt(day.staff, 10),
                total_hours: num(day.hours),
                hourly_rate: day.rate ?? currentRate,
                notes: day.notes.trim() || null,
                created_by: user.id,
            }

            if (day.id) toUpdate.push({ id: day.id, payload })
            else toInsert.push(payload)
        }

        if (toInsert.length > 0) {
            const { error: e1 } = await supabase.from('labour_entries').insert(toInsert)
            if (e1) { setError(friendlyError(e1)); setSaving(false); return }
        }
        for (const u of toUpdate) {
            const { error: e2 } = await supabase.from('labour_entries').update(u.payload).eq('id', u.id)
            if (e2) { setError(friendlyError(e2)); setSaving(false); return }
        }

        setSaving(false)
        setDirty(false)
        const changed = toInsert.length + toUpdate.length

        // Reload so new rows pick up their ids and their generated cost.
        setRefresh(n => n + 1)
        setSuccess(changed === 0 ? 'Nothing to save.' : `Saved ${changed} ${changed === 1 ? 'day' : 'days'}.`)
    }

    // Same rule as the weekly sales grid: a white box means you can type in it,
    // a grey fill means it was worked out for you. Hours and People are typed,
    // Labour, Net sales and Labour % are all calculated.
    const inputCls = 'w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-right bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent'
    const calcCellCls = 'px-3 py-2 text-right bg-gray-50'

    if (loading && Object.keys(days).length === 0) {
        return <div><p className="text-sm text-gray-400">Loading...</p></div>
    }

    return (
        <PageContainer>
            <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Labour</h2>
                <p className="text-sm text-gray-500 mt-1">
                    {activeRestaurant?.name} · hours and cost, Sunday to Saturday
                </p>
            </div>

            {/* Phone only. There is no one-day version of this page to send you
                to, the way weekly sales has, so this just says what to expect
                rather than offering a way out. */}
            <div className="md:hidden bg-blue-50 text-blue-800 text-sm rounded-lg p-3 mb-4">
                This page is meant for a computer. It works fine on a phone, but the week is seven rows of hours and
                cost, so you have to scroll sideways to reach the cost column.
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {!currentRate && (
                <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 mb-4">
                    No hourly rate is set for this restaurant, so labour cost will come out as zero.
                    Set it in Restaurant settings first.
                </div>
            )}

            {/* Week navigation */}
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
                        {/* A set width on a wide screen, so the arrows do not
                            shift sideways when the text changes length: 3 Aug -
                            9 Aug is a lot narrower than 31 Aug - 6 Sept, and
                            clicking back through weeks moved the button out from
                            under the mouse. On a phone the arrows are pinned to
                            the edges instead, so they cannot move whatever the
                            date says, and the text takes the room between. */}
                        <span className="text-sm font-medium text-gray-900 text-center whitespace-nowrap sm:w-44">
                            {shortDate(dates[0])} - {shortDate(dates[6])}
                        </span>
                    </DateStepper>

                    {dirty && <span className="text-xs text-amber-600 font-medium ml-2">Unsaved changes</span>}

                    <input
                        type="date"
                        value={pickerDate}
                        onChange={e => {
                            const v = e.target.value
                            if (!v) return
                            setPickerDate(v)
                            setWeekStart(weekStartOf(v))
                        }}
                        className={`w-full sm:w-auto sm:ml-auto ${dateField}`}
                        aria-label="Jump to week"
                    />
                </div>
            </div>

            {/* The week */}
            <div className={`${card} overflow-hidden mb-4`}>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead>
                            <tr className={tableHeadRow}>
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Day</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Hours</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">People</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Labour</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Net sales</th>
                                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Labour %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dates.map((d, i) => {
                                const net = netSalesFor(d)
                                const closed = sales[d]?.is_closed
                                const pct = pctFor(d)
                                return (
                                    <tr key={d} className="border-b border-border">
                                        <td className="px-3 py-2">
                                            <div className="text-gray-900">{DAY_NAMES[i]}</div>
                                            <div className="text-xs text-gray-400">{fullDate(d)}</div>
                                        </td>
                                        <td className="px-2 py-2">
                                            <input {...numberField({
                                                value: days[d]?.hours,
                                                onChange: v => setField(d, 'hours', v),
                                            })}
                                                className={inputCls} placeholder="0" />
                                        </td>
                                        <td className="px-2 py-2">
                                            <input {...numberField({
                                                value: days[d]?.staff,
                                                onChange: v => setField(d, 'staff', v),
                                                whole: true,
                                            })}
                                                className={inputCls} placeholder="0" />
                                        </td>
                                        <td className={`${calcCellCls} text-gray-700`}>{fmtMoney(costFor(d))}</td>
                                        <td className={calcCellCls}>
                                            {closed
                                                ? <span className="text-gray-400 text-xs">Closed</span>
                                                : net == null
                                                    ? <span className="text-amber-600 text-xs">No sales entered</span>
                                                    : <span className="text-gray-700">{fmtMoney(net)}</span>}
                                        </td>
                                        <td className={`${calcCellCls} font-medium ${pctColour(pct)}`}>
                                            {pct == null ? '-' : `${pct.toFixed(1)}%`}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-border bg-gray-50">
                                <td className="px-3 py-3 font-semibold text-gray-900">Week</td>
                                <td className="px-3 py-3 text-right font-semibold text-gray-900">{fmtQty(weekHours)}</td>
                                {/* No total for people: the same person works most
                                    days, so adding the daily counts is meaningless. */}
                                <td className="px-3 py-3 text-right text-gray-400">-</td>
                                <td className="px-3 py-3 text-right font-semibold text-gray-900">{fmtMoney(weekCost)}</td>
                                <td className="px-3 py-3 text-right font-semibold text-gray-900">{fmtMoney(weekNet)}</td>
                                <td className={`px-3 py-3 text-right font-semibold ${pctColour(weekPct)}`}>
                                    {weekPct == null ? '-' : `${weekPct.toFixed(1)}%`}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">
                People is a head count of who worked that day, not how many were on at once. It does not feed the
                cost, which is hours times the hourly rate of {fmtMoney(currentRate)}.
                {target
                    ? ` The labour target for the week of ${fullDate(weekStart)} is ${target}% of net sales.`
                    : ''}
            </p>

            <div className="flex justify-end">
                <button onClick={handleSave} disabled={saving}
                    className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save week'}
                </button>
            </div>
        </PageContainer>
    )
}