import { useState, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { dayIsClosed, planNoteWrites, applyNoteWrites } from '../../lib/closedDays'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { todayISO, weekStartOf, weekDates, shortDate, addDays, fullDate, weekMonthLabel } from '../../lib/dates'
import { friendlyError, isPermissionError } from '../../lib/errors'
import { tendersToShow, tenderVariance, mergeTenderSales, tenderValuesFromRecord, sameLabel, trackedCopy } from '../../lib/salesTenders'
import { numberField } from '../../lib/numberInput'
import { secondaryButton, dateField, jumpButton, tableHeadRow, card } from '../../lib/controlStyles'
import DateStepper from '../../components/DateStepper'

// Week entry grid: metrics as rows, days as columns, mirroring the layout the
// business already uses in its weekly spreadsheet. Rows scale as platforms are
// added or removed, which a day-per-column layout would not.
//
// TWO RECORDS, DELIBERATELY SEPARATE
// The top block is the till receipt: gross, net, and then a row for every way
// the till takes money. Those rows are not fixed any more. They come from
// sales_tenders, one record per row per restaurant, so when the till changes a
// Super Admin edits them in Restaurant settings instead of us writing a
// migration. That block is what reconciles, because it is what the POS prints
// and what can be checked at close.
// The platform rows below are a separate tracking record. They will not tie out
// exactly against the receipt: some platforms report before commission, some
// after, some include VAT and some do not. Forcing them to agree would produce
// a permanent false error, so the difference is shown as information only and
// never counted as a reconciliation failure.
//
// Cash reconciliation (floats, cash banked, petty cash) is deliberately absent
// here, as it is in the day form: the business is changing how it handles cash.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
const DRAFT_FIELDS = ['gross', 'net', 'staffFood']

function sameDay(a, b) {
    if (!a || !b) return false
    if ((a.isClosed ?? false) !== (b.isClosed ?? false)) return false
    for (const f of DRAFT_FIELDS) {
        if (num(a[f]) !== num(b[f])) return false
    }
    const tenderKeys = new Set([
        ...Object.keys(a.tenderValues || {}),
        ...Object.keys(b.tenderValues || {}),
    ])
    for (const k of tenderKeys) {
        if (num(a.tenderValues?.[k]) !== num(b.tenderValues?.[k])) return false
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

export default function WeeklySalesPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    // Raw value of the week picker. Kept separate from weekStart so choosing a
    // Wednesday does not rewrite the input to Sunday while the picker is open.
    const [pickerDate, setPickerDate] = useState(weekStart)

    const [platforms, setPlatforms] = useState([])
    // Every tender for this restaurant, retired ones included. The retired ones
    // are needed so an old week can still draw the rows it was entered with.
    const [tenders, setTenders] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // True once something has been edited but not yet saved.
    const [dirty, setDirty] = useState(false)

    // Working copy of the week, keyed by date.
    const [days, setDays] = useState({})
    // The roster's word on these seven days, which decides which are closed.
    const [dayNotes, setDayNotes] = useState([])

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
            .order('sort_order')
            .order('name')

        if (pErr) { setError(friendlyError(pErr)); setLoading(false); return }

        const sortedPlats = (plats || []).sort(
            (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
        )
        setPlatforms(sortedPlats)

        // Not filtered by is_active on purpose. A week from March has to be able
        // to show Outside Catering, and it can only do that if the retired row
        // is here to be matched against what that week has stored.
        const { data: tends, error: tErr } = await supabase
            .from('sales_tenders')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('sort_order')
            .order('label')

        if (tErr) { setError(friendlyError(tErr)); setLoading(false); return }
        setTenders(tends || [])

        const { data: recs, error: rErr } = await supabase
            .from('sales_records')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .gte('sale_date', dates[0])
            .lte('sale_date', dates[6])

        if (rErr) { setError(friendlyError(rErr)); setLoading(false); return }

        const byDate = {}
        for (const r of recs || []) byDate[r.sale_date] = r

        // What the roster says about these days. It decides which are closed.
        const { data: notes } = await supabase
            .from('day_notes')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .gte('note_date', dates[0]).lte('note_date', dates[6])

        const noteByDate = {}
        for (const n of notes || []) noteByDate[n.note_date] = n
        setDayNotes(notes || [])

        const next = {}
        for (const d of dates) {
            const r = byDate[d]
            const platformValues = {}
            if (r?.platform_sales && typeof r.platform_sales === 'object') {
                for (const [k, v] of Object.entries(r.platform_sales)) platformValues[k] = String(v)
            }
            next[d] = {
                id: r?.id ?? null,
                isClosed: dayIsClosed(noteByDate[d], r),
                gross: r?.gross_sales != null ? String(r.gross_sales) : '',
                net: r?.net_sales != null ? String(r.net_sales) : '',
                staffFood: r?.staff_food != null ? String(r.staff_food) : '',
                // What is on screen, and what came out of the database. Both are
                // kept because a save writes the typed values over the stored
                // ones rather than replacing them, which is how a figure
                // belonging to no row on screen survives.
                tenderValues: tenderValuesFromRecord(r?.tender_sales),
                storedTenders: r?.tender_sales ?? {},
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
                    const merged = {
                        ...next[d], ...draft[d],
                        id: next[d].id,
                        storedTenders: next[d].storedTenders,
                    }
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

    // Typing a till figure also fills the Corporate tracking row of the same
    // name, so a day where everything matches only has to be typed once.
    //
    // It stays editable. What the till rang up and what the platform actually
    // pays after commission are not always the same, and the tracking row is
    // where that difference gets recorded, so it stops copying the moment
    // something different is typed into it. See trackedCopy.
    function setTenderValue(date, key, value) {
        setDirty(true)
        setDays(prev => {
            const day = prev[date]
            const next = {
                ...day,
                tenderValues: { ...day.tenderValues, [key]: value },
            }

            const tender = tenders.find(t => t.key === key)
            const tracking = tender && cateringPlatforms.find(p => sameLabel(p.name, tender.label))
            if (tracking) {
                const copy = trackedCopy({
                    typed: value,
                    previousTillValue: day.tenderValues?.[key],
                    trackedValue: day.platformValues?.[tracking.name],
                })
                if (copy != null) {
                    next.platformValues = { ...day.platformValues, [tracking.name]: copy }
                }
            }

            return { ...prev, [date]: next }
        })
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
        goToWeek(addDays(weekStart, weeks * 7))
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

    // The rows this week draws: the active ones, plus any retired row that one
    // of these seven days still holds a figure for. Worked out across the whole
    // week rather than per day, because the grid is one set of rows.
    const shownTenders = tendersToShow(tenders, dates.map(d => days[d]?.storedTenders))

    // Reconciliation uses only the till receipt block.
    function varianceFor(date) {
        const day = days[date]
        if (!day || day.isClosed) return 0
        return tenderVariance(day.gross, day.tenderValues, shownTenders)
    }

    function weekTenderTotal(key) {
        return dates.reduce((sum, d) => {
            const day = days[d]
            if (!day || day.isClosed) return sum
            return sum + num(day.tenderValues?.[key])
        }, 0)
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


    function pctOfGross(amount, grossAmount) {
        return grossAmount > 0 ? (amount / grossAmount) * 100 : 0
    }

    // A draft the database will never accept is worse than no draft: it comes
    // back next visit looking like figures that saved. Only for a refusal, not
    // for a dropped connection, where keeping what was typed is the whole point.
    function discardDraftIfRefused(err) {
        if (!isPermissionError(err)) return
        try {
            localStorage.removeItem(draftKey(restaurantId, weekStart))
        } catch {
            // Nothing to lose if it cannot be cleared.
        }
        setDirty(false)
    }

    // ---- saving ---------------------------------------------------------

    // Saves the whole week in one go.
    //
    // A week is up to seven rows, some of which already exist and some of which
    // do not, so it sorts them into inserts and updates first and sends the
    // inserts as one batch. There is no upsert here because a day is identified
    // by restaurant and date rather than by an id the screen knows.
    //
    // A day is skipped entirely when nothing has been typed into it and nothing
    // is stored for it yet. That is what keeps "nobody has filled this in" a
    // real state rather than writing seven rows of zeros for every week, which
    // would make a day nobody touched look like a day we took nothing.
    //
    // Marking a day closed writes zeros across the board on purpose. Closed and
    // empty are different things: closed means we did not trade, and closed days
    // are then left out of daily averages so a bank holiday does not drag down
    // what a normal day looks like.
    //
    // This is not a transaction. If the inserts land and an update then fails,
    // part of the week is saved and the screen still shows what you typed. That
    // is why it stops at the first error rather than carrying on, and why the
    // local draft is only cleared once everything has gone through.
    async function handleSaveWeek() {
        setError(''); setSuccess('')
        setSaving(true)

        const toInsert = []
        const toUpdate = []

        for (const date of dates) {
            const day = days[date]
            if (!day) continue

            const hasAnyValue =
                day.gross !== '' || day.net !== '' || day.staffFood !== '' ||
                Object.values(day.tenderValues || {}).some(v => v !== '' && v != null) ||
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
                    gross_sales: 0, net_sales: 0,
                    tender_sales: {}, platform_sales: {}, staff_food: 0, instore_variance: 0,
                }
                : {
                    ...base,
                    is_closed: false,
                    gross_sales: num(day.gross),
                    net_sales: num(day.net),
                    // Every row on the till receipt. Written over what was
                    // already stored rather than replacing it, so a figure
                    // belonging to no row on screen is left where it is.
                    tender_sales: mergeTenderSales(day.storedTenders, day.tenderValues, shownTenders),
                    // Tracking detail, not required to match the receipt.
                    platform_sales: platformSales,
                    staff_food: num(day.staffFood),
                    instore_variance: varianceFor(date),
                }

            if (day.id) toUpdate.push({ id: day.id, payload })
            else toInsert.push(payload)
        }

        // The roster's days, told once for the whole week. Ticking a day closed
        // here used to leave the roster still printing hours for it.
        const notePlan = planNoteWrites(dayNotes, dates.map(d => ({
            date: d,
            closed: !!days[d]?.isClosed,
        })))

        if (toInsert.length > 0) {
            const { error: e1 } = await supabase.from('sales_records').insert(toInsert)
            if (e1) {
                setError(friendlyError(e1))
                discardDraftIfRefused(e1)
                setSaving(false)
                return
            }
        }
        for (const u of toUpdate) {
            const { error: e2 } = await supabase.from('sales_records').update(u.payload).eq('id', u.id)
            if (e2) {
                setError(friendlyError(e2))
                discardDraftIfRefused(e2)
                setSaving(false)
                return
            }
        }

        // The database now matches the screen, so the draft is no longer needed.
        try {
            localStorage.removeItem(draftKey(restaurantId, weekStart))
        } catch {
            // Failing to clear a draft is harmless.
        }

        const noteErr = await applyNoteWrites(supabase, {
            restaurantId, userId: user.id, plan: notePlan,
        })
        if (noteErr) { setSaving(false); setError(friendlyError(noteErr)); return }

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
    // Tab moves down the block you are in, and at the bottom of it carries on
    // into the same block on the next day rather than dropping into the block
    // below.
    //
    // It used to walk the whole column, so finishing Uber Eats put you in
    // Clockmeal, which is a different record entirely. You fill one block across
    // the week, not one day top to bottom, so this follows how it is actually
    // used.
    function handleGridKeyDown(e) {
        if (e.key !== 'Tab') return
        const { block, col } = e.target.dataset || {}
        if (block == null || col == null) return

        e.preventDefault()

        const inBlock = c => Array.from(document.querySelectorAll(
            `input[data-block="${block}"][data-col="${c}"]:not([disabled])`
        ))

        const here = inBlock(col)
        const step = e.shiftKey ? -1 : 1
        let next = here[here.indexOf(e.target) + step]

        if (!next) {
            const neighbour = inBlock(Number(col) + step)
            next = step > 0 ? neighbour[0] : neighbour[neighbour.length - 1]
        }

        if (next) {
            next.focus()
            next.select()
        }
    }

    // ---- rendering helpers ----------------------------------------------

    // One rule across the whole grid: a white box means you can type in it, a
    // grey fill means it was worked out for you.
    //
    // Before this the input borders were the cream border colour on a cream
    // page, so they barely read as boxes, and the totals and the reconciliation
    // were bare text with nothing marking them as different. Everything looked
    // the same on a screen that is nothing but numbers.
    const inputCls =
        'w-full border rounded-md px-2 py-1.5 text-sm text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:text-gray-400 disabled:shadow-none'

    // A filled box is faintly green, an empty one is white, and every box on a
    // closed day is red.
    //
    // On a grid of seven days by a dozen rows there was no way to see at a
    // glance how far through a week you were. The empty boxes used to show a
    // grey 0.00, which reads as a figure somebody entered when it is not one,
    // so that is gone as well: blank means nobody has filled it in, and a typed
    // 0 means the till took nothing. Those are different things and the day has
    // to be able to say which.
    //
    // The background is set here rather than with a disabled: rule, because a
    // disabled: rule would beat the closed colour and leave the boxes grey in a
    // red column.
    function cellCls(value, closed) {
        if (closed) return `${inputCls} bg-red-50 border-red-200`
        const filled = !(value === '' || value == null)
        return `${inputCls} border-gray-300 ${filled ? 'bg-green-50' : 'bg-white'}`
    }

    // A closed day is not a day nobody has filled in, it is a day we did not
    // trade, so the whole column says so rather than just the boxes going flat.
    function closedCol(date) {
        return days[date]?.isClosed ? 'bg-red-50' : ''
    }
    // The label and total cells paint their own background, because the label
    // is sticky and would otherwise go transparent over the rows as it scrolls.
    // The background is kept out of the base class and passed in instead: with
    // it baked in, a tinted row ended up with two background classes on the same
    // cell and which one won came down to the order Tailwind happens to emit
    // them in. That is why the gross row and the net row did not match.
    const labelCellBase = 'px-3 py-2 text-sm font-medium text-gray-800 whitespace-nowrap sticky left-0 z-10'
    const totalCellBase = 'px-3 py-2 text-sm font-semibold text-gray-700 text-right whitespace-nowrap'
    const labelCellCls = `${labelCellBase} bg-gray-50`
    const totalCellCls = `${totalCellBase} bg-gray-50`

    // Called as functions rather than rendered as components, so React keeps the
    // same DOM nodes between renders and inputs do not lose focus while typing.
    function fieldRow({ label, field, bold, key, block = 'receipt', tint }) {
        const bg = tint || 'bg-gray-50'
        return (
            <tr key={key} className={`border-b border-border ${tint || ''}`}>
                <td className={`${labelCellBase} ${bg} ${bold ? 'font-semibold' : ''}`}>{label}</td>
                {dates.map((d, i) => (
                    <td key={d} className={`px-1.5 py-1.5 ${closedCol(d)}`}>
                        <input
                            {...numberField({
                                value: days[d]?.[field],
                                onChange: v => setField(d, field, v),
                            })}
                            data-col={i}
                            data-block={block}
                            disabled={days[d]?.isClosed}
                            className={cellCls(days[d]?.[field], days[d]?.isClosed)}
                        />
                    </td>
                ))}
                <td className={`${totalCellBase} ${bg}`}>{fmtMoney(weekTotal(field))}</td>
            </tr>
        )
    }

    function tenderRow(tender) {
        return (
            <tr key={tender.key} className="border-b border-border">
                <td className={labelCellCls}>
                    {tender.label}
                    {/* Only ever appears on an old week. It is here so nobody
                        wonders why a row they cannot find in settings is on the
                        screen in front of them. */}
                    {!tender.is_active && (
                        <span className="ml-2 text-xs font-normal text-gray-400">retired</span>
                    )}
                </td>
                {dates.map((d, i) => (
                    <td key={d} className={`px-1.5 py-1.5 ${closedCol(d)}`}>
                        <input
                            {...numberField({
                                value: days[d]?.tenderValues?.[tender.key],
                                onChange: v => setTenderValue(d, tender.key, v),
                            })}
                            data-col={i}
                            data-block="receipt"
                            disabled={days[d]?.isClosed}
                            className={cellCls(days[d]?.tenderValues?.[tender.key], days[d]?.isClosed)}
                        />
                    </td>
                ))}
                <td className={totalCellCls}>{fmtMoney(weekTenderTotal(tender.key))}</td>
            </tr>
        )
    }

    function platformRow(platform) {
        return (
            <tr key={platform.id} className="border-b border-border">
                <td className={`${labelCellCls} pl-6 text-gray-600`}>{platform.name}</td>
                {dates.map((d, i) => (
                    <td key={d} className={`px-1.5 py-1.5 ${closedCol(d)}`}>
                        <input
                            {...numberField({
                                value: days[d]?.platformValues?.[platform.name],
                                onChange: v => setPlatformValue(d, platform.name, v),
                            })}
                            data-col={i}
                            data-block={platform.bucket}
                            disabled={days[d]?.isClosed}
                            className={cellCls(days[d]?.platformValues?.[platform.name], days[d]?.isClosed)}
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
    // The heading on a tracking block.
    //
    // These blocks are not part of the reconciliation and never were, but they
    // sat in the same table in the same colours as the rows that are, with only
    // a small orange caption to tell them apart. On a screen of nothing but
    // figures that is not enough. They get a gap, a solid bar and a total that
    // matches the bar, so it is obvious where the receipt stops.
    //
    // Deliberately grey rather than one of the app's colours. Orange would read
    // as something needing attention and green as something confirmed, and this
    // is neither: it is a note kept alongside the day.
    function trackingHeaderRow({ title, note, key }) {
        return (
            <Fragment key={key}>
                <tr>
                    <td colSpan={9} className="px-3 py-2 sticky left-0 bg-gray-600">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">{title}</span>
                        <span className="text-xs text-white/60 ml-2">
                            tracking only, outside the reconciliation
                        </span>
                    </td>
                </tr>
                {note && (
                    <tr>
                        <td colSpan={9} className="px-3 py-2 sticky left-0 bg-blue-50 text-xs text-blue-800 border-b border-border">
                            {note}
                        </td>
                    </tr>
                )}
            </Fragment>
        )
    }

    // Every table on this screen uses the same column widths, so the cards line
    // up with each other and with the day headings above them. They are separate
    // tables now, one per card, which is the only way to give each a border of
    // its own, so the widths have to be stated rather than left to the browser.
    function gridColumns() {
        return (
            <colgroup>
                <col style={{ width: '11rem' }} />
                {dates.map(d => <col key={d} style={{ width: '6rem' }} />)}
                <col style={{ width: '7rem' }} />
            </colgroup>
        )
    }

    function platformSumRow({ label, bucketPlatforms, receiptKey, key }) {
        const weekSum = weekPlatformSum(bucketPlatforms)
        // Once the till row this was compared against is gone, there is nothing
        // honest to compare it to, so it shows the tracked total on its own.
        const comparable = shownTenders.some(t => t.key === receiptKey)
        const weekReceipt = comparable ? weekTenderTotal(receiptKey) : 0
        const weekGap = weekSum - weekReceipt

        return (
            <tr key={key} className="border-t-2 border-gray-300 border-b border-border bg-gray-200">
                <td className={`${labelCellBase} bg-gray-200 font-semibold`}>{label} tracked</td>
                {dates.map(d => {
                    const day = days[d]
                    const sum = platformSumFor(d, bucketPlatforms)
                    const gap = sum - num(day?.tenderValues?.[receiptKey])
                    const showGap = comparable && !day?.isClosed && Math.abs(gap) >= 0.01
                    return (
                        <td key={d} className={`px-3 py-2 text-right whitespace-nowrap ${closedCol(d)}`}>
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
                    {comparable && Math.abs(weekGap) >= 0.01 && (
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
                    {/* Which month you are in. The column headings give the day
                        and the date, but on a grid full of numbers it is easy to
                        lose track of the month, so it is said once up here. */}
                    <p className="font-serif text-xl font-bold text-gray-900">{weekMonthLabel(weekStart)}</p>
                    <h2 className="text-lg font-semibold text-gray-900 mt-1">Weekly sales</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {activeRestaurant?.name} · enter the whole week, Sunday to Saturday
                    </p>
                </div>
                {/* Switch to the single-day form, for phone use */}
                <button
                    onClick={() => navigate('/sales?view=day')}
                    className={secondaryButton}
                >
                    Day view
                </button>
            </div>

            {/* Phone only.

                The app already sends you to the day form on a narrow screen,
                but only when it is guessing. Follow the sidebar link, or come
                back after choosing the week view once on a laptop, and you land
                straight on this grid with no explanation. Seven days across is
                never going to be comfortable on a phone, so rather than pretend
                otherwise it says so and points at the form that is. */}
            <div className="md:hidden bg-blue-50 text-blue-800 text-sm rounded-lg p-3 mb-4">
                This grid is meant for a computer. On a phone the Day view above is easier to use. It takes one day
                at a time and saves to exactly the same place, so it makes no difference which one you use.
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

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
                        className={`w-full sm:w-auto sm:ml-auto ${dateField}`}
                        aria-label="Jump to week"
                    />
                </div>
            </div>

            {/* Three separate cards, all inside one scrolling box.

                The till receipt is one thing and the tracking blocks are
                another, so they are not rows of the same table any more. Keeping
                them in one scroller means they still slide sideways together and
                still share a column layout, which is the whole point: a figure
                under Wednesday has to be under Wednesday on every card.

                Fixed layout stops columns resizing as digits are typed. */}
            <div className="overflow-x-auto mb-4" onKeyDown={handleGridKeyDown}>
                <div className="min-w-[1000px] space-y-4">

                <div className={`${card} overflow-hidden`}>
                    <table className="w-full table-fixed">
                        {gridColumns()}
                        <thead>
                            {/* The first cell is sticky and paints its own
                                background, so it has to be given the heading
                                colour too. Otherwise it keeps the old grey and
                                you see it as soon as you scroll sideways. The
                                day and date are divs inside the cell, so they
                                set their own colour rather than inheriting. */}
                            <tr className={tableHeadRow}>
                                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider sticky left-0 bg-sidebar z-10 w-44">
                                    &nbsp;
                                </th>
                                {dates.map((d, i) => (
                                    <th key={d} className="px-1.5 py-2 text-center w-24">
                                        <div className="text-xs font-semibold text-white">{DAY_NAMES[i]}</div>
                                        <div className="text-xs text-white/60 font-normal">{fullDate(d)}</div>
                                    </th>
                                ))}
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider w-28">Total</th>
                            </tr>

                            {/* Closed sits in the header: it is a property of the day */}
                            <tr className="border-b border-border bg-gray-50">
                                <td className="px-3 py-1.5 text-xs text-gray-500 sticky left-0 bg-gray-50 z-10">Closed</td>
                                {dates.map(d => (
                                    <td key={d} className={`px-1.5 py-1.5 text-center ${closedCol(d)}`}>
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
                            {/* Till receipt block: this is what reconciles.

                                Gross and net are what the day came to. The rows
                                under them are how it was taken, and they have to
                                add up to gross. They are two different kinds of
                                figure, so they get the colours and the gap the
                                weekly spreadsheet already gives them rather than
                                sitting in one undifferentiated list. */}
                            {/* A step darker than the faint green a filled
                                cell gets, or a whole row reads as one big
                                confirmation tick. */}
                            {fieldRow({ key: 'gross', label: 'Gross sales', field: 'gross', bold: true, tint: 'bg-blue-200' })}
                            {fieldRow({ key: 'net', label: 'Net sales', field: 'net', bold: true, tint: 'bg-green-200' })}

                            <tr aria-hidden="true">
                                <td colSpan={9} className="h-4 bg-app-bg sticky left-0"></td>
                            </tr>

                            {shownTenders.map(t => tenderRow(t))}

                            {/* Reconciliation closes the receipt block */}
                            <tr className="border-b-2 border-border bg-gray-50">
                                <td className={`${labelCellCls} font-semibold bg-gray-50`}>Reconciliation</td>
                                {dates.map(d => {
                                    const v = varianceFor(d)
                                    // Any cent at all. This is the till receipt,
                                    // not a cash drawer, so there is nothing to
                                    // round away: if it does not add up to gross
                                    // then something was typed wrong or the till
                                    // is wrong, and either is worth a look.
                                    const warn = v !== 0
                                    const closed = days[d]?.isClosed
                                    return (
                                        <td key={d} className={`px-3 py-2 text-right text-sm whitespace-nowrap ${closedCol(d)}`}>
                                            {closed
                                                ? <span className="text-gray-300">-</span>
                                                : <span className={warn ? 'text-red-600 font-semibold' : 'text-green-700'}>{fmtMoney(v)}</span>}
                                        </td>
                                    )
                                })}
                                <td></td>
                            </tr>

                        </tbody>
                    </table>
                </div>

                {/* Platform detail. Tracking only, outside the reconciliation. */}
                {onlinePlatforms.length > 0 && (
                    <div className={`${card} overflow-hidden`}>
                        <table className="w-full table-fixed">
                            {gridColumns()}
                            <tbody>
                                {trackingHeaderRow({ key: 'onlineHead', title: 'Online Platforms' })}
                                {onlinePlatforms.map(p => platformRow(p))}
                                {platformSumRow({ key: 'onlineSum', label: 'Online', bucketPlatforms: onlinePlatforms, receiptKey: 'online_sales' })}
                            </tbody>
                        </table>
                    </div>
                )}

                {cateringPlatforms.length > 0 && (
                    <div className={`${card} overflow-hidden`}>
                        <table className="w-full table-fixed">
                            {gridColumns()}
                            <tbody>
                                {trackingHeaderRow({
                                    key: 'corporateHead',
                                    title: 'Corporate',
                                    note: 'These start as whatever you typed on the till rows above, since the till now itemises them itself. Change one if the platform pays something different after commission, and it will stop following.',
                                })}
                                {cateringPlatforms.map(p => platformRow(p))}
                                {platformSumRow({ key: 'cateringSum', label: 'Corporate', bucketPlatforms: cateringPlatforms, receiptKey: 'outside_catering' })}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className={`${card} overflow-hidden`}>
                    <table className="w-full table-fixed">
                        {gridColumns()}
                        <tbody>
                            {fieldRow({ key: 'staffFood', label: 'Staff food', field: 'staffFood', block: 'extra' })}
                        </tbody>
                    </table>
                </div>

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
