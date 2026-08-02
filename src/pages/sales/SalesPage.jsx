import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { RECEIPT_ROWS, resolveRowOrder } from './WeeklySalesPage'
import { todayISO, addDays } from '../../lib/dates'

// Threshold above which the reconciliation is flagged for review.
const VARIANCE_WARN_THRESHOLD = 10

// TWO RECORDS, DELIBERATELY SEPARATE
// The till receipt block (gross, net, cash, card, kiosk, Online Sales, Outside
// Catering) is entered directly and is the only block that reconciles, because
// it is what the POS prints and what can be checked at close. The platform
// figures below are a separate tracking record: platforms report commission and
// VAT inconsistently, so forcing them to agree with the receipt would produce a
// permanent false error. The difference is shown as information instead.
// This matches the weekly grid exactly, so both screens mean the same thing by
// the same columns.
//
// NOTE ON CASH RECONCILIATION
// Cash drawer handling (start float, end float, cash banked, petty cash) is
// deliberately not exposed. The business is changing how it handles the cash
// sheet and cash flow, so that work is deferred. The supporting schema is left
// in place (petty_cash_entries, sales_records.cash_banked) so it can be
// re-enabled without a migration. "Cash" below is a payment method.

// Parse a money input string to a number, treating blank as 0.
function num(v) {
    if (v === '' || v == null) return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
}

export default function SalesPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    // On a wide screen the week grid is the more useful default, so send the
    // user there unless they explicitly asked for the day view (?view=day) or
    // previously chose one. The choice is remembered so this never fights them.
    useEffect(() => {
        const requested = searchParams.get('view')
        if (requested) {
            localStorage.setItem('salesView', requested)
            return
        }
        const remembered = localStorage.getItem('salesView')
        const preferWeek = remembered ? remembered === 'week' : window.innerWidth >= 1024
        if (preferWeek) navigate('/sales/weekly', { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const [saleDate, setSaleDate] = useState(todayISO())
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // Id of the existing record for this date, if any. Drives insert vs update.
    const [recordId, setRecordId] = useState(null)

    // Marks a non-trading day. Closed days are excluded from per-day averages.
    const [isClosed, setIsClosed] = useState(false)

    const [platforms, setPlatforms] = useState([])

    // Receipt values, keyed the same way as the weekly grid.
    const [values, setValues] = useState({
        gross: '', net: '', cash: '', card: '', kiosk: '',
        onlineSales: '', cateringSales: '',
    })
    const [staffFood, setStaffFood] = useState('')

    // Per-platform amounts, keyed by platform name: { Deliveroo: "120.50" }
    const [platformSales, setPlatformSales] = useState({})

    const restaurantId = activeRestaurant?.id

    // Receipt row order, configurable per restaurant in Restaurant settings.
    // Shared with the weekly grid so both screens present the same sequence.
    const receiptRows = resolveRowOrder(activeRestaurant?.sales_row_order)

    useEffect(() => {
        if (restaurantId) loadDay()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, saleDate])

    async function loadDay() {
        setLoading(true)
        setError('')
        setSuccess('')

        const { data: plats, error: pErr } = await supabase
            .from('sales_platforms')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)

        if (pErr) { setError(pErr.message); setLoading(false); return }

        // Sort by the manager-defined order, falling back to alphabetical.
        const sortedPlats = (plats || []).sort(
            (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
        )
        setPlatforms(sortedPlats)

        const { data: rec, error: rErr } = await supabase
            .from('sales_records')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('sale_date', saleDate)
            .maybeSingle()

        if (rErr) { setError(rErr.message); setLoading(false); return }

        if (rec) {
            setRecordId(rec.id)
            setIsClosed(rec.is_closed || false)
            setValues({
                gross: rec.gross_sales != null ? String(rec.gross_sales) : '',
                net: rec.net_sales != null ? String(rec.net_sales) : '',
                cash: rec.cash_sales != null ? String(rec.cash_sales) : '',
                card: rec.card_sales != null ? String(rec.card_sales) : '',
                kiosk: rec.kiosk_sales != null ? String(rec.kiosk_sales) : '',
                onlineSales: rec.online_sales != null ? String(rec.online_sales) : '',
                cateringSales: rec.catering_sales != null ? String(rec.catering_sales) : '',
            })
            setStaffFood(rec.staff_food != null ? String(rec.staff_food) : '')

            const ps = {}
            if (rec.platform_sales && typeof rec.platform_sales === 'object') {
                for (const [k, v] of Object.entries(rec.platform_sales)) ps[k] = String(v)
            }
            setPlatformSales(ps)
        } else {
            setRecordId(null)
            setIsClosed(false)
            setValues({ gross: '', net: '', cash: '', card: '', kiosk: '', onlineSales: '', cateringSales: '' })
            setStaffFood('')
            setPlatformSales({})
        }

        setLoading(false)
    }

    function setValue(key, v) {
        setValues(prev => ({ ...prev, [key]: v }))
    }

    function setPlatformAmount(name, value) {
        setPlatformSales(prev => ({ ...prev, [name]: value }))
    }

    function shiftDate(days) {
        setSaleDate(addDays(saleDate, days))
    }

    // ---- derived values -------------------------------------------------

    const onlinePlatforms = platforms.filter(p => p.bucket === 'online_platform')
    const cateringPlatforms = platforms.filter(p => p.bucket === 'catering')

    // Sum of the tracking rows for a bucket, compared against the receipt figure
    // for information only.
    function platformSum(bucketPlatforms) {
        return bucketPlatforms.reduce((sum, p) => sum + num(platformSales[p.name]), 0)
    }

    // Reconciliation uses only the till receipt block.
    const variance =
        num(values.cash) + num(values.card) + num(values.kiosk)
        + num(values.onlineSales) + num(values.cateringSales)
        - num(values.gross)
    const varianceWarn = Math.abs(variance) > VARIANCE_WARN_THRESHOLD

    const gross = num(values.gross)
    function pctOfGross(amount) {
        return gross > 0 ? (amount / gross) * 100 : 0
    }

    // ---- saving ---------------------------------------------------------

    async function handleSave() {
        setError(''); setSuccess('')

        // One record per date per restaurant, so confirm before replacing one.
        if (recordId) {
            const ok = window.confirm(`A sales record already exists for ${saleDate}. Overwrite it?`)
            if (!ok) return
        }

        setSaving(true)

        // Only store platforms that actually have a value, to keep the JSONB tidy.
        const ps = {}
        for (const p of platforms) {
            const v = num(platformSales[p.name])
            if (v !== 0) ps[p.name] = v
        }

        const base = {
            restaurant_id: restaurantId,
            sale_date: saleDate,
            upload_method: 'manual',
            created_by: user.id,
        }

        // Cash drawer fields are omitted; those columns keep their defaults.
        const payload = isClosed
            ? {
                ...base,
                is_closed: true,
                gross_sales: 0, net_sales: 0, cash_sales: 0, card_sales: 0, kiosk_sales: 0,
                online_sales: 0, catering_sales: 0, platform_sales: {},
                staff_food: 0, instore_variance: 0,
            }
            : {
                ...base,
                is_closed: false,
                gross_sales: num(values.gross),
                net_sales: num(values.net),
                cash_sales: num(values.cash),
                card_sales: num(values.card),
                kiosk_sales: num(values.kiosk),
                // Receipt figures, entered directly rather than derived.
                online_sales: num(values.onlineSales),
                catering_sales: num(values.cateringSales),
                // Tracking detail, not required to match the two above.
                platform_sales: ps,
                staff_food: num(staffFood),
                instore_variance: variance,
            }

        let resErr
        if (recordId) {
            const { error: e1 } = await supabase.from('sales_records').update(payload).eq('id', recordId)
            resErr = e1
        } else {
            const { error: e1 } = await supabase.from('sales_records').insert(payload)
            resErr = e1
        }

        setSaving(false)
        if (resErr) { setError(resErr.message); return }
        setSuccess(isClosed ? `${saleDate} marked as closed.` : `Sales for ${saleDate} saved.`)
        loadDay()
    }

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    // One bucket of tracking platforms, with the gap against the receipt figure.
    function trackingBucket(title, bucketPlatforms, receiptKey) {
        if (bucketPlatforms.length === 0) return null
        const sum = platformSum(bucketPlatforms)
        const gap = sum - num(values[receiptKey])
        return (
            <div className="bg-white rounded-xl border border-border p-5 mb-3">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-accent">
                        {title}
                        <span className="text-xs text-gray-400 font-normal ml-2">tracking only</span>
                    </h3>
                    <span className="text-sm text-gray-500">
                        total: <span className="font-semibold text-gray-900">{fmtMoney(sum)}</span>
                        <span className="ml-2 text-gray-400">({pctOfGross(sum).toFixed(1)}% of sales)</span>
                    </span>
                </div>
                {Math.abs(gap) >= 0.01 && (
                    <p className="text-xs text-amber-600 mb-3">
                        {gap > 0 ? '+' : ''}{fmtMoney(gap)} against the receipt figure. Expected: platforms report
                        commission and VAT differently.
                    </p>
                )}
                <div className="grid grid-cols-3 gap-3 mt-3">
                    {bucketPlatforms.map(p => (
                        <div key={p.id}>
                            <label className={labelCls}>{p.name}</label>
                            <input
                                type="number" step="0.01" inputMode="decimal"
                                value={platformSales[p.name] ?? ''}
                                onChange={e => setPlatformAmount(p.name, e.target.value)}
                                className={fieldCls}
                                placeholder="0.00"
                            />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (loading) {
        return <div className="max-w-2xl"><p className="text-sm text-gray-400">Loading...</p></div>
    }

    return (
        <div className="max-w-2xl">
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Daily sales</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name} · one record per day</p>
                </div>
                {/* Switch to the whole-week grid, better suited to a laptop */}
                <button
                    onClick={() => {
                        localStorage.setItem('salesView', 'week')
                        navigate('/sales/weekly')
                    }}
                    className="px-3 py-2 border border-border rounded-lg text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                >
                    Week view
                </button>
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {/* Date selector */}
            <div className="bg-white rounded-xl border border-border p-4 mb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => shiftDate(-1)} className="px-2 py-1.5 border border-border rounded-lg text-gray-600 hover:bg-gray-50" aria-label="Previous day">‹</button>
                        <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
                        <button type="button" onClick={() => shiftDate(1)} className="px-2 py-1.5 border border-border rounded-lg text-gray-600 hover:bg-gray-50" aria-label="Next day">›</button>
                        <button type="button" onClick={() => setSaleDate(todayISO())} className="ml-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium">Today</button>
                    </div>
                    {recordId && <span className="text-xs text-amber-600 font-medium">Existing record</span>}
                </div>
            </div>

            {/* Non-trading day */}
            <div className="bg-white rounded-xl border border-border p-4 mb-3">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isClosed}
                        onChange={e => setIsClosed(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <div>
                        <span className="text-sm font-medium text-gray-900">Store was closed this day</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Marks the day as not trading. Closed days are excluded from daily averages.
                        </p>
                    </div>
                </label>
            </div>

            {/* Everything below is irrelevant on a closed day, so it is hidden. */}
            {!isClosed && (
                <>
                    {/* Till receipt block, in the order set in Restaurant settings */}
                    <div className="bg-white rounded-xl border border-border p-5 mb-3">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Till receipt</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {receiptRows.map(row => (
                                <div key={row.key}>
                                    <label className={labelCls}>{row.label}</label>
                                    <input
                                        type="number" step="0.01" inputMode="decimal"
                                        value={values[row.key] ?? ''}
                                        onChange={e => setValue(row.key, e.target.value)}
                                        className={fieldCls}
                                        placeholder="0.00"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Reconciliation closes the receipt block */}
                    <div className={`rounded-xl p-4 mb-3 ${varianceWarn ? 'bg-red-50' : 'bg-green-50'}`}>
                        <div className={`text-xs mb-1 ${varianceWarn ? 'text-red-600' : 'text-green-700'}`}>Reconciliation</div>
                        <div className={`text-xl font-semibold ${varianceWarn ? 'text-red-700' : 'text-green-700'}`}>{fmtMoney(variance)}</div>
                        <div className={`text-xs mt-1 ${varianceWarn ? 'text-red-600' : 'text-green-700'}`}>
                            {varianceWarn
                                ? `Over €${VARIANCE_WARN_THRESHOLD} — check the figures`
                                : 'cash + card + kiosk + online + catering − gross'}
                        </div>
                    </div>

                    {/* Platform detail, outside the reconciliation */}
                    {trackingBucket('Online Platform', onlinePlatforms, 'onlineSales')}
                    {trackingBucket('Catering', cateringPlatforms, 'cateringSales')}

                    <div className="bg-white rounded-xl border border-border p-5 mb-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Staff food</label>
                                <input
                                    type="number" step="0.01" inputMode="decimal"
                                    value={staffFood}
                                    onChange={e => setStaffFood(e.target.value)}
                                    className={fieldCls}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}

            <div className="flex justify-end">
                <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                    {saving
                        ? 'Saving...'
                        : isClosed
                            ? (recordId ? 'Update as closed' : 'Mark day closed')
                            : (recordId ? 'Update day' : 'Save day')}
                </button>
            </div>
        </div>
    )
}
