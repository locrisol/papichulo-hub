import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { addDays, weekNumber, weekRange } from '../../lib/dates'
import { resolveTarget } from '../../lib/costTargets'
import { friendlyError } from '../../lib/errors'
import { card, cardHeader, badge, secondaryButton } from '../../lib/controlStyles'
import { reportFigures } from '../../lib/weeklyReport'
import ReportComments from '../../components/reports/ReportComments'

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

function num(v) {
    if (v == null) return 0
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

function pct(v) {
    return v == null ? '—' : `${v.toFixed(2)}%`
}

// Green at or under target, amber within two points over, red beyond. The same
// bands the cost dashboard uses, so a week does not look different depending on
// which screen you read it on.
function statusFor(actual, target) {
    if (actual == null || !target) return 'none'
    if (actual <= target) return 'green'
    if (actual <= target + 2) return 'amber'
    return 'red'
}

const TONE = {
    green: 'text-green-700',
    amber: 'text-amber-600',
    red: 'text-red-600',
    none: 'text-gray-400',
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
            <p className={`font-serif text-3xl font-bold leading-none ${tone}`}>{pct(share)}</p>
            <p className="text-sm text-muted mt-2 tabular-nums">
                of net{target ? ` · ${target}% target` : ''}
            </p>
            <p className="text-sm text-gray-700 mt-1 tabular-nums font-semibold">{fmtMoney(figure)}</p>
            <p className="text-xs text-muted mt-0.5 tabular-nums">{pct(shareGross)} of gross</p>
        </div>
    )
}

export default function ReportPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

    const [report, setReport] = useState(null)
    const [sections, setSections] = useState([])
    const [figures, setFigures] = useState(null)
    const [targets, setTargets] = useState({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    // Bumped after every write. The page reloads rather than each section
    // keeping its own copy of the truth, which is how two parts of a screen
    // end up disagreeing about what was just saved.
    const [refresh, setRefresh] = useState(0)

    const isStoreManager = ['super_admin', 'store_manager'].includes(user?.role)
    const canEdit = isStoreManager && report?.status === 'draft'

    useEffect(() => {
        if (!id) return

        async function load() {
            setError('')

            const { data: head, error: hErr } = await supabase
                .from('weekly_reports')
                .select('*, report_sections(*, report_items(*))')
                .eq('id', id)
                .single()

            if (hErr) { setError(friendlyError(hErr)); setLoading(false); return }

            setReport(head)
            setSections((head.report_sections || []).slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(s => ({
                    ...s,
                    items: (s.report_items || []).slice().sort((a, b) => a.sort_order - b.sort_order),
                })))

            const weekStart = head.week_start
            const end = addDays(weekStart, 6)

            // A published report reads the figures frozen into it. A draft
            // reads them live, so it is always current while it is being
            // written.
            if (head.status === 'published' && head.figures) {
                setFigures(head.figures)
            } else {
                const [days, invoices, labour] = await Promise.all([
                    supabase.from('sales_records')
                        .select('sale_date, net_sales, gross_sales, is_closed')
                        .eq('restaurant_id', head.restaurant_id)
                        .gte('sale_date', weekStart).lte('sale_date', end),
                    supabase.from('invoices')
                        .select('total_amount, category')
                        .eq('restaurant_id', head.restaurant_id)
                        .gte('invoice_date', weekStart).lte('invoice_date', end),
                    supabase.from('labour_entries')
                        .select('labour_cost')
                        .eq('restaurant_id', head.restaurant_id)
                        .gte('entry_date', weekStart).lte('entry_date', end),
                ])

                const failed = days.error || invoices.error || labour.error
                if (failed) { setError(friendlyError(failed)); setLoading(false); return }

                const all = (head.report_sections || []).flatMap(s => s.report_items || [])
                setFigures(reportFigures({
                    days: days.data || [],
                    invoices: invoices.data || [],
                    labour: labour.data || [],
                    overheads: all.filter(i => i.kind === 'overhead'),
                    delivery: all.filter(i => i.kind === 'delivery'),
                }))
            }

            // Targets are looked up for the week being reported on rather than
            // taken from today's settings, so a target changed in September
            // does not change how an August week is judged.
            const { data: overrides } = await supabase
                .from('cost_target_overrides')
                .select('*')
                .eq('restaurant_id', head.restaurant_id)

            setTargets({
                food: resolveTarget(overrides || [], 'food', weekStart, num(activeRestaurant?.food_cost_target)),
                labour: resolveTarget(overrides || [], 'labour', weekStart, num(activeRestaurant?.labour_cost_target)),
                packaging: resolveTarget(overrides || [], 'packaging', weekStart, num(activeRestaurant?.packaging_cost_target)),
            })

            setLoading(false)
        }

        load()
    }, [id, activeRestaurant, refresh])

    // Comments, one card each. Every write goes through here and then reloads,
    // rather than each section keeping its own copy of the truth.
    async function addComment(sectionId, note) {
        const section = sections.find(s => s.id === sectionId)
        const order = (section?.items.filter(i => i.kind === 'comment').length) || 0
        const { error: err } = await supabase.from('report_items')
            .insert({ section_id: sectionId, kind: 'comment', note, sort_order: order })
        if (err) return setError(friendlyError(err))
        setRefresh(n => n + 1)
    }

    async function saveComment(itemId, note) {
        const { error: err } = await supabase.from('report_items').update({ note }).eq('id', itemId)
        if (err) return setError(friendlyError(err))
        setRefresh(n => n + 1)
    }

    async function removeComment(itemId) {
        const { error: err } = await supabase.from('report_items').delete().eq('id', itemId)
        if (err) return setError(friendlyError(err))
        setRefresh(n => n + 1)
    }

    function commentsOf(section) {
        return section.items.filter(i => i.kind === 'comment')
    }

    if (loading) {
        return <p className="text-sm text-muted">Loading the week.</p>
    }

    if (!report) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-red-700">{error || 'That report could not be found.'}</p>
                <button onClick={() => navigate('/reports')} className={secondaryButton}>
                    Back to reports
                </button>
            </div>
        )
    }

    const week = report.week_start
    const salesCosts = sections.find(s => s.key === 'sales_costs')

    return (
        <div className="space-y-4">
            {/* The header stacks on a phone. The week and its dates are the
                thing you need to be sure of before typing anything into it. */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                    <button
                        onClick={() => navigate('/reports')}
                        className="text-sm font-semibold text-accent-ink hover:underline mb-1"
                    >
                        &larr; All reports
                    </button>
                    <h1 className="font-serif text-2xl font-bold text-sidebar leading-tight">
                        Week {weekNumber(week)}
                    </h1>
                    <p className="text-sm text-muted mt-1">
                        {weekRange(week)} &middot; {activeRestaurant?.name}
                    </p>
                </div>

                <span className={`${badge} flex-shrink-0 self-start ${report.status === 'draft'
                    ? 'bg-accent-light text-accent-ink'
                    : 'bg-green-50 text-green-700'}`}>
                    {report.status === 'draft'
                        ? (report.send_count > 0 ? 'Re-opened' : 'Draft')
                        : 'Sent'}
                </span>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {/* SALES AND COSTS */}
            <div className={card}>
                <div className={`${cardHeader} rounded-t-xl flex items-center justify-between gap-3`}>
                    <span>{salesCosts?.title || 'Sales and costs'}</span>
                    <span className="normal-case tracking-normal font-semibold text-[11px] opacity-75">
                        From the Hub
                    </span>
                </div>

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

                    <p className="text-xs text-muted mt-4">
                        Food and packaging come from the invoices dated in this week, labour from the hours
                        entered against it. Nothing here is typed twice, so it cannot disagree with the cost
                        dashboard.
                    </p>

                    {salesCosts && (
                        <ReportComments
                            items={commentsOf(salesCosts)}
                            canEdit={canEdit}
                            onAdd={note => addComment(salesCosts.id, note)}
                            onSave={saveComment}
                            onRemove={removeComment}
                        />
                    )}
                </div>
            </div>

            {/* The rest of the sections are still to come. They are listed
                rather than hidden, so the shape of the report is visible while
                it is being built out. */}
            {sections.filter(s => s.key !== 'sales_costs').map(section => (
                <div key={section.id} className={`${card} opacity-60`}>
                    <div className={`${cardHeader} rounded-t-xl`}>{section.title}</div>
                    <div className="p-4 sm:p-5">
                        <p className="text-sm text-muted">Still being built.</p>
                    </div>
                </div>
            ))}
        </div>
    )
}
