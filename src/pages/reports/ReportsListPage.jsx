import { Fragment, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'
import { shortDate, addDays, weekNumber, weekRange } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { tableCard, tableHeadRow, tableHeadCell, badge, secondaryButton } from '../../lib/controlStyles'
import {
    reportableWeeks,
    weekReadiness,
    carriedItems,
    DEFAULT_SECTIONS,
    DEFAULT_OVERHEADS,
} from '../../lib/weeklyReport'

// The way in to the weekly report: the weeks that have finished, and what state
// each one is in.
//
// Three things a week can be. Not started, which offers a button. Draft, which
// somebody is part way through. Published, which has gone out and can be read.
//
// A fourth state matters more than the other three: a week with a day nobody
// has entered. That week cannot be started at all, and the row names the days
// rather than grey out a button and leave somebody guessing. A report built on
// four days of a seven day week is worse than no report, because it looks like
// a report.
//
// A day that is entered but does not balance against the till is only ever a
// note. Net sales is its own column rather than a sum of the till rows, so a
// day three euro short still reports the right figure, and refusing to write a
// correct report over a drawer being short is the wrong trade. The row says it
// and the week starts anyway.
//
// Owners read this list and do not write it, the same split the rest of the app
// uses for anything a store runs itself. That is enforced in the database, not
// here. Hiding the button is only about not offering a screen that will refuse.

const WEEKS_SHOWN = 10

function num(v) {
    if (v == null) return 0
    const n = Number(v)
    return isNaN(n) ? 0 : n
}

// The days nobody has entered, named rather than counted. "Thursday and
// Friday" tells you where to go; "2 days missing" only makes you go and look.
function missingWords(missing) {
    const days = missing.map(shortDate)
    if (days.length === 1) return `${days[0]} has no figures yet.`
    return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]} have no figures yet.`
}

// The days that were entered and do not add up. Said, never enforced.
function varianceWords(unbalanced) {
    return unbalanced
        .map(off => `${shortDate(off.date)} is ${fmtMoney(Math.abs(off.out))} `
            + `${off.out < 0 ? 'short' : 'over'}`)
        .join(', ')
}

// The one button a week offers, wherever it is drawn.
//
// Written once and used by both layouts. The phone list and the table showing
// different buttons is exactly the kind of thing that happens when the same
// decision is made twice.
function WeekAction({ week, blocked, canWrite, starting, onOpen, onStart, onSales, wide }) {
    const width = wide ? 'w-full justify-center ' : ''

    if (week.report) {
        return (
            <button onClick={onOpen} className={`${width}${secondaryButton}`}>
                {week.report.status === 'draft' ? 'Carry on' : 'Read'}
            </button>
        )
    }
    if (blocked) {
        return (
            <button onClick={onSales} className={`${width}${secondaryButton}`}>
                Open weekly sales
            </button>
        )
    }
    if (!canWrite) {
        return <span className="text-sm text-muted">Not written</span>
    }
    return (
        <button
            onClick={onStart}
            disabled={starting}
            className={`${wide ? 'w-full ' : ''}px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-accent-ink transition-colors disabled:opacity-50`}
        >
            {starting ? 'Starting' : 'Start'}
        </button>
    )
}

function StateBadge({ report }) {
    if (!report) {
        return <span className={`${badge} bg-gray-100 text-gray-600`}>Not started</span>
    }
    if (report.status === 'draft') {
        return (
            <span className={`${badge} bg-accent-light text-accent-ink`}>
                {report.send_count > 0 ? 'Re-opened' : 'Draft'}
            </span>
        )
    }
    return (
        <span className={`${badge} bg-green-50 text-green-700`}>
            {report.send_count > 1 ? `Sent ${report.send_count} times` : 'Sent'}
        </span>
    )
}

export default function ReportsListPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()

    const canWrite = ['super_admin', 'store_manager'].includes(user?.role)

    const [weeks, setWeeks] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [starting, setStarting] = useState(null)

    const restaurantId = activeRestaurant?.id

    useEffect(() => {
        if (!restaurantId) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restaurantId])

    async function load() {
        setLoading(true)
        setError('')

        const wanted = reportableWeeks(WEEKS_SHOWN)
        const from = wanted[wanted.length - 1]
        const to = addDays(wanted[0], 6)

        // Three reads over a range, rather than one per week. Ten weeks is
        // seventy days and a handful of reports, small enough to sort out here
        // and far cheaper than thirty round trips.
        const [reports, sales, tenders] = await Promise.all([
            supabase
                .from('weekly_reports')
                .select('id, week_start, status, published_at, send_count')
                .eq('restaurant_id', restaurantId)
                .gte('week_start', from),
            supabase
                .from('sales_records')
                .select('sale_date, gross_sales, net_sales, tender_sales, is_closed')
                .eq('restaurant_id', restaurantId)
                .gte('sale_date', from)
                .lte('sale_date', to),
            supabase
                .from('sales_tenders')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .order('sort_order'),
        ])

        const failed = reports.error || sales.error || tenders.error
        if (failed) { setError(friendlyError(failed)); setLoading(false); return }

        const byWeek = new Map((reports.data || []).map(r => [r.week_start, r]))

        setWeeks(wanted.map(weekStart => {
            const days = (sales.data || []).filter(d =>
                d.sale_date >= weekStart && d.sale_date <= addDays(weekStart, 6))
            return {
                weekStart,
                report: byWeek.get(weekStart) || null,
                readiness: weekReadiness(weekStart, days, tenders.data || []),
                net: days.filter(d => !d.is_closed).reduce((t, d) => t + num(d.net_sales), 0),
            }
        }))

        setLoading(false)
    }

    // The week before this one, with its sections and everything on them.
    async function previousReport(weekStart) {
        const { data } = await supabase
            .from('weekly_reports')
            .select('id, week_start, report_sections(id, key, title, sort_order, report_items(*))')
            .eq('restaurant_id', restaurantId)
            .lt('week_start', weekStart)
            .order('week_start', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!data) return null
        return {
            ...data,
            sections: (data.report_sections || []).slice().sort((a, b) => a.sort_order - b.sort_order),
        }
    }

    // Starting a week writes the report, its sections, and whatever carries
    // over. All of it or none: the sections are what everything else hangs off,
    // so a report with none is not a half made report, it is a broken one.
    async function start(weekStart) {
        setStarting(weekStart)
        setError('')

        const previous = await previousReport(weekStart)

        const { data: report, error: rErr } = await supabase
            .from('weekly_reports')
            .insert({ restaurant_id: restaurantId, week_start: weekStart, created_by: user.id })
            .select()
            .single()

        if (rErr) { setError(friendlyError(rErr)); setStarting(null); return }

        async function giveUp(err) {
            await supabase.from('weekly_reports').delete().eq('id', report.id)
            setError(friendlyError(err))
            setStarting(null)
        }

        // The section list comes from the week before where there is one, so a
        // section somebody added keeps appearing and one they dropped stays
        // dropped. Only a restaurant that has never written a report gets the
        // built-in list.
        const wanted = previous?.sections?.length ? previous.sections : DEFAULT_SECTIONS

        const { data: sections, error: sErr } = await supabase
            .from('report_sections')
            .insert(wanted.map((s, i) => ({
                report_id: report.id, key: s.key, title: s.title, sort_order: i,
            })))
            .select()

        if (sErr) return giveUp(sErr)

        const items = openingItems(sections, previous, weekStart)
        if (items.length > 0) {
            const { error: iErr } = await supabase.from('report_items').insert(items)
            if (iErr) return giveUp(iErr)
        }

        navigate(`/reports/${report.id}`)
    }

    if (!restaurantId) return null

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="font-serif text-2xl font-bold text-sidebar">Reports</h1>
                    <p className="text-sm text-muted mt-1">
                        One report a week, written from the figures already in the Hub.
                    </p>
                </div>
                <button onClick={load} className={secondaryButton} disabled={loading}>
                    {loading ? 'Loading' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {/* Below md this is a list of cards rather than a table.

                A five column table on a phone either scrolls sideways, which
                puts the button out of reach, or squeezes every column until the
                dates wrap onto four lines. Products, suppliers, menu items and
                the team already made this choice, so this follows them rather
                than inventing a third way. */}
            <div className="md:hidden space-y-3">
                {weeks.map(week => {
                    const blocked = !week.report && !week.readiness.ready
                    const off = week.readiness.unbalanced
                    return (
                        <div
                            key={week.weekStart}
                            className={`rounded-xl border p-4 ${blocked
                                ? 'bg-accent-light/50 border-accent/30'
                                : 'bg-white border-border'}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-serif text-lg font-bold text-sidebar leading-tight">
                                        Week {weekNumber(week.weekStart)}
                                    </p>
                                    <p className="text-sm text-muted mt-0.5">
                                        {weekRange(week.weekStart)}
                                    </p>
                                </div>
                                <div className="flex-shrink-0">
                                    {blocked
                                        ? <span className={`${badge} bg-accent-light text-accent-ink`}>Sales not finished</span>
                                        : <StateBadge report={week.report} />}
                                </div>
                            </div>

                            <p className="mt-3 text-xl font-bold tabular-nums text-sidebar">
                                {week.net > 0
                                    ? fmtMoney(week.net)
                                    : <span className="text-muted text-base font-normal">No sales entered</span>}
                                {week.net > 0 && (
                                    <span className="text-xs font-normal text-muted ml-2">net sales</span>
                                )}
                            </p>

                            {blocked && (
                                <p className="mt-2 text-sm text-accent-ink">
                                    {missingWords(week.readiness.missing)}
                                </p>
                            )}
                            {off.length > 0 && (
                                <p className="mt-2 text-sm text-muted">
                                    {off.length === 1 ? 'One day is' : `${off.length} days are`}
                                    {' '}out against the till: {varianceWords(off)}.
                                </p>
                            )}

                            <div className="mt-3">
                                <WeekAction
                                    wide
                                    week={week}
                                    blocked={blocked}
                                    canWrite={canWrite}
                                    starting={starting === week.weekStart}
                                    onOpen={() => navigate(`/reports/${week.report.id}`)}
                                    onStart={() => start(week.weekStart)}
                                    onSales={() => navigate('/sales/weekly')}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className={`${tableCard} hidden md:block`}>
                <table className="w-full">
                    <thead>
                        <tr className={tableHeadRow}>
                            <th className={`${tableHeadCell} text-left px-5 py-3`}>Week</th>
                            <th className={`${tableHeadCell} text-left px-5 py-3`}>Dates</th>
                            <th className={`${tableHeadCell} text-right px-5 py-3`}>Net sales</th>
                            <th className={`${tableHeadCell} text-left px-5 py-3`}>State</th>
                            <th className={`${tableHeadCell} text-right px-5 py-3`}></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {weeks.map(week => {
                            const blocked = !week.report && !week.readiness.ready
                            const off = week.readiness.unbalanced
                            return (
                                <Fragment key={week.weekStart}>
                                    <tr className={blocked ? 'bg-accent-light/50' : ''}>
                                        <td className="px-5 py-3 font-bold text-sidebar whitespace-nowrap">
                                            {weekNumber(week.weekStart)}
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-700 whitespace-nowrap">
                                            {weekRange(week.weekStart)}
                                        </td>
                                        <td className="px-5 py-3 text-sm text-right tabular-nums text-gray-700">
                                            {week.net > 0
                                                ? fmtMoney(week.net)
                                                : <span className="text-muted">&mdash;</span>}
                                        </td>
                                        <td className="px-5 py-3">
                                            {blocked
                                                ? <span className={`${badge} bg-accent-light text-accent-ink`}>Sales not finished</span>
                                                : <StateBadge report={week.report} />}
                                        </td>
                                        <td className="px-5 py-3 text-right whitespace-nowrap">
                                            <WeekAction
                                                week={week}
                                                blocked={blocked}
                                                canWrite={canWrite}
                                                starting={starting === week.weekStart}
                                                onOpen={() => navigate(`/reports/${week.report.id}`)}
                                                onStart={() => start(week.weekStart)}
                                                onSales={() => navigate('/sales/weekly')}
                                            />
                                        </td>
                                    </tr>

                                    {(blocked || off.length > 0) && (
                                        <tr className={blocked ? 'bg-accent-light/50' : ''}>
                                            <td colSpan={5} className="px-5 pb-3 text-sm">
                                                {blocked && (
                                                    <span className="text-accent-ink">
                                                        {missingWords(week.readiness.missing)}
                                                    </span>
                                                )}
                                                {off.length > 0 && (
                                                    <span className={blocked ? 'text-muted ml-1' : 'text-muted'}>
                                                        {off.length === 1 ? 'One day is' : `${off.length} days are`}
                                                        {' '}out against the till: {varianceWords(off)}. This does not
                                                        stop the report, because net sales does not come from the till
                                                        rows.
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            <p className="text-sm text-muted px-1">
                {canWrite
                    ? 'A week can be started once every one of its days has been entered or marked closed. A day that does not add up against the till is noted, not enforced.'
                    : 'Reports are written by the store manager. This is the same list they see, so any week can be read here without going back through a mailbox.'}
            </p>
        </div>
    )
}

// What a new report opens with: whatever carried from last week, sorted into
// the sections of this one.
//
// Carried items are matched to their section by key, so a section that was
// renamed still receives its own things and one that was dropped quietly loses
// them, which is what dropping it meant.
function openingItems(sections, previous, weekStart) {
    const byKey = new Map(sections.map(s => [s.key, s]))
    const out = []

    if (!previous) {
        // The very first report a restaurant writes. There is nothing to carry,
        // so the overhead list is offered empty. The list is the useful part:
        // nobody should have to remember that insurance exists.
        const pl = byKey.get('profit_loss')
        if (pl) {
            DEFAULT_OVERHEADS.forEach((o, i) => out.push({
                section_id: pl.id, kind: 'overhead', key: o.key, label: o.label,
                amount: 0, sort_order: i,
            }))
        }
        return out
    }

    for (const before of previous.sections) {
        const now = byKey.get(before.key)
        if (!now) continue
        for (const item of carriedItems(before.report_items || [], weekStart)) {
            out.push({ ...item, section_id: now.id })
        }
    }

    return out
}
