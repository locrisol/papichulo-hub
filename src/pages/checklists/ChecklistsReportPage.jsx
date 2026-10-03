import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { addDays, shortDate, stampDay, todayISO, weekStartOf } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { card, cardHeader, pageTitle, rowButton, secondaryButton, segmentButton, segmentTrack } from '@/lib/controlStyles'
import {
    busiestWords, doneDay, doneDayLong, lastDoneRows, listTree, periodRecord, progressOf, repeatWords,
    roundOutcome, ticksByTimeOfDay, ticksByWeekday, weekdayName,
} from '@/lib/checklists'
import { BAR_COLOUR } from '@/lib/weekTaken'
import ErrorBanner from '@/components/ui/ErrorBanner'
import BackButton from '@/components/ui/BackButton'

// How the cleaning is going, for managers.
//
// Asked for on 27 September: "This tool also should allow on the reports to see
// how is cleaning more and when the cleaning is being done (which days of the
// week there is more cleaning or less being done)." So it leads with the days
// and the times, then each list's record stretch by stretch, then the day each
// thing on it was last done, the longest ago first. Last, the rounds
// themselves, each of which opens with who did what and its own PDF.
const RANGES = [
    { weeks: 4, label: '4 weeks' },
    { weeks: 12, label: '12 weeks' },
    { weeks: 26, label: '6 months' },
]

const OUTCOME = {
    done: { text: 'Done', tone: 'bg-green-100 text-green-900 border-green-300' },
    missed: { text: 'Not done', tone: 'bg-red-50 text-red-800 border-red-200' },
    ended: { text: 'Ended early', tone: 'bg-amber-50 text-amber-900 border-amber-200' },
    current: { text: 'Still going', tone: 'bg-white text-gray-600 border-gray-300' },
}

export default function ChecklistsReportPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const [weeks, setWeeks] = useState(4)
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    const today = todayISO()
    const from = addDays(weekStartOf(today), -7 * (weeks - 1))

    const load = useCallback(async () => {
        if (!activeRestaurant) return
        setError('')
        const from = addDays(weekStartOf(todayISO()), -7 * (weeks - 1))
        const { data: lists, error: listErr } = await supabase.from('checklists').select('*')
            .eq('restaurant_id', activeRestaurant.id).eq('is_active', true).order('sort_order').order('name')
        if (listErr) { setError(friendlyError(listErr)); return }
        const ids = lists.map(l => l.id)
        const start = new Date(from + 'T00:00:00').toISOString()
        const [cats, tasks, rounds, ticks] = await Promise.all([
            ids.length ? supabase.from('checklist_categories').select('*').in('checklist_id', ids) : { data: [] },
            ids.length ? supabase.from('checklist_tasks').select('*').in('checklist_id', ids) : { data: [] },
            supabase.from('checklist_rounds').select('*').eq('restaurant_id', activeRestaurant.id)
                .or(`ended_at.is.null,ended_at.gte.${start}`).order('started_at', { ascending: false }),
            // A page at a time: one busy weekly list is past a thousand ticks
            // inside six months, and a single read stops there.
            everyRow(() => supabase.from('checklist_ticks').select('round_id, task_id, done_at')
                .eq('restaurant_id', activeRestaurant.id).gte('done_at', start).order('id')),
        ])
        const failed = cats.error || tasks.error || rounds.error || ticks.error
        if (failed) { setError(friendlyError(failed)); return }
        const taskIds = (tasks.data || []).map(t => t.id)
        const last = taskIds.length
            ? await supabase.from('checklist_last_done').select('task_id, done_at').in('task_id', taskIds)
            : { data: [] }
        setData({
            lists,
            categories: cats.data || [],
            tasks: tasks.data || [],
            rounds: rounds.data || [],
            ticks: ticks.data || [],
            lastDone: new Map((last.data || []).map(x => [x.task_id, x.done_at])),
        })
    }, [activeRestaurant, weeks])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load()
    }, [load])

    if (!data) {
        return (
            <div>
                <BackButton to="/checklists">Back to checklists</BackButton>
                {error ? <ErrorBanner className="mt-4">{error}</ErrorBanner> : <p className="text-sm text-muted mt-4">Loading the reports...</p>}
            </div>
        )
    }

    const byDay = ticksByWeekday(data.ticks)
    const byTime = ticksByTimeOfDay(data.ticks)
    const total = data.ticks.length

    const perList = data.lists.map(list => {
        const tree = listTree(data.categories.filter(c => c.checklist_id === list.id), data.tasks.filter(t => t.checklist_id === list.id))
        const record = periodRecord(list, data.rounds, from, today, today)
        const closed = record.filter(r => r.outcome !== 'current')
        const done = closed.filter(r => r.outcome === 'done').length
        const summary = list.repeats === 'once'
            ? onceWords(list, data.rounds)
            : closed.length
                ? `Finished ${done} of the last ${closed.length === 1 ? 'time' : `${closed.length} times`} it was due.`
                : 'Not due in full yet in these weeks.'
        return { list, tree, record, summary, rows: lastDoneRows(tree, data.lastDone) }
    })

    async function download() {
        setBusy(true)
        try {
            const { reportPdf } = await import('@/lib/checklistPdf')
            await reportPdf({
                restaurant: activeRestaurant,
                fromLabel: shortDate(from),
                toLabel: `${shortDate(today)} ${today.slice(0, 4)}`,
                byDay,
                byTime,
                generatedBy: user?.full_name,
                lists: perList.map(p => ({
                    name: p.list.name,
                    repeats: repeatWords(p.list),
                    summary: p.summary,
                    record: p.record.map(r => ({ label: stretchLabel(p.list, r), outcome: r.outcome, finishedOn: r.finishedOn ? doneDay(r.finishedOn + 'T12:00:00') : null })),
                    rows: p.rows,
                })),
            })
        } catch (err) {
            setError(friendlyError(err))
        } finally {
            setBusy(false)
        }
    }

    const roundsShown = data.rounds.filter(r => stampDay(r.started_at) >= from || !r.ended_at)
    const listOf = new Map(data.lists.map(l => [l.id, l]))

    return (
        <div>
            <BackButton to="/checklists">Back to checklists</BackButton>
            <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className={pageTitle}>Checklist reports</h1>
                    <p className="text-sm text-muted mt-1">{activeRestaurant.name} | {shortDate(from)} to today</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className={segmentTrack} role="group" aria-label="How far back">
                        {RANGES.map(r => (
                            <button key={r.weeks} type="button" aria-pressed={weeks === r.weeks} onClick={() => setWeeks(r.weeks)} className={segmentButton(weeks === r.weeks)}>
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <button type="button" onClick={download} disabled={busy} className={secondaryButton}>
                        {busy ? 'Making PDF...' : 'Download PDF'}
                    </button>
                </div>
            </header>

            <ErrorBanner className="mb-4">{error}</ErrorBanner>

            <div className="grid gap-5 lg:grid-cols-2">
                <section className={`${card} overflow-hidden`}>
                    <h2 className={cardHeader}>Which days the cleaning gets done</h2>
                    <div className="p-5">
                        {total === 0
                            ? <p className="text-sm text-muted italic">Nothing was ticked in these weeks.</p>
                            : <>
                                <p className="text-sm text-gray-700 mb-4">{busiestWords(byDay)} {total} things ticked in all.</p>
                                <Bars rows={byDay.map((count, i) => ({ label: weekdayName(i), count }))} total={total} />
                            </>}
                    </div>
                </section>
                <section className={`${card} overflow-hidden`}>
                    <h2 className={cardHeader}>What time of day</h2>
                    <div className="p-5">
                        {total === 0
                            ? <p className="text-sm text-muted italic">Nothing was ticked in these weeks.</p>
                            : <Bars rows={byTime} total={total} />}
                    </div>
                </section>
            </div>

            {perList.length === 0 && (
                <p className="text-sm text-muted mt-6">There are no lists yet.</p>
            )}

            {perList.map(({ list, record, summary, rows }) => (
                <section key={list.id} className={`${card} overflow-hidden mt-5`}>
                    <h2 className={`${cardHeader} flex flex-wrap items-center justify-between gap-2`}>
                        <span className="normal-case text-sm tracking-normal">{list.name}</span>
                        <span className="normal-case tracking-normal font-semibold text-white/80">{repeatWords(list)}</span>
                    </h2>
                    <div className="p-5">
                        <p className="text-sm text-gray-800">{summary}</p>
                        {record.length > 0 && (
                            <ul className="flex flex-wrap gap-2 mt-3">
                                {record.map(r => (
                                    <li key={r.from} className={`border rounded-lg px-2.5 py-1.5 text-xs ${OUTCOME[r.outcome].tone}`}>
                                        <span className="font-semibold">{stretchLabel(list, r)}</span>
                                        <span className="block">{OUTCOME[r.outcome].text}{r.finishedOn ? `, ${doneDay(r.finishedOn + 'T12:00:00')}` : ''}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {rows.length > 0 && (
                            <details className="mt-4 group">
                                <summary className="cursor-pointer text-sm font-semibold text-gray-800">
                                    When each thing was last done
                                </summary>
                                <table className="w-full text-sm mt-3">
                                    <tbody className="divide-y divide-border">
                                        {rows.map(t => (
                                            <tr key={t.id}>
                                                <td className="py-2 pr-3">
                                                    <span className="text-gray-900">{t.label}</span>
                                                    <span className="block text-xs text-muted">{t.category}</span>
                                                </td>
                                                <td className={`py-2 text-right whitespace-nowrap ${t.doneAt ? 'text-gray-700' : 'text-red-700 font-semibold'}`}>
                                                    {t.doneAt ? doneDay(t.doneAt) : 'Never'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </details>
                        )}
                    </div>
                </section>
            ))}

            <section className={`${card} overflow-hidden mt-5`}>
                <h2 className={cardHeader}>Rounds</h2>
                {roundsShown.length === 0 ? (
                    <p className="p-5 text-sm text-muted italic">No rounds in these weeks.</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {roundsShown.map(r => {
                            const list = listOf.get(r.checklist_id)
                            const outcome = roundOutcome(r)
                            const tree = list ? perList.find(p => p.list.id === list.id)?.tree || [] : []
                            const { done, total: all } = progressOf(tree, data.ticks.filter(t => t.round_id === r.id))
                            return (
                                <li key={r.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900">{list?.name || 'A list taken off'}</p>
                                        <p className="text-xs text-muted">
                                            Started {doneDayLong(r.started_at)}{r.started_by_name ? ` by ${r.started_by_name}` : ''}
                                            {' · '}
                                            {outcome === 'open' ? `${done} of ${all} done so far` : outcome === 'finished' ? `Finished ${doneDayLong(r.ended_at)}` : `Ended early ${doneDayLong(r.ended_at)}`}
                                        </p>
                                    </div>
                                    <button type="button" onClick={() => navigate(`/checklists/rounds/${r.id}`)} className={`${rowButton('plain')} self-start sm:self-auto`}>
                                        Open
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
        </div>
    )
}

// How a stretch is named on the record: its first day for a week or a few, its
// month for a month.
function stretchLabel(list, stretch) {
    if (list.repeats === 'monthly') return new Date(stretch.from + 'T00:00:00').toLocaleDateString('en-IE', { month: 'long' })
    return list.every_weeks === 1 ? `Week of ${shortDate(stretch.from)}` : `${shortDate(stretch.from)} to ${shortDate(stretch.to)}`
}

function onceWords(list, rounds) {
    const round = rounds.find(r => r.checklist_id === list.id)
    if (!round) return list.finish_by ? `Done once, by ${doneDayLong(list.finish_by + 'T12:00:00')}. Not started yet.` : 'Done once. Not started yet.'
    if (!round.ended_at) return 'Done once. In progress.'
    return `Done once. ${roundOutcome(round) === 'finished' ? 'Finished' : 'Ended early'} ${doneDayLong(round.ended_at)}.`
}

// Counts drawn as bars, one colour, read off a common left edge. The same
// look as How the week was taken on the cost dashboard.
function Bars({ rows, total }) {
    const biggest = Math.max(1, ...rows.map(r => r.count))
    return (
        <ul className="space-y-2.5">
            {rows.map(r => (
                <li key={r.label}>
                    <div className="flex justify-between items-baseline gap-3 mb-1">
                        <span className="text-sm text-gray-700">{r.label}</span>
                        <span className="text-xs text-muted tabular-nums whitespace-nowrap">
                            {r.count} {total ? `(${Math.round((r.count / total) * 100)}%)` : ''}
                        </span>
                    </div>
                    <span className="block h-4 bg-gray-100 rounded-md overflow-hidden">
                        <span className="block h-full rounded-r-md" style={{ width: `${r.count ? Math.max((r.count / biggest) * 100, 1) : 0}%`, backgroundColor: BAR_COLOUR }} />
                    </span>
                </li>
            ))}
        </ul>
    )
}
