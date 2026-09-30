import { useState, useEffect, useRef, Fragment, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { dayIsClosed, planNoteWrites, applyNoteWrites } from '@/lib/closedDays'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useConfirm } from '@/context/confirm'
import { fmtMoney, num } from '@/lib/format'
import { todayISO, weekStartOf, weekDates, shortDate, addDays, fullDate, weekMonthLabel, dayList } from '@/lib/dates'
import { friendlyError, isPermissionError } from '@/lib/errors'
import {
    tendersToShow, tenderVariance, mergeTenderSales, tenderValuesFromRecord, sameLabel, trackedCopy,
    keyedPlatforms, platformsToShow, mergePlatformSales, sameStoredDay,
} from '@/lib/salesTenders'
import { numberField } from '@/lib/numberInput'
import {
    secondaryButton, dateField, tableHeadRow, card, checkbox, pageTitle, primaryButton, warningNote,
} from '@/lib/controlStyles'
import JumpButton from '@/components/ui/JumpButton'
import DateStepper from '@/components/ui/DateStepper'
import { DAY_NAMES } from '@/lib/events'
import {
    bankHolidayOn, BANK_HOLIDAY_ON_DARK, BANK_HOLIDAY_WASH_CLASS, BANK_HOLIDAY_LABEL,
} from '@/lib/bankHolidays'
import ErrorBanner from '@/components/ui/ErrorBanner'
import SalesImportDialog from '@/components/sales/SalesImportDialog'

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



// Key under which an unsaved week is kept in local storage.
function draftKey(restaurantId, weekStart) {
    return `salesWeekDraft:${restaurantId}:${weekStart}`
}

// The blocks Tab moves across rather than down. See handleGridKeyDown.
const ACROSS_BLOCKS = new Set(['online_platform'])

// Fields compared when deciding whether a day genuinely differs from another
// copy of it. A draft matching the database is not an unsaved change.
const DRAFT_FIELDS = ['gross', 'net', 'staffFood']

// One box against another. Empty and a typed nought are different answers
// here, the same as everywhere else on this screen: nobody filled it in, or the
// till took nothing. Otherwise the figures are compared, so 500 and 500.00 are
// the same.
function sameBox(a, b) {
    const emptyA = a === '' || a == null
    const emptyB = b === '' || b == null
    if (emptyA || emptyB) return emptyA && emptyB
    return num(a) === num(b)
}

function sameDay(a, b) {
    if (!a || !b) return false
    if ((a.isClosed ?? false) !== (b.isClosed ?? false)) return false
    for (const f of DRAFT_FIELDS) {
        if (!sameBox(a[f], b[f])) return false
    }
    for (const group of ['tenderValues', 'platformValues']) {
        const keys = new Set([...Object.keys(a[group] || {}), ...Object.keys(b[group] || {})])
        for (const k of keys) {
            if (!sameBox(a[group]?.[k], b[group]?.[k])) return false
        }
    }
    return true
}

// A stored day the way the grid holds it: strings for the boxes, and what the
// database held kept beside them.
//
// The roster's day note decides whether it is closed. Without one it is what
// the row itself says, which is how Save week tells a day the roster has shut
// since from a row that already says so.
function dayFromRecord(r, note) {
    const platformValues = {}
    if (r?.platform_sales && typeof r.platform_sales === 'object') {
        for (const [k, v] of Object.entries(r.platform_sales)) platformValues[k] = String(v)
    }
    return {
        id: r?.id ?? null,
        isClosed: dayIsClosed(note, r),
        gross: r?.gross_sales != null ? String(r.gross_sales) : '',
        net: r?.net_sales != null ? String(r.net_sales) : '',
        staffFood: r?.staff_food != null ? String(r.staff_food) : '',
        // What is on screen, and what came out of the database. Both are
        // kept because a save writes the typed values over the stored ones
        // rather than replacing them, which is how a figure belonging to no
        // row on screen survives. The platforms are keyed by their key.
        tenderValues: tenderValuesFromRecord(r?.tender_sales),
        storedTenders: r?.tender_sales ?? {},
        platformValues,
        storedPlatforms: r?.platform_sales ?? {},
    }
}

export default function WeeklySalesPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const confirm = useConfirm()

    const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()))
    // Raw value of the week picker. Kept separate from weekStart so choosing a
    // Wednesday does not rewrite the input to Sunday while the picker is open.
    const [pickerDate, setPickerDate] = useState(weekStart)

    // Every platform and every tender for this restaurant, retired ones
    // included. The retired ones are needed so an old week can still draw the
    // rows it was entered with.
    const [platforms, setPlatforms] = useState([])
    const [tenders, setTenders] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    // Kept apart from the page's error above. That one is for something that
    // would not load, which belongs at the top of the page because there is
    // nothing else up there to read. This is for a save that would not go
    // through, and that belongs beside the button you pressed: at the foot of
    // a form on a phone, the top of the page is not on the screen at all.
    const [formProblem, setFormProblem] = useState('')
    const [success, setSuccess] = useState('')
    // Days whose unsaved changes on this device were not brought back, because
    // the day was changed somewhere else since: saved on a phone, or opened or
    // closed on the roster. See loadWeek.
    const [notRestored, setNotRestored] = useState([])

    // True once something has been edited but not yet saved.
    const [dirty, setDirty] = useState(false)
    const [importing, setImporting] = useState(false)

    // Working copy of the week, keyed by date.
    const [days, setDays] = useState({})
    // The roster's word on these seven days, which decides which are closed.
    const [dayNotes, setDayNotes] = useState([])

    // Which restaurant and week `days` currently holds. Guards against reloading
    // (and so discarding unsaved edits) when nothing has actually changed.
    const loadedKey = useRef(null)

    // The week as it came out of the database, before anything was typed or
    // brought back from a draft: `view` is each day as the grid first showed
    // it, and `rows` is the stored rows themselves. What is unsaved, and what
    // Save week has to write, is whatever differs from these.
    const loaded = useRef({ view: {}, rows: {} })

    const dates = weekDates(weekStart)
    const restaurantId = activeRestaurant?.id

    // Depend on the id, not the object: the context can return a new object for
    // the same restaurant, which would re-run this and wipe anything typed.
    

    // Keep a local draft of anything unsaved. Guarded by loadedKey: when the week
    // changes, weekStart updates before loadWeek replaces `days`, so without this
    // check the previous week's figures get written under the new week's key.
    //
    // Only the days that differ from what was loaded go in, each with the day
    // as it was loaded beside it. It used to be all seven, blanks included, so
    // a draft left on the office computer on Monday came back on Saturday over
    // every day entered on a phone in between, and Save week wrote the blanks
    // as zeros. Keeping the day as loaded is what lets loadWeek tell whether
    // the database has moved on since.
    useEffect(() => {
        if (!dirty || !restaurantId) return
        const key = `${restaurantId}:${weekStart}`
        if (loadedKey.current !== key) return
        try {
            const draft = {}
            for (const [date, day] of Object.entries(days)) {
                const base = loaded.current.view[date]
                if (!sameDay(day, base)) draft[date] = { base, edit: day }
            }
            if (Object.keys(draft).length) {
                localStorage.setItem(draftKey(restaurantId, weekStart), JSON.stringify(draft))
            } else {
                localStorage.removeItem(draftKey(restaurantId, weekStart))
            }
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

    const loadWeek = useCallback(async (key) => {

        // The week's seven days, worked out here rather than taken as a

        // dependency. They are derived from weekStart on every render, so

        // depending on them would rebuild this callback every render and the

        // effect below would reload the week forever.

        const dates = weekDates(weekStart)

        setLoading(true)
        setError('')
        setSuccess('')
        setNotRestored([])

        // Four at once. None of them needs anything from another, and this
        // grid is the slowest screen in the app to open.
        //
        // The platforms and the tenders are deliberately not filtered by
        // is_active. A week from March has to be able to show Outside Catering,
        // and it can only do that if the retired row is here to be matched
        // against what that week has stored.
        const [
            { data: plats, error: pErr },
            { data: tends, error: tErr },
            { data: recs, error: rErr },
            { data: notes },
        ] = await Promise.all([
            supabase.from('sales_platforms')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .order('sort_order')
                .order('name'),
            supabase.from('sales_tenders')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .order('sort_order')
                .order('label'),
            supabase.from('sales_records')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .gte('sale_date', dates[0])
                .lte('sale_date', dates[6]),
            // What the roster says about these days. It decides which are
            // closed, and a failure here is not worth stopping the week over.
            supabase.from('day_notes')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .gte('note_date', dates[0]).lte('note_date', dates[6]),
        ])

        const failed = [pErr, tErr, rErr].find(Boolean)
        if (failed) { setError(friendlyError(failed)); setLoading(false); return }

        // Both are put in order by platformsToShow and tendersToShow.
        setPlatforms(keyedPlatforms(plats))
        setTenders(tends || [])

        const byDate = {}
        for (const r of recs || []) byDate[r.sale_date] = r

        const noteByDate = {}
        for (const n of notes || []) noteByDate[n.note_date] = n
        setDayNotes(notes || [])

        const view = {}
        for (const d of dates) view[d] = dayFromRecord(byDate[d], noteByDate[d])
        const next = { ...view }

        // A draft day comes back only if the database still holds what it was
        // typed over. If the day has been saved somewhere else since, on a
        // phone or in the day view, what is stored now is newer than the
        // draft, so the draft is dropped and the screen says which days. A
        // draft day that already matches the database is simply not an
        // unsaved change.
        //
        // A draft from before 30 September holds the day alone, with nothing
        // to say what it was typed over, so it cannot be checked and is not
        // brought back.
        const restored = []
        const moved = []
        try {
            const raw = localStorage.getItem(draftKey(restaurantId, weekStart))
            if (raw) {
                const draft = JSON.parse(raw)
                for (const d of dates) {
                    const { base, edit } = draft?.[d] || {}
                    if (!base || !edit) continue
                    if (sameDay(edit, view[d])) continue
                    if (!sameDay(base, view[d])) { moved.push(d); continue }
                    next[d] = {
                        ...edit,
                        id: view[d].id,
                        storedTenders: view[d].storedTenders,
                        storedPlatforms: view[d].storedPlatforms,
                    }
                    restored.push(d)
                }
                if (!restored.length) localStorage.removeItem(draftKey(restaurantId, weekStart))
            }
        } catch {
            localStorage.removeItem(draftKey(restaurantId, weekStart))
        }

        loaded.current = { view, rows: byDate }
        setDays(next)
        setDirty(restored.length > 0)
        setNotRestored(moved)
        if (restored.length) setSuccess('Restored unsaved changes from this device.')
        loadedKey.current = key
        setLoading(false)
        }, [restaurantId, weekStart])

    useEffect(() => {
        if (!restaurantId) return
        const key = `${restaurantId}:${weekStart}`
        if (loadedKey.current === key) return
        loadWeek(key)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadWeek])

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

            // Found by name, since that is all the two tables share, and kept
            // under the platform's key.
            const tender = tenders.find(t => t.key === key)
            const tracking = tender && cateringPlatforms.find(p => sameLabel(p.name, tender.label))
            if (tracking) {
                const copy = trackedCopy({
                    typed: value,
                    previousTillValue: day.tenderValues?.[key],
                    trackedValue: day.platformValues?.[tracking.key],
                })
                if (copy != null) {
                    next.platformValues = { ...day.platformValues, [tracking.key]: copy }
                }
            }

            return { ...prev, [date]: next }
        })
    }

    function setPlatformValue(date, platformKey, value) {
        setDirty(true)
        setDays(prev => ({
            ...prev,
            [date]: {
                ...prev[date],
                platformValues: { ...prev[date].platformValues, [platformKey]: value },
            },
        }))
    }

    // The till's report, read in. It lands in the boxes exactly as if it had
    // been typed, so the week is still checked by the Reconciliation row and
    // still saved with Save week, and nothing is written until it is.
    function fillFromTill(filled) {
        setDirty(true)
        setDays(prev => ({ ...prev, ...filled }))
        setImporting(false)
        setFormProblem('')
        setSuccess("The till's report is in. Check the week, then press Save week.")
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

    // The rows this week draws: the active ones, plus any retired row that one
    // of these seven days still holds a figure for. Worked out across the whole
    // week rather than per day, because the grid is one set of rows.
    const shownTenders = tendersToShow(tenders, dates.map(d => days[d]?.storedTenders))
    const shownPlatforms = platformsToShow(platforms, dates.map(d => days[d]?.storedPlatforms))

    const onlinePlatforms = shownPlatforms.filter(p => p.bucket === 'online_platform')
    const cateringPlatforms = shownPlatforms.filter(p => p.bucket === 'catering')

    // Sum of the tracking rows for a bucket, compared against the receipt figure
    // for information only.
    function platformSumFor(date, bucketPlatforms) {
        const day = days[date]
        if (!day || day.isClosed) return 0
        return bucketPlatforms.reduce((sum, p) => sum + num(day.platformValues?.[p.key]), 0)
    }

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

    function weekPlatformTotal(platformKey) {
        return dates.reduce((sum, d) => {
            const day = days[d]
            if (!day || day.isClosed) return sum
            return sum + num(day.platformValues?.[platformKey])
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
    // A stored day is only written when it differs from what was stored, so a
    // correction made on a phone to a day this screen never touched is left
    // alone. It used to write all seven. The one change it makes on its own is
    // a day the roster has shut since, which it writes as closed, the same as
    // it always has, so the sales row agrees with the roster.
    //
    // Just before writing, the week is read again. Two screens open on the
    // same week used to mean the second save quietly undid the first, so a day
    // saved somewhere else since this screen loaded is named, and nothing is
    // written unless the person says to.
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
        setFormProblem(''); setSuccess('')
        setSaving(true)

        const stored = loaded.current.rows
        const toWrite = dates.filter(date => {
            const day = days[date]
            if (!day) return false
            if (day.id) return !sameDay(day, dayFromRecord(stored[date], null))

            const hasAnyValue =
                day.gross !== '' || day.net !== '' || day.staffFood !== '' ||
                Object.values(day.tenderValues || {}).some(v => v !== '' && v != null) ||
                Object.values(day.platformValues || {}).some(v => v !== '' && v != null)

            // Nothing entered and nothing stored: leave this day alone.
            return hasAnyValue || day.isClosed
        })

        // What the database holds now, which is what gets written over.
        const now = {}
        if (toWrite.length) {
            const { data: fresh, error: e0 } = await supabase.from('sales_records')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .gte('sale_date', dates[0])
                .lte('sale_date', dates[6])
            if (e0) { setFormProblem(friendlyError(e0)); setSaving(false); return }
            for (const r of fresh || []) now[r.sale_date] = r

            const movedOn = toWrite.filter(date => !sameStoredDay(now[date], stored[date]))
            if (movedOn.length) {
                const one = movedOn.length === 1
                const ok = await confirm({
                    title: 'Saved somewhere else',
                    message: `${dayList(movedOn)} ${one ? 'was' : 'were'} saved on another screen after you `
                        + `opened this week. Saving now replaces ${one ? 'it' : 'them'} with what is on this screen.`,
                    confirmLabel: 'Save anyway',
                    tone: 'danger',
                    dangerNote: `The other changes to ${one ? 'that day' : 'those days'} will be lost.`,
                })
                if (!ok) { setSaving(false); return }
            }
        }

        const toInsert = []
        const toUpdate = []

        for (const date of toWrite) {
            const day = days[date]
            // The row as it is now, so a day saved somewhere else since is
            // written over rather than inserted a second time.
            const id = now[date]?.id ?? null

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
                    // Written over what was stored the same way, so a
                    // platform retired since keeps its figures.
                    platform_sales: mergePlatformSales(day.storedPlatforms, day.platformValues, shownPlatforms),
                    staff_food: num(day.staffFood),
                    instore_variance: varianceFor(date),
                }

            if (id) toUpdate.push({ id, payload })
            else toInsert.push(payload)
        }

        // The roster's days, told once for the whole week. Ticking a day closed
        // here used to leave the roster still printing hours for it.
        const notePlan = planNoteWrites(dayNotes, dates.map(d => ({
            date: d,
            closed: !!days[d]?.isClosed,
        })))

        // Each write hands back the rows it wrote, and they are taken as what
        // is stored the moment they land. If a later write fails, the next
        // Save week then knows these days are saved. Without it, it named
        // them as saved on another screen and tried to add them again.
        function landed(rows) {
            for (const r of rows || []) {
                loaded.current.rows[r.sale_date] = r
                loaded.current.view[r.sale_date] = dayFromRecord(r, dayNotes.find(n => n.note_date === r.sale_date))
            }
            setDays(prev => {
                const next = { ...prev }
                for (const r of rows || []) {
                    if (!next[r.sale_date]) continue
                    next[r.sale_date] = {
                        ...next[r.sale_date],
                        id: r.id,
                        storedTenders: r.tender_sales ?? {},
                        storedPlatforms: r.platform_sales ?? {},
                    }
                }
                return next
            })
        }

        if (toInsert.length > 0) {
            const { data: added, error: e1 } = await supabase.from('sales_records').insert(toInsert).select()
            if (e1) {
                setFormProblem(friendlyError(e1))
                discardDraftIfRefused(e1)
                setSaving(false)
                return
            }
            landed(added)
        }
        for (const u of toUpdate) {
            const { data: changed, error: e2 } = await supabase.from('sales_records')
                .update(u.payload).eq('id', u.id).select()
            if (e2) {
                setFormProblem(friendlyError(e2))
                discardDraftIfRefused(e2)
                setSaving(false)
                return
            }
            landed(changed)
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
        if (noteErr) { setSaving(false); setFormProblem(friendlyError(noteErr)); return }

        setSaving(false)
        setDirty(false)
        const changed = toInsert.length + toUpdate.length

        // Force a real reload so ids for newly inserted days are picked up.
        loadedKey.current = null
        await loadWeek(`${restaurantId}:${weekStart}`)
        setSuccess(changed === 0 ? 'Nothing to save.' : `Saved ${changed} ${changed === 1 ? 'day' : 'days'}.`)
    }

    // ---- keyboard -------------------------------------------------------

    // Tab moves down the block you are in, and at the bottom of it carries on
    // into the same block on the next day rather than dropping into the block
    // below. Shift+Tab goes back.
    //
    // It used to walk the whole column, so finishing Uber Eats put you in
    // Clockmeal, which is a different record entirely. You fill one block across
    // the week, not one day top to bottom, so this follows how it is actually
    // used.
    //
    // **Except the online platforms, which go across.** Asked for on 27
    // September: those are typed a platform at a time, Sunday to Saturday, and
    // then the next platform. Only that block; the till's rows and Corporate
    // still go down. The boxes are in the page row by row, left to right, so
    // the next one in the page is the next day, and after Saturday it is the
    // next platform's Sunday. A closed day's boxes are disabled and skipped.
    function handleGridKeyDown(e) {
        if (e.key !== 'Tab') return
        const { block, col } = e.target.dataset || {}
        if (block == null || col == null) return

        e.preventDefault()
        const step = e.shiftKey ? -1 : 1

        let next
        if (ACROSS_BLOCKS.has(block)) {
            const boxes = Array.from(document.querySelectorAll(
                `input[data-block="${block}"]:not([disabled])`
            ))
            next = boxes[boxes.indexOf(e.target) + step]
        } else {
            const inBlock = c => Array.from(document.querySelectorAll(
                `input[data-block="${block}"][data-col="${c}"]:not([disabled])`
            ))

            const here = inBlock(col)
            next = here[here.indexOf(e.target) + step]

            if (!next) {
                const neighbour = inBlock(Number(col) + step)
                next = step > 0 ? neighbour[0] : neighbour[neighbour.length - 1]
            }
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
    //
    // A bank holiday colours its column the same way, and closed wins: a bank
    // holiday you were shut for is just shut. One class either way, never two,
    // for the reason written under this one.
    function closedCol(date) {
        if (days[date]?.isClosed) return 'bg-red-50'
        return bankHolidayOn(date) ? BANK_HOLIDAY_WASH_CLASS : ''
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
                        screen in front of them.

                        On a line of its own under the name. The column is the
                        same width on every screen and does not wrap, so beside
                        a longer name like Lunch Team Catering it ran over the
                        Sunday box. */}
                    {!tender.is_active && (
                        <span className="block text-xs font-normal text-muted">retired</span>
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

    // Shown by its name, kept by its key.
    function platformRow(platform) {
        return (
            <tr key={platform.id} className="border-b border-border">
                <td className={`${labelCellCls} pl-6 text-gray-600`}>
                    {platform.name}
                    {/* Only on a week that has figures for it, the same as a
                        retired till row, and under the name for the same
                        reason. */}
                    {!platform.is_active && (
                        <span className="block text-xs font-normal text-muted">retired</span>
                    )}
                </td>
                {dates.map((d, i) => (
                    <td key={d} className={`px-1.5 py-1.5 ${closedCol(d)}`}>
                        <input
                            {...numberField({
                                value: days[d]?.platformValues?.[platform.key],
                                onChange: v => setPlatformValue(d, platform.key, v),
                            })}
                            data-col={i}
                            data-block={platform.bucket}
                            disabled={days[d]?.isClosed}
                            className={cellCls(days[d]?.platformValues?.[platform.key], days[d]?.isClosed)}
                        />
                    </td>
                ))}
                <td className={`${totalCellCls} font-normal text-gray-600`}>
                    {fmtMoney(weekPlatformTotal(platform.key))}
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

    // Which day each column is, over every block rather than only over the first.
    //
    // The week is nine columns of nothing but figures and it is wider than any
    // phone, so it scrolls both ways. Reaching the Corporate rows meant the only
    // day heading in the page was somewhere above the top of the screen, and
    // typing a figure into the wrong day is not a mistake this page shows you.
    //
    // The first cell is sticky and paints its own background, so it has to be
    // given the heading colour too. Otherwise it keeps the old grey and you see
    // it as soon as you scroll sideways. The day and date are divs inside the
    // cell, so they set their own colour rather than inheriting.
    function dayHeadRow(key) {
        return (
            <tr key={key} className={tableHeadRow}>
                <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider sticky left-0 bg-sidebar z-10 w-44">
                    &nbsp;
                </th>
                {dates.map((d, i) => {
                    const holiday = bankHolidayOn(d)
                    return (
                        <th key={d} className="px-1.5 py-2 text-center w-24">
                            <div className="text-xs font-semibold text-white">{DAY_NAMES[i]}</div>
                            <div className="text-xs text-white/60 font-normal">{fullDate(d)}</div>
                            {/* A bank holiday takes a different week and a
                                different wage bill, so a week being read
                                against last year's should say which days were
                                one. Worked out from the date, so it is on every
                                week ever typed without anybody going back. */}
                            {holiday && (
                                <div
                                    className="text-[0.65rem] font-bold"
                                    style={{ color: BANK_HOLIDAY_ON_DARK }}
                                >
                                    {BANK_HOLIDAY_LABEL}
                                </div>
                            )}
                        </th>
                    )
                })}
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider w-28">Total</th>
            </tr>
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
                    <div className="text-xs text-muted">{pctOfGross(weekSum, weekGross).toFixed(1)}% of sales</div>
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
        return <div><p className="text-sm text-muted">Loading...</p></div>
    }

    return (
        <div>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    {/* Which month you are in. The column headings give the day
                        and the date, but on a grid full of numbers it is easy to
                        lose track of the month, so it is said once up here. */}
                    <p className="font-serif text-xl font-bold text-gray-900">{weekMonthLabel(weekStart)}</p>
                    <h2 className={`${pageTitle} mt-1`}>Weekly sales</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {activeRestaurant?.name} · enter the whole week, Sunday to Saturday
                    </p>
                </div>
                {/* The till's report first, the same words the Timesheet
                    uses for the same kind of file, then the switch to the
                    single day form for phone use. */}
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setImporting(true)}
                        className={secondaryButton}
                    >
                        Upload the till&apos;s report
                    </button>
                    <button
                        onClick={() => navigate('/sales?view=day')}
                        className={secondaryButton}
                    >
                        Day view
                    </button>
                </div>
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

            {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}
            {notRestored.length > 0 && (
                <div className={`${warningNote} mb-4`}>
                    Unsaved changes to {dayList(notRestored)} on this device were not restored,
                    because {notRestored.length === 1 ? 'that day was' : 'those days were'} changed
                    somewhere else since. What is showing now is what was saved.
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
                            <JumpButton
                                isCurrent={weekStart === weekStartOf(todayISO())}
                                onClick={() => goToWeek(weekStartOf(todayISO()))}
                            />
                        )}
                    >
                        {/* The width that keeps the arrows still lives in
                            DateStepper now, so every screen with these arrows
                            gets it. */}
                        <span className="text-sm font-medium text-gray-900 text-center whitespace-nowrap">
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
            {/* The scroller runs the full width of the screen on a phone rather
                than sitting inside the page padding.

                Inset by p-4 either side it had about 32 pixels less to scroll
                in than the screen has, and since the grid is a fixed 1000px
                wide that came straight off the far end: Saturday could be
                brought into view but never brought clear of the edge. The
                padding comes back as padding on the scrolling content, so the
                last column still ends with a margin rather than against the
                glass. Unchanged from md up, where the page has the room. */}
            <div
                className="overflow-x-auto mb-4 -mx-4 px-4 md:mx-0 md:px-0"
                onKeyDown={handleGridKeyDown}
            >
                <div className="min-w-[1000px] space-y-4">

                <div className={`${card} overflow-hidden`}>
                    <table className="w-full table-fixed">
                        {gridColumns()}
                        <thead>
                            {dayHeadRow()}

                            {/* Closed sits in the header: it is a property of the day */}
                            <tr className="border-b border-border bg-gray-50">
                                <td className="px-3 py-1.5 text-xs text-gray-500 sticky left-0 bg-gray-50 z-10">Closed</td>
                                {dates.map(d => (
                                    <td key={d} className={`px-1.5 py-1.5 text-center ${closedCol(d)}`}>
                                        <input
                                            type="checkbox"
                                            checked={days[d]?.isClosed ?? false}
                                            onChange={() => toggleClosed(d)}
                                            className={checkbox}
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
                                                ? <span className="text-muted">-</span>
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
                            <thead>
                                {trackingHeaderRow({ key: 'onlineHead', title: 'Online Platforms' })}
                                {dayHeadRow('onlineDays')}
                            </thead>
                            <tbody>
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
                            <thead>
                                {trackingHeaderRow({
                                    key: 'corporateHead',
                                    title: 'Corporate',
                                    note: 'These start as whatever you typed on the till rows above, since the till now itemises them itself. Change one if the platform pays something different after commission, and it will stop following.',
                                })}
                                {dayHeadRow('corporateDays')}
                            </thead>
                            <tbody>
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

            <p className="text-xs text-muted mb-4">
                Amber figures under the tracked rows show the difference against the till receipt. Platforms report
                commission and VAT differently, so a gap is expected and does not affect the reconciliation above.
            </p>

            {/* Above the button row rather than inside it. As a sibling of the
                button it sat beside it on one line, which squeezes both on a
                phone and is not where the eye goes after a press. */}
            {formProblem && (
              <ErrorBanner className="mb-3">{formProblem}</ErrorBanner>
            )}

            <div className="flex justify-end">
                <button
                    onClick={handleSaveWeek}
                    disabled={saving}
                    className={primaryButton('lg')}
                >
                    {saving ? 'Saving...' : 'Save week'}
                </button>
            </div>

            {importing && (
                <SalesImportDialog
                    restaurantId={restaurantId}
                    restaurantName={activeRestaurant?.name}
                    weekStart={weekStart}
                    days={days}
                    tenders={tenders}
                    shownTenders={shownTenders}
                    trackingPlatforms={cateringPlatforms}
                    loading={loading}
                    onGoToWeek={goToWeek}
                    onFill={fillFromTill}
                    onClose={() => setImporting(false)}
                />
            )}
        </div>
    )
}
