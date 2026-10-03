import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useConfirm } from '@/context/confirm'
import { useRestaurant } from '@/context/restaurant'
import { fmtMoney, num, fmtPct } from '@/lib/format'
import { addDays, weekNumber, weekRange, todayISO, shortDate } from '@/lib/dates'
import { bankHolidaysBetween, BANK_HOLIDAY_INK } from '@/lib/bankHolidays'
import { resolveTarget, statusFor } from '@/lib/costTargets'
import { friendlyError } from '@/lib/errors'
import {
    card, cardHeader, badge, secondaryButton, primaryButton, fieldClass, pageTitle, pageSubtitle,
} from '@/lib/controlStyles'
import { useState as useLocalState } from 'react'
import {
    reportFigures, sectionKey, publishCheck, figuresToStore, platformShare,
    deliveryRows, deliveryBlockers, deliveryCost, platformTaken, statementWeek, statementWords, platformWeeks,
    isCorrection, mailMissing,
} from '@/lib/weeklyReport'
import { keyedPlatforms, platformsToShow } from '@/lib/salesTenders'
import { paperworkFor } from '@/lib/reportPeople'
import { reprintDue } from '@/lib/allergenSheet'
import { weeksBack, byWeek } from '@/lib/reportChart'
import { FOOD, PACKAGING } from '@/lib/invoiceCategories'
import { chartSpecs } from '@/lib/reportCharts'
import { brandFor } from '@/lib/platformBrand'
import { uploadCharts, sendReport, sendWords } from '@/lib/reportMail'
import ReportComments from '@/components/reports/ReportComments'
import ReportProfitLoss from '@/components/reports/ReportProfitLoss'
import ReportOnlineSales from '@/components/reports/ReportOnlineSales'
import ReportCorporateSales from '@/components/reports/ReportCorporateSales'
import ReportPaperwork from '@/components/reports/ReportPaperwork'
import ReportActions from '@/components/reports/ReportActions'
import ReportPrices from '@/components/reports/ReportPrices'
import usePriceWeek from '@/components/reports/usePriceWeek'
import useCleaningWeek from '@/components/reports/useCleaningWeek'
import ReportCleaning from '@/components/reports/ReportCleaning'
import { claimActions } from '@/lib/invoiceReport'
import { costFromPaid, movePreferred, renumberPlan, alternatePlan, newGroupId } from '@/lib/priceEvents'
import { claimKind } from '@/lib/invoiceClaims'
import { readToDecide } from '@/lib/invoiceReview'
import ReportSectionHead from '@/components/reports/ReportSectionHead'
import Recipients from '@/components/reports/Recipients'
import PublishBar from '@/components/reports/PublishBar'
import WeekChart from '@/components/reports/WeekChart'
import BackButton from '@/components/ui/BackButton'
import AddButton from '@/components/ui/AddButton'
import { can, RESTAURANT_CONFIG } from '@/lib/access'
import ErrorBanner from '@/components/ui/ErrorBanner'
import SaveState from '@/components/ui/SaveState'

// One week's report.
//
// Everything green on this page is the Hub's own figures, read live from sales,
// invoices and labour. It is not stored on the report and it is not typed, so
// the number here and the number on the cost dashboard cannot disagree. On
// publish they are frozen, so an invoice entered next week cannot change what
// people were already sent.
//
// A published report is read-only. Re-opening it is a deliberate act and it is
// what makes the next mail a correction, so it does not belong on this page as
// a quiet toggle.


// Green at or under target, amber within two points over, red beyond. The same
// bands the cost dashboard uses, so a week does not look different depending on
// which screen you read it on.
// The report prints percentages to two decimals where the rest of the app
// uses one, because a food cost moving by a tenth of a point is a real
// change on a week's turnover and gets argued about.
const pct2 = v => fmtPct(v, 2)

// What stands in the way of Publish while part of the week could not be read.
const UNREAD = 'Part of this week could not be read, so it cannot go out yet. Reload the page to try again.'

const TONE = {
    green: 'text-green-700',
    amber: 'text-amber-700',
    red: 'text-red-600',
    none: 'text-muted',
}

// One cost, as a share of net sales.
//
// Net first and large, gross second and small. Net is what the business
// actually keeps and is what every target is set against; gross is here only
// because the report has always quoted it and people read for it.
function CostCard({ label, figure, share, shareGross, target }) {
    const tone = TONE[statusFor(share, target)]

    return (
        <div className="rounded-lg border border-border bg-app-bg p-4">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{label}</p>
            <p className={`font-serif text-3xl font-bold leading-none ${tone}`}>{pct2(share)}</p>
            <p className="text-sm text-muted mt-2 tabular-nums">
                of net{target ? ` · ${target}% target` : ''}
            </p>
            <p className="text-sm text-gray-700 mt-1 tabular-nums font-semibold">{fmtMoney(figure)}</p>
            <p className="text-xs text-muted mt-0.5 tabular-nums">{pct2(shareGross)} of gross</p>
        </div>
    )
}

export default function ReportPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const confirm = useConfirm()

    const [report, setReport] = useState(null)
    const [sections, setSections] = useState([])
    const [figures, setFigures] = useState(null)
    const [targets, setTargets] = useState({})
    // The online platforms and what each took this week. The takings are
    // the tracking rows from weekly sales, the ones filled by hand beside
    // the till, since that is what a platform statement is reconciled to.
    const [platforms, setPlatforms] = useState([])
    const [employees, setEmployees] = useState([])
    const [taken, setTaken] = useState({})
    // The week's days and the Sunday after it, for the delivery platforms,
    // whose statements run Monday to Sunday. See statementWeek.
    const [around, setAround] = useState([])
    // The weeks behind this one, for the charts. Read once, from the same
    // tables the figures come from, so a line and a card can never differ.
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    // Why the last read of the week stopped short, or empty when it did not.
    //
    // Every read used to fall back to nothing when it failed. No platforms
    // meant no delivery costs, so the week's earnings went up by all of them;
    // no team meant the paperwork said there was nobody to check. Publish then
    // froze that and mailed it. So a read that fails stops the load, says so,
    // and holds Publish until a read of the whole week works. It is kept apart
    // from `error`, which any write also sets and clears.
    const [readFailed, setReadFailed] = useState('')
    // Bumped after every write. The page reloads rather than each section
    // keeping its own copy of the truth, which is how two parts of a screen
    // end up disagreeing about what was just saved.
    const [refresh, setRefresh] = useState(0)
    // There is no save button anywhere on this page. Every box writes when you
    // leave it, so this is the only thing telling you it happened. Without it
    // autosave asks somebody to take it on trust, and nobody does with figures.
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState(null)
    // Whether the last write failed, kept apart from error. A week that could
    // not be read also fills error, and that is not a save going wrong.
    const [writeFailed, setWriteFailed] = useState(false)

    const isStoreManager = can(user, RESTAURANT_CONFIG)
    const canEdit = isStoreManager && report?.status === 'draft'

    // Prices and suppliers. Read live while the report is a draft and frozen
    // with everything else when it goes out, so a price accepted next week
    // cannot change what people were sent. Its own reload, because a decision
    // in it changes prices and not the report, and reading the whole page
    // again for that would be half a year of invoice lines for nothing.
    const [priceRefresh, setPriceRefresh] = useState(0)
    const [priceBusy, setPriceBusy] = useState('')
    const [priceSaid, setPriceSaid] = useState('')
    const livePrices = usePriceWeek({
        restaurantId: report?.restaurant_id,
        weekStart: report?.week_start,
        threshold: activeRestaurant?.recipe_gap_percent == null ? undefined : num(activeRestaurant.recipe_gap_percent),
        enabled: report?.status === 'draft',
        refresh: priceRefresh,
    })

    // The checklists as they stood on Saturday night. Live on a draft, frozen
    // with everything else when it goes out, the same as the prices.
    const liveCleaning = useCleaningWeek({
        restaurantId: report?.restaurant_id,
        weekStart: report?.week_start,
        enabled: report?.status === 'draft',
    })

    // Up here rather than beside the charts, because publishing needs them to
    // draw the pictures and publishing is defined before the page is.
    const onlinePlatforms = platforms.filter(p => p.bucket === 'online_platform')
    // Called catering in the database since 015, corporate everywhere a person
    // reads it.
    const corporatePlatforms = platforms.filter(p => p.bucket === 'catering')

    // Each online platform's statement and what it cost in our week.
    //
    // A draft works it out live. A sent report shows what it was sent with,
    // and one sent before the statement week existed (figures version 1) shows
    // what it said then: the typed figure as the cost, against our own week.
    const plItems = sections.find(s => s.key === 'profit_loss')?.items || []
    const frozenOnline = (figures?.platforms || []).filter(p => p.bucket === 'online_platform')
    const delivery = !report ? []
        : report.status !== 'published'
            ? deliveryRows({ platforms: onlinePlatforms, items: plItems, days: around, weekStart: report.week_start })
            : num(figures?.version) >= 2
                ? frozenOnline.map(p => ({
                    platform: { id: p.id, name: p.name },
                    statement: p.statement ?? null,
                    statementTaken: num(p.statementTaken),
                    weekTaken: num(p.weekTaken ?? p.taken),
                    rate: p.rate ?? null,
                    cost: num(p.cost),
                    typed: p.statement != null,
                }))
                : onlinePlatforms.map(p => {
                    const item = plItems.find(i => i.kind === 'delivery' && i.key === p.id)
                    const took = num(frozenOnline.find(f => f.id === p.id)?.taken)
                    return {
                        platform: p,
                        statement: item ? num(item.amount) : null,
                        statementTaken: took,
                        weekTaken: took,
                        rate: platformShare(item?.amount, took),
                        cost: num(item?.amount),
                        typed: !!item,
                        legacy: true,
                    }
                })
    const deliveryHeld = report?.status === 'draft'
        ? deliveryBlockers({ weekStart: report.week_start, rows: delivery, days: around })
        : []

    // Invoice lines from this week or before that nobody has decided on
    // Review. His answer of 30 September: the report cannot go out while any
    // are waiting. Only up to its own week, so a delivery on the Monday after
    // does not hold last week's report.
    const [toDecide, setToDecide] = useState(0)
    const reviewHeld = report?.status === 'draft' && toDecide > 0
        ? [{
            text: `${toDecide} invoice ${toDecide === 1 ? 'line' : 'lines'} from this week or earlier `
                + `${toDecide === 1 ? 'is' : 'are'} still waiting on Review.`,
            to: '/invoices/review',
            link: 'Open Review',
        }]
        : []
    const held = [...deliveryHeld, ...reviewHeld]
    const specs = chartSpecs({ onlinePlatforms, corporatePlatforms })

    // How the last send went, so somebody who presses publish is told whether
    // five people have the week or nobody does.
    const [mailed, setMailed] = useState(null)

    // Who the report goes to. The owners are worked out from the accounts, so
    // they are read rather than kept; the extras are the restaurant's standing
    // list, the same one every week until somebody changes it.
    const [owners, setOwners] = useState([])
    const [extras, setExtras] = useState([])
    // Whether the standing list was read. Read as empty when it was not, and
    // adding one address then saved a list of one over the whole of it, which
    // dropped the accountant from every week after without a word.
    const [extrasRead, setExtrasRead] = useState(false)
    // reprintDue's answer for this restaurant's allergen sheet: null while a
    // new one is not due, and undefined until it could be worked out.
    const [allergenSheet, setAllergenSheet] = useState(undefined)

    useEffect(() => {
        if (!id) return

        async function load() {
            setError('')
            // readFailed is not cleared here but at the very end, once every
            // read has come back. Cleared here, a reload after a write lifted
            // the hold the moment it started, and for the seconds the year of
            // history takes, Publish froze what the failed read had left.

            // A read that failed. Said, and Publish held, rather than the
            // week drawn and frozen with that part missing.
            const stop = err => {
                const said = friendlyError(err)
                setError(said)
                setReadFailed(said)
                setLoading(false)
            }

            const { data: head, error: hErr } = await supabase
                .from('weekly_reports')
                .select('*, report_sections(*, report_items(*))')
                .eq('id', id)
                .single()

            // Held too: on a reload the page still has the last read's week,
            // and that is not what was just saved.
            if (hErr) return stop(hErr)

            // Switching restaurant while a report is open leaves the page
            // for the list rather than staying put.
            //
            // Staying put looked harmless: the report is still the one
            // asked for, and it kept showing the right week. But the
            // switcher now says one restaurant while the page shows
            // another, and the cost targets below are read from whichever
            // restaurant is active, so a Point Campus week was being
            // graded green and red against Dun Laoghaire numbers.
            //
            // Checked here rather than after the state is set, so there
            // is no render in between with a report from one restaurant
            // and targets from the other.
            if (activeRestaurant && head.restaurant_id !== activeRestaurant.id) {
                navigate('/reports', { replace: true })
                return
            }

            setReport(head)
            setSections((head.report_sections || []).slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(s => ({
                    ...s,
                    items: (s.report_items || []).slice().sort((a, b) => a.sort_order - b.sort_order),
                })))

            const weekStart = head.week_start
            const end = addDays(weekStart, 6)

            // Every platform, both buckets, and what each took. platform_sales
            // is kept under each platform's key, which never changes, so that
            // is what is matched on. Everything the report itself stores is
            // keyed by id.
            //
            // Read to the Sunday after the week, not to its Saturday, because
            // that Sunday is the last day of the delivery platforms' statements
            // and what each one kept is worked out over their week.
            // Every column rather than a list naming key, so the report still
            // draws its platforms on a database 026 has not reached, where
            // naming a column that is not there fails the whole read.
            const [plats, days2] = await Promise.all([
                supabase.from('sales_platforms')
                    .select('*')
                    .eq('restaurant_id', head.restaurant_id)
                    .order('sort_order'),
                supabase.from('sales_records')
                    .select('sale_date, platform_sales, is_closed')
                    .eq('restaurant_id', head.restaurant_id)
                    .gte('sale_date', weekStart).lte('sale_date', addDays(end, 1)),
            ])
            if (plats.error || days2.error) return stop(plats.error || days2.error)

            // The active ones, and any retired since that took money in these
            // days, the same as the week grid shows. Retiring one mid week
            // must not take what it took out of that week's report.
            const allPlatforms = keyedPlatforms(plats.data)
            const shownPlatforms = platformsToShow(allPlatforms, (days2.data || []).map(d => d.platform_sales))
            setPlatforms(shownPlatforms)
            setAround(days2.data || [])

            // A published report reads the figures frozen into it. A draft
            // reads them live, so it is always current while it is being
            // written.
            if (head.status === 'published' && head.figures) {
                setFigures(head.figures)
            } else {
                const [days, spend, labour] = await Promise.all([
                    supabase.from('sales_records')
                        .select('sale_date, net_sales, gross_sales, is_closed')
                        .eq('restaurant_id', head.restaurant_id)
                        .gte('sale_date', weekStart).lte('sale_date', end),
                    // The view, not the invoices: see the comment on the
                    // same read in the cost dashboard.
                    supabase.from('invoice_cost_by_category')
                        .select('cost_date, category, amount, came_from')
                        .eq('restaurant_id', head.restaurant_id)
                        .gte('cost_date', weekStart).lte('cost_date', end),
                    // The view rather than the frozen table: see the
                    // comment on the same read in the cost dashboard.
                    supabase.from('labour_by_day')
                        .select('labour_cost')
                        .eq('restaurant_id', head.restaurant_id)
                        .gte('entry_date', weekStart).lte('entry_date', end),
                ])

                const failed = days.error || spend.error || labour.error
                if (failed) return stop(failed)

                const all = (head.report_sections || []).flatMap(s => s.report_items || [])
                // What each platform cost in our week, from its statement and
                // the share it kept over its own. The same rows the section
                // draws, so the total there and the one here are one sum.
                const rows = deliveryRows({
                    platforms: shownPlatforms.filter(p => p.bucket === 'online_platform'),
                    items: all,
                    days: days2.data || [],
                    weekStart,
                })
                setFigures(reportFigures({
                    days: days.data || [],
                    spend: spend.data || [],
                    labour: labour.data || [],
                    overheads: all.filter(i => i.kind === 'overhead'),
                    delivery: rows.map(r => ({ amount: r.cost })),
                }))

                // After the figures, so a read that fails still draws the
                // week, says so and holds Publish like any other: a count of
                // nothing would let it out with lines undecided.
                const waiting = await readToDecide(head.restaurant_id, { upTo: end })
                if (waiting.error) return stop(waiting.error)
                setToDecide(waiting.lines.length)
            }

            const [ownerRows, place, changedRes] = await Promise.all([
                supabase.from('users')
                    .select('id, full_name')
                    .eq('restaurant_id', head.restaurant_id)
                    .eq('role', 'owner').eq('is_active', true)
                    // The same filter the function uses. If these two ever
                    // disagree the card names somebody who gets nothing, which
                    // is the exact thing it exists to prevent.
                    .eq('is_test', false)
                    .order('full_name'),
                supabase.from('restaurants')
                    .select('report_recipients')
                    .eq('id', head.restaurant_id).maybeSingle(),
                // When anything on the allergen sheet last changed, for the
                // line in the paperwork saying a new one is due.
                supabase.rpc('allergens_changed_at'),
            ])
            setExtrasRead(!place.error)
            if (ownerRows.error || place.error) return stop(ownerRows.error || place.error)
            setOwners(ownerRows.data || [])
            setExtras(place.data?.report_recipients || [])

            // The printed allergen sheet, checked as things stand today like
            // the rest of the paperwork, and said only while a new one is due.
            //
            // When it was printed comes from the restaurant already loaded,
            // checked above to be this report's, and not from the read of the
            // recipients. Asked there, a database without the two columns
            // failed that read and the card showed nobody, and adding one
            // person back would have saved a list of one over the whole list.
            //
            // Left unanswered when the date would not come back, rather than
            // null, which is what a sheet that is not due gets. A reminder
            // worked out from half of what it needs would be a guess.
            setAllergenSheet(changedRes.error || !activeRestaurant ? undefined : reprintDue({
                printedAt: activeRestaurant.allergen_sheet_printed_at,
                everyMonths: activeRestaurant.allergen_sheet_every_months,
                changedAt: changedRes.data,
            }))

            // Our week only. The days read above run a day past it.
            const totals = {}
            for (const p of shownPlatforms) {
                totals[p.id] = platformTaken(days2.data, p.key, weekStart, end)
            }
            setTaken(totals)

            // The last twelve months up to this week, for the charts.
            //
            // One read over the whole range and folded into weeks here, rather
            // than fifty two round trips. A year of days is under four hundred
            // rows, which is nothing, and the alternative is a page that takes
            // a second to draw a line.
            const weekStarts = weeksBack(weekStart)
            const yearFrom = weekStarts[0]

            const [hDays, hSpend, hLabour, hReports] = await Promise.all([
                // A day past the week, for this week's platform statements.
                // It lands in a week the charts do not draw.
                supabase.from('sales_records')
                    .select('sale_date, net_sales, gross_sales, platform_sales, is_closed')
                    .eq('restaurant_id', head.restaurant_id)
                    .gte('sale_date', yearFrom).lte('sale_date', addDays(end, 1)),
                // Not like the rest: one row per typed invoice and per claim,
                // so a year of it can pass a thousand rows, and a single read
                // stops there. Paged, and ordered by every column it returns
                // because the view has no id. Two rows tied on all three are
                // the same figures, so whichever page each lands on, nothing
                // is counted twice or missed.
                everyRow(() => supabase.from('invoice_cost_by_category')
                    .select('cost_date, category, amount')
                    .eq('restaurant_id', head.restaurant_id)
                    .gte('cost_date', yearFrom).lte('cost_date', end)
                    .order('cost_date').order('category').order('amount')),
                supabase.from('labour_by_day')
                    .select('entry_date, labour_cost')
                    .eq('restaurant_id', head.restaurant_id)
                    .gte('entry_date', yearFrom).lte('entry_date', end),
                // Overheads and delivery costs live on each week's own report,
                // so a week nobody wrote up has no answer rather than a nought.
                supabase.from('weekly_reports')
                    .select('week_start, report_sections(report_items(kind, key, amount))')
                    .eq('restaurant_id', head.restaurant_id)
                    .gte('week_start', yearFrom).lte('week_start', weekStart),
            ])
            // The charts go out as pictures, so a year that did not come back
            // would be mailed as a line along the bottom.
            const lost = hDays.error || hSpend.error || hLabour.error || hReports.error
            if (lost) return stop(lost)

            const trading = (hDays.data || []).filter(d => !d.is_closed)
            const netWeeks = byWeek(trading, 'sale_date', d => d.net_sales)
            const grossWeeks = byWeek(trading, 'sale_date', d => d.gross_sales)
            const foodWeeks = byWeek(
                (hSpend.data || []).filter(r => FOOD.includes(r.category)),
                'cost_date', r => r.amount)
            const packWeeks = byWeek(
                (hSpend.data || []).filter(r => PACKAGING.includes(r.category)),
                'cost_date', r => r.amount)
            const labourWeeks = byWeek(hLabour.data || [], 'entry_date', l => l.labour_cost)

            // What each past report typed into its profit and loss.
            const reported = new Map()
            for (const r of hReports.data || []) {
                const items = (r.report_sections || []).flatMap(sec => sec.report_items || [])
                const standing = items
                    .filter(i => i.kind === 'overhead')
                    .reduce((t, i) => t + num(i.amount), 0)
                // Each statement costed the same way as this week's, so a
                // line on the chart and the figure on the card cannot differ.
                // Every week, including the ones already sent: what was typed
                // was always the platform's Monday to Sunday statement. A sent
                // report keeps the figures it went out with either way.
                const delivery = {}
                let deliveryTotal = 0
                const { from, to } = statementWeek(r.week_start)
                for (const i of items.filter(i => i.kind === 'delivery')) {
                    // Every platform, retired or not, since a past week's
                    // statement can belong to one retired since. A line
                    // from a platform deleted outright only has the name it
                    // was written with.
                    const key = allPlatforms.find(p => p.id === i.key)?.key ?? i.label
                    const { cost } = deliveryCost({
                        statement: i.amount,
                        statementTaken: platformTaken(hDays.data, key, from, to),
                        weekTaken: platformTaken(hDays.data, key, r.week_start, addDays(r.week_start, 6)),
                    })
                    delivery[i.key] = cost
                    deliveryTotal += cost
                }
                reported.set(r.week_start, { standing, delivery, deliveryTotal })
            }

            // Each platform's own weekly line, and the two totals. Over every
            // platform that took money this year, not only the ones this week
            // shows, so retiring one does not take it out of past weeks.
            //
            // The chart keys are prefixed rather than used raw: a platform
            // called "net" or "food" would otherwise collide with a column on
            // the same row and quietly draw the wrong line.
            const platformRows = platformWeeks({ platforms: allPlatforms, days: hDays.data || [], weeks: weekStarts })

            setHistory(weekStarts.map(week => {
                const row = {
                    week,
                    net: netWeeks.get(week) || 0,
                    gross: grossWeeks.get(week) || 0,
                    food: foodWeeks.get(week) || 0,
                    packaging: packWeeks.get(week) || 0,
                    labour: labourWeeks.get(week) || 0,
                    ...platformRows.get(week),
                }

                // Null, not nought, for a week nobody wrote up. The chart
                // leaves a gap where there is no answer.
                const pl = reported.get(week)
                row.earnings = null
                row.deliveryTotal = null
                for (const p of shownPlatforms) row[`d_${p.id}`] = null

                if (pl) {
                    row.deliveryTotal = pl.deliveryTotal
                    for (const p of shownPlatforms) {
                        if (p.id in pl.delivery) row[`d_${p.id}`] = pl.delivery[p.id]
                    }
                    row.earnings = row.net - row.food - row.packaging - row.labour
                        - pl.standing - pl.deliveryTotal
                }

                return row
            }))

            // The team, for the paperwork lines. Only the fields the
            // section reads, so a mail built from this cannot carry anything
            // else about anybody.
            const { data: team, error: teamError } = await supabase
                .from('employees')
                .select('id, full_name, started_on, ended_on, on_trial, food_safety_expires, work_permission, work_permission_expires, permission_renewal_applied')
                .eq('restaurant_id', head.restaurant_id)
            if (teamError) return stop(teamError)
            setEmployees(team || [])

            // Targets are looked up for the week being reported on rather than
            // taken from today's settings, so a target changed in September
            // does not change how an August week is judged.
            const { data: overrides, error: targetError } = await supabase
                .from('cost_target_overrides')
                .select('*')
                .eq('restaurant_id', head.restaurant_id)
            if (targetError) return stop(targetError)

            setTargets({
                food: resolveTarget(overrides || [], 'food', weekStart, num(activeRestaurant?.food_cost_target)),
                labour: resolveTarget(overrides || [], 'labour', weekStart, num(activeRestaurant?.labour_cost_target)),
                packaging: resolveTarget(overrides || [], 'packaging', weekStart, num(activeRestaurant?.packaging_cost_target)),
            })

            setReadFailed('')
            setLoading(false)
        }

        load()
    }, [id, activeRestaurant, refresh, navigate])

    // Every write on this page goes through here.
    //
    // One place that sets the saving flag, reports the failure and reloads, so
    // no handler can be written later that saves without saying so. The reload
    // is deliberate: the alternative is each section keeping its own copy of
    // the truth, which is how two halves of a screen end up disagreeing about
    // what was just typed.
    async function write(run) {
        setSaving(true)
        const { error: err } = await run()
        setSaving(false)

        if (err) { setError(friendlyError(err)); setWriteFailed(true); return false }
        setError('')
        setWriteFailed(false)
        setSavedAt(new Date())
        setRefresh(n => n + 1)
        return true
    }

    // Comments, one card each.
    async function addComment(sectionId, note) {
        const section = sections.find(s => s.id === sectionId)
        const order = (section?.items.filter(i => i.kind === 'comment').length) || 0
        return write(() => supabase.from('report_items')
            .insert({ section_id: sectionId, kind: 'comment', note, sort_order: order }))
    }

    async function saveItem(itemId, patch) {
        return write(() => supabase.from('report_items').update(patch).eq('id', itemId))
    }

    async function removeItem(itemId) {
        return write(() => supabase.from('report_items').delete().eq('id', itemId))
    }

    const saveComment = (itemId, note) => saveItem(itemId, { note })

    // An overhead keeps its carried_from, so the report can always say what it
    // was before somebody opened it. Only the amount moves.
    async function saveOverhead(itemId, amount) {
        return write(() => supabase.from('report_items').update({ amount }).eq('id', itemId))
    }

    async function addOverhead(label) {
        const pl = sections.find(s => s.key === 'profit_loss')
        if (!pl) return
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'line'
        const order = pl.items.filter(i => i.kind === 'overhead').length
        return write(() => supabase.from('report_items').insert({
            section_id: pl.id, kind: 'overhead', key, label, amount: 0, sort_order: order,
        }))
    }

    // A delivery line is written the first time a figure is typed into it,
    // rather than fourteen empty rows being created for every week whether the
    // platform traded or not.
    async function saveDelivery(platform, amount) {
        const pl = sections.find(s => s.key === 'profit_loss')
        if (!pl) return
        const existing = pl.items.find(i => i.kind === 'delivery' && i.key === platform.id)

        return write(() => existing
            ? supabase.from('report_items').update({ amount }).eq('id', existing.id)
            : supabase.from('report_items').insert({
                section_id: pl.id, kind: 'delivery', key: platform.id,
                label: platform.name, amount, sort_order: platform.sort_order || 0,
            }))
    }

    // ---- online sales ----
    //
    // A rating, a review and a refund all hang off a platform by its id rather
    // than its name, so renaming a platform in settings does not orphan a
    // week's notes, the way it used to orphan its takings.
    const online = () => sections.find(s => s.key === 'online_sales')

    async function saveRating(platform, value) {
        const section = online()
        if (!section) return
        const existing = section.items.find(i => i.kind === 'rating' && i.key === platform.id)

        return write(() => existing
            ? supabase.from('report_items').update({ amount: value }).eq('id', existing.id)
            : supabase.from('report_items').insert({
                section_id: section.id, kind: 'rating', key: platform.id,
                label: platform.name, amount: value, sort_order: platform.sort_order || 0,
            }))
    }

    async function addReview(platform, stars, count) {
        const section = online()
        if (!section) return
        return write(() => supabase.from('report_items').insert({
            section_id: section.id, kind: 'review', key: platform.id,
            label: platform.name, meta: { stars, count },
            sort_order: section.items.filter(i => i.kind === 'review').length,
        }))
    }

    // The note on a corporate platform, saying who the job was for.
    //
    // Stored as a comment carrying the platform's id, which is what keeps it on
    // its own line rather than loose at the bottom of the section. A comment
    // with no id is a section comment, and that one distinction is the whole
    // difference between the two.
    async function savePlatformNote(sectionId, platform, note) {
        const section = sections.find(s => s.id === sectionId)
        const existing = section?.items.find(
            i => i.kind === 'comment' && i.key === platform.id)

        if (!note) {
            return existing ? removeItem(existing.id) : undefined
        }

        return write(() => existing
            ? supabase.from('report_items').update({ note }).eq('id', existing.id)
            : supabase.from('report_items').insert({
                section_id: sectionId, kind: 'comment', key: platform.id,
                label: platform.name, note, sort_order: platform.sort_order || 0,
            }))
    }

    // ---- publishing ----
    //
    // The figures are frozen onto the report here and nowhere else. Up to this
    // moment a draft reads them live so it is always current; from this moment
    // it reads what was stored, because an invoice entered next week must not
    // change what five people were already sent.
    // Everything the mail says, frozen as one lump.
    //
    // The money is only half of it. The platform takings and the paperwork are
    // read live on the screen, which is right for a draft and wrong for a
    // report that has gone out: somebody's permit renewed in October must not
    // change what a report sent in September said. So they are frozen here
    // beside the figures, and the mail reads the frozen copy.
    function frozenFigures() {
        const { food, permits } = paperworkFor(employees, report.week_start, todayISO())

        return figuresToStore({
            ...figures,
            // The colour travels with the platform rather than being worked
            // out again in the mail. Only what is inside a function's own
            // folder gets deployed with it, so the alternative was writing the
            // brand colours down a second time where nobody would think to
            // change them.
            platforms: platforms.map(p => ({
                id: p.id, name: p.name, bucket: p.bucket,
                taken: taken[p.id] || 0,
                // An online platform's statement, what it took over the
                // statement's week and over ours, the share it kept and what
                // that cost us. The mail cannot work any of it out.
                ...deliveryFrozen(delivery.find(r => r.platform.id === p.id)),
                // Both shades. `mark` paints the edge of the platform's block,
                // `ink` is the same colour taken down until it reads as
                // lettering. The mail cannot work them out for itself: only
                // what is inside a function's own folder gets deployed with
                // it, so the alternative was writing the brand colours down a
                // second time where nobody would think to change them.
                mark: brandFor(p.name).mark,
                colour: brandFor(p.name).ink,
            })),

            // The targets this week was judged against, frozen with everything
            // else. resolveTarget already picked the one in force for the week
            // rather than the one set today; freezing it means a target changed
            // in October cannot repaint a report sent in September.
            targets,
            // Which days the statements covered, in words, for the mail.
            statement: {
                ...statementWeek(report.week_start),
                words: statementWords(report.week_start),
            },
            // The price section exactly as it stood, words and all, because
            // the mail cannot work any of it out for itself.
            prices: livePrices.ready ? livePrices.data : null,
            // The checklists, words and all, with the paths of the week's
            // photos so the page can still show them while they are kept.
            cleaning: liveCleaning.ready ? liveCleaning.data : null,
            paperwork: {
                food,
                // Frozen with whether a renewal had been applied for, because
                // that is the difference between somebody who cannot legally be
                // on next week's roster and somebody who is waiting on the post.
                permits,
                // Only while a new allergen sheet is due, in the words the
                // Public Allergens page uses. Null says it was checked and
                // was not. Undefined, when it could not be checked, is left
                // out of the stored copy, the same as a report frozen before
                // version 3.
                allergenSheet,
            },
        })
    }

    // The price section and the checklists are frozen with everything else,
    // so both have to have finished reading, and be this week's, before
    // anything goes out.
    function stillReading() {
        if (sections.some(s => s.key === 'cleaning') && !liveCleaning.ready) {
            setError(liveCleaning.error
                ? `The checklists could not be read, so this cannot go out yet: ${liveCleaning.error}`
                : 'The checklists are still being read. Give it a moment and press it again.')
            return true
        }
        if (!sections.some(s => s.key === 'prices_suppliers')) return false
        if (livePrices.ready) return false
        setError(livePrices.error
            ? `The prices could not be read, so this cannot go out yet: ${livePrices.error}`
            : 'The prices are still being read. Give it a moment and press it again.')
        return true
    }

    async function publish() {
        const check = publishCheck(sections, figures, held)
        if (readFailed || check.blockers.length > 0) return
        if (stillReading()) return

        // First unless an earlier send reached somebody. See isCorrection.
        const first = !isCorrection(report)
        const ok = await confirm({
            title: first ? 'Send this report?' : 'Send a correction?',
            message: first
                ? 'The figures are frozen as they stand and the report goes out. You can re-open it afterwards '
                    + 'if something needs changing.'
                : 'Everyone who got the first one gets this, marked as a correction saying what changed.',
            confirmLabel: first ? 'Send it' : 'Send the correction',
        })
        if (!ok) return

        setMailed(null)
        setSaving(true)
        try {
            // The pictures first. They have to exist before the mail can point
            // at them, and a chart that will not draw is left out rather than
            // stopping the report.
            const charts = await uploadCharts({
                reportId: report.id, rows: history, onlinePlatforms, corporatePlatforms,
            })

            // What the last mail said, kept so the next one can say what
            // changed. Only from the second send on: the first has nothing to
            // be a correction of.
            const previous = first ? null : report.figures

            const { error: saveError } = await supabase.from('weekly_reports').update({
                status: 'published',
                figures: frozenFigures(),
                previous_figures: previous,
                charts,
                published_at: new Date().toISOString(),
                published_by: user.id,
                // One again when nobody got the last one, because the mail
                // calls anything past one a correction.
                send_count: first ? 1 : (report.send_count || 0) + 1,
            }).eq('id', report.id)
            if (saveError) throw saveError

            // Frozen first, sent second, and deliberately in that order. A
            // report that was frozen but not mailed says so and can be sent
            // from the bar. One that was mailed off figures nothing kept is a
            // week nobody can ever look up again.
            try {
                const result = await sendReport({ reportId: report.id })
                setMailed(sendWords(result))
            } catch (err) {
                setMailed(`Published, but the mail did not go out: ${err.message}`)
            }

            setRefresh(n => n + 1)
        } catch (err) {
            setError(friendlyError(err))
        } finally {
            setSaving(false)
        }
    }

    // Changing who gets it.
    //
    // The list lives on the restaurant rather than on the report, so this is
    // the same list next week and the week after. Taking somebody off is
    // confirmed, since it is silent otherwise: nothing happens until Monday,
    // and by Monday nobody remembers doing it.
    async function changeRecipients(list) {
        if (!extrasRead) return
        const gone = extras.filter(a => !list.includes(a))
        if (gone.length > 0) {
            const ok = await confirm({
                title: 'Take them off the list?',
                message: `${gone.join(', ')} will stop getting the weekly report, this week and `
                    + 'every week after, until somebody adds them back.',
                confirmLabel: 'Take them off',
            })
            if (!ok) return
        }

        const before = extras
        setExtras(list)
        const { error: saveError } = await supabase.from('restaurants')
            .update({ report_recipients: list })
            .eq('id', report.restaurant_id)

        if (saveError) {
            setExtras(before)
            setError(friendlyError(saveError))
        }
    }

    // A test send.
    //
    // The report exactly as it would go out, to the person asking and nobody
    // else. Nothing is frozen and nothing is counted as a send, so a draft can
    // be tried as many times as it takes to look right.
    //
    // Who it goes to is not decided here or posted from here. The function
    // sends a test to whoever is logged in, which is a rule a browser cannot
    // talk it out of.
    async function testSend() {
        // A test goes to the list too, so one built from half a week is not
        // sent either.
        if (readFailed) { setError(UNREAD); return }
        if (stillReading()) return
        setMailed(null)
        setSaving(true)
        try {
            const charts = await uploadCharts({
                reportId: report.id, rows: history, onlinePlatforms, corporatePlatforms, test: true,
            })
            const result = await sendReport({
                reportId: report.id, test: true, figures: frozenFigures(), charts,
            })
            setMailed(sendWords(result, { test: true }))
        } catch (err) {
            setMailed(`The test did not go out: ${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    // Sending one that was published and never went.
    //
    // The report as it was frozen, mailed for the first time. Nothing is
    // written to it here: the figures and charts are the ones already on it,
    // and the count stays where it is, so the mail is not a correction. The
    // function writes who it went to once it has gone, which is what turns
    // this bar back into Sent.
    async function sendUnsent() {
        const ok = await confirm({
            title: 'Send this report?',
            message: 'It goes to everyone on the list below, with the figures as they were frozen.',
            confirmLabel: 'Send it',
        })
        if (!ok) return

        setMailed(null)
        setSaving(true)
        try {
            const result = await sendReport({ reportId: report.id })
            setMailed(sendWords(result))
            setRefresh(n => n + 1)
        } catch (err) {
            setMailed(`The mail did not go out: ${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    // Re-opening does not clear published_at, send_count or sent_to. What went
    // out went out, and the next mail has to know whether it is a correction,
    // which it is only when the last one reached somebody. A report whose mail
    // never went can be re-opened too, and publishing that one again sends it
    // for the first time, so it is not told otherwise. See isCorrection.
    async function reopen() {
        const ok = await confirm({
            title: 'Re-open this report?',
            message: isCorrection(report)
                ? 'It goes back to a draft and the figures go live again. Nothing is unsent: publishing it '
                    + 'a second time mails a correction to everyone who got the first.'
                : 'It goes back to a draft and the figures go live again. Nobody got it the first time, so '
                    + 'publishing it sends it as the first mail, not a correction.',
            confirmLabel: 'Re-open it',
        })
        if (!ok) return

        await write(() => supabase.from('weekly_reports').update({
            status: 'draft',
            reopened_at: new Date().toISOString(),
        }).eq('id', report.id))
    }

    // ---- the sections themselves ----
    //
    // A section belongs to a report, not to a restaurant, and a new report
    // copies the list from the one before it. So adding one here is what makes
    // it appear every week from now on, and dropping one is what stops it,
    // with no template anywhere for somebody to keep in step.
    //
    // Every earlier report keeps its own copy either way, so nothing already
    // sent changes.
    async function addSection(title) {
        const taken = sections.map(s => s.key)
        // Cleaning stays last, which is where he asked for it, so a section
        // added now goes in just before it.
        const last = sections.find(s => s.key === 'cleaning')
        return write(async () => {
            if (last) {
                const moved = await supabase.from('report_sections').update({ sort_order: sections.length }).eq('id', last.id)
                if (moved.error) return moved
            }
            return supabase.from('report_sections').insert({
                report_id: report.id,
                key: sectionKey(title, taken),
                title,
                sort_order: last ? last.sort_order : sections.length,
            })
        })
    }

    async function renameSection(sectionId, title) {
        return write(() => supabase.from('report_sections').update({ title }).eq('id', sectionId))
    }

    async function removeSection(sectionId) {
        return write(() => supabase.from('report_sections').delete().eq('id', sectionId))
    }

    // ---- support and actions ----
    //
    // An action is raised against the week it first appears in and carries the
    // date with it, so how long it has been open needs nothing else stored.
    async function addAction(label, weekStart) {
        const section = sections.find(s => s.key === 'support_actions')
        if (!section) return
        return write(() => supabase.from('report_items').insert({
            section_id: section.id, kind: 'action', label,
            opened_on: weekStart,
            sort_order: section.items.filter(i => i.kind === 'action').length,
        }))
    }

    // The claims that are still owed, onto the support list.
    //
    // An action already carries from week to week until somebody ticks it, so
    // nothing new has to be built to make a claim stay in front of people: it
    // is added once, keyed by the claim, and crossed off when the credit lands.
    async function putClaimsOnList(jobs) {
        const section = sections.find(s => s.key === 'support_actions')
        if (!section) return 'This report has no support section to put them on.'

        const at = section.items.filter(i => i.kind === 'action').length
        if (jobs.add.length) {
            const { error: e1 } = await supabase.from('report_items').insert(
                jobs.add.map((job, i) => ({ ...job, section_id: section.id, sort_order: at + i })),
            )
            if (e1) return friendlyError(e1)
        }

        if (jobs.tick.length) {
            const { error: e2 } = await supabase.from('report_items')
                .update({ done_on: todayISO() })
                .in('id', jobs.tick.map(item => item.id))
            if (e2) return friendlyError(e2)
        }

        // Back on for a claim asked again, and words brought up to date. One
        // write each, because each has words of its own.
        for (const { id, patch } of [...jobs.reopen, ...jobs.relabel]) {
            const { error: e3 } = await supabase.from('report_items').update(patch).eq('id', id)
            if (e3) return friendlyError(e3)
        }

        setRefresh(n => n + 1)
        return null
    }

    // ---- the decisions in the price section ----
    //
    // Each one changes what recipes cost or what a code means, never the
    // report, so each is asked about first and then only the price section is
    // read again.
    async function decidePrice(key, question, work, done) {
        const ok = await confirm(question)
        if (!ok) return
        setPriceBusy(key)
        setPriceSaid('')
        setError('')
        const failed = await work()
        setPriceBusy('')
        if (failed) { setError(failed); return }
        setPriceSaid(done)
        setPriceRefresh(n => n + 1)
    }

    function costFrom(item, key) {
        const row = livePrices.prices.find(p => p.id === item.priceId)
        return decidePrice(key, {
            title: `Cost ${item.name} from what we pay?`,
            message: `Every recipe with ${item.name} in it will cost it at ${fmtMoney(item.paid)} ${item.unit} `
                + `instead of ${fmtMoney(item.recipe)}, the price on the invoice of ${shortDate(item.paidOn)}.`,
            confirmLabel: 'Cost from it',
        }, async () => {
            const out = costFromPaid(item, row, {
                restaurantId: report.restaurant_id, userId: user?.id, at: new Date().toISOString(),
            })
            if (!out) return 'That price is not in the Hub any more. Reload the page.'
            const { error: e1 } = await supabase.from('product_supplier_prices').update(out.patch).eq('id', out.priceId)
            if (e1) return friendlyError(e1)
            const { error: e2 } = await supabase.from('product_price_events').insert(out.event)
            return e2 ? friendlyError(e2) : null
        }, `${item.name} is costed from ${fmtMoney(item.paid)} ${item.unit} now.`)
    }

    function makeUsual(item, key) {
        const to = livePrices.prices.find(p => p.id === item.priceId)
        const from = livePrices.prices.find(p => p.id === item.fromPriceId)
        return decidePrice(key, {
            title: `Make ${item.bought} the usual one?`,
            message: `Recipes with ${item.name} in them will cost it at ${fmtMoney(item.rowPer)} ${item.unit}, `
                + `the price the Hub has for ${item.bought} (code ${item.code}), and the report will compare `
                + 'everything else with it from now on. If that price is not what is paid now, the report '
                + 'says so next.',
            confirmLabel: 'Make it the usual one',
        }, async () => {
            if (!to || to.price_per_unit == null) return 'That price is not in the Hub any more. Reload the page.'
            const move = movePreferred({ id: item.productId }, to, {
                restaurantId: report.restaurant_id, userId: user?.id, from, at: new Date().toISOString(),
            })
            if (move.off) {
                const { error: e1 } = await supabase.from('product_supplier_prices')
                    .update({ is_preferred: false }).eq('id', move.off)
                if (e1) return friendlyError(e1)
            }
            const { error: e2 } = await supabase.from('product_supplier_prices')
                .update({ is_preferred: true }).eq('id', move.on)
            if (e2) return friendlyError(e2)
            const { error: e3 } = await supabase.from('product_price_events').insert({
                ...move.event, note: `Bought as ${item.bought} three times in a row`,
            })
            return e3 ? friendlyError(e3) : null
        }, `${item.name} is costed from ${item.bought} now.`)
    }

    function renumber(item, key) {
        const plan = renumberPlan(item)
        return decidePrice(key, {
            title: 'The same thing under a new number?',
            message: `${item.bought} (code ${item.code}) and the ${item.name} usually bought`
                + `${item.usualCode ? ` (code ${item.usualCode})` : ''} become one, with one price and one price `
                + 'history. What recipes cost it at does not change here: if the price moved, it shows as a price '
                + 'change from now on.',
            confirmLabel: 'They are the same',
        }, async () => {
            if (!plan) return 'The Hub cannot join these two. Match the code in the review instead.'
            if (plan.moveLines) {
                const { error: e1 } = await supabase.from('invoice_lines')
                    .update({ price_id: plan.moveLines.to }).eq('price_id', plan.moveLines.from)
                if (e1) return friendlyError(e1)
            }
            if (plan.release) {
                const { error: e2 } = await supabase.from('supplier_codes')
                    .update({ price_id: null }).eq('id', plan.release)
                if (e2) return friendlyError(e2)
            }
            // Asked to say what it removed, because a removal the database
            // quietly declines comes back with no error and nothing gone, and
            // the green peppers were left with a price nobody pointed at.
            if (plan.drop) {
                const { data: gone, error: e3 } = await supabase.from('product_supplier_prices')
                    .delete().eq('id', plan.drop).select('id')
                if (e3) return friendlyError(e3)
                if (!gone?.length) {
                    return "The code was joined, but its old price could not be removed. It is on the product's "
                        + 'prices page and nothing uses it: delete it there.'
                }
            }
            const { error: e4 } = await supabase.from('supplier_codes').update(plan.point.patch).eq('id', plan.point.id)
            if (e4) return friendlyError(e4)
            if (plan.rowCode) {
                const { error: e5 } = await supabase.from('product_supplier_prices')
                    .update({ supplier_code: plan.rowCode.supplier_code }).eq('id', plan.rowCode.id)
                if (e5) return friendlyError(e5)
            }
            return null
        }, `${item.bought} and the usual ${item.name} are one version now.`)
    }

    // The same thing bought either way. Nothing is moved or removed: the two
    // codes go in one group and each keeps its own price.
    function buyBoth(item, key) {
        const plan = alternatePlan(item, newGroupId())
        return decidePrice(key, {
            title: 'Same thing, you usually buy both?',
            message: `${item.bought} (code ${item.code}) and ${item.usualName}`
                + `${item.usualCode ? ` (code ${item.usualCode})` : ''} become one product bought either way. `
                + 'Each keeps its own price, neither is listed as bought instead of the other again, and recipes are '
                + 'checked against what they cost on average.',
            confirmLabel: 'We buy both',
        }, async () => {
            if (!plan) return 'The Hub cannot group these two. The usual price has no code on it.'
            const { error: e1 } = await supabase.from('supplier_codes')
                .update({ alternate_group: plan.group }).in('id', plan.rows)
            if (e1) return friendlyError(e1)
            if (plan.fold) {
                const { error: e2 } = await supabase.from('supplier_codes')
                    .update({ alternate_group: plan.group }).eq('alternate_group', plan.fold)
                if (e2) return friendlyError(e2)
            }
            return null
        }, `${item.name} is bought either way now.`)
    }

    // A label on the credit note and nothing else. Logging a claim for it now
    // would take its money off the week the delivery happened, which may be a
    // report already sent.
    function giveReason(item, reason, key) {
        const label = claimKind(reason).label
        return decidePrice(key, {
            title: `${label}?`,
            message: `${item.what} (${item.number || 'credit note'}) will say ${label.toLowerCase()} `
                + 'on this report and every one after. No money moves and no week changes.',
            confirmLabel: 'Give the reason',
        }, async () => {
            const { error: e1 } = await supabase.from('invoices').update({ credit_reason: reason }).eq('id', item.id)
            return e1 ? friendlyError(e1) : null
        }, 'Saved.')
    }

    async function listClaims(jobs) {
        setPriceBusy('list')
        setPriceSaid('')
        const failed = await putClaimsOnList(jobs)
        setPriceBusy('')
        if (failed) { setError(failed); return }
        setPriceSaid(jobs.add.length
            ? 'The support list has them now, and they stay on it until they are ticked.'
            : 'The support list is up to date.')
    }

    async function addRefund(platform) {
        const section = online()
        if (!section) return
        return write(() => supabase.from('report_items').insert({
            section_id: section.id, kind: 'refund', key: platform.id,
            label: platform.name, amount: 0,
            sort_order: section.items.filter(i => i.kind === 'refund').length,
        }))
    }

    // The comments on a section, which are the ones belonging to nothing
    // narrower. A comment carrying a key belongs to a platform and is drawn on
    // that platform's line instead.
    function commentsOf(section) {
        return section.items.filter(i => i.kind === 'comment' && !i.key)
    }

    if (loading) {
        return <p className="text-sm text-muted">Loading the week.</p>
    }

    // No figures means the first read of the week failed before they came
    // back, and there is no week to draw. It used to try, and fell over on
    // the first figure.
    if (!report || !figures) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-red-700">
                    {error || (report ? 'This week could not be read.' : 'That report could not be found.')}
                </p>
                <BackButton to="/reports">Back to reports</BackButton>
            </div>
        )
    }

    const week = report.week_start
    const salesCosts = sections.find(s => s.key === 'sales_costs')
    const check = publishCheck(sections, figures, held)
    const blockers = readFailed ? [UNREAD, ...check.blockers] : check.blockers

    return (
        <div className="space-y-4">
            {/* The header stacks on a phone. The week and its dates are the
                thing you need to be sure of before typing anything into it. */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                    <BackButton to="/reports" className="mb-2">All reports</BackButton>
                    <h2 className={pageTitle}>Week {weekNumber(week)}</h2>
                    <p className={pageSubtitle}>
                        {weekRange(week)} &middot; {activeRestaurant?.name}
                    </p>
                    {/* A week with a bank holiday in it is not comparable with
                        the one before it, in sales or in what it cost to staff.
                        Whoever reads the report should not have to work out
                        which week that was. */}
                    {bankHolidaysBetween(week, addDays(week, 6)).map(holiday => (
                        <p
                            key={holiday.date}
                            className="text-xs font-bold mt-1"
                            style={{ color: BANK_HOLIDAY_INK }}
                        >
                            {holiday.name}, {shortDate(holiday.date)}
                        </p>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 flex-shrink-0 self-start">
                    {canEdit && <SaveState problem={writeFailed} saving={saving} savedAt={savedAt} />}
                    <span className={`${badge} ${report.status === 'draft' || mailMissing(report)
                        ? 'bg-accent-light text-accent-ink'
                        : 'bg-green-50 text-green-700'}`}>
                        {report.status === 'draft'
                            ? (report.send_count > 0 ? 'Re-opened' : 'Draft')
                            : mailMissing(report) ? 'Not sent' : 'Sent'}
                    </span>
                </div>
            </div>

            {error && (
                <ErrorBanner>
                    {error}
                </ErrorBanner>
            )}

            <PublishBar
                report={report}
                blockers={blockers}
                warnings={check.warnings}
                canWrite={isStoreManager}
                busy={saving}
                mailed={mailed}
                onPublish={publish}
                onReopen={reopen}
                onTest={testSend}
                onSend={sendUnsent}
            />

            <Recipients
                owners={owners}
                extras={extras}
                canEdit={isStoreManager && extrasRead}
                busy={saving}
                onChange={changeRecipients}
            />

            {/* SALES AND COSTS */}
            <div className={card}>
                {salesCosts ? (
                    <ReportSectionHead
                        section={salesCosts}
                        canEdit={canEdit}
                        onRename={renameSection}
                        onRemove={removeSection}
                        note="From the Hub"
                    />
                ) : (
                    <div className={`${cardHeader} rounded-t-xl`}>Sales and costs</div>
                )}

                <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="rounded-lg border border-border bg-app-bg p-4">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Net sales</p>
                            <p className="font-serif text-3xl font-bold text-sidebar leading-none tabular-nums">
                                {fmtMoney(figures.net)}
                            </p>
                            <p className="text-sm text-muted mt-2 tabular-nums">
                                {fmtMoney(figures.gross)} gross
                            </p>
                        </div>
                        <div className="rounded-lg border border-border bg-app-bg p-4">
                            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Trading days</p>
                            <p className="font-serif text-3xl font-bold text-sidebar leading-none tabular-nums">
                                {figures.tradingDays}
                            </p>
                            <p className="text-sm text-muted mt-2">
                                {figures.tradingDays === 7 ? 'Open all week' : 'The rest were closed'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <CostCard
                            label="Food"
                            figure={figures.food}
                            share={figures.foodPct}
                            shareGross={figures.foodPctGross}
                            target={targets.food}
                        />
                        <CostCard
                            label="Labour"
                            figure={figures.labour}
                            share={figures.labourPct}
                            shareGross={figures.labourPctGross}
                            target={targets.labour}
                        />
                        <CostCard
                            label="Packaging and cleaning"
                            figure={figures.packaging}
                            share={figures.packagingPct}
                            shareGross={figures.packagingPctGross}
                            target={targets.packaging}
                        />
                    </div>

                    <p className="text-xs text-muted mt-4 mb-4">
                        Food and packaging come from the invoices dated in this week, labour from the hours
                        entered against it. Nothing here is typed twice, so it cannot disagree with the cost
                        dashboard.
                    </p>

                    <WeekChart rows={history} {...specs.sales} />
                    <figcaption className="text-xs text-muted mt-2">{specs.sales.caption}</figcaption>

                    {salesCosts && (
                        <ReportComments
                            items={commentsOf(salesCosts)}
                            canEdit={canEdit}
                            onAdd={note => addComment(salesCosts.id, note)}
                            onSave={saveComment}
                            onRemove={removeItem}
                        />
                    )}
                </div>
            </div>

            {/* The rest, in the order they are read. The ones with nothing
                built yet say so rather than being hidden, so the shape of the
                report is visible while it fills in. */}
            {sections.filter(s => s.key !== 'sales_costs').map(section => {
                const built = [
                    'profit_loss', 'prices_suppliers', 'online_sales', 'corporate_sales',
                    'people_ops', 'marketing', 'support_actions', 'cleaning',
                ].includes(section.key)
                return (
                    <div key={section.id} className={card}>
                        <ReportSectionHead
                            section={section}
                            canEdit={canEdit}
                            onRename={renameSection}
                            onRemove={removeSection}
                        />
                        <div className="p-4 sm:p-5">
                            {built ? (
                                <>
                                    {section.key === 'profit_loss' && (
                                        <>
                                        <ReportProfitLoss
                                            section={section}
                                            figures={figures}
                                            rows={delivery}
                                            statement={statementWords(week)}
                                            waiting={!around.some(d => d.sale_date === statementWeek(week).to)}
                                            canEdit={canEdit}
                                            onSaveOverhead={saveOverhead}
                                            onSaveDelivery={saveDelivery}
                                            onAddOverhead={addOverhead}
                                            onRenameOverhead={(id, label) => saveItem(id, { label })}
                                            onRemoveOverhead={removeItem}
                                        />
                                        <PageChart spec={specs.delivery} rows={history} />
                                        <PageChart spec={specs.earnings} rows={history} />
                                        </>
                                    )}
                                    {section.key === 'prices_suppliers' && (
                                        <PricesBlock
                                            report={report}
                                            live={livePrices}
                                            canEdit={canEdit}
                                            busy={priceBusy}
                                            said={priceSaid}
                                            supportSection={sections.find(s => s.key === 'support_actions')}
                                            handlers={{
                                                onCostFrom: costFrom,
                                                onMakeUsual: makeUsual,
                                                onRenumber: renumber,
                                                onGiveReason: giveReason,
                                                onBuyBoth: buyBoth,
                                                onPutOnList: listClaims,
                                            }}
                                        />
                                    )}
                                    {section.key === 'people_ops' && (
                                        <ReportPaperwork
                                            paperwork={paperworkFor(employees, week, todayISO())}
                                            weekStart={week}
                                            asOf={todayISO()}
                                            allergenSheet={allergenSheet}
                                        />
                                    )}
                                    {section.key === 'cleaning' && (
                                        <ReportCleaning
                                            cleaning={report.status === 'published' ? report.figures?.cleaning : liveCleaning.data}
                                            published={report.status === 'published'}
                                        />
                                    )}
                                    {section.key === 'support_actions' && (
                                        <ReportActions
                                            section={section}
                                            weekStart={week}
                                            canEdit={canEdit}
                                            onAdd={addAction}
                                            onSave={saveItem}
                                            onRemove={removeItem}
                                        />
                                    )}
                                    {section.key === 'corporate_sales' && (
                                        <>
                                            <PageChart spec={specs.corporate} rows={history} />
                                            <ReportCorporateSales
                                            platforms={corporatePlatforms}
                                            taken={taken}
                                            notes={new Map(section.items
                                                .filter(i => i.kind === 'comment' && i.key)
                                                .map(i => [i.key, i]))}
                                            canEdit={canEdit}
                                            onSaveNote={(platform, note) =>
                                                savePlatformNote(section.id, platform, note)}
                                            />
                                        </>
                                    )}
                                    {section.key === 'online_sales' && (
                                        <>
                                            <PageChart spec={specs.online} rows={history} />
                                            <ReportOnlineSales
                                            section={section}
                                            platforms={onlinePlatforms}
                                            taken={taken}
                                            canEdit={canEdit}
                                            handlers={{
                                                onSaveRating: saveRating,
                                                onAddReview: addReview,
                                                onAddRefund: addRefund,
                                                onSaveItem: saveItem,
                                                onRemoveItem: removeItem,
                                            }}
                                            />
                                        </>
                                    )}
                                    {section.key !== 'support_actions' && (
                                        <ReportComments
                                            items={commentsOf(section)}
                                            canEdit={canEdit}
                                            onAdd={note => addComment(section.id, note)}
                                            onSave={saveComment}
                                            onRemove={removeItem}
                                            label={['people_ops', 'marketing'].includes(section.key)
                                                ? 'Notes'
                                                : 'Comments'}
                                        />
                                    )}
                                </>
                            ) : (
                                <ReportComments
                                    items={commentsOf(section)}
                                    canEdit={canEdit}
                                    onAdd={note => addComment(section.id, note)}
                                    onSave={saveComment}
                                    onRemove={removeItem}
                                    label="Notes"
                                />
                            )}
                        </div>
                    </div>
                )
            })}

            {canEdit && <AddSection onAdd={addSection} />}
        </div>
    )
}

// The price section, live or frozen.
//
// A report that has gone out shows what it said when it went, and nothing on
// it can be decided any more: the buttons belong to a week still being
// written. One sent before the section existed has nothing frozen, and says
// so rather than showing today's prices under last month's heading.
function PricesBlock({ report, live, canEdit, busy, said, supportSection, handlers }) {
    const published = report.status === 'published'
    const section = published ? report.figures?.prices : live.data

    if (published && !section) {
        return <p className="text-sm text-muted">This report went out before prices had a section of their own.</p>
    }
    if (!published && live.error) return <ErrorBanner>{live.error}</ErrorBanner>
    if (!section) return <p className="text-sm text-muted">Reading the invoices for the week.</p>

    const jobs = canEdit ? claimActions(live.claims, supportSection?.items, report.week_start) : null
    return (
        <>
            {said && <p className="text-sm text-green-700 mb-3" aria-live="polite">{said}</p>}
            <ReportPrices
                section={section}
                canDecide={canEdit}
                canEdit={canEdit}
                busy={busy}
                jobs={jobs}
                {...handlers}
            />
        </>
    )
}

// One chart on the page, from the spec that also draws it into the mail.
//
// The spec carries the series, the scale and the words; this carries where it
// sits. Spreading it into WeekChart means a chart that gains a series gains it
// in both places, which is the whole reason the specs left this file.
function PageChart({ spec, rows }) {
    if (!spec || spec.series.length === 0) return null
    if (spec.platforms && spec.platforms.length === 0) return null

    return (
        <div className="mt-6 mb-5">
            {spec.pageHeading && (
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                    {spec.title}
                </p>
            )}
            <WeekChart rows={rows} {...spec} />
            <p className="text-xs text-muted mt-2">{spec.caption}</p>
        </div>
    )
}

// Adding a section of your own.
//
// It appears on every week from now on, because the next report copies its
// section list from this one. That is worth saying on the button, since it is
// not what "add" usually means and it is the reason the feature exists: a
// restaurant that wants a priorities follow-up every week should type that once
// and never again.
function AddSection({ onAdd }) {
    const [open, setOpen] = useLocalState(false)
    const [title, setTitle] = useLocalState('')

    if (!open) {
        return (
            <AddButton onClick={() => setOpen(true)}>Add a section</AddButton>
        )
    }

    return (
        <div className={`${card} p-4`}>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">A section of your own</p>
            <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[12rem]">
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { setTitle(''); setOpen(false) } }}
                        autoFocus
                        placeholder="What is it called"
                        className={fieldClass}
                    />
                </div>
                <button
                    onClick={async () => {
                        if (!title.trim()) return
                        await onAdd(title.trim())
                        setTitle('')
                        setOpen(false)
                    }}
                    className={primaryButton()}
                >
                    Add
                </button>
                <button
                    onClick={() => { setTitle(''); setOpen(false) }}
                    className={secondaryButton}
                >
                    Cancel
                </button>
            </div>
            <p className="text-xs text-muted mt-2">
                It appears on every week from now on, and can be dropped again whenever you like.
            </p>
        </div>
    )
}

// What a platform's row adds to the frozen figures. Nothing for a platform
// with no row, which is every corporate one.
function deliveryFrozen(row) {
    if (!row) return {}
    return {
        statement: row.statement,
        statementTaken: row.statementTaken,
        weekTaken: row.weekTaken,
        rate: row.rate,
        cost: row.cost,
    }
}
