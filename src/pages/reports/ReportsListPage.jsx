import { Fragment, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { fmtMoney, num } from '@/lib/format'
import { shortDate, addDays, weekNumber, weekRange } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { tableCard, tableHeadRow, tableHeadCell, badge, secondaryButton } from '@/lib/controlStyles'
import {
    reportableWeeks,
    weekReadiness,
    carriedItems,
    DEFAULT_SECTIONS,
    DEFAULT_OVERHEADS,
} from '@/lib/weeklyReport'
import { personWeek, unanswered } from '@/lib/timesheet'
import { can, RESTAURANT_CONFIG } from '@/lib/access'
import ErrorBanner from '@/components/ui/ErrorBanner'

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


// The days nobody has entered, named rather than counted. "Thursday and
// Friday" tells you where to go; "2 days missing" only makes you go and look.
function missingWords(missing) {
    const days = missing.map(shortDate)
    if (days.length === 1) return `${days[0]} has no figures yet.`
    return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]} have no figures yet.`
}

// The people who were down to work and nobody has said whether they did.
// Named, the same as the missing days are, because a block that will not say
// what it wants is a block somebody works around.
function unansweredWords(waiting) {
    const who = some => {
        const names = some.map(w => w.person.full_name)
        return names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    }

    const missing = waiting.filter(w => w.days?.length)
    // Hours the till's report does not have: a time off it that somebody moved,
    // or a shift typed onto a day it says nothing about. It blocks the same way
    // a shift with nothing said does, and for the same reason: the report
    // carries a wage bill, and a figure the accountant's own copy disagrees
    // with is the one thing nobody reading it can see.
    const changed = waiting.filter(w => w.changed?.length)

    const said = []
    if (missing.length) {
        said.push(`${who(missing)} ${missing.length === 1 ? 'has a rostered shift' : 'have rostered shifts'} `
            + 'with nothing said on the timesheet.')
    }
    if (changed.length) {
        said.push(`${who(changed)} ${changed.length === 1 ? 'has hours' : 'have hours'} `
            + "the till's report does not have, with nothing said about them.")
    }
    return said.join(' ')
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
function WeekAction({ week, blocked, canWrite, starting, onOpen, onStart, onSales, onTimesheet, wide }) {
    const width = wide ? 'w-full justify-center ' : ''

    if (week.report) {
        return (
            <button onClick={onOpen} className={`${width}${secondaryButton}`}>
                {week.report.status === 'draft' ? 'Carry on' : 'Read'}
            </button>
        )
    }
    if (blocked) {
        // Sent to whichever one is actually in the way. Sales first: a week
        // with no figures at all is the bigger hole, and the timesheet is
        // easier to finish once the days are there.
        const toSales = week.readiness.missing.length > 0
        return (
            <button
                onClick={toSales ? onSales : onTimesheet}
                className={`${width}${secondaryButton}`}
            >
                {toSales ? 'Open weekly sales' : 'Open the timesheet'}
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

    const canWrite = can(user, RESTAURANT_CONFIG)

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

        // Reads over a range, rather than one per week. Ten weeks is seventy
        // days and a handful of reports, small enough to sort out here and far
        // cheaper than thirty round trips. The last four are what says whether
        // the timesheet has been done: who is on the team, what they were
        // rostered, what the clock registered and who was away.
        const [reports, sales, tenders, team, entries, absences, shifts, labour, weekRows] = await Promise.all([
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
            supabase
                .from('employees')
                .select('id, full_name, hourly_rate, sort_order, started_on, ended_on')
                .eq('restaurant_id', restaurantId)
                .order('sort_order'),
            supabase
                .from('timesheet_entries')
                // source and note are not decoration here. A till time changed
                // by hand is the one thing on a week that has to say why, and
                // without these two columns that rule was never checked on this
                // page at all: it read every row as typed and unremarkable.
                .select('employee_id, work_date, starts_at, ends_at, kind, source, note')
                .eq('restaurant_id', restaurantId)
                .gte('work_date', from).lte('work_date', to),
            supabase
                .from('absences')
                .select('employee_id, kind, starts_on, ends_on, hours, status, can_work_from, can_work_to')
                .eq('restaurant_id', restaurantId)
                .lte('starts_on', to).gte('ends_on', from),
            supabase
                .from('roster_shifts')
                .select('id, employee_id, shift_date, starts_at, ends_at')
                .eq('restaurant_id', restaurantId)
                .gte('shift_date', from).lte('shift_date', to),
            // The days the old Labour archive already answers. Those weeks are
            // accounted for by history and no timesheet will ever be typed for
            // them, so asking for one would stop every report about the first
            // eight months of 2026 from ever being written.
            supabase
                .from('labour_by_day')
                .select('entry_date, came_from')
                .eq('restaurant_id', restaurantId)
                .gte('entry_date', from).lte('entry_date', to),
            // The weeks whose till report has been read in. On those, a
            // rostered shift with nothing against it is not a question: the
            // file said nothing was clocked, and the accountant has the file.
            supabase
                .from('timesheet_weeks')
                .select('week_start, imported_at')
                .eq('restaurant_id', restaurantId)
                .gte('week_start', from),
        ])

        const failed = reports.error || sales.error || tenders.error
            || team.error || entries.error || absences.error || shifts.error || labour.error
            || weekRows.error
        if (failed) { setError(friendlyError(failed)); setLoading(false); return }

        const archived = new Set((labour.data || [])
            .filter(l => l.came_from === 'archive')
            .map(l => l.entry_date))

        const byWeek = new Map((reports.data || []).map(r => [r.week_start, r]))
        const imported = new Set((weekRows.data || [])
            .filter(w => w.imported_at)
            .map(w => w.week_start))

        setWeeks(wanted.map(weekStart => {
            const weekEnd = addDays(weekStart, 6)
            const days = (sales.data || []).filter(d =>
                d.sale_date >= weekStart && d.sale_date <= weekEnd)

            // Anybody who had left before the week or had not started is not on
            // it, the same rule the timesheet itself uses.
            const rows = (team.data || [])
                .filter(p => (!p.ended_on || p.ended_on >= weekStart)
                    && (!p.started_on || p.started_on <= weekEnd))
                .map(person => personWeek({
                    person,
                    weekStart,
                    entries: entries.data || [],
                    absences: absences.data || [],
                    shifts: shifts.data || [],
                    imported: imported.has(weekStart),
                }))

            return {
                weekStart,
                report: byWeek.get(weekStart) || null,
                readiness: weekReadiness(weekStart, days, tenders.data || [], unanswered(rows, archived)),
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
                <ErrorBanner>
                    {error}
                </ErrorBanner>
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
                                    onTimesheet={() => navigate('/costs/timesheet')}
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
                                    onTimesheet={() => navigate('/costs/timesheet')}
                                            />
                                        </td>
                                    </tr>

                                    {(blocked || off.length > 0) && (
                                        <tr className={blocked ? 'bg-accent-light/50' : ''}>
                                            <td colSpan={5} className="px-5 pb-3 text-sm">
                                                {blocked && (
                                                    <span className="text-accent-ink">
                                                        {week.readiness.missing.length > 0
                                                            ? missingWords(week.readiness.missing)
                                                            : unansweredWords(week.readiness.unanswered)}
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
