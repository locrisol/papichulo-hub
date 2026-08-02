import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'

// Week entry grid: metrics as rows, days as columns, mirroring the layout the
// business already uses in its weekly spreadsheet. Rows scale as platforms are
// added or removed, which a day-per-column layout would not.
//
// TWO RECORDS, DELIBERATELY SEPARATE
// The top block is the till receipt: gross, net, cash, card, kiosk, one Online
// Sales figure and one Outside Catering figure. That block is what reconciles,
// because it is what the POS prints and what can be checked at close.
// The platform rows below are a separate tracking record. They will not tie out
// exactly against the receipt: some platforms report before commission, some
// after, some include VAT and some do not. Forcing them to agree would produce
// a permanent false error, so the difference is shown as information only and
// never counted as a reconciliation failure.
//
// Cash reconciliation (floats, cash banked, petty cash) is deliberately absent
// here, as it is in the day form: the business is changing how it handles cash.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const VARIANCE_WARN_THRESHOLD = 10

// Format a Date as YYYY-MM-DD using local time. Do not use toISOString here:
// it converts to UTC, so local midnight becomes the previous day in any
// timezone ahead of UTC, which silently shifts every date back by one.
function toISODate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function todayISO() {
    return toISODate(new Date())
}

// The Sunday that starts the week containing the given date.
function weekStartOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() - d.getDay())
    return toISODate(d)
}

// The seven dates, Sunday through Saturday, for a week starting at weekStart.
function weekDates(weekStart) {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart + 'T00:00:00')
        d.setDate(d.getDate() + i)
        return toISODate(d)
    })
}

function shortDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })
}

function num(v) {
    if (v === '' || v == null) return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
}

// Key under which an unsaved week is kept in local storage.
function draftKey(restaurantId, weekStart) {
    return `salesWeekDraft:${restaurantId}:${weekStart}`
}

// Fields compared when deciding whether a draft genuinely differs from what is
// already stored. A draft matching the database is not an unsaved change.
const DRAFT_FIELDS = ['gross', 'net', 'cash', 'card', 'kiosk', 'onlineSales', 'cateringSales', 'staffFood']

function sameDay(a, b) {
    if (!a || !b) return false
    if ((a.isClosed ?? false) !== (b.isClosed ?? false)) return false
    for (const f of DRAFT_FIELDS) {
        if (num(a[f]) !== num(b[f])) return false
    }
    const names = new Set([
        ...Object.keys(a.platformValues || {}),
        ...Object.keys(b.platformValues || {}),
    ])
    for (const n of names) {
        if (num(a.platformValues?.[n]) !== num(b.platformValues?.[n])) return false
    }
    return true
}

// The till receipt rows, in their default order. Exported so Restaurant settings
// can offer the same list when arranging them. Platform rows are not here: they
// are ordered by sales_platforms.sort_order.
export const RECEIPT_ROWS = [
    { key: 'gross', label: 'Gross sales', bold: true },
    { key: 'net', label: 'Net sales', bold: true },
    { key: 'cash', label: 'Cash' },
    { key: 'card', label: 'Card' },
    { key: 'kiosk', label: 'Kiosk' },
    { key: 'onlineSales', label: 'Online Sales' },
    { key: 'cateringSales', label: 'Outside Catering' },
]

// Turns a stored order into a usable one. The stored value is a preference, not
// a contract: unknown keys are dropped and missing rows appended in default
// order, so changing the field set later cannot leave a manager with a broken grid.
export function resolveRowOrder(storedOrder) {
    const byKey = new Map(RECEIPT_ROWS.map(r => [r.key, r]))
    const out = []
    if (Array.isArray(storedOrder)) {
        for (const key of storedOrder) {
            if (byKey.has(key)) {
                out.push(byKey.get(key))
                byKey.delete(key)
            }
        }
    }
    for (const r of RECEIPT_ROWS) {
        if (byKey.has(r.key)) out.push(r)
    }
    return out
}

export default function WeeklySalesPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    // Raw value of the week picker. Kept separate from weekStart so choosing a
    // Wednesday does not rewrite the input to Sunday while the picker is open.
    const [pickerDate, setPickerDate] = useState(weekStart)

    const [platforms, setPlatforms] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // True once something has been edited but not yet saved.
    const [dirty, setDirty] = useState(false)

    // Working copy of the week, keyed by date.
    const [days, setDays] = useState({})

    // Which restaurant and week `days` currently holds. Guards against reloading
    // (and so discarding unsaved edits) when nothing has actually changed.
    const loadedKey = useRef(null)

    const dates = weekDates(weekStart)
    const restaurantId = activeRestaurant?.id

    // Depend on the id, not the object: the context can return a new object for
    // the same restaurant, which would re-run this and wipe anything typed.
    useEffect(() => {
        if (!restaurantId) return
        const key = `${restaurantId}:${weekStart}`
        if (loadedKey.current === key) return
        loadWeek(key)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId, weekStart])

    // Keep a local draft of anything unsaved. Guarded by loadedKey: when the week
    // changes, weekStart updates before loadWeek replaces `days`, so without this
    // check the previous week's figures get written under the new week's key.
    useEffect(() => {
        if (!dirty || !restaurantId) return
        const key = `${restaurantId}:${weekStart}`
        if (loadedKey.current !== key) return
        try {
            localStorage.setItem(draftKey(restaurantId, weekStart), JSON.stringify(days))
        } catch {
            // Storage may be full or blocked; a failed draft must not break entry.
        }
    }, [days, dirty, restaurantId, weekStart])

    // Warn before leaving with unsaved changes.
    useEffect(() => {
        function onBeforeUnload(e) {
            if (!dirty) return
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [dirty])

    async function loadWeek(key) {
        setLoading(true)
        setError('')
        setSuccess('')

        const { data: plats, error: pErr } = await supabase
            .from('sales_platforms')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true)

        if (pErr) { setError(pErr.message); setLoading(false); return }

        const sortedPlats = (plats || []).sort(
            (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
        )
        setPlatforms(sortedPlats)

        const { data: recs, error: rErr } = await supabase
            .from('sales_records')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .gte('sale_date', dates[0])
            .lte('sale_date', dates[6])

        if (rErr) { setError(rErr.message); setLoading(false); return }

        const byDate = {}
        for (const r of recs || []) byDate[r.sale_date] = r

        const next = {}
        for (const d of dates) {
            const r = byDate[d]
            const platformValues = {}
            if (r?.platform_sales && typeof r.platform_sales === 'object') {
                for (const [k, v] of Object.entries(r.platform_sales)) platformValues[k] = String(v)
            }
            next[d] = {
                id: r?.id ?? null,
                isClosed: r?.is_closed ?? false,
                gross: r?.gross_sales != null ? String(r.gross_sales) : '',
                net: r?.net_sales != null ? String(r.net_sales) : '',
                cash: r?.cash_sales != null ? String(r.cash_sales) : '',
                card: r?.card_sales != null ? String(r.card_sales) : '',
                kiosk: r?.kiosk_sales != null ? String(r.kiosk_sales) : '',
                // Both taken straight from the till receipt, not derived.
                onlineSales: r?.online_sales != null ? String(r.online_sales) : '',
                cateringSales: r?.catering_sales != null ? String(r.catering_sales) : '',
                staffFood: r?.staff_food != null ? String(r.staff_food) : '',
                platformValues,
            }
        }

        // A draft only counts if it actually differs from the database. Anything
        // matching what is already stored is discarded rather than reported as
        // an unsaved change.
        let restored = false
        try {
            const raw = localStorage.getItem(draftKey(restaurantId, weekStart))
            if (raw) {
                const draft = JSON.parse(raw)
                for (const d of dates) {
                    if (!draft[d]) continue
                    const merged = { ...next[d], ...draft[d], id: next[d].id }
                    if (sameDay(merged, next[d])) continue
                    next[d] = merged
                    restored = true
                }
                if (!restored) localStorage.removeItem(draftKey(restaurantId, weekStart))
            }
        } catch {
            localStorage.removeItem(draftKey(restaurantId, weekStart))
        }

        setDays(next)
        setDirty(restored)
        if (restored) setSuccess('Restored unsaved changes from this device.')
        loadedKey.current = key
        setLoading(false)
    }

    function setField(date, field, value) {
        setDirty(true)
        setDays(prev => ({ ...prev, [date]: { ...prev[date], [field]: value } }))
    }

    function setPlatformValue(date, platformName, value) {
        setDirty(true)
        setDays(prev => ({
            ...prev,
            [date]: {
                ...prev[date],
                platformValues: { ...prev[date].platformValues, [platformName]: value },
            },
        }))
    }

    function toggleClosed(date) {
        setDirty(true)
        setDays(prev => ({ ...prev, [date]: { ...prev[date], isClosed: !prev[date].isClosed } }))
    }

    // Changing week discards nothing, but the user should know the current week
    // has not been written to the database yet.
    function goToWeek(newStart) {
        setWeekStart(newStart)
        setPickerDate(newStart)
    }

    function shiftWeek(weeks) {
        const d = new Date(weekStart + 'T00:00:00')
        d.setDate(d.getDate() + weeks * 7)
        goToWeek(toISODate(d))
    }

    // ---- derived values -------------------------------------------------

    const onlinePlatforms = platforms.filter(p => p.bucket === 'online_platform')
    const cateringPlatforms = platforms.filter(p => p.bucket === 'catering')

    // Sum of the tracking rows for a bucket, compared against the receipt figure
    // for information only.
    function platformSumFor(date, bucketPlatforms) {
        const day = days[date]
        if (!day || day.isClosed) return 0
        return bucketPlatforms.reduce((sum, p) => sum + num(day.platformValues?.[p.name]), 0)
    }

    // Reconciliation uses only the till receipt block.
    function varianceFor(date) {
        const day = days[date]
        if (!day || day.isClosed) return 0
        return num(day.cash) + num(day.card) + num(day.kiosk)
            + num(day.onlineSales) + num(day.cateringSales)
            - num(day.gross)
    }

    function weekTotal(field) {
        return dates.reduce((sum, d) => {
            const day = days[d]
            if (!day || day.isClosed) return sum
            return sum + num(day[field])
        }, 0)
    }

    function weekPlatformSum(bucketPlatforms) {
        return dates.reduce((sum, d) => sum + platformSumFor(d, bucketPlatforms), 0)
    }

    function weekPlatformTotal(platformName) {
        return dates.reduce((sum, d) => {
            const day = days[d]
            if (!day || day.isClosed) return sum
            return sum + num(day.platformValues?.[platformName])
        }, 0)
    }

    const weekGross = weekTotal('gross')

    // Receipt row order, configurable per restaurant in Restaurant settings.
    const receiptRows = resolveRowOrder(activeRestaurant?.sales_row_order)

    function pctOfGross(amount, grossAmount) {
        return grossAmount > 0 ? (amount / grossAmount) * 100 : 0
    }

    // ---- saving ---------------------------------------------------------

    async function handleSaveWeek() {
        setError(''); setSuccess('')
        setSaving(true)

        const toInsert = []
        const toUpdate = []

        for (const date of dates) {
            const day = days[date]
            if (!day) continue

            const hasAnyValue =
                day.gross !== '' || day.net !== '' || day.cash !== '' ||
                day.card !== '' || day.kiosk !== '' || day.onlineSales !== '' ||
                day.cateringSales !== '' || day.staffFood !== '' ||
                Object.values(day.platformValues || {}).some(v => v !== '' && v != null)

            // Nothing entered and nothing stored: leave this day alone.
            if (!hasAnyValue && !day.isClosed && !day.id) continue

            const platformSales = {}
            if (!day.isClosed) {
                for (const p of platforms) {
                    const v = num(day.platformValues?.[p.name])
                    if (v !== 0) platformSales[p.name] = v
                }
            }

            const base = {
                restaurant_id: restaurantId,
                sale_date: date,
                upload_method: 'manual',
                created_by: user.id,
            }

            const payload = day.isClosed
                ? {
                    ...base,
                    is_closed: true,
                    gross_sales: 0, net_sales: 0, cash_sales: 0, card_sales: 0,
                    kiosk_sales: 0, online_sales: 0, catering_sales: 0,
                    platform_sales: {}, staff_food: 0, instore_variance: 0,
                }
                : {
                    ...base,
                    is_closed: false,
                    gross_sales: num(day.gross),
                    net_sales: num(day.net),
                    cash_sales: num(day.cash),
                    card_sales: num(day.card),
                    kiosk_sales: num(day.kiosk),
                    // Receipt figures, entered directly rather than derived.
                    online_sales: num(day.onlineSales),
                    catering_sales: num(day.cateringSales),
                    // Tracking detail, not required to match the two above.
                    platform_sales: platformSales,
                    staff_food: num(day.staffFood),
                    instore_variance: varianceFor(date),
                }

            if (day.id) toUpdate.push({ id: day.id, payload })
            else toInsert.push(payload)
        }

        if (toInsert.length > 0) {
            const { error: e1 } = await supabase.from('sales_records').insert(toInsert)
            if (e1) { setError(e1.message); setSaving(false); return }
        }
        for (const u of toUpdate) {
            const { error: e2 } = await supabase.from('sales_records').update(u.payload).eq('id', u.id)
            if (e2) { setError(e2.message); setSaving(false); return }
        }

        // The database now matches the screen, so the draft is no longer needed.
        try {
            localStorage.removeItem(draftKey(restaurantId, weekStart))
        } catch {
            // Failing to clear a draft is harmless.
        }

        setSaving(false)
        setDirty(false)
        const changed = toInsert.length + toUpdate.length

        // Force a real reload so ids for newly inserted days are picked up.
        loadedKey.current = null
        await loadWeek(`${restaurantId}:${weekStart}`)
        setSuccess(changed === 0 ? 'Nothing to save.' : `Saved ${changed} ${changed === 1 ? 'day' : 'days'}.`)
    }

    // ---- keyboard -------------------------------------------------------

    // Tab normally moves across the row. In a grid like this it is more natural
    // to move down the same day's column, so jump to the next input carrying the
    // same data-col value. Shift+Tab goes back up.
    function handleGridKeyDown(e) {
        if (e.key !== 'Tab') return
        const col = e.target.dataset?.col
        if (col == null) return

        e.preventDefault()
        const colInputs = Array.from(
            document.querySelectorAll(`input[data-col="${col}"]:not([disabled])`)
        )
        const i = colInputs.indexOf(e.target)
        const next = e.shiftKey ? colInputs[i - 1] : colInputs[i + 1]
        if (next) {
            next.focus()
            next.select()
        }
    }

    // ---- rendering helpers ----------------------------------------------

    const inputCls =
        'w-full border border-border rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent bg-white disabled:bg-gray-100 disabled:text-gray-400'
    const labelCellCls = 'px-3 py-2 text-sm text-gray-700 whitespace-nowrap sticky left-0 bg-white z-10'
    const totalCellCls = 'px-3 py-2 text-sm font-semibold text-gray-900 text-right whitespace-nowrap'

    // Called as functions rather than rendered as components, so React keeps the
    // same DOM nodes between renders and inputs do not lose focus while typing.
    function fieldRow({ label, field, bold, key }) {
        return (
            <tr key={key} className="border-b border-border">
                <td className={`${labelCellCls} ${bold ? 'font-semibold' : ''}`}>{label}</td>
                {dates.map((d, i) => (
                    <td key={d} className="px-1.5 py-1.5">
                        <input
                            type="number" step="0.01" inputMode="decimal"
                            data-col={i}
                            value={days[d]?.[field] ?? ''}
                            disabled={days[d]?.isClosed}
                            onChange={e => setField(d, field, e.target.value)}
                            className={inputCls}
                            placeholder="0.00"
                        />
                    </td>
                ))}
                <td className={totalCellCls}>{fmtMoney(weekTotal(field))}</td>
            </tr>
        )
    }

    function platformRow(platform) {
        return (
            <tr key={platform.id} className="border-b border-border">
                <td className={`${labelCellCls} pl-6 text-gray-600`}>{platform.name}</td>
                {dates.map((d, i) => (
                    <td key={d} className="px-1.5 py-1.5">
                        <input
                            type="number" step="0.01" inputMode="decimal"
                            data-col={i}
                            value={days[d]?.platformValues?.[platform.name] ?? ''}
                            disabled={days[d]?.isClosed}
                            onChange={e => setPlatformValue(d, platform.name, e.target.value)}
                            className={inputCls}
                            placeholder="0.00"
                        />
                    </td>
                ))}
                <td className={`${totalCellCls} font-normal text-gray-600`}>
                    {fmtMoney(weekPlatformTotal(platform.name))}
                </td>
            </tr>
        )
    }

    // Sum of the tracking rows, with the gap against the receipt figure beneath.
    // The gap is expected and informational, never an error.
    function platformSumRow({ label, bucketPlatforms, receiptField, key }) {
        const weekSum = weekPlatformSum(bucketPlatforms)
        const weekReceipt = weekTotal(receiptField)
        const weekGap = weekSum - weekReceipt

        return (
            <tr key={key} className="border-b border-border bg-gray-50">
                <td className={`${labelCellCls} font-semibold bg-gray-50`}>{label} tracked</td>
                {dates.map(d => {
                    const day = days[d]
                    const sum = platformSumFor(d, bucketPlatforms)
                    const gap = sum - num(day?.[receiptField])
                    const showGap = !day?.isClosed && Math.abs(gap) >= 0.01
                    return (
                        <td key={d} className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="text-sm text-gray-900">{fmtMoney(sum)}</div>
                            {showGap && (
                                <div className="text-xs text-amber-600">
                                    {gap > 0 ? '+' : ''}{fmtMoney(gap)}
                                </div>
                            )}
                        </td>
                    )
                })}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">{fmtMoney(weekSum)}</div>
                    <div className="text-xs text-gray-400">{pctOfGross(weekSum, weekGross).toFixed(1)}% of sales</div>
                    {Math.abs(weekGap) >= 0.01 && (
                        <div className="text-xs text-amber-600">
                            {weekGap > 0 ? '+' : ''}{fmtMoney(weekGap)} vs receipt
                        </div>
                    )}
                </td>
            </tr>
        )
    }

    // Only blank the page on the very first load. On later week changes keep the
    // grid mounted, otherwise the date picker is unmounted mid-interaction.
    if (loading && Object.keys(days).length === 0) {
        return <div><p className="text-sm text-gray-400">Loading...</p></div>
    }

    return (
        <div>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Weekly sales</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {activeRestaurant?.name} · enter the whole week, Sunday to Saturday
                    </p>
                </div>
                {/* Switch to the single-day form, for phone use */}
                <button
                    onClick={() => navigate('/sales?view=day')}
                    className="px-3 py-2 border border-border rounded-lg text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                >
                    Day view
                </button>
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {/* Week navigation */}
            <div className="bg-white rounded-xl border border-border p-4 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => shiftWeek(-1)} className="px-2 py-1.5 border border-border rounded-lg text-gray-600 hover:bg-gray-50" aria-label="Previous week">‹</button>
                    <span className="text-sm font-medium text-gray-900 px-2">
                        {shortDate(dates[0])} - {shortDate(dates[6])}
                    </span>
                    <button type="button" onClick={() => shiftWeek(1)} className="px-2 py-1.5 border border-border rounded-lg text-gray-600 hover:bg-gray-50" aria-label="Next week">›</button>
                    <button type="button" onClick={() => goToWeek(weekStartOf(todayISO()))} className="ml-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium">This week</button>

                    {dirty && <span className="text-xs text-amber-600 font-medium ml-2">Unsaved changes</span>}

                    {/* Pick any date; it snaps to that week's Sunday */}
                    <input
                        type="date"
                        value={pickerDate}
                        onChange={e => {
                            const v = e.target.value
                            if (!v) return
                            setPickerDate(v)
                            goToWeek(weekStartOf(v))
                        }}
                        className="ml-auto border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        aria-label="Jump to week"
                    />
                </div>
            </div>

            {/* Fixed layout stops columns resizing as digits are typed. */}
            <div className="bg-white rounded-xl border border-border overflow-hidden mb-4">
                <div className="overflow-x-auto" onKeyDown={handleGridKeyDown}>
                    <table className="w-full min-w-[1000px] table-fixed">
                        <thead>
                            <tr className="border-b border-border bg-gray-50">
                                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 w-44">
                                    &nbsp;
                                </th>
                                {dates.map((d, i) => (
                                    <th key={d} className="px-1.5 py-2 text-center w-24">
                                        <div className="text-xs font-semibold text-gray-700">{DAY_NAMES[i]}</div>
                                        <div className="text-xs text-gray-400 font-normal">{shortDate(d)}</div>
                                    </th>
                                ))}
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Total</th>
                            </tr>

                            {/* Closed sits in the header: it is a property of the day */}
                            <tr className="border-b border-border bg-gray-50">
                                <td className="px-3 py-1.5 text-xs text-gray-500 sticky left-0 bg-gray-50 z-10">Closed</td>
                                {dates.map(d => (
                                    <td key={d} className="px-1.5 py-1.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={days[d]?.isClosed ?? false}
                                            onChange={() => toggleClosed(d)}
                                            className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                                            aria-label={`Mark ${d} as closed`}
                                        />
                                    </td>
                                ))}
                                <td></td>
                            </tr>
                        </thead>

                        <tbody>
                            {/* Till receipt block: this is what reconciles */}
                            {receiptRows.map(r => fieldRow({ key: r.key, label: r.label, field: r.key, bold: r.bold }))}

                            {/* Reconciliation closes the receipt block */}
                            <tr className="border-b-2 border-border bg-gray-50">
                                <td className={`${labelCellCls} font-semibold bg-gray-50`}>Reconciliation</td>
                                {dates.map(d => {
                                    const v = varianceFor(d)
                                    const warn = Math.abs(v) > VARIANCE_WARN_THRESHOLD
                                    const closed = days[d]?.isClosed
                                    return (
                                        <td key={d} className="px-3 py-2 text-right text-sm whitespace-nowrap">
                                            {closed
                                                ? <span className="text-gray-300">-</span>
                                                : <span className={warn ? 'text-red-600 font-semibold' : 'text-green-700'}>{fmtMoney(v)}</span>}
                                        </td>
                                    )
                                })}
                                <td></td>
                            </tr>

                            {/* Platform detail. Tracking only, outside the reconciliation. */}
                            {onlinePlatforms.length > 0 && (
                                <>
                                    <tr className="border-b border-border">
                                        <td colSpan={9} className="px-3 pt-4 pb-1 sticky left-0 bg-white">
                                            <span className="text-xs font-semibold text-accent uppercase tracking-wider">Online Platform</span>
                                            <span className="text-xs text-gray-400 ml-2">tracking only</span>
                                        </td>
                                    </tr>
                                    {onlinePlatforms.map(p => platformRow(p))}
                                    {platformSumRow({ key: 'onlineSum', label: 'Online', bucketPlatforms: onlinePlatforms, receiptField: 'onlineSales' })}
                                </>
                            )}

                            {cateringPlatforms.length > 0 && (
                                <>
                                    <tr className="border-b border-border">
                                        <td colSpan={9} className="px-3 pt-4 pb-1 sticky left-0 bg-white">
                                            <span className="text-xs font-semibold text-accent uppercase tracking-wider">Catering</span>
                                            <span className="text-xs text-gray-400 ml-2">tracking only</span>
                                        </td>
                                    </tr>
                                    {cateringPlatforms.map(p => platformRow(p))}
                                    {platformSumRow({ key: 'cateringSum', label: 'Catering', bucketPlatforms: cateringPlatforms, receiptField: 'cateringSales' })}
                                </>
                            )}

                            {fieldRow({ key: 'staffFood', label: 'Staff food', field: 'staffFood' })}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">
                Amber figures under the tracked rows show the difference against the till receipt. Platforms report
                commission and VAT differently, so a gap is expected and does not affect the reconciliation above.
            </p>

            <div className="flex justify-end">
                <button
                    onClick={handleSaveWeek}
                    disabled={saving}
                    className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save week'}
                </button>
            </div>
        </div>
    )
}
