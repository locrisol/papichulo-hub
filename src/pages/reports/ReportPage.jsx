import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { addDays, weekNumber, weekRange, todayISO } from '../../lib/dates'
import { resolveTarget } from '../../lib/costTargets'
import { friendlyError } from '../../lib/errors'
import { card, cardHeader, badge, secondaryButton } from '../../lib/controlStyles'
import { useState as useLocalState } from 'react'
import { reportFigures, sectionKey } from '../../lib/weeklyReport'
import { workingThatWeek } from '../../lib/reportPeople'
import ReportComments from '../../components/reports/ReportComments'
import ReportProfitLoss from '../../components/reports/ReportProfitLoss'
import ReportOnlineSales from '../../components/reports/ReportOnlineSales'
import ReportCorporateSales from '../../components/reports/ReportCorporateSales'
import ReportPaperwork from '../../components/reports/ReportPaperwork'
import ReportActions from '../../components/reports/ReportActions'
import ReportSectionHead from '../../components/reports/ReportSectionHead'
import BackButton from '../../components/BackButton'

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
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

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
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    // Bumped after every write. The page reloads rather than each section
    // keeping its own copy of the truth, which is how two parts of a screen
    // end up disagreeing about what was just saved.
    const [refresh, setRefresh] = useState(0)
    // There is no save button anywhere on this page. Every box writes when you
    // leave it, so this is the only thing telling you it happened. Without it
    // autosave asks somebody to take it on trust, and nobody does with figures.
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState(null)

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

            // Every active platform, both buckets, and what each took.
            // platform_sales is keyed by platform name rather than id, which is
            // a known weakness of that table, so the name is what has to be
            // matched on. Everything the report itself stores is keyed by id.
            const [plats, days2] = await Promise.all([
                supabase.from('sales_platforms')
                    .select('id, name, bucket, is_active, sort_order')
                    .eq('restaurant_id', head.restaurant_id)
                    .eq('is_active', true)
                    .order('sort_order'),
                supabase.from('sales_records')
                    .select('platform_sales')
                    .eq('restaurant_id', head.restaurant_id)
                    .gte('sale_date', weekStart).lte('sale_date', end),
            ])

            const all2 = plats.data || []
            setPlatforms(all2)

            const totals = {}
            for (const p of all2) {
                totals[p.id] = (days2.data || []).reduce(
                    (t, d) => t + num(d.platform_sales?.[p.name]), 0)
            }
            setTaken(totals)

            // The team, for the paperwork lines. Only the four fields the
            // section reads, so a mail built from this cannot carry anything
            // else about anybody.
            const { data: team } = await supabase
                .from('employees')
                .select('id, full_name, started_on, ended_on, food_safety_expires, work_permission, work_permission_expires')
                .eq('restaurant_id', head.restaurant_id)
            setEmployees(team || [])

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

        if (err) { setError(friendlyError(err)); return false }
        setError('')
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
    // week's notes the way platform_sales does.
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
        return write(() => supabase.from('report_sections').insert({
            report_id: report.id,
            key: sectionKey(title, taken),
            title,
            sort_order: sections.length,
        }))
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

    if (!report) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-red-700">{error || 'That report could not be found.'}</p>
                <BackButton to="/reports">Back to reports</BackButton>
            </div>
        )
    }

    const week = report.week_start
    const salesCosts = sections.find(s => s.key === 'sales_costs')
    const onlinePlatforms = platforms.filter(p => p.bucket === 'online_platform')
    const corporatePlatforms = platforms.filter(p => p.bucket === 'catering')

    return (
        <div className="space-y-4">
            {/* The header stacks on a phone. The week and its dates are the
                thing you need to be sure of before typing anything into it. */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                    <BackButton to="/reports" className="mb-2">All reports</BackButton>
                    <h1 className="font-serif text-2xl font-bold text-sidebar leading-tight">
                        Week {weekNumber(week)}
                    </h1>
                    <p className="text-sm text-muted mt-1">
                        {weekRange(week)} &middot; {activeRestaurant?.name}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 flex-shrink-0 self-start">
                    {canEdit && (
                        <span className="text-xs text-muted" aria-live="polite">
                            {saving
                                ? 'Saving'
                                : savedAt
                                    ? `Saved at ${savedAt.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}`
                                    : 'Saves as you type'}
                        </span>
                    )}
                    <span className={`${badge} ${report.status === 'draft'
                        ? 'bg-accent-light text-accent-ink'
                        : 'bg-green-50 text-green-700'}`}>
                        {report.status === 'draft'
                            ? (report.send_count > 0 ? 'Re-opened' : 'Draft')
                            : 'Sent'}
                    </span>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {error}
                </div>
            )}

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
                    'profit_loss', 'online_sales', 'corporate_sales',
                    'people_ops', 'marketing', 'support_actions',
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
                                        <ReportProfitLoss
                                            section={section}
                                            figures={figures}
                                            platforms={onlinePlatforms}
                                            taken={taken}
                                            canEdit={canEdit}
                                            onSaveOverhead={saveOverhead}
                                            onSaveDelivery={saveDelivery}
                                            onAddOverhead={addOverhead}
                                            onRenameOverhead={(id, label) => saveItem(id, { label })}
                                            onRemoveOverhead={removeItem}
                                        />
                                    )}
                                    {section.key === 'people_ops' && (
                                        <ReportPaperwork
                                            employees={workingThatWeek(employees, week)}
                                            weekStart={week}
                                            asOf={todayISO()}
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
                                    )}
                                    {section.key === 'online_sales' && (
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
            <button
                onClick={() => setOpen(true)}
                className="text-sm font-semibold text-accent-ink hover:underline px-1"
            >
                + Add a section
            </button>
        )
    }

    return (
        <div className={`${card} p-4`}>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">A section of your own</p>
            <div className="flex flex-wrap gap-2">
                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setTitle(''); setOpen(false) } }}
                    autoFocus
                    placeholder="What is it called"
                    className="flex-1 min-w-[12rem] bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                />
                <button
                    onClick={async () => {
                        if (!title.trim()) return
                        await onAdd(title.trim())
                        setTitle('')
                        setOpen(false)
                    }}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-accent-ink transition-colors"
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
