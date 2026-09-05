import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { dayIsClosed, planNoteWrites, applyNoteWrites } from '../../lib/closedDays'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { tendersToShow, tenderVariance, mergeTenderSales, tenderValuesFromRecord, sameLabel, trackedCopy } from '../../lib/salesTenders'
import { numberField } from '../../lib/numberInput'
import { todayISO, addDays, fullDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { secondaryButton, card, dateField, jumpButton } from '../../lib/controlStyles'
import DateStepper from '../../components/DateStepper'
import { useConfirm } from '../../context/ConfirmContext'

// TWO RECORDS, DELIBERATELY SEPARATE
// The till receipt block (gross, net, and a row for every way the till takes
// money) is entered directly and is the only block that reconciles, because it
// is what the POS prints and what can be checked at close. Those rows come from
// sales_tenders rather than being fixed, so when the till changes a Super Admin
// edits them in Restaurant settings instead of us writing a migration. The platform
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
    const confirm = useConfirm()

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
    // The roster's word on this day, which decides the box above.
    const [dayNote, setDayNote] = useState(null)

    const [platforms, setPlatforms] = useState([])

    // Every tender for this restaurant, retired ones included, so an old day can
    // still show the rows it was entered with.
    const [tenders, setTenders] = useState([])

    // Gross and net only. Every other row on the receipt is a tender now.
    const [values, setValues] = useState({ gross: '', net: '' })

    // Tender amounts on screen, keyed by tender key, and what the database
    // actually holds. Both are kept because a save writes over the stored
    // figures rather than replacing them.
    const [tenderValues, setTenderValues] = useState({})
    const [storedTenders, setStoredTenders] = useState({})
    const [staffFood, setStaffFood] = useState('')

    // Per-platform amounts, keyed by platform name: { Deliveroo: "120.50" }
    const [platformSales, setPlatformSales] = useState({})

    const restaurantId = activeRestaurant?.id

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
            .order('sort_order')
            .order('name')

        if (pErr) { setError(friendlyError(pErr)); setLoading(false); return }

        // Not filtered by is_active: a day from March has to be able to show
        // Outside Catering, which it can only do if the retired row is here.
        const { data: tends, error: tErr } = await supabase
            .from('sales_tenders')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('sort_order')
            .order('label')

        if (tErr) { setError(friendlyError(tErr)); setLoading(false); return }
        setTenders(tends || [])

        // Sort by the manager-defined order, falling back to alphabetical.
        const sortedPlats = (plats || []).sort(
            (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
        )
        setPlatforms(sortedPlats)

        const { data: note } = await supabase
            .from('day_notes')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('note_date', saleDate)
            .maybeSingle()

        setDayNote(note || null)

        const { data: rec, error: rErr } = await supabase
            .from('sales_records')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('sale_date', saleDate)
            .maybeSingle()

        if (rErr) { setError(friendlyError(rErr)); setLoading(false); return }

        if (rec) {
            setRecordId(rec.id)
            setIsClosed(dayIsClosed(note, rec))
            setValues({
                gross: rec.gross_sales != null ? String(rec.gross_sales) : '',
                net: rec.net_sales != null ? String(rec.net_sales) : '',
            })
            setTenderValues(tenderValuesFromRecord(rec.tender_sales))
            setStoredTenders(rec.tender_sales ?? {})
            setStaffFood(rec.staff_food != null ? String(rec.staff_food) : '')

            const ps = {}
            if (rec.platform_sales && typeof rec.platform_sales === 'object') {
                for (const [k, v] of Object.entries(rec.platform_sales)) ps[k] = String(v)
            }
            setPlatformSales(ps)
        } else {
            setIsClosed(dayIsClosed(note, null))
            setRecordId(null)
            setIsClosed(false)
            setValues({ gross: '', net: '' })
            setTenderValues({})
            setStoredTenders({})
            setStaffFood('')
            setPlatformSales({})
        }

        setLoading(false)
    }

    function setValue(key, v) {
        setValues(prev => ({ ...prev, [key]: v }))
    }

    // Same as the weekly grid: a till figure fills the Corporate tracking row
    // of the same name, and stops as soon as that row is given its own figure.
    function setTenderValue(key, value) {
        const tender = tenders.find(t => t.key === key)
        const tracking = tender && cateringPlatforms.find(p => sameLabel(p.name, tender.label))
        if (tracking) {
            const copy = trackedCopy({
                typed: value,
                previousTillValue: tenderValues[key],
                trackedValue: platformSales[tracking.name],
            })
            if (copy != null) {
                setPlatformSales(prev => ({ ...prev, [tracking.name]: copy }))
            }
        }
        setTenderValues(prev => ({ ...prev, [key]: value }))
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

    // The rows this day draws: the active ones, plus any retired row this day
    // still holds a figure for.
    const shownTenders = tendersToShow(tenders, [storedTenders])

    // Reconciliation uses only the till receipt block.
    const variance = tenderVariance(values.gross, tenderValues, shownTenders)
    // Any cent at all. This is the till receipt, not a cash drawer, so there
    // is nothing to round away: if it does not add up to gross then something
    // was typed wrong or the till is wrong, and either is worth a look.
    const varianceWarn = variance !== 0

    const gross = num(values.gross)
    function pctOfGross(amount) {
        return gross > 0 ? (amount / gross) * 100 : 0
    }

    // ---- saving ---------------------------------------------------------

    async function handleSave() {
        setError(''); setSuccess('')

        // One record per date per restaurant, so confirm before replacing one.
        if (recordId) {
            const ok = await confirm({
                title: 'Overwrite this day?',
                message: 'There is already a record for this day. Saving replaces it with what is on screen now.',
                details: [{ label: 'Day', value: fullDate(saleDate) }],
                confirmLabel: 'Overwrite',
                tone: 'danger',
            })
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
                gross_sales: 0, net_sales: 0,
                tender_sales: {}, platform_sales: {},
                staff_food: 0, instore_variance: 0,
            }
            : {
                ...base,
                is_closed: false,
                gross_sales: num(values.gross),
                net_sales: num(values.net),
                // Every row on the till receipt. Written over what was already
                // stored rather than replacing it, so a figure belonging to no
                // row on screen is left where it is.
                tender_sales: mergeTenderSales(storedTenders, tenderValues, shownTenders),
                // Tracking detail, not required to match the receipt.
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
        if (resErr) { setError(friendlyError(resErr)); return }
        // And the roster's day is told, so it is one tick rather than two.
        const noteErr = await applyNoteWrites(supabase, {
            restaurantId,
            userId: user.id,
            plan: planNoteWrites(dayNote ? [dayNote] : [], [{ date: saleDate, closed: isClosed }]),
        })
        if (noteErr) { setError(friendlyError(noteErr)); return }

        setSuccess(isClosed ? `${saleDate} marked as closed.` : `Sales for ${saleDate} saved.`)
        loadDay()
    }

    const fieldCls =
        'w-full border border-border rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent bg-white'

    // A filled box is faintly green, an empty one is white, the same as the
    // weekly grid. The 0.00 placeholders are gone with it: a grey 0.00 reads as
    // a figure somebody entered when it is not one. Blank means nobody has
    // filled it in, a typed 0 means the till took nothing, and the day has to
    // be able to say which.
    function fieldWith(value) {
        return `${fieldCls} ${value === '' || value == null ? '' : 'bg-green-50'}`
    }
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    // One bucket of tracking platforms, with the gap against the receipt figure.
    function trackingBucket(title, bucketPlatforms, receiptKey, note) {
        if (bucketPlatforms.length === 0) return null
        const sum = platformSum(bucketPlatforms)
        // Once the till row this was compared against is retired there is
        // nothing honest to compare it to, so it shows its own total instead.
        const comparable = shownTenders.some(t => t.key === receiptKey)
        const gap = sum - num(tenderValues[receiptKey])
        // Headed and totalled the same way as the weekly grid, so both screens
        // draw the line between the receipt and the notes kept beside it in the
        // same place. Grey rather than one of the app's colours on purpose:
        // orange would read as needing attention and green as confirmed, and
        // this is neither.
        return (
            <div className={`${card} overflow-hidden mb-3`}>
                <div className="bg-gray-600 px-5 py-2 flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        {title}
                        <span className="text-xs font-normal normal-case tracking-normal text-white/60 ml-2">
                            tracking only, outside the reconciliation
                        </span>
                    </h3>
                </div>

                {note && (
                    <p className="bg-blue-50 text-xs text-blue-800 px-5 py-2 border-b border-border">{note}</p>
                )}

                <div className="bg-gray-200 border-b border-gray-300 px-5 py-2 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{title} tracked</span>
                    <span className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">{fmtMoney(sum)}</span>
                        <span className="ml-2 text-gray-500">({pctOfGross(sum).toFixed(1)}% of sales)</span>
                    </span>
                </div>

                {comparable && Math.abs(gap) >= 0.01 && (
                    <p className="text-xs text-amber-600 px-5 pt-3">
                        {gap > 0 ? '+' : ''}{fmtMoney(gap)} against the receipt figure. Expected: platforms report
                        commission and VAT differently.
                    </p>
                )}
                <div className="grid grid-cols-3 gap-3 p-5">
                    {bucketPlatforms.map(p => (
                        <div key={p.id}>
                            <label className={labelCls}>{p.name}</label>
                            <input
                                {...numberField({
                                    value: platformSales[p.name],
                                    onChange: v => setPlatformAmount(p.name, v),
                                })}
                                className={fieldWith(platformSales[p.name])}
                            />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (loading) {
        return <p className="text-sm text-gray-400">Loading...</p>
    }

    return (
        <>
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
                    className={secondaryButton}
                >
                    Week view
                </button>
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {/* Two columns once there is room for them. The left is the day
                and the money off the till, finishing with the reconciliation,
                which is the number you are actually checking. The right is the
                extra detail that does not go into that number. On a phone it
                stacks back into one column in the same order. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div>
                    {/* Date selector */}
                    <div className={`${card} p-4 mb-3`}>
                        <DateStepper
                            onBack={() => shiftDate(-1)}
                            onNext={() => shiftDate(1)}
                            backLabel="Previous day"
                            nextLabel="Next day"
                            jump={(
                                <button
                                    type="button"
                                    onClick={() => setSaleDate(todayISO())}
                                    className={jumpButton(saleDate === todayISO())}
                                >
                                    Today
                                </button>
                            )}
                        >
                            <input
                                type="date"
                                value={saleDate}
                                onChange={e => setSaleDate(e.target.value)}
                                aria-label="Day"
                                className={`${dateField} w-full`}
                            />
                        </DateStepper>
                        {/* Under the row rather than off the end of it. On a
                            phone it was being pushed onto a line of its own and
                            reading like a stray label. */}
                        {recordId && (
                            <p className="text-xs text-amber-600 font-medium mt-2">Existing record</p>
                        )}
                    </div>

                    {/* Non-trading day */}
                    <div className={`${card} p-4 mb-3`}>
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
                            {/* Till receipt block. Gross and net stay at the
                                top; everything under them is whatever the till
                                currently prints, set in Restaurant settings. */}
                            <div className={`${card} p-5 mb-3`}>
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">Till receipt</h3>

                                {/* Gross and net are what the day came to. The
                                    boxes under them are how it was taken, and
                                    they have to add up to gross. Two different
                                    kinds of figure, so they are set apart with
                                    the same two colours the weekly spreadsheet
                                    gives them. */}
                                <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-border">
                                    {/* A step darker than the faint green a
                                        filled box gets, or the block reads as
                                        one big confirmation tick. */}
                                    <div className="bg-blue-200 rounded-lg p-2">
                                        <label className={labelCls}>Gross sales</label>
                                        <input
                                            {...numberField({
                                                value: values.gross,
                                                onChange: v => setValue('gross', v),
                                            })}
                                            className={fieldWith(values.gross)}
                                        />
                                    </div>
                                    <div className="bg-green-200 rounded-lg p-2">
                                        <label className={labelCls}>Net sales</label>
                                        <input
                                            {...numberField({
                                                value: values.net,
                                                onChange: v => setValue('net', v),
                                            })}
                                            className={fieldWith(values.net)}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {shownTenders.map(t => (
                                        <div key={t.key}>
                                            <label className={labelCls}>
                                                {t.label}
                                                {!t.is_active && (
                                                    <span className="ml-2 text-gray-400">retired</span>
                                                )}
                                            </label>
                                            <input
                                                {...numberField({
                                                    value: tenderValues[t.key],
                                                    onChange: v => setTenderValue(t.key, v),
                                                })}
                                                className={fieldWith(tenderValues[t.key])}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Reconciliation closes the receipt block */}
                            <div className={`rounded-xl border shadow-md p-4 mb-3 ${varianceWarn ? 'bg-red-50 border-red-400' : 'bg-green-50 border-green-400'}`}>
                                <div className={`text-xs mb-1 ${varianceWarn ? 'text-red-600' : 'text-green-700'}`}>Reconciliation</div>
                                <div className={`text-xl font-semibold ${varianceWarn ? 'text-red-700' : 'text-green-700'}`}>{fmtMoney(variance)}</div>
                                <div className={`text-xs mt-1 ${varianceWarn ? 'text-red-600' : 'text-green-700'}`}>
                                    {varianceWarn
                                        ? 'Does not add up to gross sales, check the figures'
                                        : 'everything the till took, against gross sales'}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* The right column is all about a trading day, so on a closed
                    day there is nothing to put in it. */}
                {!isClosed && (
                    <div>
                        {/* Platform detail, outside the reconciliation */}
                        {trackingBucket('Online Platform', onlinePlatforms, 'online_sales')}
                        {trackingBucket('Corporate', cateringPlatforms, 'outside_catering',
                            'These start as whatever you typed on the till rows above, since the till now itemises them itself. Change one if the platform pays something different after commission, and it will stop following.')}

                        <div className={`${card} p-5 mb-3`}>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Staff food</label>
                                    <input
                                        {...numberField({
                                            value: staffFood,
                                            onChange: setStaffFood,
                                        })}
                                        className={fieldWith(staffFood)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                    {saving
                        ? 'Saving...'
                        : isClosed
                            ? (recordId ? 'Update as closed' : 'Mark day closed')
                            : (recordId ? 'Update day' : 'Save day')}
                </button>
            </div>
        </>
    )
}
